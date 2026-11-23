import { syncStateSchema, syncJobSchema } from "../domain/syncState";
import { useEffect, useRef, useState } from "react";
type State = ReturnType<typeof syncStateSchema.parse>;
const endpoint = `${import.meta.env.BASE_URL}api/data-sources`;
export function useSourceSync() {
  const [state, setState] = useState<State | null>(null);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const completed = useRef(new Set<string>());
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const ctl = new AbortController();
    async function poll() {
      try {
        const response = await fetch(endpoint, {
          cache: "no-store",
          signal: ctl.signal,
        });
        if (!response.ok) throw Error();
        const value = syncStateSchema.parse(await response.json());
        if (stopped) return;
        setState(value);
        for (const s of value.sources)
          if (
            s.job &&
            s.job.status !== "running" &&
            !completed.current.has(s.job.id)
          ) {
            completed.current.add(s.job.id);
            window.dispatchEvent(new Event("rpl:catalog-refresh"));
          }
      } catch {
        if (!stopped) setState(null);
      }
      if (!stopped) timer = setTimeout(poll, 1500);
    }
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
      ctl.abort();
    };
  }, []);
  async function start(id: string) {
    setSubmitting(true);
    setMessage("");
    try {
      const response = await fetch(
        `${endpoint}/${encodeURIComponent(id)}/sync`,
        { method: "POST", headers: { "X-RPL-Sync": "1" } },
      );
      const value = await response.json();
      if (!response.ok) throw Error(value.message || "无法启动同步。");
      const job = syncJobSchema.parse(value);
      setState((old) =>
        old
          ? {
              busy: true,
              sources: old.sources.map((s) =>
                s.id === id ? { ...s, job } : s,
              ),
            }
          : old,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "无法启动同步。");
    } finally {
      setSubmitting(false);
    }
  }
  return { state, message, submitting, start };
}
