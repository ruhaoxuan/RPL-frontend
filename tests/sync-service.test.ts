import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { SyncService } from "../scripts/sync/service";
import type { SyncAdapter } from "../scripts/sync/types";

test("公共流程复用：自动只检查，手动先检查后拉取，失败保留检查结果", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "rpl-workflow-"));
  const records = JSON.parse(
    await readFile("metadata/data-sources.json", "utf8"),
  );
  const catalog = JSON.parse(
    await readFile("public/generated/catalog.json", "utf8"),
  );
  const baseline = catalog.manifest.sourceCommit;
  const latest = "a".repeat(40);
  const calls: string[] = [];
  let failCheck = false,
    failPull = false;
  let release: (() => void) | undefined;
  let block = false;
  const wait = async (service: SyncService) => {
    while (service.active) await new Promise((r) => setTimeout(r, 5));
  };
  try {
    await mkdir(path.join(root, "metadata"));
    await mkdir(path.join(root, "public/generated"), { recursive: true });
    await writeFile(
      path.join(root, "metadata/data-sources.json"),
      JSON.stringify(records),
    );
    await writeFile(
      path.join(root, "public/generated/catalog.json"),
      JSON.stringify(catalog),
    );
    const adapter: SyncAdapter = {
      key: "rpl-git",
      supports: () => true,
      check: async () => {
        calls.push("check");
        if (block)
          await new Promise<void>((resolve) => {
            release = resolve;
          });
        if (failCheck) throw Error("check failed");
        return { latestVersion: latest, currentVersion: baseline };
      },
      pull: async (ctx, checked) => {
        calls.push("pull");
        assert.equal(checked.latestVersion, latest);
        if (failPull) throw Error("pull failed");
        const staged = JSON.parse(await readFile(ctx.recordsFile, "utf8"));
        await mkdir(ctx.outputDir);
        await writeFile(
          path.join(ctx.outputDir, "catalog.json"),
          JSON.stringify({
            ...catalog,
            manifest: { ...catalog.manifest, sourceCommit: latest },
            dataSources: staged.sources,
          }),
        );
        return { version: latest };
      },
    };
    const service = new SyncService(root, { "rpl-git": adapter });
    await assert.rejects(service.start("missing"), /不存在/);
    block = true;
    const checking = await service.start("rpl", "check");
    while (!release) await new Promise((r) => setTimeout(r, 5));
    await assert.rejects(service.start("rpl"), /已有同步任务/);
    release();
    await wait(service);
    block = false;
    assert.equal(checking.status, "success");
    assert.deepEqual(calls, ["check"]);
    calls.length = 0;
    failPull = true;
    const failed = await service.start("rpl");
    await wait(service);
    assert.equal(failed.status, "failed");
    assert.deepEqual(calls, ["check", "pull"]);
    let saved = JSON.parse(
      await readFile(path.join(root, "metadata/data-sources.json"), "utf8"),
    ).sources[0];
    assert.equal(saved.updateCheck.status, "update_available");
    assert.equal(saved.lastSyncedAt, records.sources[0].lastSyncedAt);
    calls.length = 0;
    failCheck = true;
    await service.start("rpl");
    await wait(service);
    assert.deepEqual(calls, ["check"]);
    saved = JSON.parse(
      await readFile(path.join(root, "metadata/data-sources.json"), "utf8"),
    ).sources[0];
    assert.equal(saved.updateCheck.status, "failed");
    assert.equal(saved.lastAttemptStatus, "failed");
    calls.length = 0;
    failCheck = false;
    failPull = false;
    const synced = await service.start("rpl");
    await wait(service);
    assert.equal(synced.status, "success");
    assert.deepEqual(calls, ["check", "pull"]);
    saved = JSON.parse(
      await readFile(path.join(root, "metadata/data-sources.json"), "utf8"),
    ).sources[0];
    assert.equal(saved.updateCheck.status, "current");
    assert.equal(saved.version, latest);
    // A pull implementation cannot silently publish a different version.
    const wrongVersion = new SyncService(root, {
      "rpl-git": {
        ...adapter,
        pull: async () => ({ version: "b".repeat(40) }),
      },
    });
    const mismatch = await wrongVersion.start("rpl");
    await wait(wrongVersion);
    assert.equal(mismatch.status, "failed");
    saved = JSON.parse(
      await readFile(path.join(root, "metadata/data-sources.json"), "utf8"),
    ).sources[0];
    assert.equal(saved.version, latest);
    // Adapter names must not resolve to properties inherited from Object.prototype.
    const unknownRecords = JSON.parse(
      await readFile(path.join(root, "metadata/data-sources.json"), "utf8"),
    );
    unknownRecords.sources[0].adapter = "constructor";
    await writeFile(
      path.join(root, "metadata/data-sources.json"),
      JSON.stringify(unknownRecords),
    );
    assert.equal((await service.state()).sources[0].supported, false);
    await assert.rejects(service.start("rpl"), /适配器/);
    const unsupported = new SyncService(root, {});
    await assert.rejects(unsupported.start("rpl"), /适配器/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
