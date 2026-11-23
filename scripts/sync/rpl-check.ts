import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import type { CheckResult, SyncContext } from "./types.ts";
export async function rplGit(root: string, ...args: string[]) {
  return (
    await promisify(execFile)(
      "git",
      ["-C", path.join(root, "vendor/RPL"), ...args],
      {
        timeout: 60000,
        env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
      },
    )
  ).stdout.trim();
}
export async function checkRpl(ctx: SyncContext): Promise<CheckResult> {
  const currentVersion = await rplGit(ctx.root, "rev-parse", "HEAD");
  const result = await rplGit(
    ctx.root,
    "ls-remote",
    "--exit-code",
    "origin",
    "refs/heads/master",
  );
  const latestVersion = result.split(/\s+/)[0];
  if (!/^[a-f0-9]{40}$/.test(latestVersion)) throw Error("远端版本格式无效");
  return { latestVersion, currentVersion };
}
