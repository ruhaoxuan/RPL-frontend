import React from "react";
import type { DiagnosticGroup, CodeFile } from "../domain/model";
import styles from "./DiagnosticsPanel.module.css";

const names: Record<string, string> = {
  primary: "主要提示",
  note: "原因说明",
  help: "修改建议",
  label: "位置说明",
  suggestion: "代码替换建议",
};
export function DiagnosticsPanel({
  diagnostics,
  file,
  onLocate,
}: {
  diagnostics: DiagnosticGroup[];
  file: CodeFile;
  onLocate: (start: number, end?: number) => void;
}) {
  return (
    <section className={styles.panel} aria-labelledby="diagnostic-heading">
      <div className={styles.heading}>
        <h2 id="diagnostic-heading">
          诊断说明 <span>{diagnostics.length} 组</span>
        </h2>
        <small>原始诊断文案 · 与实际检测结果分开</small>
      </div>
      <p className={styles.intro}>
        按诊断组查看主要问题、原因及修改建议。位置标签指向 RPL
        模式中的语句，不表示实例的实际命中行。
      </p>
      {diagnostics.map((g, index) => (
        <details key={g.id} open={index === 0} className={styles.group}>
          <summary>
            <span className={styles.groupTitle}>
              {g.id}
              <small>{g.fields.find((f) => f.key === "primary")?.text}</small>
            </span>
            <span
              className={styles.level}
              title="默认诊断策略，不是风险严重性或可检测状态"
            >
              {g.effectiveLevel}
              {g.declaredLevel === null ? "（默认）" : ""}
            </span>
            <span className={styles.toggle}>展开 / 收起</span>
          </summary>
          <div className={styles.body}>
            <div className={styles.meta}>
              <span>
                RPL lint <code>rpl::{g.lintName}</code>
              </span>
              <span>
                默认诊断级别 <b>{g.effectiveLevel}</b>
                {g.declaredLevel === null
                  ? "（上游未显式声明，当前引擎默认 deny）"
                  : "（文件显式声明）"}
              </span>
              <button
                type="button"
                onClick={() => onLocate(g.startLine, g.endLine)}
              >
                在本页查看诊断源码 ↓
              </button>
            </div>
            <div className={styles.rules}>
              <b>使用此提示的检测规则</b>
              {g.rules.length ? (
                g.rules.map((r) => (
                  <button
                    type="button"
                    key={`${r.name}:${r.line}`}
                    onClick={() => onLocate(r.line)}
                  >
                    <code>{r.name}</code>
                    <small>L{r.line} ↓</small>
                  </button>
                ))
              ) : (
                <span>未发现显式引用</span>
              )}
            </div>
            {(["primary", "note", "help", "label", "suggestion"] as const).map(
              (key) => {
                const fields = g.fields.filter((f) => f.key === key);
                return fields.length ? (
                  <div key={key} className={styles.field}>
                    <h3>{names[key]}</h3>
                    {fields.map((f, n) => (
                      <div key={`${f.line}:${n}`} className={styles.message}>
                        <p>{f.text}</p>
                        {f.args !== null && (
                          <div className={styles.arguments}>
                            <span>
                              {key === "suggestion"
                                ? "替换参数"
                                : "模式位置标签"}
                            </span>
                            <code>{f.args}</code>
                          </div>
                        )}
                        <button
                          type="button"
                          className={styles.lineLink}
                          onClick={() => onLocate(f.line)}
                        >
                          本页源码 L{f.line} ↓
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null;
              },
            )}
            {g.fields
              .filter(
                (f) =>
                  ![
                    "primary",
                    "note",
                    "help",
                    "label",
                    "suggestion",
                    "name",
                    "level",
                  ].includes(f.key),
              )
              .map((f, n) => (
                <div key={`extra:${n}`} className={styles.field}>
                  <h3>{f.key}</h3>
                  <p>{f.text}</p>
                  {f.args && <code>{f.args}</code>}
                </div>
              ))}
          </div>
        </details>
      ))}
    </section>
  );
}
