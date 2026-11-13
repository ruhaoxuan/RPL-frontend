import type { Pattern, Source } from "./model";

export const sourceColors: Record<Source, string> = {
  clippy: "#729bd0",
  codeql: "#a18acb",
  cve: "#d29094",
  other: "#a6afb8",
};

/** Count unique patterns, never instances or links. The full catalog is the denominator. */
export function sourceDistribution(patterns: Pick<Pattern, "id" | "source">[]) {
  const unique = [...new Map(patterns.map((p) => [p.id, p])).values()];
  let offset = 0;
  return (["clippy", "codeql", "cve", "other"] as Source[]).map((source) => {
    const count = unique.filter((p) => p.source === source).length;
    const fraction = unique.length ? count / unique.length : 0;
    const item = { source, count, fraction, offset };
    offset += fraction;
    return item;
  });
}
