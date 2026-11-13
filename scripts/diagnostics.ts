import type { DiagnosticGroup, DiagnosticField } from "../src/domain/model";
type Token = {
  value: string;
  kind: "word" | "string" | "symbol";
  start: number;
  end: number;
  line: number;
};

/** Focused metadata reader, not a replacement for the Rust RPL semantic parser.
 * Strings/comments are tokenized before brace traversal; repeated fields retain source order.
 */
export function extractDiagnostics(
  source: string,
  file = "input.rpl",
): DiagnosticGroup[] {
  const tokens: Token[] = [];
  let i = 0,
    line = 1;
  function fail(message: string): never {
    throw Error(`${file}:${line}: ${message}`);
  }
  function advance() {
    if (source[i] === "\n") line++;
    i++;
  }
  while (i < source.length) {
    if (/\s/.test(source[i])) {
      advance();
      continue;
    }
    if (source.startsWith("//", i)) {
      while (i < source.length && source[i] !== "\n") advance();
      continue;
    }
    if (source.startsWith("/*", i)) {
      let depth = 1;
      advance();
      advance();
      while (i < source.length && depth) {
        if (source.startsWith("/*", i)) {
          depth++;
          advance();
          advance();
        } else if (source.startsWith("*/", i)) {
          depth--;
          advance();
          advance();
        } else advance();
      }
      if (depth) fail("未闭合的注释");
      continue;
    }
    const start = i,
      startLine = line;
    if (source[i] === '"') {
      advance();
      let closed = false;
      while (i < source.length) {
        if (source[i] === "\\") {
          advance();
          if (i < source.length) advance();
        } else if (source[i] === '"') {
          advance();
          closed = true;
          break;
        } else advance();
      }
      if (!closed) fail("未闭合的字符串");
      const raw = source.slice(start, i);
      let text: string;
      try {
        text = JSON.parse(raw);
      } catch {
        text = raw.slice(1, -1);
      }
      tokens.push({
        value: text,
        kind: "string",
        start,
        end: i,
        line: startLine,
      });
      continue;
    }
    // Character constants must not contribute structural braces.
    const char = source.slice(i).match(/^'(?:\\.|[^'\\\n])'/);
    if (char) {
      for (let n = 0; n < char[0].length; n++) advance();
      tokens.push({
        value: char[0],
        kind: "symbol",
        start,
        end: i,
        line: startLine,
      });
      continue;
    }
    const word = source.slice(i).match(/^\$?[A-Za-z_][A-Za-z0-9_-]*/);
    if (word) {
      i += word[0].length;
      tokens.push({
        value: word[0],
        kind: "word",
        start,
        end: i,
        line: startLine,
      });
      continue;
    }
    advance();
    tokens.push({
      value: source.slice(start, i),
      kind: "symbol",
      start,
      end: i,
      line: startLine,
    });
  }
  function is(index: number, value: string) {
    return tokens[index]?.kind !== "string" && tokens[index]?.value === value;
  }
  function close(at: number, open: string, end: string) {
    let depth = 0;
    for (let j = at; j < tokens.length; j++) {
      if (is(j, open)) depth++;
      if (is(j, end)) {
        depth--;
        if (depth === 0) return j;
      }
    }
    throw Error(`${file}:${tokens[at]?.line}: 未闭合 ${open}`);
  }
  const groups: DiagnosticGroup[] = [];
  let depth = 0;
  for (let t = 0; t < tokens.length; t++) {
    if (depth === 0 && is(t, "diag") && is(t + 1, "{")) {
      const blockEnd = close(t + 1, "{", "}");
      let j = t + 2;
      while (j < blockEnd) {
        const group = tokens[j];
        if (group.kind !== "word" || !is(j + 1, "=") || !is(j + 2, "{"))
          throw Error(`${file}:${group.line}: 无法解析诊断组`);
        const groupEnd = close(j + 2, "{", "}");
        const fields: DiagnosticField[] = [];
        let k = j + 3;
        while (k < groupEnd) {
          if (is(k, ",")) {
            k++;
            continue;
          }
          const key = tokens[k++];
          if (key.kind !== "word")
            throw Error(`${file}:${key.line}: 无法解析诊断字段`);
          let args: string | null = null;
          if (is(k, "(")) {
            const last = close(k, "(", ")");
            args = source.slice(tokens[k].end, tokens[last].start);
            k = last + 1;
          }
          if (!(is(k, "=") || (key.value.startsWith("$") && is(k, ":"))))
            throw Error(`${file}:${key.line}: 诊断字段缺少等号`);
          k++;
          const value = tokens[k++];
          if (value?.kind !== "string")
            throw Error(`${file}:${key.line}: 诊断字段值不是字符串`);
          fields.push({
            key: key.value,
            args,
            text: value.value,
            raw: source.slice(value.start, value.end),
            line: key.line,
          });
        }
        const last = (key: string) =>
          fields.filter((f) => f.key === key).at(-1)?.text;
        if (!last("name") || !fields.some((f) => f.key === "primary"))
          throw Error(`${file}:${group.line}: 诊断缺少 name 或 primary`);
        if (groups.some((g) => g.id === group.value))
          throw Error(`${file}:${group.line}: 重复诊断组 ${group.value}`);
        groups.push({
          id: group.value,
          lintName: last("name")!,
          declaredLevel: last("level") ?? null,
          effectiveLevel: last("level") ?? "deny",
          startLine: group.line,
          endLine: tokens[groupEnd].line,
          fields,
          rules: [],
        });
        j = groupEnd + 1;
      }
      t = blockEnd;
      continue;
    }
    if (is(t, "{")) depth++;
    else if (is(t, "}")) depth--;
  }
  // RPL uses #[diag] when present; otherwise it resolves the subrule's own name.
  // See rpl_context/src/pat/mod.rs: diag_name().unwrap_or(*name).
  let nesting = 0;
  for (let t = 0; t < tokens.length; t++) {
    if (nesting === 0 && is(t, "patt") && is(t + 1, "{")) {
      const end = close(t + 1, "{", "}");
      let j = t + 2;
      let explicit: string | null = null;
      while (j < end) {
        if (is(j, "#") && is(j + 1, "[")) {
          const last = close(j + 1, "[", "]");
          if (
            is(j + 2, "diag") &&
            is(j + 3, "=") &&
            tokens[j + 4]?.kind === "string"
          )
            explicit = tokens[j + 4].value;
          j = last + 1;
          continue;
        }
        if (is(j, "use")) {
          while (j < end && !is(j, ";")) j++;
          j++;
          continue;
        }
        let next = j + 1;
        if (tokens[j]?.kind === "word") {
          if (is(next, "[")) next = close(next, "[", "]") + 1;
          if (is(next, "=")) {
            const name = tokens[j].value,
              target = groups.find((g) => g.id === (explicit ?? name));
            if (explicit && !target)
              throw Error(
                `${file}:${tokens[j].line}: 引用了不存在的诊断组 ${explicit}`,
              );
            if (target) target.rules.push({ name, line: tokens[j].line });
            explicit = null;
            j = next + 1;
            continue;
          }
        }
        if (is(j, "{")) j = close(j, "{", "}") + 1;
        else if (is(j, "(")) j = close(j, "(", ")") + 1;
        else j++;
      }
      t = end;
      continue;
    }
    if (is(t, "{")) nesting++;
    else if (is(t, "}")) nesting--;
  }
  return groups;
}
