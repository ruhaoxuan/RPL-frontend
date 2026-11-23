import type { DataSource } from "./dataSources";
export type Source = "clippy" | "codeql" | "cve" | "other";
export type Result = "match" | "no_match" | "not_run" | "error";
export interface CodeFile {
  id: string;
  path: string;
  githubUrl: string;
  updatedAt: string;
  hash: string;
  asset: string;
  lineCount: number;
}
export interface DiagnosticField {
  key: string;
  args: string | null;
  text: string;
  raw: string;
  line: number;
}
export interface DiagnosticGroup {
  id: string;
  lintName: string;
  declaredLevel: string | null;
  effectiveLevel: string;
  startLine: number;
  endLine: number;
  fields: DiagnosticField[];
  rules: { name: string; line: number }[];
}
export interface Pattern {
  id: string;
  name: string;
  description: string;
  source: Source;
  category: string;
  tags: string[];
  externalIds: string[];
  diagNames: string[];
  diagnostics: DiagnosticGroup[];
  detectionStatus: "detectable" | "undetectable" | "pending";
  fileId: string;
}
export interface Instance {
  id: string;
  name: string;
  description: string;
  type: "positive" | "negative";
  patternIds: string[];
  fileId: string;
  start: number;
  end: number;
  evidence: string;
  profiles: string[];
  actualResult: Result;
  expectedResult: "match" | "no_match";
  diagnosticLines: number[];
  baselineReferences: {
    path: string;
    githubUrl: string;
    profile: string;
    containsTargetDiagnostic: boolean;
    sha256: string;
  }[];
}
export interface Catalog {
  dataSources: DataSource[];
  manifest: {
    schemaVersion: number;
    dataPolicy: "curated-allowlist";
    allowedPairCount: number;
    excludedPairCount: number;
    sourceCommit: string;
    generatedAt: string;
    sourceRepository: string;
    rawRustFiles: number;
  };
  patterns: Pattern[];
  instances: Instance[];
  files: CodeFile[];
}
export interface CodeAsset {
  code: string;
  html: string;
}
export const sourceLabels: Record<Source, string> = {
  clippy: "Clippy",
  codeql: "CodeQL",
  cve: "CVE",
  other: "UB",
};
export const statusLabels = {
  detectable: "可检测",
  undetectable: "不可检测",
  pending: "待验证",
};
export function verdict(type: Instance["type"], actual: Result) {
  if (actual === "not_run") return "未验证";
  if (actual === "error") return "执行错误";
  return (type === "positive") === (actual === "match") ? "通过" : "未通过";
}
export function counts(instances: Instance[]) {
  return {
    total: instances.length,
    positive: instances.filter((x) => x.type === "positive").length,
    negative: instances.filter((x) => x.type === "negative").length,
  };
}

export const resultLabels: Record<Result, string> = {
  match: "Match",
  no_match: "No Match",
  not_run: "Not Run",
  error: "Error",
};
