import {
  mkdir,
  readFile,
  writeFile,
  rename,
  rm,
  access,
} from "node:fs/promises";
import path from "node:path";
import { dataSourcesSchema } from "../../src/domain/dataSources.ts";
import { catalogSchema } from "../../src/domain/catalog.ts";
import type {
  SyncAdapter,
  SyncContext,
  PreparedSnapshot,
  CheckResult,
} from "./types.ts";
async function exists(file: string) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}
async function save(file: string, value: unknown) {
  await writeFile(`${file}.tmp`, JSON.stringify(value, null, 2) + "\n");
  await rename(`${file}.tmp`, file);
}
/** Shared check phase for scheduler, CLI and manual sync. No adapter writes status. */
export async function runSource(
  root: string,
  id: string,
  adapter: SyncAdapter,
  kind: "check" | "sync",
  onOutput = (text: string) => {
    process.stdout.write(text);
  },
) {
  const workspace = path.join(root, ".data-sync");
  try {
    await mkdir(workspace);
  } catch {
    throw Error("已有检查或同步任务运行，请稍后重试。");
  }
  const file = path.join(root, "metadata/data-sources.json");
  const output = path.join(root, "public/generated"),
    backup = path.join(workspace, "previous");
  const catalogFile = path.join(output, "catalog.json");
  let ctx: SyncContext | undefined, prepared: PreparedSnapshot | undefined;
  let activated = false,
    backedUp = false,
    published = false,
    recoverySafe = true;
  let step = "检查更新";
  try {
    const records = dataSourcesSchema.parse(
      JSON.parse(await readFile(file, "utf8")),
    );
    const source = records.sources.find((s) => s.id === id);
    if (!source || !adapter.supports(source))
      throw Error("数据源不支持此适配器");
    const original = structuredClone(source);
    ctx = {
      root,
      source,
      workspace,
      outputDir: path.join(workspace, "generated"),
      recordsFile: path.join(workspace, "data-sources.json"),
      onOutput,
    };
    async function persist() {
      await save(file, records);
      if (await exists(catalogFile)) {
        const catalog = JSON.parse(await readFile(catalogFile, "utf8"));
        // Preserve published data: only refresh the source's check/sync records.
        const target = catalog.dataSources.find(
          (s: { id: string }) => s.id === id,
        );
        if (target) Object.assign(target, source);
        await save(catalogFile, catalog);
      }
    }
    let checked: CheckResult;
    try {
      checked = await adapter.check(ctx);
      if (!checked.latestVersion || !checked.currentVersion)
        throw Error("检查未返回有效版本");
      source.updateCheck.latestVersion = checked.latestVersion;
      source.updateCheck.comparedVersion = checked.currentVersion;
      source.updateCheck.status =
        checked.latestVersion === checked.currentVersion
          ? "current"
          : "update_available";
      source.updateCheck.error = null;
    } catch (error) {
      source.updateCheck.lastCheckedAt = new Date().toISOString();
      source.updateCheck.status = "failed";
      source.updateCheck.error =
        "检查失败，请确认网络及数据源配置；旧数据和成功同步时间未改变。";
      if (kind === "sync") {
        source.lastSyncAttemptAt = source.updateCheck.lastCheckedAt;
        source.lastAttemptStatus = "failed";
        source.lastError = source.updateCheck.error;
      }
      await persist();
      throw error;
    }
    source.updateCheck.lastCheckedAt = new Date().toISOString();
    // Persist successful check before pull so its result survives downstream failures.
    await persist();
    if (kind === "check") return;
    try {
      step = "拉取并生成候选数据";
      // Only the temporary records predict candidate success, never the live records.
      const stagedRecords = structuredClone(records);
      const stagedSource = stagedRecords.sources.find((s) => s.id === id)!;
      Object.assign(stagedSource, {
        version: checked.latestVersion,
        lastSyncedAt: new Date().toISOString(),
        lastSyncAttemptAt: new Date().toISOString(),
        lastAttemptStatus: "success",
        lastError: null,
      });
      stagedSource.updateCheck.comparedVersion = checked.latestVersion;
      stagedSource.updateCheck.status = "current";
      await save(ctx.recordsFile, stagedRecords);
      prepared = await adapter.pull(ctx, checked);
      if (prepared.version !== checked.latestVersion)
        throw Error("拉取版本与检查结果不一致，拒绝发布");
      step = "校验候选数据";
      await prepared.validate?.();
      const candidateFile = path.join(ctx.outputDir, "catalog.json");
      const candidate = catalogSchema.parse(
        JSON.parse(await readFile(candidateFile, "utf8")),
      );
      // Preserve all other sources and only commit this source after complete validation.
      Object.assign(source, {
        version: prepared.version,
        lastSyncedAt: new Date().toISOString(),
        lastSyncAttemptAt: new Date().toISOString(),
        lastAttemptStatus: "success",
        lastError: null,
      });
      source.updateCheck.comparedVersion = prepared.version;
      source.updateCheck.status = "current";
      candidate.dataSources = records.sources;
      catalogSchema.parse(candidate);
      await save(candidateFile, candidate);
      step = "保存已验证数据";
      activated = true;
      await prepared.activate?.();
      if (await exists(output)) {
        await rename(output, backup);
        backedUp = true;
      }
      await mkdir(path.dirname(output), { recursive: true });
      await rename(ctx.outputDir, output);
      published = true;
      await save(file, records);
      onOutput(
        `同步成功：${source.name} ${prepared.version}，时间 ${source.lastSyncedAt}\n`,
      );
    } catch (error) {
      try {
        if (published) await rm(output, { recursive: true, force: true });
        if (backedUp) await rename(backup, output);
        if (activated) await prepared?.rollback?.();
      } catch (recoveryError) {
        recoverySafe = false;
        throw new Error("回退未完成，保留 .data-sync 以便恢复", {
          cause: recoveryError,
        });
      }
      // Restore the applied version while retaining the shared check phase's result.
      source.version = original.version;
      source.lastSyncedAt = original.lastSyncedAt;
      source.updateCheck.comparedVersion = checked.currentVersion;
      source.updateCheck.status =
        checked.latestVersion === checked.currentVersion
          ? "current"
          : "update_available";
      source.lastSyncAttemptAt = new Date().toISOString();
      source.lastAttemptStatus = "failed";
      source.lastError = `${step}失败，更新尚未应用。请查看终端日志并核对收录清单。`;
      await persist();
      throw error;
    }
  } finally {
    if (recoverySafe) {
      try {
        if (ctx && kind === "sync") await adapter.cleanup?.(ctx);
        await rm(workspace, { recursive: true, force: true });
      } catch (error) {
        onOutput(
          `临时工作区清理失败，已保留 .data-sync，请人工核对：${String(error)}\n`,
        );
      }
    }
  }
}
