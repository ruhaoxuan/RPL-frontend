import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { allowedManifestSchema, type AllowedManifest } from "./allowlist";

export function renderMappingTable(manifest: AllowedManifest): string {
  const patterns = new Set(manifest.pairs.map((p) => p.patternId));
  const positive = manifest.pairs.filter((p) => p.type === "positive").length;
  const escape = (value: string) =>
    value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
  const fileLink = (file: string) => `[${escape(file)}](../vendor/RPL/${file})`;
  return [
    "# 模式—实例对应表",
    "",
    "本表由仓库内的 `metadata/allowed-pairs.json` 生成，供浏览核对。JSON 是收录范围、预期类型和文件校验信息的唯一数据来源。展示数据直接由 JSON 生成；本表用于阅读及一致性校验，不作为数据来源，也不依赖外部资料。",
    "",
    `当前包含 **${patterns.size} 条模式、${manifest.pairs.length} 对关联**，其中 Positive ${positive} 对、Negative ${manifest.pairs.length - positive} 对。`,
    "",
    `核对的上游提交：\`${manifest.reviewedSourceCommit}\`。`,
    "",
    "修改对应关系后运行 `npm run data:table` 同步本表，再运行 `npm run build` 和 `npm test`。数据检查会拒绝表格与 JSON 不一致的版本。",
    "",
    "| 序号 | 模式 ID / 模式文件 | 实例文件 | 类型 | 预期结果 | RPL 诊断名称 |",
    "| --- | --- | --- | --- | --- | --- |",
    ...manifest.pairs.map(
      (p, i) =>
        `| ${i + 1} | [${escape(p.patternId)}](../vendor/RPL/${p.patternFile}) | ${fileLink(p.instanceFile)} | ${p.type === "positive" ? "Positive" : "Negative"} | ${p.expectedResult === "match" ? "Match" : "No Match"} | ${p.diagNames.map((d) => "`" + escape(d) + "`").join("、")} |`,
    ),
    "",
    "Positive/Negative 是相对于关联模式的预期。预期结果不等于已执行的实际结果；历史诊断基准也不等于当前运行报告。",
    "",
  ].join("\n");
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const manifest = allowedManifestSchema.parse(
    JSON.parse(await readFile("metadata/allowed-pairs.json", "utf8")),
  );
  await mkdir("docs", { recursive: true });
  await writeFile(
    "docs/pattern-instance-mapping.md",
    renderMappingTable(manifest),
  );
  console.log("已更新 docs/pattern-instance-mapping.md");
}
