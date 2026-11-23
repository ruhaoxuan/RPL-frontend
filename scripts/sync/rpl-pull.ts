import { access } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { rplGit } from "./rpl-check.ts";
import type { CheckResult, PreparedSnapshot, SyncContext } from "./types.ts";
export async function pullRpl(
  ctx: SyncContext,
  checked: CheckResult,
): Promise<PreparedSnapshot> {
  if (await rplGit(ctx.root, "status", "--porcelain"))
    throw Error("RPL 子模块存在本地修改，请先处理");
  const original = await rplGit(ctx.root, "rev-parse", "HEAD");
  if (original !== checked.currentVersion)
    throw Error("检查后本地版本发生变化，请重新同步");
  let branch: string | undefined;
  try {
    branch = await rplGit(
      ctx.root,
      "symbolic-ref",
      "--quiet",
      "--short",
      "HEAD",
    );
  } catch {
    /* detached HEAD */
  }
  await rplGit(ctx.root, "fetch", "origin", "master");
  // Use precisely the checked revision even if origin/master moves after check().
  await rplGit(ctx.root, "cat-file", "-e", `${checked.latestVersion}^{commit}`);
  const candidate = path.join(ctx.workspace, "source");
  await rplGit(
    ctx.root,
    "worktree",
    "add",
    "--detach",
    candidate,
    checked.latestVersion,
  );
  const env = {
    ...process.env,
    RPL_SOURCE_ROOT: candidate,
    RPL_OUTPUT_DIR: ctx.outputDir,
    RPL_SOURCES_FILE: ctx.recordsFile,
  };
  const run = (file: string) =>
    new Promise<void>((resolve, reject) => {
      const child = spawn(
        process.execPath,
        ["--import", "tsx", `scripts/${file}`],
        { cwd: ctx.root, env, stdio: ["ignore", "pipe", "pipe"] },
      );
      child.stdout.on("data", (b) => ctx.onOutput(String(b)));
      child.stderr.on("data", (b) => ctx.onOutput(String(b)));
      child.on("error", reject);
      child.on("close", (code) =>
        code === 0 ? resolve() : reject(Error(`${file} 执行失败`)),
      );
    });
  await run("build-data.ts");
  return {
    version: checked.latestVersion,
    validate: () => run("check-data.ts"),
    activate: async () => {
      await rplGit(ctx.root, "checkout", "--detach", checked.latestVersion);
    },
    rollback: async () => {
      await rplGit(ctx.root, "checkout", branch || original);
    },
  };
}
export async function cleanupRpl(ctx: SyncContext) {
  const candidate = path.join(ctx.workspace, "source");
  try {
    await access(candidate);
  } catch {
    return;
  }
  await rplGit(ctx.root, "worktree", "remove", "--force", candidate);
}
