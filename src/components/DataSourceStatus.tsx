import { useSourceSync } from "./useSourceSync";
import React from "react";
import { Link } from "react-router-dom";
import type { DataSource } from "../domain/dataSources";
import { latestSyncedSource } from "../domain/dataSources";
import styles from "./DataSourceStatus.module.css";
const time = (value: string | null) =>
  value
    ? new Date(value).toLocaleString("zh-CN", {
        hour12: false,
        timeZoneName: "short",
      })
    : "尚未记录";
const labels = { never: "未同步", success: "成功", failed: "失败" };
export function SyncSummary({ sources }: { sources: DataSource[] }) {
  const latest = latestSyncedSource(sources);
  return (
    <div className={styles.summary} aria-label="数据同步摘要">
      <span>
        {sources.length > 1 ? "最近一次成功同步" : "数据最近同步"}：
        {time(latest?.lastSyncedAt ?? null)}
        {latest ? ` · ${latest.name}` : ""}
      </span>
      {sources.some((s) => s.lastAttemptStatus === "failed") && (
        <span className={styles.failed}>最近同步失败</span>
      )}
      <Link to="/about?section=data-sources">查看数据源 →</Link>
    </div>
  );
}
export function DataSourceStatus({ sources }: { sources: DataSource[] }) {
  const sync = useSourceSync();
  const displayed = sources.map(
    (s) => sync.state?.sources.find((x) => x.id === s.id)?.record || s,
  );
  const checkLabels = {
    never: "尚未检查",
    current: "已是最新",
    update_available: "发现更新",
    failed: "检查失败",
  };
  return (
    <section
      id="data-sources"
      className={styles.section}
      aria-label="数据源与同步状态"
      tabIndex={-1}
    >
      <h2>数据源与同步状态</h2>
      <p>
        最近成功同步指数据源已完成拉取、收录校验及展示数据生成的时间，不是文件修改、普通构建或站点发布时间。时间按当前浏览器所在时区显示。
      </p>
      {sources.some((s) => !s.lastSyncedAt) && (
        <p>
          “尚未记录”表示没有通过同步流程保存过成功记录；当前固定版本数据仍可正常浏览。
        </p>
      )}
      {!sync.state && (
        <p>
          手动同步需要本地同步服务。请通过本项目的本地启动或预览访问；静态站点仅展示同步记录。
        </p>
      )}
      {sync.message && <p role="alert">{sync.message}</p>}
      <div className={styles.tableWrap}>
        <table>
          <thead>
            <tr>
              <th>数据源</th>
              <th>最近成功同步</th>
              <th>当前数据版本</th>
              <th>最近同步结果</th>
              <th>更新检查</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {displayed.map((s) => (
              <tr key={s.id}>
                <td>
                  <a href={s.url} target="_blank" rel="noreferrer">
                    {s.name} ↗
                  </a>
                </td>
                <td>{time(s.lastSyncedAt)}</td>
                <td>
                  {s.version && s.type === "git" ? (
                    <a
                      href={`${s.url.replace(/\/$/, "")}/tree/${encodeURIComponent(s.version)}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <code>{s.version.slice(0, 7)}</code> ↗
                    </a>
                  ) : (
                    s.version || "—"
                  )}
                </td>
                <td>
                  {labels[s.lastAttemptStatus]}
                  {s.lastAttemptStatus === "failed" && (
                    <details>
                      <summary>失败详情</summary>
                      <p>
                        {s.lastSyncedAt
                          ? "当前仍展示上次成功同步的数据。"
                          : "尚无成功同步记录，当前展示仓库固定版本数据。"}
                      </p>
                      <p>{s.lastError}</p>
                    </details>
                  )}
                </td>
                <td>
                  <strong>{checkLabels[s.updateCheck.status]}</strong>
                  <small>最近检查：{time(s.updateCheck.lastCheckedAt)}</small>
                  <small>
                    {s.updateCheck.enabled
                      ? `自动检查：每 ${s.updateCheck.intervalMinutes} 分钟（本地服务运行时）`
                      : "自动检查已关闭"}
                  </small>
                  {s.updateCheck.status === "update_available" && (
                    <small>
                      当前 {s.updateCheck.comparedVersion?.slice(0, 7)} → 最新{" "}
                      {s.updateCheck.latestVersion?.slice(0, 7)}
                      ；更新尚未应用，尚未同步或收录。
                    </small>
                  )}
                  {s.updateCheck.status === "failed" && (
                    <small>{s.updateCheck.error}</small>
                  )}
                </td>
                <td>
                  <button
                    type="button"
                    aria-label={`手动同步 ${s.name}`}
                    disabled={
                      !sync.state ||
                      sync.state.busy ||
                      sync.submitting ||
                      !sync.state.sources.find((x) => x.id === s.id)?.supported
                    }
                    onClick={() => void sync.start(s.id)}
                  >
                    {sync.state?.sources.find((x) => x.id === s.id)?.job
                      ?.status === "running" &&
                    sync.state?.sources.find((x) => x.id === s.id)?.job
                      ?.kind !== "check"
                      ? "同步中…"
                      : "手动同步"}
                  </button>
                  {sync.state &&
                    !sync.state.sources.find((x) => x.id === s.id)
                      ?.supported && <small>尚未配置同步方式</small>}
                  <span className={styles.job} role="status">
                    {
                      sync.state?.sources.find((x) => x.id === s.id)?.job
                        ?.message
                    }
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        最近同步尝试：
        {displayed
          .map((s) => `${s.name} ${time(s.lastSyncAttemptAt)}`)
          .join("；")}
        。后台更新检查只查询版本；手动同步会同时刷新更新检查结果，全部校验通过后才更新成功同步时间。
      </p>
    </section>
  );
}
