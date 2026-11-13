import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { selectPatterns } from "../src/domain/search";
import { verdict, type Catalog } from "../src/domain/model";
import {
  allowedManifestSchema,
  assertCatalogMatchesAllowlist,
} from "../scripts/allowlist";
import { sourceDistribution } from "../src/domain/sourceDistribution";
const data = JSON.parse(
  readFileSync("public/generated/catalog.json", "utf8"),
) as Catalog;
const manifest = allowedManifestSchema.parse(
  JSON.parse(readFileSync("metadata/allowed-pairs.json", "utf8")),
);
test("收录110对完全相等，41对排除，53模式91正例19反例", () => {
  assert.equal(manifest.pairs.length, 110);
  assert.equal(manifest.excludedPairs.length, 41);
  assertCatalogMatchesAllowlist(data, manifest);
  assert.equal(data.patterns.length, 53);
  assert.equal(data.instances.length, 110);
  assert.equal(data.instances.filter((i) => i.type === "positive").length, 91);
  assert.equal(data.instances.filter((i) => i.type === "negative").length, 19);
  assert.ok(data.instances.every((i) => i.actualResult === "not_run"));
  assert.ok(data.patterns.every((p) => p.detectionStatus === "pending"));
});
test("发布目录不携带原始表格出处和行号，维护信息仍可追溯", () => {
  assert.doesNotMatch(
    JSON.stringify(data),
    /Excel|\.xlsx|workbook|spreadsheetRows|白色允许清单|橙色/i,
  );
  assert.equal(data.manifest.dataPolicy, "curated-allowlist");
  assert.ok(manifest.sourceWorkbook);
  assert.ok(manifest.pairs.every((p) => Number.isInteger(p.spreadsheetRow)));
});
test("已收录的两个修复版仍为Negative，即使基准含诊断", () => {
  for (const row of [125, 133]) {
    const pair = manifest.pairs.find((p) => p.spreadsheetRow === row)!;
    const file = data.files.find((f) => f.path === pair.instanceFile)!;
    const i = data.instances.find((i) => i.fileId === file.id)!;
    assert.ok(i);
    assert.equal(i.type, "negative");
    assert.equal(i.expectedResult, "no_match");
    assert.ok(i.baselineReferences.some((b) => b.containsTargetDiagnostic));
    assert.equal(i.actualResult, "not_run");
  }
});
test("按模式文件组合过滤，不因文件共享放行排除关系", () => {
  const f = data.files.find((f) => f.path === "tests/ui/clippy/uninit_vec.rs")!;
  const cases = data.instances.filter((i) => i.fileId === f.id);
  assert.equal(cases.length, 1);
  assert.deepEqual(cases[0].patternIds, ["clippy/uninit-vec"]);
});
test("遗漏、表外关联、分类冲突和重复清单均拒绝", () => {
  const missing = structuredClone(data);
  missing.instances.pop();
  assert.throws(() => assertCatalogMatchesAllowlist(missing, manifest), /遗漏/);
  const extra = structuredClone(data);
  extra.instances[0].patternIds.push("injected");
  assert.throws(
    () => assertCatalogMatchesAllowlist(extra, manifest),
    /未收录或已排除/,
  );
  const wrong = structuredClone(data);
  wrong.instances[0].type = "negative";
  assert.throws(() => assertCatalogMatchesAllowlist(wrong, manifest), /分类/);
  const duplicate = structuredClone(manifest);
  duplicate.pairs.push(duplicate.pairs[0]);
  assert.throws(() => allowedManifestSchema.parse(duplicate));
});
test("来源占比按53个模式计数，空数据无NaN", () => {
  const all = sourceDistribution(data.patterns);
  assert.deepEqual(
    all.map((x) => x.count),
    [18, 3, 28, 4],
  );
  assert.ok(Math.abs(all.reduce((n, x) => n + x.fraction, 0) - 1) < 1e-12);
  assert.ok(sourceDistribution([]).every((x) => x.fraction === 0));
});
test("搜索和筛选只访问允许数据", () => {
  assert.equal(
    selectPatterns(data, new URLSearchParams("type=negative")).length,
    18,
  );
  assert.equal(selectPatterns(data, new URLSearchParams("has=no")).length, 0);
  assert.equal(
    selectPatterns(data, new URLSearchParams("q=ctor_initialization.rs"))
      .length,
    1,
  );
});
test("预期与实际独立判定", () => {
  assert.equal(verdict("negative", "match"), "未通过");
  assert.equal(verdict("positive", "no_match"), "未通过");
  assert.equal(verdict("negative", "not_run"), "未验证");
  assert.equal(verdict("positive", "match"), "通过");
  assert.equal(verdict("negative", "no_match"), "通过");
  assert.equal(verdict("negative", "error"), "执行错误");
});
