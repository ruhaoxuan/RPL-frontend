import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { extractDiagnostics } from "../scripts/diagnostics";
const root = "vendor/RPL/docs/patterns-pest/";
test("真实 ctor 文件完整保留3组诊断与显式规则关联", () => {
  const groups = extractDiagnostics(
    readFileSync(root + "codeql/ctor-initialization.rpl", "utf8"),
  );
  assert.deepEqual(
    groups.map((g) => g.lintName),
    [
      "ctor_initialization_print",
      "ctor_initialization_stdout",
      "ctor_initialization_stderr",
    ],
  );
  assert.deepEqual(
    groups.map((g) => g.rules[0].name),
    ["ctor_println", "ctor_stdout", "ctor_stderr"],
  );
  assert.ok(
    groups[1].fields
      .find((f) => f.key === "help")!
      .text.includes("STDOUT_FILENO"),
  );
  assert.ok(
    groups[2].fields
      .find((f) => f.key === "help")!
      .text.includes("STDERR_FILENO"),
  );
});
test("多个label不覆盖，并支持子规则同名默认关联", () => {
  const [g] = extractDiagnostics(
    readFileSync(root + "cve/CVE-2020-25795.rpl", "utf8"),
  );
  assert.equal(g.fields.filter((f) => f.key === "label").length, 2);
  assert.deepEqual(
    g.fields.filter((f) => f.key === "label").map((f) => f.args),
    ["poison", "iter"],
  );
  assert.equal(g.rules[0].name, "insert_from_copy_then_next");
});
test("字符串括号、转义、占位符、重复字段和注释不破坏分组", () => {
  const source = String.raw`pattern sample
 // diag { fake = { name = "fake" } }
 patt { #[diag = "group"] #[deduplicate] first = fn _(..) {} }
 diag { /* } nested /* { */ */ group = {
 primary(site) = "a { bracket {$value} and \"quote\"", label(a) = "first", label(b) = "second",
 note = "one", note = "two", help = "Option<T>", name = "different_lint",
 suggestion(code = "f({$value})", span = "site") = "replace",
 } }`;
  const [g] = extractDiagnostics(source);
  assert.equal(g.id, "group");
  assert.equal(g.lintName, "different_lint");
  assert.equal(g.declaredLevel, null);
  assert.equal(g.effectiveLevel, "deny");
  assert.equal(g.rules[0].name, "first");
  assert.equal(g.fields.filter((f) => f.key === "note").length, 2);
  assert.ok(g.fields[0].text.includes("{$value}"));
  assert.ok(g.fields[0].text.includes('"quote"'));
  assert.ok(
    g.fields.find((f) => f.key === "suggestion")!.args!.includes("f({$value})"),
  );
});
test("畸形诊断必须给出错误，不静默丢失", () => {
  assert.throws(
    () =>
      extractDiagnostics(
        'pattern a\ndiag { x = { primary(a) = "hi", } }',
        "bad.rpl",
      ),
    /bad.rpl/,
  );
  assert.throws(
    () =>
      extractDiagnostics(
        'pattern a\ndiag { x = { name = "x", primary(a) = "hi"',
        "bad.rpl",
      ),
    /未闭合/,
  );
});
