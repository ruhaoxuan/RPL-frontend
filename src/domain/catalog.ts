import { z } from "zod";
import type { Catalog } from "./model";

const line = z.number().int().positive();
const strings = z.array(z.string());
export const catalogSchema: z.ZodType<Catalog> = z
  .object({
    manifest: z.object({
      schemaVersion: z.literal(3),
      dataPolicy: z.literal("curated-allowlist"),
      allowedPairCount: z.number().int().nonnegative(),
      excludedPairCount: z.number().int().nonnegative(),
      sourceCommit: z.string().regex(/^[a-f0-9]{40}$/),
      generatedAt: z.string().datetime({ offset: true }),
      sourceRepository: z.string().url(),
      rawRustFiles: z.number().int().nonnegative(),
    }),
    patterns: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        description: z.string(),
        source: z.enum(["clippy", "codeql", "cve", "other"]),
        category: z.string(),
        tags: strings,
        externalIds: strings,
        diagNames: strings,
        detectionStatus: z.enum(["detectable", "undetectable", "pending"]),
        fileId: z.string(),
        diagnostics: z
          .array(
            z.object({
              id: z.string(),
              lintName: z.string(),
              declaredLevel: z.string().nullable(),
              effectiveLevel: z.string(),
              startLine: line,
              endLine: line,
              rules: z.array(z.object({ name: z.string(), line })),
              fields: z.array(
                z.object({
                  key: z.string(),
                  args: z.string().nullable(),
                  text: z.string(),
                  raw: z.string(),
                  line,
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
        name: z.string(),
        description: z.string(),
        type: z.enum(["positive", "negative"]),
        patternIds: strings.min(1),
        fileId: z.string(),
        start: line,
        end: line,
        evidence: z.string(),
        profiles: strings,
        actualResult: z.enum(["match", "no_match", "not_run", "error"]),
        expectedResult: z.enum(["match", "no_match"]),
        diagnosticLines: z.array(line),
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
        path: z.string(),
        githubUrl: z.string().url(),
        updatedAt: z.string().datetime({ offset: true }),
        hash: z.string(),
        asset: z.string(),
        lineCount: line,
      }),
    ),
  })
  .superRefine((data, ctx) => {
    const files = new Set(data.files.map((f) => f.id));
    const patterns = new Set(data.patterns.map((p) => p.id));
    for (const items of [data.files, data.patterns, data.instances]) {
      if (new Set(items.map((x) => x.id)).size !== items.length)
        ctx.addIssue({ code: "custom", message: "重复 ID" });
    }
    if (
      data.patterns.some((p) => !files.has(p.fileId)) ||
      data.instances.some(
        (i) =>
          !files.has(i.fileId) || i.patternIds.some((id) => !patterns.has(id)),
      )
    )
      ctx.addIssue({ code: "custom", message: "目录引用缺失" });
  });
