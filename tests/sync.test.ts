import { readdir } from "node:fs/promises";
import { writeFile } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, cp, symlink, mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import {
  dataSourcesSchema,
  latestSyncedSource,
} from "../src/domain/dataSources";

test("同步记录初始无时间，多来源按成功时间排序", () => {
  const initial = dataSourcesSchema.parse(
    JSON.parse(requireRead("metadata/data-sources.json", "utf8")),
  );
  const base = {
    ...initial.sources[0],
    lastAttemptStatus: "success" as const,
    version: "abc",
    lastSyncAttemptAt: "2026-11-23T02:00:00Z",
  };
  assert.equal(
    latestSyncedSource([
      { ...base, id: "a", lastSyncedAt: "2026-11-23T01:00:00Z" },
      { ...base, id: "b", lastSyncedAt: "2026-11-23T02:00:00Z" },
    ])?.id,
    "b",
  );
  assert.equal(latestSyncedSource([]), undefined);
});
import { readFileSync as requireRead } from "node:fs";

test(
  "真实同步：成功、无变化、普通构建不改时间、失败保留已发布快照",
  { timeout: 120000 },
  async () => {
    const root = process.cwd(),
      fixture = await mkdtemp(path.join(tmpdir(), "rpl-sync-test-"));
    const git = (...args: string[]) =>
      execFileSync("git", args, {
        cwd: fixture,
        stdio: "pipe",
        encoding: "utf8",
      });
    const run = (file: string) =>
      spawnSync(process.execPath, ["--import", "tsx", `scripts/${file}`], {
        cwd: fixture,
        encoding: "utf8",
      });
    const json = async (file: string) =>
      JSON.parse(await readFile(path.join(fixture, file), "utf8"));
    try {
      for (const dir of ["src", "scripts", "metadata", "docs"])
        await cp(path.join(root, dir), path.join(fixture, dir), {
          recursive: true,
        });
      await symlink(
        path.join(root, "node_modules"),
        path.join(fixture, "node_modules"),
        "dir",
      );
      await cp(
        path.join(root, "package.json"),
        path.join(fixture, "package.json"),
      );
      await mkdir(path.join(fixture, "vendor"));
      git("clone", "--shared", path.join(root, "vendor/RPL"), "vendor/RPL");
      const initialRecords = await json("metadata/data-sources.json");
      initialRecords.sources[0].updateCheck.status = "update_available";
      initialRecords.sources[0].updateCheck.latestVersion = "f".repeat(40);
      await writeFile(
        path.join(fixture, "metadata/data-sources.json"),
        JSON.stringify(initialRecords),
      );
      for (let attempt = 0; attempt < 2; attempt++) {
        const result = run("sync-data.ts");
        assert.equal(result.status, 0, result.stdout + result.stderr);
      }
      const records = await json("metadata/data-sources.json");
      const success = records.sources[0];
      assert.equal(success.lastAttemptStatus, "success");
      assert.ok(success.lastSyncedAt);
      assert.equal(success.updateCheck.status, "current");
      assert.equal(success.updateCheck.latestVersion, success.version);
      assert.equal(success.updateCheck.comparedVersion, success.version);
      assert.ok(success.updateCheck.lastCheckedAt);
      assert.equal(
        success.version,
        git("-C", "vendor/RPL", "rev-parse", "HEAD").trim(),
      );
      const build = run("build-data.ts");
      assert.equal(build.status, 0, build.stdout + build.stderr);
      assert.deepEqual(await json("metadata/data-sources.json"), records);
      const mismatched = structuredClone(records);
      mismatched.sources[0].version = "f".repeat(40);
      const mismatchFile = path.join(fixture, "mismatch.json");
      const guardedOutput = path.join(fixture, "guarded-output");
      await writeFile(mismatchFile, JSON.stringify(mismatched));
      await mkdir(guardedOutput);
      await writeFile(path.join(guardedOutput, "sentinel"), "keep");
      const rejectedBuild = spawnSync(
        process.execPath,
        ["--import", "tsx", "scripts/build-data.ts"],
        {
          cwd: fixture,
          encoding: "utf8",
          env: {
            ...process.env,
            RPL_SOURCES_FILE: mismatchFile,
            RPL_OUTPUT_DIR: guardedOutput,
          },
        },
      );
      assert.notEqual(rejectedBuild.status, 0);
      assert.deepEqual(await readdir(guardedOutput), ["sentinel"]);
      const before = await json("public/generated/catalog.json");
      const manifestPath = path.join(fixture, "metadata/allowed-pairs.json");
      const originalManifest = await readFile(manifestPath, "utf8");
      const upstream = path.join(fixture, "upstream");
      git("clone", "--shared", path.join(fixture, "vendor/RPL"), upstream);
      git("-C", upstream, "checkout", "-B", "master");
      git(
        "-C",
        upstream,
        "-c",
        "user.name=Test",
        "-c",
        "user.email=test@example.invalid",
        "commit",
        "--allow-empty",
        "-m",
        "candidate update",
      );
      const remoteRevision = git("-C", upstream, "rev-parse", "HEAD").trim();
      git("-C", "vendor/RPL", "remote", "set-url", "origin", upstream);
      const invalid = JSON.parse(originalManifest);
      invalid.pairs[0].patternSha256 = "0".repeat(64);
      await writeFile(manifestPath, JSON.stringify(invalid));
      assert.notEqual(run("sync-data.ts").status, 0);
      const validationFailure = (await json("metadata/data-sources.json"))
        .sources[0];
      assert.equal(validationFailure.lastSyncedAt, success.lastSyncedAt);
      assert.equal(validationFailure.lastAttemptStatus, "failed");
      assert.equal(validationFailure.updateCheck.status, "update_available");
      assert.equal(validationFailure.updateCheck.latestVersion, remoteRevision);
      assert.equal(
        validationFailure.updateCheck.comparedVersion,
        success.version,
      );
      assert.equal(validationFailure.version, success.version);
      assert.deepEqual(
        (await json("public/generated/catalog.json")).patterns,
        before.patterns,
      );
      await writeFile(manifestPath, originalManifest);
      git(
        "-C",
        "vendor/RPL",
        "remote",
        "set-url",
        "origin",
        path.join(fixture, "missing-origin"),
      );
      assert.notEqual(run("sync-data.ts").status, 0);
      const failed = (await json("metadata/data-sources.json")).sources[0];
      assert.equal(failed.lastAttemptStatus, "failed");
      assert.equal(failed.updateCheck.status, "failed");
      assert.equal(failed.lastSyncedAt, success.lastSyncedAt);
      assert.equal(failed.version, success.version);
      const after = await json("public/generated/catalog.json");
      assert.deepEqual(after.patterns, before.patterns);
      assert.equal(after.manifest.sourceCommit, before.manifest.sourceCommit);
      assert.equal(after.dataSources[0].lastAttemptStatus, "failed");
    } finally {
      await rm(fixture, { recursive: true, force: true });
    }
  },
);
