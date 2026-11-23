import { runSource } from "./workflow.ts";
import { access } from "node:fs/promises";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { dataSourcesSchema } from "../../src/domain/dataSources.ts";
import { syncAdapters, type SyncAdapter } from "./adapters.ts";
export type SyncJob = {
  id: string;
  sourceId: string;
  status: "running" | "success" | "failed";
  message: string;
  kind: "sync" | "check";
};
export class SyncService {
  jobs = new Map<string, SyncJob>();
  active: SyncJob | null = null;
  constructor(
    readonly root: string,
    readonly adapters: Record<string, SyncAdapter> = syncAdapters,
  ) {}
  async sources() {
    return dataSourcesSchema.parse(
      JSON.parse(
        await readFile(
          path.join(this.root, "metadata/data-sources.json"),
          "utf8",
        ),
      ),
    ).sources;
  }
  private adapterFor(key: string) {
    return Object.hasOwn(this.adapters, key) ? this.adapters[key] : undefined;
  }
  async state() {
    return {
      sources: (await this.sources()).map((s) => ({
        id: s.id,
        supported: Boolean(this.adapterFor(s.adapter)?.supports(s)),
        checkSupported: Boolean(this.adapterFor(s.adapter)?.check),
        record: s,
        job: this.jobs.get(s.id) ?? null,
      })),
      busy: Boolean(this.active),
    };
  }
  private stopping = false;
  private ticking = false;
  private retryAfter = new Map<string, number>();
  async tick(now = Date.now()) {
    if (this.stopping || this.ticking || this.active) return;
    this.ticking = true;
    try {
      try {
        await access(path.join(this.root, ".data-sync"));
        return;
      } catch {
        /* no writer */
      }
      for (const s of await this.sources()) {
        const check = s.updateCheck;
        if (
          !check.enabled ||
          !this.adapterFor(s.adapter)?.check ||
          !this.adapterFor(s.adapter)?.supports(s)
        )
          continue;
        if (now < (this.retryAfter.get(s.id) || 0)) continue;
        if (
          check.lastCheckedAt &&
          now - Date.parse(check.lastCheckedAt) < check.intervalMinutes * 60000
        )
          continue;
        this.retryAfter.set(s.id, now + 60000);
        await this.start(s.id, "check");
        break;
      }
    } finally {
      this.ticking = false;
    }
  }
  startScheduler() {
    this.stopping = false;
    const tick = () => {
      void this.tick().catch((error) =>
        console.error("更新检查调度失败", error),
      );
    };
    const initial = setTimeout(tick, 5000);
    const timer = setInterval(tick, 15000);
    initial.unref();
    timer.unref();
    return () => {
      this.stopping = true;
      clearTimeout(initial);
      clearInterval(timer);
    };
  }
  async start(sourceId: string, kind: "sync" | "check" = "sync") {
    if (this.active)
      throw Object.assign(new Error("已有同步任务运行，请等待完成。"), {
        statusCode: 409,
      });
    const source = (await this.sources()).find((s) => s.id === sourceId);
    if (!source)
      throw Object.assign(new Error("数据源不存在。"), { statusCode: 404 });
    const adapter = this.adapterFor(source.adapter);
    if (!adapter?.supports(source))
      throw Object.assign(new Error("该数据源尚未配置同步适配器。"), {
        statusCode: 422,
      });
    if (kind === "check" && !adapter.check)
      throw Object.assign(new Error("该来源不支持更新检查。"), {
        statusCode: 422,
      });
    // Repeat after async metadata read to prevent simultaneous requests racing.
    if (this.active)
      throw Object.assign(new Error("已有同步任务运行，请等待完成。"), {
        statusCode: 409,
      });
    const job: SyncJob = {
      id: randomUUID(),
      sourceId,
      status: "running",
      kind,
      message: kind === "check" ? "正在检查更新…" : "正在拉取并校验数据…",
    };
    this.active = job;
    this.jobs.set(sourceId, job);
    void Promise.resolve()
      .then(() => runSource(this.root, sourceId, adapter, kind))
      .then(
        () => {
          job.status = "success";
          job.message =
            kind === "check"
              ? "检查完成，已更新检查结果。"
              : "同步完成，已刷新展示数据。";
        },
        (error) => {
          console.error(
            `[${sourceId}/${kind}]`,
            error instanceof Error ? error.message : String(error),
          );
          job.status = "failed";
          job.message =
            kind === "check"
              ? "检查失败，旧数据与同步时间未改变。"
              : "同步失败，原有数据和成功时间已保留；请查看失败详情。";
        },
      )
      .finally(() => {
        this.active = null;
      });
    return job;
  }
}
