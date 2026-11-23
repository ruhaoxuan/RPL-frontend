import { checkRpl } from "./rpl-check.ts";
import { pullRpl, cleanupRpl } from "./rpl-pull.ts";
import type { SyncAdapter } from "./types.ts";
export type {
  SyncAdapter,
  SyncContext,
  CheckResult,
  PreparedSnapshot,
} from "./types.ts";
export const syncAdapters: Record<string, SyncAdapter> = {
  "rpl-git": {
    key: "rpl-git",
    supports: (s) => s.id === "rpl" && s.type === "git",
    check: checkRpl,
    pull: pullRpl,
    cleanup: cleanupRpl,
  },
};
