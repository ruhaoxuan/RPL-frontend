import { readFile, writeFile, mkdir, readdir, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";
import { createHighlighter } from "shiki";
import { descriptions } from "../metadata/curated";
import { extractDiagnostics } from "./diagnostics";
import { extractAnnotations } from "./annotations";
import {
  allowedManifestSchema,
  assertCatalogMatchesAllowlist,
} from "./allowlist";
import type {
  Catalog,
  CodeAsset,
  CodeFile,
  Instance,
  Pattern,
} from "../src/domain/model";
const root = path.resolve("vendor/RPL"),
  out = path.resolve("public/generated");
const git = (...args: string[]) =>
  execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
const commit = git("rev-parse", "HEAD");
if (git("status", "--porcelain", "--untracked-files=no"))
  throw Error("RPL 子模块存在未提交修改；请先固定上游版本。");
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
async function walk(dir: string): Promise<string[]> {
  const a = await readdir(path.join(root, dir), { withFileTypes: true });
  return (
    await Promise.all(
      a
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((x) =>
          x.isDirectory() ? walk(`${dir}/${x.name}`) : [`${dir}/${x.name}`],
        ),
    )
  ).flat();
}
const allowlist = allowedManifestSchema.parse(
  JSON.parse(await readFile("metadata/allowed-pairs.json", "utf8")),
);
const allowedPatternIds = new Set(allowlist.pairs.map((p) => p.patternId));
// Fail closed if reviewed content changes; unrelated source changes are safe.
for (const pair of allowlist.pairs) {
  for (const [file, expected] of [
    [pair.patternFile, pair.patternSha256],
    [pair.instanceFile, pair.instanceSha256],
  ]) {
    const content = await readFile(path.join(root, file), "utf8");
    if (hash(content) !== expected)
      throw Error(
        `关联 ${pair.id} 的源码发生变化，请重新审查允许清单：${file}`,
      );
  }
}
await mkdir(out, { recursive: true });
const rplGrammar = {
  name: "rpl",
  scopeName: "source.rpl",
  repository: {},
  patterns: [
    { name: "comment.line.double-slash", begin: "//", end: "$" },
    { name: "comment.block", begin: "/\\*", end: "\\*/" },
    {
      name: "string.quoted.double",
      begin: '"',
      end: '"',
      patterns: [{ name: "constant.character.escape", match: "\\\\." }],
    },
    {
      name: "keyword.control",
      match:
        "\\b(pattern|patt|diag|util|where|let|fn|unsafe|move|const|mut|type|pub|use|struct|enum|impl|return)\\b",
    },
    { name: "variable.other", match: "\\$[A-Za-z_][A-Za-z0-9_]*" },
    { name: "entity.name.function", match: "'[A-Za-z_][A-Za-z0-9_]*" },
    { name: "constant.numeric", match: "\\b[0-9]+\\b" },
    {
      name: "support.type",
      match: "\\b(bool|usize|isize|u8|u16|u32|u64|i8|i16|i32|i64|Self)\\b",
    },
  ],
};
const highlighter = await createHighlighter({
  themes: ["github-light"],
  langs: ["rust", rplGrammar],
});
const files: CodeFile[] = [],
  patterns: Pattern[] = [],
  instances: Instance[] = [];
const codeCache = new Map<string, string>();
async function load(file: string) {
  if (!codeCache.has(file))
    codeCache.set(file, await readFile(path.join(root, file), "utf8"));
  return codeCache.get(file)!;
}
async function register(file: string) {
  let f = files.find((x) => x.path === file);
  if (f) return f;
  const code = await load(file),
    id = hash(file).slice(0, 16);
  const asset = `code-${id}.json`;
  f = {
    id,
    path: file,
    asset,
    lineCount: code.split("\n").length,
    hash: hash(code),
    githubUrl: `https://github.com/RPL-Toolchain/RPL/blob/${commit}/${file}`,
    updatedAt: git("log", "-1", "--format=%cI", "--", file),
  };
  if (!f.updatedAt) throw Error(`缺少提交历史: ${file}`);
  files.push(f);
  const value: CodeAsset = {
    code,
    html: highlighter.codeToHtml(code, {
      lang: file.endsWith(".rpl") ? "rpl" : "rust",
      theme: "github-light",
      transformers: [
        {
          line(node, line) {
            node.properties["data-line"] = line;
          },
        },
      ],
    }),
  };
  await writeFile(path.join(out, asset), JSON.stringify(value));
  return f;
}
for (const file of (await walk("docs/patterns-pest")).filter((x) =>
  x.endsWith(".rpl"),
)) {
  const code = await load(file),
    rel = file.replace("docs/patterns-pest/", ""),
    category = rel.split("/")[0],
    name = path.basename(file, ".rpl"),
    id = rel.replace(/\.rpl$/, "");
  if (!allowedPatternIds.has(id)) continue;
  const diagNames = [...code.matchAll(/\bname\s*=\s*"([^"]+)"/g)].map(
    (x) => x[1],
  );
  const tags = [category === "cve" ? "漏洞模式" : "代码检查"];
  for (const [rx, tag] of [
    [/ptr|pointer/i, "指针"],
    [/transmute|cast/i, "类型转换"],
    [/uninit|initial/i, "初始化"],
    [/drop|lifetime/i, "生命周期"],
    [/vec|collection/i, "集合"],
  ] as const)
    if (rx.test(code + " " + name)) tags.push(tag);
  const diagnostics = [
    ...code.matchAll(/primary\([^)]*\)\s*=\s*"([^"]+)"/g),
  ].map((x) => x[1]);
  patterns.push({
    id,
    name,
    description:
      descriptions[name] ||
      (diagnostics[0]
        ? `上游诊断：${diagnostics[0]}`
        : "此模式的详细说明待补充，请查阅 RPL 原始规则。"),
    source: category === "ub" ? "other" : (category as Pattern["source"]),
    category,
    tags,
    externalIds: category === "cve" ? [name] : diagNames,
    diagNames,
    diagnostics: extractDiagnostics(code, file),
    detectionStatus: "pending",
    fileId: (await register(file)).id,
  });
}
const rust = (await walk("tests/ui")).filter((x) => x.endsWith(".rs"));
for (const pair of allowlist.pairs) {
  const code = await load(pair.instanceFile),
    f = await register(pair.instanceFile);
  const lines = [
    ...new Set(
      extractAnnotations(code, new Set(pair.diagNames)).map((a) => a.line),
    ),
  ].sort((a, b) => a - b);
  const baselines = [];
  for (const baseline of pair.baselineFiles) {
    const text = await readFile(path.join(root, baseline), "utf8");
    const identifiers = new Set(
      [...text.matchAll(/\brpl::([A-Za-z0-9_]+)/g)].map((x) => x[1]),
    );
    const profile =
      path
        .basename(baseline, ".stderr")
        .slice(path.basename(pair.instanceFile, ".rs").length)
        .replace(/^\./, "") || "default";
    baselines.push({
      path: baseline,
      githubUrl: `https://github.com/RPL-Toolchain/RPL/blob/${commit}/${baseline}`,
      profile,
      containsTargetDiagnostic: pair.diagNames.some((d) => identifiers.has(d)),
      sha256: hash(text),
    });
  }
  const existing = instances.find((i) => i.fileId === f.id);
  if (existing) {
    existing.patternIds.push(pair.patternId);
    existing.diagnosticLines = [
      ...new Set([...existing.diagnosticLines, ...lines]),
    ].sort((a, b) => a - b);
    existing.baselineReferences = [
      ...existing.baselineReferences,
      ...baselines.filter(
        (b) => !existing.baselineReferences.some((e) => e.path === b.path),
      ),
    ];
    existing.profiles = [
      ...new Set(existing.baselineReferences.map((b) => b.profile)),
    ];
    continue;
  }
  instances.push({
    id: `instance-${hash(pair.instanceFile).slice(0, 16)}`,
    name: path.basename(pair.instanceFile),
    description: `${pair.type === "positive" ? "该实例预期匹配关联模式。" : "该实例预期不匹配关联模式。"}${pair.note || "完整源文件作为一个实例展示。"}`,
    type: pair.type,
    patternIds: [pair.patternId],
    fileId: f.id,
    start: 1,
    end: f.lineCount,
    evidence:
      "预期结果由已核对的模式—实例关联定义；是否包含历史诊断不会改变预期分类。",
    profiles: [...new Set(baselines.map((b) => b.profile))],
    actualResult: "not_run",
    expectedResult: pair.expectedResult,
    diagnosticLines: lines,
    baselineReferences: baselines,
  });
}
const catalog: Catalog = {
  manifest: {
    schemaVersion: 3,
    dataPolicy: "curated-allowlist",
    allowedPairCount: allowlist.pairs.length,
    excludedPairCount: allowlist.excludedPairs.length,
    sourceCommit: commit,
    sourceRepository: "https://github.com/RPL-Toolchain/RPL",
    generatedAt: new Date().toISOString(),
    rawRustFiles: rust.length,
  },
  patterns,
  instances,
  files,
};
assertCatalogMatchesAllowlist(catalog, allowlist);
await writeFile(path.join(out, "catalog.json"), JSON.stringify(catalog));
for (const f of await readdir(out))
  if (f !== "catalog.json" && !files.some((x) => x.asset === f))
    await rm(path.join(out, f));
highlighter.dispose();
console.log(
  `已生成 ${patterns.length} 条模式、${instances.length} 个案例（反例 ${instances.filter((i) => i.type === "negative").length}）、${files.length} 份代码资源。来源 ${commit.slice(0, 7)}`,
);
