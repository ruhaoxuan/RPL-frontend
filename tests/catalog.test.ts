import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { catalogSchema } from "../src/domain/catalog";
const data = JSON.parse(readFileSync("public/generated/catalog.json", "utf8"));
test("目录接受完整数据，拒绝错误版本、缺项和失效引用", () => {
  assert.ok(catalogSchema.safeParse(data).success);
  const missingTags = structuredClone(data);
  delete missingTags.patterns[0].tags;
  const missingFile = structuredClone(data);
  missingFile.instances[0].fileId = "missing";
  const version = structuredClone(data);
  version.manifest.schemaVersion = 2;
  for (const value of [{}, null, missingTags, missingFile, version])
    assert.equal(catalogSchema.safeParse(value).success, false);
});
