import type { DataSource } from "../../src/domain/dataSources";
export interface CheckResult {
  latestVersion: string;
  currentVersion: string;
}
export interface SyncContext {
  root: string;
  source: DataSource;
  workspace: string;
  outputDir: string;
  recordsFile: string;
  onOutput: (text: string) => void;
}
/** Pull prepares a complete candidate catalog. Only the workflow may publish it. */
export interface PreparedSnapshot {
  version: string;
  validate?: () => Promise<void>;
  activate?: () => Promise<void>;
  rollback?: () => Promise<void>;
}
export interface SyncAdapter {
  key: string;
  supports: (source: DataSource) => boolean;
  check: (context: SyncContext) => Promise<CheckResult>;
  pull: (
    context: SyncContext,
    checked: CheckResult,
  ) => Promise<PreparedSnapshot>;
  cleanup?: (context: SyncContext) => Promise<void>;
}
