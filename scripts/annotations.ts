export function extractAnnotations(code: string, known: Set<string>) {
  const lines = code.split("\n");
  const out: { line: number; diag: string; profile: string }[] = [];
  let previous = 0;
  lines.forEach((line, index) => {
    const m = line.match(/\/\/~(?:\[([^\]]+)\])?(\^+|\|)?\s*(.*)$/);
    if (!m) return;
    const target =
      m[2] === "|"
        ? previous
        : m[2]?.startsWith("^")
          ? index + 1 - m[2].length
          : index + 1;
    previous = target;
    const diag = m[3]
      .trim()
      .split(/\s+/)
      .find((x) => known.has(x));
    if (diag && target > 0 && target <= lines.length)
      out.push({ line: target, diag, profile: m[1] || "all" });
  });
  return out;
}
