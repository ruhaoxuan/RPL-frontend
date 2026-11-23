import { z } from "zod";
const timestamp = z.string().datetime({ offset: true });
export const dataSourceSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    type: z.enum(["git", "web", "script"]),
    adapter: z.string().min(1),
    url: z.string().url(),
    lastSyncAttemptAt: timestamp.nullable(),
    lastSyncedAt: timestamp.nullable(),
    version: z.string().min(1).nullable(),
    lastAttemptStatus: z.enum(["never", "success", "failed"]),
    lastError: z.string().nullable(),
    updateCheck: z.object({
      enabled: z.boolean(),
      intervalMinutes: z.number().int().min(1),
      lastCheckedAt: timestamp.nullable(),
      status: z.enum(["never", "current", "update_available", "failed"]),
      latestVersion: z.string().nullable(),
      comparedVersion: z.string().nullable(),
      error: z.string().nullable(),
    }),
  })
  .superRefine((s, ctx) => {
    if (
      Boolean(s.lastSyncedAt) !== Boolean(s.version) ||
      (s.lastAttemptStatus === "success" && !s.lastSyncedAt) ||
      (s.lastAttemptStatus === "never" &&
        (s.lastSyncAttemptAt || s.lastSyncedAt)) ||
      (s.lastAttemptStatus !== "never" && !s.lastSyncAttemptAt)
    )
      ctx.addIssue({ code: "custom", message: "同步记录不完整" });
  });
export const dataSourcesSchema = z
  .object({
    schemaVersion: z.literal(1),
    sources: z.array(dataSourceSchema).min(1),
  })
  .superRefine((v, ctx) => {
    if (new Set(v.sources.map((s) => s.id)).size !== v.sources.length)
      ctx.addIssue({ code: "custom", message: "重复数据源" });
  });
export type DataSource = z.infer<typeof dataSourceSchema>;
export function latestSyncedSource(sources: DataSource[]) {
  return sources
    .filter((s) => s.lastSyncedAt)
    .sort(
      (a, b) => Date.parse(b.lastSyncedAt!) - Date.parse(a.lastSyncedAt!),
    )[0];
}
