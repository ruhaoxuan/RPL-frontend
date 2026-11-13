import { z } from "zod";
import type { Catalog } from "../src/domain/model";
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const patternPath = z
  .string()
  .regex(/^docs\/patterns-pest\/(clippy|codeql|cve|ub)\/[^/]+\.rpl$/);
const instancePath = z
  .string()
  .regex(/^tests\/ui\/(?!.*(?:^|\/)\.\.\/).+\.rs$/);
export const allowedManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    sourceWorkbook: z.string(),
    workbookSha256: hash,
    sheetName: z.string(),
    importedAt: z.string(),
    reviewedSourceCommit: z.string().regex(/^[a-f0-9]{40}$/),
    pairs: z
      .array(
        z.object({
          id: z.string(),
          spreadsheetRow: z.number().int().min(2),
          patternId: z.string(),
          patternFile: patternPath,
          instanceFile: instancePath,
          diagNames: z.array(z.string()).min(1),
          type: z.enum(["positive", "negative"]),
          expectedResult: z.enum(["match", "no_match"]),
          baselineFiles: z.array(
            z.string().startsWith("tests/ui/").endsWith(".stderr"),
          ),
          note: z.string(),
          patternSha256: hash,
          instanceSha256: hash,
        }),
      )
      .min(1),
    excludedPairs: z.array(
      z.object({
        spreadsheetRow: z.number(),
        patternId: z.string(),
        patternFile: patternPath,
        instanceFile: instancePath,
      }),
    ),
    missingBaselines: z.array(z.object({ row: z.number(), path: z.string() })),
  })
  .superRefine((m, ctx) => {
    const seen = new Set<string>(),
      types = new Map<string, string>();
    for (const pair of m.pairs) {
      const key = pairKey(pair.patternId, pair.instanceFile);
      if (seen.has(key))
        ctx.addIssue({ code: "custom", message: "重复的允许关联 " + key });
      seen.add(key);
      if (pair.patternFile !== `docs/patterns-pest/${pair.patternId}.rpl`)
        ctx.addIssue({ code: "custom", message: "模式 ID 与路径不一致" });
      if ((pair.type === "positive") !== (pair.expectedResult === "match"))
        ctx.addIssue({ code: "custom", message: "预期类型冲突" });
      if (
        types.has(pair.instanceFile) &&
        types.get(pair.instanceFile) !== pair.type
      )
        ctx.addIssue({
          code: "custom",
          message: "共享文件出现不同预期，需升级为关联级类型模型",
        });
      types.set(pair.instanceFile, pair.type);
    }
    for (const p of m.excludedPairs)
      if (seen.has(pairKey(p.patternId, p.instanceFile)))
        ctx.addIssue({ code: "custom", message: "允许与排除关联重叠" });
  });
export type AllowedManifest = z.infer<typeof allowedManifestSchema>;
export const pairKey = (patternId: string, file: string) =>
  `${patternId}\0${file}`;
export function assertCatalogMatchesAllowlist(
  data: Catalog,
  manifest: AllowedManifest,
) {
  const files = new Map(data.files.map((f) => [f.id, f.path]));
  const expected = new Map(
    manifest.pairs.map((p) => [pairKey(p.patternId, p.instanceFile), p]),
  );
  const actual = new Set<string>();
  for (const i of data.instances)
    for (const pid of i.patternIds) {
      const key = pairKey(pid, files.get(i.fileId) || "");
      const pair = expected.get(key);
      if (!pair) throw Error(`未收录或已排除的关联: ${key}`);
      if (i.type !== pair.type || i.expectedResult !== pair.expectedResult)
        throw Error(`关联分类不一致: ${pair.id}`);
      if (actual.has(key)) throw Error("重复的生成关联");
      actual.add(key);
    }
  if (actual.size !== expected.size) throw Error("收录关联有遗漏");
  const expectedPatterns = new Set(manifest.pairs.map((p) => p.patternId));
  if (
    data.patterns.length !== expectedPatterns.size ||
    data.patterns.some((p) => !expectedPatterns.has(p.id))
  )
    throw Error("模式目录与收录范围不一致");
  if (data.manifest.dataPolicy !== "curated-allowlist")
    throw Error("收录策略不一致");
}
