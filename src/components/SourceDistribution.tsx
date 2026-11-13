import React from "react";
import type { Pattern, Source } from "../domain/model";
import { sourceLabels } from "../domain/model";
import { sourceColors, sourceDistribution } from "../domain/sourceDistribution";
import styles from "./SourceDistribution.module.css";

export function SourceDistribution({
  patterns,
  activeSource,
  onSelect,
}: {
  patterns: Pattern[];
  activeSource: string;
  onSelect: (source: Source) => void;
}) {
  const items = sourceDistribution(patterns);
  const total = items.reduce((n, item) => n + item.count, 0);
  const description = items
    .map(
      (item) =>
        `${sourceLabels[item.source]} ${item.count} 条，占 ${(item.fraction * 100).toFixed(1)}%`,
    )
    .join("；");
  return (
    <section
      className={styles.panel}
      aria-labelledby="source-distribution-title"
    >
      <div className={styles.heading}>
        <div>
          <h2 id="source-distribution-title">
            模式来源分布 <span>Source composition</span>
          </h2>
          <p>按独立模式计数；点击图例筛选目录。百分比经四舍五入。</p>
        </div>
        <span className={styles.caption}>全部来源 · {total} 条模式</span>
      </div>
      <div className={styles.content}>
        <svg
          className={styles.chart}
          viewBox="0 0 200 200"
          role="img"
          aria-label={`模式来源占比，合计 ${total} 条。${description}`}
        >
          <circle
            cx="100"
            cy="100"
            r="74"
            fill="none"
            stroke="#f0f2f5"
            strokeWidth="23"
          />
          {items
            .filter((item) => item.count > 0)
            .map((item) => (
              <circle
                key={item.source}
                cx="100"
                cy="100"
                r="74"
                fill="none"
                stroke={sourceColors[item.source]}
                strokeWidth="23"
                pathLength="100"
                strokeDasharray={`${item.fraction * 100} ${100 - item.fraction * 100}`}
                strokeDashoffset={-item.offset * 100}
                transform="rotate(-90 100 100)"
              >
                <title>
                  {sourceLabels[item.source]}：{item.count} 条（
                  {(item.fraction * 100).toFixed(1)}%）
                </title>
              </circle>
            ))}
          <text x="100" y="101" textAnchor="middle" className={styles.total}>
            {total}
          </text>
          <text
            x="100"
            y="122"
            textAnchor="middle"
            className={styles.centerLabel}
          >
            模式总数
          </text>
        </svg>
        <div className={styles.legend} aria-label="来源图例，可点击筛选目录">
          {items.map((item) => (
            <button
              key={item.source}
              type="button"
              aria-label={`按 ${sourceLabels[item.source]} 筛选模式`}
              aria-pressed={activeSource === item.source}
              onClick={() => onSelect(item.source)}
              className={activeSource === item.source ? styles.active : ""}
            >
              <span className={styles.source}>
                <i style={{ background: sourceColors[item.source] }} />
                {sourceLabels[item.source]}
              </span>
              <span className={styles.count}>
                {item.count}
                <small>条</small>
              </span>
              <span className={styles.percentage}>
                {(item.fraction * 100).toFixed(1)}
                <small>%</small>
              </span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
