import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { SyncService } from "../scripts/sync/service.ts";

test(
  "更新检查与调度：只读版本、无更新/有更新/失败、间隔开关和互斥",
  { timeout: 30000 },
  async () => {
    const root = await mkdtemp(path.join(tmpdir(), "rpl-check-"));
    const git = (cwd: string, ...args: string[]) =>
      execFileSync("git", args, {
        cwd,
        encoding: "utf8",
        stdio: "pipe",
      }).trim();
    const recordFile = path.join(root, "metadata/data-sources.json");
    const catalogFile = path.join(root, "public/generated/catalog.json");
    const read = async () => JSON.parse(await readFile(recordFile, "utf8"));
    const save = async (value: unknown) =>
      writeFile(recordFile, JSON.stringify(value));
    const wait = async (service: SyncService) => {
      while (service.active)
        await new Promise((resolve) => setTimeout(resolve, 5));
    };
    try {
      for (const dir of ["remote", "vendor", "metadata", "public/generated"])
        await mkdir(path.join(root, dir), { recursive: true });
      const remote = path.join(root, "remote"),
        local = path.join(root, "vendor/RPL");
      git(remote, "init", "-b", "master");
      git(
        remote,
        "-c",
        "user.name=Test",
        "-c",
        "user.email=test@example.invalid",
        "commit",
        "--allow-empty",
        "-m",
        "initial",
      );
      git(root, "clone", remote, local);
      const head = git(local, "rev-parse", "HEAD"),
        refs = git(local, "show-ref");
      const records = JSON.parse(
        await readFile("metadata/data-sources.json", "utf8"),
      );
      records.sources[0].version = head;
      records.sources[0].lastSyncedAt = "2026-11-23T01:00:00Z";
      records.sources[0].lastSyncAttemptAt = "2026-11-23T01:00:00Z";
      records.sources[0].lastAttemptStatus = "success";
      records.sources[0].updateCheck = {
        enabled: true,
        intervalMinutes: 360,
        status: "never",
        lastCheckedAt: null,
        latestVersion: null,
        comparedVersion: null,
        error: null,
      };
      await save(records);
      const catalog = JSON.parse(
        await readFile("public/generated/catalog.json", "utf8"),
      );
      catalog.dataSources = records.sources;
      catalog.manifest.sourceCommit = head;
      await writeFile(catalogFile, JSON.stringify(catalog));
      const service = new SyncService(root);
      await service.start("rpl", "check");
      await wait(service);
      assert.equal((await read()).sources[0].updateCheck.status, "current");
      assert.equal(git(local, "show-ref"), refs);
      git(
        remote,
        "-c",
        "user.name=Test",
        "-c",
        "user.email=test@example.invalid",
        "commit",
        "--allow-empty",
        "-m",
        "new version",
      );
      await service.start("rpl", "check");
      await wait(service);
      let result = await read();
      assert.equal(result.sources[0].updateCheck.status, "update_available");
      assert.equal(git(local, "rev-parse", "HEAD"), head);
      assert.equal(git(local, "show-ref"), refs); // ls-remote does not fetch refs.
      assert.equal(result.sources[0].version, head);
      assert.equal(
        result.sources[0].lastSyncedAt,
        records.sources[0].lastSyncedAt,
      );
      assert.equal(
        result.sources[0].lastSyncAttemptAt,
        records.sources[0].lastSyncAttemptAt,
      );
      const published = JSON.parse(await readFile(catalogFile, "utf8"));
      assert.deepEqual(published.patterns, catalog.patterns);
      assert.equal(
        published.manifest.generatedAt,
        catalog.manifest.generatedAt,
      );
      await service.tick();
      assert.equal(service.active, null); // interval not due
      result.sources[0].updateCheck.lastCheckedAt = null;
      result.sources[0].updateCheck.enabled = false;
      await save(result);
      await service.tick();
      assert.equal(service.active, null);
      result.sources[0].updateCheck.enabled = true;
      await save(result);
      await mkdir(path.join(root, ".data-sync"));
      await service.tick();
      assert.equal(service.active, null);
      await rm(path.join(root, ".data-sync"), { recursive: true });
      await service.tick();
      assert.equal((await service.state()).busy, true);
      await wait(service);
      git(local, "remote", "set-url", "origin", path.join(root, "missing"));
      await service.start("rpl", "check");
      await wait(service);
      result = await read();
      assert.equal(result.sources[0].updateCheck.status, "failed");
      assert.equal(
        result.sources[0].lastSyncedAt,
        records.sources[0].lastSyncedAt,
      );
      assert.equal(result.sources[0].version, head);
      assert.equal(service.jobs.get("rpl")?.status, "failed");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);
