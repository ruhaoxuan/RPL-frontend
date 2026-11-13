import { readFile } from "node:fs/promises";
import { renderMappingTable } from "./mapping-table";
import { createHash } from "node:crypto";
import {
  allowedManifestSchema,
  assertCatalogMatchesAllowlist,
} from "./allowlist";
import { z } from "zod";
import type { Catalog } from "../src/domain/model";
const raw = JSON.parse(await readFile("public/generated/catalog.json", "utf8"));
z.object({
  manifest: z.object({
    schemaVersion: z.literal(3),
    dataPolicy: z.literal("curated-allowlist"),
    sourceCommit: z.string().regex(/^[a-f0-9]{40}$/),
  }),
  patterns: z.array(
    z.object({
      id: z.string(),
      source: z.enum(["clippy", "codeql", "cve", "other"]),
      detectionStatus: z.enum(["detectable", "undetectable", "pending"]),
      fileId: z.string(),
      diagnostics: z
        .array(
          z.object({
            id: z.string(),
            lintName: z.string(),
            declaredLevel: z.string().nullable(),
            effectiveLevel: z.string(),
            startLine: z.number().int().positive(),
            endLine: z.number().int().positive(),
            rules: z.array(
              z.object({ name: z.string(), line: z.number().int().positive() }),
            ),
            fields: z.array(
              z.object({
                key: z.string(),
                args: z.string().nullable(),
                text: z.string(),
                raw: z.string(),
                line: z.number().int().positive(),
              }),
            ),
          }),
        )
        .min(1),
    }),
  ),
  instances: z.array(
    z.object({
      id: z.string(),
      type: z.enum(["positive", "negative"]),
      patternIds: z.array(z.string()).min(1),
      start: z.number().int().positive(),
      end: z.number().int().positive(),
      actualResult: z.enum(["match", "no_match", "not_run", "error"]),
      expectedResult: z.enum(["match", "no_match"]),
      diagnosticLines: z.array(z.number().int().positive()),
      baselineReferences: z.array(
        z.object({
          path: z.string(),
          githubUrl: z.string().url(),
          profile: z.string(),
          containsTargetDiagnostic: z.boolean(),
          sha256: z.string(),
        }),
      ),
    }),
  ),
  files: z.array(
    z.object({
      id: z.string(),
      asset: z.string(),
      path: z.string(),
      githubUrl: z.string().url(),
      updatedAt: z.string().datetime({ offset: true }),
    }),
  ),
}).parse(raw);
const data = raw as Catalog;
for (const list of [data.patterns, data.instances, data.files])
  if (new Set(list.map((x) => x.id)).size !== list.length)
    throw Error("重复 ID");
for (const p of data.patterns)
  if (!data.files.some((x) => x.id === p.fileId))
    throw Error(`模式文件缺失 ${p.id}`);
for (const p of data.patterns) {
  const f = data.files.find((f) => f.id === p.fileId)!;
  const ids = p.diagnostics.map((d) => d.id);
  if (new Set(ids).size !== ids.length) throw Error("重复诊断组");
  for (const d of p.diagnostics) {
    if (
      d.endLine > f.lineCount ||
      d.startLine > d.endLine ||
      d.fields.some((x) => x.line < d.startLine || x.line > d.endLine) ||
      d.rules.some((x) => x.line > f.lineCount)
    )
      throw Error(`诊断位置无效 ${p.id}`);
  }
}
for (const i of data.instances) {
  const f = data.files.find((x) => x.id === i.fileId);
  if (
    !f ||
    i.end < i.start ||
    i.end > f.lineCount ||
    i.diagnosticLines.some((n) => n > f.lineCount) ||
    !i.patternIds.every((id) => data.patterns.some((x) => x.id === id))
  )
    throw Error(`案例引用无效 ${i.id}`);
}
for (const f of data.files) {
  const asset = JSON.parse(
    await readFile(`public/generated/${f.asset}`, "utf8"),
  );
  if (
    asset.code.split("\n").length !== f.lineCount ||
    !asset.html.includes("data-line=") ||
    createHash("sha256").update(asset.code).digest("hex") !== f.hash
  )
    throw Error(`代码资源无效 ${f.path}`);
}
const manifest = allowedManifestSchema.parse(
  JSON.parse(await readFile("metadata/allowed-pairs.json", "utf8")),
);
assertCatalogMatchesAllowlist(data, manifest);
if (
  (await readFile("docs/pattern-instance-mapping.md", "utf8")) !==
  renderMappingTable(manifest)
)
  throw Error("对应关系表与元数据不一致，请运行 npm run data:table");
const generatedFiles = await import("node:fs/promises").then((fs) =>
  fs.readdir("public/generated"),
);
if (
  generatedFiles.some(
    (f) => f !== "catalog.json" && !data.files.some((x) => x.asset === f),
  )
)
  throw Error("残留表外代码资源");
console.log("收录关联全集一致、排除关联零混入、无额外关联和旧代码资源。");
console.log("数据结构、ID、引用、行范围、更新时间和代码资源检查通过。");
