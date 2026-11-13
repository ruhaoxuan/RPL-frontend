import React, {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  createContext,
  useContext,
} from "react";
import { createRoot } from "react-dom/client";
import {
  HashRouter,
  Link,
  Route,
  Routes,
  useLocation,
  useParams,
  useSearchParams,
} from "react-router-dom";
import {
  ArrowUpRight,
  ArrowRight,
  ArrowLeft,
  BookOpen,
  Search,
  Layers,
  Code2,
  GitBranch,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
  Copy,
  Check,
  ExternalLink,
  FolderGit2,
  Info,
  RotateCcw,
  Menu,
  X,
  FileCode2,
  ShieldCheck,
} from "lucide-react";
import type {
  Catalog,
  CodeAsset,
  CodeFile,
  Pattern,
  Instance,
  Source,
} from "./domain/model";
import {
  sourceLabels,
  statusLabels,
  counts,
  verdict,
  resultLabels,
} from "./domain/model";
import { catalogSchema } from "./domain/catalog";
import { selectPatterns } from "./domain/search";
import styles from "./styles/app.module.css";
import { DiagnosticsPanel } from "./components/DiagnosticsPanel";
import { SourceDistribution } from "./components/SourceDistribution";
const DataContext = createContext<Catalog>(null!);
const useData = () => useContext(DataContext);
const routePattern = (id: string) => `/patterns/${encodeURIComponent(id)}`;
const date = (s: string) =>
  new Date(s).toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: string;
}) {
  return (
    <span className={`${styles.badge} ${styles[tone] || ""}`}>{children}</span>
  );
}
function SourceBadge({ source }: { source: Source }) {
  return (
    <Badge tone={source}>
      <span className={styles.dot} />
      {sourceLabels[source]}
    </Badge>
  );
}
function Github({
  url,
  children = "GitHub 原文件",
}: {
  url: string;
  children?: React.ReactNode;
}) {
  return (
    <a className={styles.external} href={url} target="_blank" rel="noreferrer">
      {children}
      <ArrowUpRight size={14} />
    </a>
  );
}
function Empty({
  title = "没有找到符合条件的模式",
  children,
}: {
  title?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={styles.empty}>
      <Search size={32} />
      <h2>{title}</h2>
      {children}
    </div>
  );
}
function CodeView({
  file,
  start,
  end,
  lines,
  focusTarget,
}: {
  file: CodeFile;
  start?: number;
  end?: number;
  lines?: number[];
  focusTarget?: { start: number; end: number; request: number };
}) {
  const [asset, setAsset] = useState<CodeAsset | null>(null),
    [error, setError] = useState(false),
    [copy, setCopy] = useState("复制代码");
  useEffect(() => {
    const ctl = new AbortController();
    setAsset(null);
    setError(false);
    fetch(`${import.meta.env.BASE_URL}generated/${file.asset}`, {
      signal: ctl.signal,
    })
      .then((r) => {
        if (!r.ok) throw Error();
        return r.json();
      })
      .then(setAsset)
      .catch((e) => {
        if (e.name !== "AbortError") setError(true);
      });
    return () => ctl.abort();
  }, [file.asset]);
  useEffect(() => {
    const first = focusTarget?.start ?? lines?.[0] ?? start;
    if (!asset || !first) return;
    const line = document
      .getElementById(`code-${file.id}`)
      ?.querySelector(`[data-line="${first}"]`) as HTMLElement | null;
    if (focusTarget) {
      const container = document.getElementById(`code-${file.id}`);
      container?.focus({ preventScroll: true });
      line?.scrollIntoView({ block: "center", behavior: "instant" });
    } else line?.scrollIntoView({ block: "nearest" });
  }, [asset, start, file.id, lines, focusTarget]);
  async function copyCode() {
    if (!asset) return;
    try {
      await navigator.clipboard.writeText(asset.code);
      setCopy("已复制");
      setTimeout(() => setCopy("复制代码"), 2000);
    } catch {
      setCopy("复制失败，请手动选择");
    }
  }
  const highlighted = asset?.html.replace(
    /class="line" data-line="(\d+)"/g,
    (all, n) =>
      (
        focusTarget
          ? Number(n) >= focusTarget.start && Number(n) <= focusTarget.end
          : lines
            ? lines.includes(Number(n))
            : Number(n) >= (start || Infinity) &&
              Number(n) <= (end || start || -1)
      )
        ? `class="line selected-line" data-line="${n}"`
        : all,
  );
  return (
    <section className={styles.codePanel}>
      <div className={styles.codeHeader}>
        <span>
          <FileCode2 size={16} />
          {file.path.split("/").at(-1)}
          <Badge>{file.path.endsWith(".rpl") ? "RPL" : "Rust"}</Badge>
        </span>
        <div>
          <button onClick={copyCode} disabled={!asset}>
            {copy === "已复制" ? <Check size={14} /> : <Copy size={14} />}{" "}
            {copy}
          </button>
          <Github
            url={`${file.githubUrl}${start ? `#L${start}-L${end || start}` : ""}`}
          />
        </div>
      </div>
      <div className={styles.codePath}>
        {file.path}
        {focusTarget && (
          <span aria-live="polite">
            已定位：L{focusTarget.start}
            {focusTarget.end !== focusTarget.start
              ? `–L${focusTarget.end}`
              : ""}
          </span>
        )}
        {!focusTarget && lines !== undefined && (
          <span>
            上游标注位置{" "}
            {lines.length
              ? lines
                  .map((n) => `L${n}`)
                  .slice(0, 5)
                  .join("、") + (lines.length > 5 ? " 等" : "")
              : "未提取到；完整文件展示"}
          </span>
        )}
        {start && (
          <span>
            案例位置 L{start}
            {end !== start ? `–${end}` : ""}
          </span>
        )}
      </div>
      {error ? (
        <div className={styles.empty}>
          代码加载失败。
          <Github url={file.githubUrl} />
          <button onClick={() => location.reload()}>重新加载</button>
        </div>
      ) : !asset ? (
        <div className={styles.loading}>正在加载代码…</div>
      ) : (
        <div
          id={`code-${file.id}`}
          className={styles.codeBody}
          tabIndex={0}
          aria-label="只读代码，支持横向滚动"
          dangerouslySetInnerHTML={{ __html: highlighted! }}
        />
      )}
    </section>
  );
}
function PatternDiagnostics({
  pattern,
  file,
  initiallyOpen = true,
}: {
  pattern: Pattern;
  file: CodeFile;
  initiallyOpen?: boolean;
}) {
  const [showCode, setShowCode] = useState(initiallyOpen);
  const [target, setTarget] = useState<{
    start: number;
    end: number;
    request: number;
  }>();
  const locate = (start: number, end = start) => {
    setShowCode(true);
    setTarget((previous) => ({
      start,
      end,
      request: (previous?.request ?? 0) + 1,
    }));
  };
  return (
    <>
      <DiagnosticsPanel
        diagnostics={pattern.diagnostics}
        file={file}
        onLocate={locate}
      />
      {!initiallyOpen && (
        <button
          type="button"
          onClick={() => setShowCode(!showCode)}
          aria-expanded={showCode}
        >
          {showCode ? "收起" : "展开"}关联模式 RPL 代码
        </button>
      )}
      {showCode && (
        <>
          <div className={styles.sectionHeading}>
            <h2>
              模式代码 <span>RPL definition</span>
            </h2>
            <span>点击诊断说明中的位置可在此定位</span>
          </div>
          <CodeView file={file} focusTarget={target} />
        </>
      )}
    </>
  );
}
function PatternCard({ pattern: p }: { pattern: Pattern }) {
  const data = useData(),
    f = data.files.find((x) => x.id === p.fileId)!,
    c = counts(data.instances.filter((x) => x.patternIds.includes(p.id)));
  return (
    <article className={`${styles.card} ${styles[`border_${p.source}`]}`}>
      <div className={styles.cardTop}>
        <SourceBadge source={p.source} />
        <Badge tone={p.detectionStatus}>
          <span className={styles.dot} />
          {statusLabels[p.detectionStatus]}
        </Badge>
      </div>
      <Link to={routePattern(p.id)} className={styles.cardTitle}>
        {p.name}
        <ArrowUpRight size={18} />
      </Link>
      <div className={styles.cardId}>
        {p.id} · {p.diagnostics.length} 组诊断
      </div>
      <p className={styles.description}>{p.description}</p>
      <div className={styles.tags}>
        {p.tags.map((t) => (
          <span key={t}>{t}</span>
        ))}
      </div>
      <div className={styles.cardCounts}>
        <span>
          <Code2 size={15} />
          <b>{c.total}</b> 个实例
        </span>
        <span className={styles.positive}>+ {c.positive} Positive</span>
        <span className={styles.negative}>− {c.negative} Negative</span>
      </div>
      <div className={styles.cardFooter}>
        <span>更新于 {date(f.updatedAt)}</span>
        <div>
          <Github url={f.githubUrl} children="GitHub" />
          <Link to={routePattern(p.id)}>
            查看详情 <ArrowRight size={14} />
          </Link>
        </div>
      </div>
    </article>
  );
}
function SelectFilter({
  label,
  name,
  options,
}: {
  label: string;
  name: string;
  options: { value: string; label: string }[];
}) {
  const [params, setParams] = useSearchParams();
  return (
    <label className={styles.filterLabel}>
      {label}
      <select
        aria-label={label}
        value={params.get(name) || ""}
        onChange={(e) => {
          const n = new URLSearchParams(params);
          if (e.target.value) n.set(name, e.target.value);
          else n.delete(name);
          n.delete("page");
          setParams(n);
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
function Home() {
  const data = useData(),
    [params, setParams] = useSearchParams();
  const results = selectPatterns(data, params),
    pages = Math.max(1, Math.ceil(results.length / 20)),
    rawPage = Number(params.get("page") || 1),
    page = Math.max(
      1,
      Math.min(pages, Number.isFinite(rawPage) ? Math.floor(rawPage) : 1),
    );
  const previousPage = useRef(page);
  useLayoutEffect(() => {
    if (previousPage.current !== page) {
      document.getElementById("results")?.scrollIntoView({
        block: "start",
        behavior: "instant",
      });
      previousPage.current = page;
    }
  }, [page]);
  const c = counts(data.instances);
  const tags = [...new Set(data.patterns.flatMap((x) => x.tags))].sort();
  const setPage = (p: number) => {
    const n = new URLSearchParams(params);
    n.set("page", String(p));
    setParams(n);
  };
  return (
    <>
      <div className={styles.hero}>
        <h1>RPL Atlas</h1>
      </div>
      <SourceDistribution
        patterns={data.patterns}
        activeSource={params.get("source") || ""}
        onSelect={(source) => {
          const next = new URLSearchParams(params);
          params.get("source") === source
            ? next.delete("source")
            : next.set("source", source);
          next.delete("page");
          setParams(next);
          document
            .getElementById("results")
            ?.scrollIntoView({ block: "start" });
        }}
      />
      <div className={styles.stats}>
        <div>
          <span>
            <Layers size={16} />
            模式总数
          </span>
          <strong>
            {data.patterns.length}
            <small>patterns</small>
          </strong>
          <p>Clippy、CodeQL、CVE 与 UB</p>
        </div>
        <div>
          <span>
            <Code2 size={16} />
            代码实例
          </span>
          <strong>
            {c.total}
            <small>instances</small>
          </strong>
          <p>
            <i className={styles.positive}>{c.positive} Positive</i>
            <i className={styles.negative}>{c.negative} Negative</i>
          </p>
        </div>
        <div>
          <span>
            <ShieldCheck size={16} />
            检测状态
          </span>
          <strong>
            {
              data.patterns.filter((p) => p.detectionStatus === "pending")
                .length
            }
            <small>待验证</small>
          </strong>
          <p>
            可检测{" "}
            {
              data.patterns.filter((p) => p.detectionStatus === "detectable")
                .length
            }{" "}
            · 不可检测{" "}
            {
              data.patterns.filter((p) => p.detectionStatus === "undetectable")
                .length
            }
          </p>
        </div>
      </div>
      <section className={styles.explore} id="results">
        <div className={styles.sectionHeading}>
          <h2>
            模式目录 <span>Pattern library</span>
          </h2>
          <span className={styles.live}>
            <span className={styles.dot} /> 来自真实仓库
          </span>
        </div>
        <div className={styles.sourceTabs}>
          {(["", "clippy", "codeql", "cve", "other"] as const).map((s) => {
            const selected = (params.get("source") || "") === s;
            const items = s
              ? data.patterns.filter((x) => x.source === s)
              : data.patterns;
            const cases = data.instances.filter((x) =>
              x.patternIds.some((id) => items.some((p) => p.id === id)),
            );
            return (
              <button
                key={s}
                aria-pressed={selected}
                className={selected ? styles.activeTab : ""}
                onClick={() => {
                  const n = new URLSearchParams(params);
                  s ? n.set("source", s) : n.delete("source");
                  n.delete("page");
                  setParams(n);
                }}
              >
                <span>
                  {s ? sourceLabels[s] : "全部模式"} <b>{items.length}</b>
                </span>
                <small>{cases.length} 个实例</small>
              </button>
            );
          })}
        </div>
        <div className={styles.searchBox}>
          <Search size={20} />
          <input
            aria-label="搜索模式"
            placeholder="搜索模式名称、CVE 编号、标签或文件路径…"
            value={params.get("q") || ""}
            onChange={(e) => {
              const n = new URLSearchParams(params);
              e.target.value ? n.set("q", e.target.value) : n.delete("q");
              n.delete("page");
              setParams(n, { replace: true });
            }}
          />
          <kbd>搜索</kbd>
        </div>
        <div className={styles.filterBar}>
          <span>
            <SlidersHorizontal size={16} />
            筛选
          </span>
          <SelectFilter
            label="实例关联"
            name="has"
            options={[
              { value: "", label: "全部实例关联" },
              { value: "yes", label: "有实例" },
              { value: "no", label: "无实例" },
            ]}
          />
          <SelectFilter
            label="检测状态"
            name="status"
            options={[
              { value: "", label: "全部检测状态" },
              ...Object.entries(statusLabels).map(([value, label]) => ({
                value,
                label,
              })),
            ]}
          />
          <SelectFilter
            label="实例类型"
            name="type"
            options={[
              { value: "", label: "全部实例类型" },
              { value: "positive", label: "Positive" },
              { value: "negative", label: "Negative" },
            ]}
          />
          <SelectFilter
            label="标签"
            name="tag"
            options={[
              { value: "", label: "全部标签" },
              ...tags.map((t) => ({ value: t, label: t })),
            ]}
          />
          {["q", "source", "has", "status", "type", "tag"].some((x) =>
            params.has(x),
          ) && (
            <button className={styles.reset} onClick={() => setParams({})}>
              <RotateCcw size={13} />
              重置
            </button>
          )}
        </div>
        <div className={styles.resultBar}>
          <span>
            找到 <b>{results.length}</b> 条模式 <small>· 每页 20 条</small>
          </span>
          <SelectFilter
            label="排序"
            name="sort"
            options={[
              { value: "", label: "最近更新" },
              { value: "name", label: "名称 A–Z" },
              { value: "count", label: "实例数量" },
            ]}
          />
        </div>
        {results.length ? (
          <div className={styles.cardGrid}>
            {results.slice((page - 1) * 20, page * 20).map((p) => (
              <PatternCard key={p.id} pattern={p} />
            ))}
          </div>
        ) : (
          <Empty>
            <p>尝试其他关键词，或减少筛选条件。</p>
            <button
              className={styles.primaryButton}
              onClick={() => setParams({})}
            >
              清除筛选
            </button>
          </Empty>
        )}
        <nav className={styles.pagination} aria-label="分页">
          <span>
            第 {page} / {pages} 页
          </span>
          <div>
            <button
              aria-label="上一页"
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
            >
              <ChevronLeft size={16} />
            </button>
            {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                aria-current={n === page ? "page" : undefined}
                className={n === page ? styles.pageActive : ""}
                onClick={() => setPage(n)}
              >
                {n}
              </button>
            ))}
            <button
              aria-label="下一页"
              disabled={page === pages}
              onClick={() => setPage(page + 1)}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </nav>
      </section>
      <div className={styles.note}>
        <Info size={17} />
        <p>
          当前收录 {data.patterns.length} 条模式、{data.instances.length}
          个文件级实例。预期结果与实际检测结果分别记录，所有模式仍待验证。
          <Link to="/about">
            了解数据口径 <ArrowRight size={13} />
          </Link>
        </p>
      </div>
    </>
  );
}
function CaseRow({ instance: i }: { instance: Instance }) {
  const data = useData(),
    f = data.files.find((x) => x.id === i.fileId)!;
  return (
    <article className={styles.caseRow}>
      <div>
        <div className={styles.rowTitle}>
          <Badge tone={i.type}>
            {i.type === "positive" ? "Positive" : "Negative"}
          </Badge>
          <Link to={`/instances/${i.id}`}>{i.name}</Link>
        </div>
        <small>
          {i.id} · {f.path}
        </small>
        <p>{i.description}</p>
        <span className={styles.inlineMuted}>
          预期 {i.type === "positive" ? "Match" : "No Match"}　·　实际{" "}
          {resultLabels[i.actualResult]}　·　{verdict(i.type, i.actualResult)}
        </span>
        <div className={styles.tags}>
          {[
            ...new Set(
              i.patternIds.map(
                (id) => data.patterns.find((p) => p.id === id)!.source,
              ),
            ),
          ].map((s) => (
            <SourceBadge key={s} source={s} />
          ))}
        </div>
      </div>
      <div className={styles.rowActions}>
        <Link className={styles.outlineButton} to={`/instances/${i.id}`}>
          实例详情 <ArrowRight size={14} />
        </Link>
        <Github url={f.githubUrl} />
      </div>
    </article>
  );
}
function Breadcrumb({ name }: { name: string }) {
  return (
    <div className={styles.breadcrumb}>
      <Link to="/">模式知识库</Link>
      <ChevronRight size={13} />
      <span>{name}</span>
    </div>
  );
}
function PatternPage() {
  const { id } = useParams(),
    data = useData(),
    p = data.patterns.find((x) => x.id === id);
  const [type, setType] = useState(""),
    [page, setPage] = useState(1);
  useEffect(() => {
    setType("");
    setPage(1);
  }, [id]);
  if (!p) return <Missing />;
  const f = data.files.find((x) => x.id === p.fileId)!,
    items = data.instances.filter((x) => x.patternIds.includes(p.id)),
    c = counts(items),
    filtered = items.filter((x) => !type || x.type === type);
  return (
    <>
      <Breadcrumb name="模式详情" />
      <div className={styles.detailHead}>
        <div className={styles.cardTop}>
          <SourceBadge source={p.source} />
          <Badge tone={p.detectionStatus}>
            {statusLabels[p.detectionStatus]}
          </Badge>
        </div>
        <h1>{p.name}</h1>
        <code>{p.id}</code>
        <p>{p.description}</p>
        <div className={styles.tags}>
          {p.tags.map((t) => (
            <span key={t}>{t}</span>
          ))}
        </div>
      </div>
      <div className={styles.detailMeta}>
        <div>
          <small>来源标识</small>
          <strong>{p.externalIds.join(" · ") || "待补充"}</strong>
        </div>
        <div>
          <small>关联实例</small>
          <strong>
            {c.total}{" "}
            <em>
              {" "}
              / {c.positive} Positive · {c.negative} Negative
            </em>
          </strong>
        </div>
        <div>
          <small>最后更新</small>
          <strong>{date(f.updatedAt)}</strong>
        </div>
        <Github url={f.githubUrl} />
      </div>
      <div className={styles.note}>
        <Info size={17} />
        <p>
          待验证：尚未导入此版本的实际运行报告。以下案例中的测试预期与实际检测结果分别记录。
        </p>
      </div>
      <PatternDiagnostics key={f.id} pattern={p} file={f} />
      <div className={styles.sectionHeading}>
        <h2>
          关联实例 <span>{c.total} instances</span>
        </h2>
        <select
          aria-label="关联实例类型"
          value={type}
          onChange={(e) => {
            setType(e.target.value);
            setPage(1);
          }}
        >
          <option value="">全部类型</option>
          <option value="positive">Positive ({c.positive})</option>
          <option value="negative">Negative ({c.negative})</option>
        </select>
      </div>
      {filtered.length ? (
        <>
          <div className={styles.caseList}>
            {filtered.slice((page - 1) * 10, page * 10).map((i) => (
              <CaseRow key={i.id} instance={i} />
            ))}
          </div>
          <div className={styles.pagination}>
            <span>
              {filtered.length} 个实例，第 {page} /{" "}
              {Math.ceil(filtered.length / 10)} 页
            </span>
            <div>
              <button disabled={page === 1} onClick={() => setPage(page - 1)}>
                上一页
              </button>
              <button
                disabled={page * 10 >= filtered.length}
                onClick={() => setPage(page + 1)}
              >
                下一页
              </button>
            </div>
          </div>
        </>
      ) : (
        <Empty title="暂无此类型的关联实例">
          <p>该模式仍可查看完整规则代码。</p>
        </Empty>
      )}
    </>
  );
}
function InstancePage() {
  const { id } = useParams(),
    data = useData(),
    i = data.instances.find((x) => x.id === id);
  if (!i) return <Missing />;
  const f = data.files.find((x) => x.id === i.fileId)!,
    patterns = data.patterns.filter((p) => i.patternIds.includes(p.id));
  return (
    <>
      <Breadcrumb name="实例详情" />
      <div className={styles.detailHead}>
        <div className={styles.cardTop}>
          <Badge tone={i.type}>
            {i.type === "positive" ? "Positive" : "Negative"}
          </Badge>
          <Badge>代码案例</Badge>
        </div>
        <h1>{i.name}</h1>
        <code>{i.id}</code>
        <p>{i.description}</p>
      </div>
      <div className={styles.detailMeta}>
        <div>
          <small>实例来源</small>
          <strong>
            {[...new Set(patterns.map((p) => sourceLabels[p.source]))].join(
              " / ",
            )}
          </strong>
        </div>
        <div>
          <small>代码范围</small>
          <strong>完整文件 · {f.lineCount} 行</strong>
        </div>
        <div>
          <small>最后更新</small>
          <strong>{date(f.updatedAt)}</strong>
        </div>
        <Github url={`${f.githubUrl}#L${i.start}-L${i.end}`} />
      </div>
      <div className={styles.resultTiles}>
        <div>
          <small>预期结果</small>
          <strong
            className={
              i.type === "positive" ? styles.positive : styles.negative
            }
          >
            {i.type === "positive" ? "Match" : "No Match"}
          </strong>
        </div>
        <div>
          <small>实际检测结果</small>
          <strong>{resultLabels[i.actualResult]}</strong>
        </div>
        <div>
          <small>验证结论</small>
          <strong>{verdict(i.type, i.actualResult)}</strong>
        </div>
      </div>
      <div className={styles.note}>
        <Info size={17} />
        <p>
          {i.evidence}
          <br />
          基准配置：
          {i.profiles
            .map((p) => (p === "all" ? "上游通用预期" : p))
            .join(" / ")}
          。此处未执行检测，不以测试基准代替实际结果。
        </p>
      </div>
      <section className={styles.prose} aria-label="上游检测基准">
        <h2>
          上游检测基准 <Badge>历史基准 · 非本次运行</Badge>
        </h2>
        <p>
          以下文件保存上游预期诊断。它们可用于核对工具行为，但不会被当成本次实际检测结果，也不会覆盖
          实例的预期分类。
        </p>
        {i.baselineReferences.map((b) => (
          <div key={b.path} className={styles.caseRow}>
            <div>
              <Github url={b.githubUrl}>{b.path.split("/").at(-1)}</Github>
              <small>{b.path}</small>
              <span className={styles.inlineMuted}>
                配置 {b.profile} ·{" "}
                {b.containsTargetDiagnostic
                  ? "基准中包含目标诊断"
                  : "基准中未识别到目标诊断"}
              </span>
            </div>
          </div>
        ))}
      </section>
      <div className={styles.sectionHeading}>
        <h2>
          实例代码 <span>Rust source</span>
        </h2>
        <span>高亮为上游标注位置，非本次命中</span>
      </div>
      <CodeView file={f} lines={i.diagnosticLines} />
      <div className={styles.sectionHeading}>
        <h2>
          关联模式 <span>{patterns.length} patterns</span>
        </h2>
      </div>
      {patterns.map((p) => (
        <div key={`diag:${p.id}`}>
          <p className={styles.inlineMuted}>关联模式：{p.name}</p>
          <PatternDiagnostics
            key={p.fileId}
            pattern={p}
            file={data.files.find((f) => f.id === p.fileId)!}
            initiallyOpen={false}
          />
        </div>
      ))}
      <div className={styles.cardGrid}>
        {patterns.map((p) => (
          <PatternCard key={p.id} pattern={p} />
        ))}
      </div>
    </>
  );
}
function Missing() {
  return (
    <Empty title="没有找到这个页面">
      <p>资料可能已随上游版本更新，请返回目录查找。</p>
      <Link className={styles.primaryButton} to="/">
        返回模式目录
      </Link>
    </Empty>
  );
}
function About() {
  const data = useData();
  return (
    <>
      <Breadcrumb name="数据说明" />
      <div className={styles.detailHead}>
        <h1>数据说明</h1>
      </div>
      <section className={styles.prose}>
        <h2>数据快照</h2>
        <p>
          当前展示 {data.patterns.length} 份 RPL 模式文件。上游提交{" "}
          <code>{data.manifest.sourceCommit}</code>，生成时间{" "}
          {new Date(data.manifest.generatedAt).toLocaleString("zh-CN")}
          。详情中的更新时间来自对应文件的最后一次 Git 提交。
        </p>
        <Github
          url={`${data.manifest.sourceRepository}/tree/${data.manifest.sourceCommit}`}
        >
          查看固定版本的上游仓库
        </Github>
        <h2>收录依据</h2>
        <p>
          模式与实例的对应关系经过人工核对，由本仓库维护。只展示已收录的关联，
          不会仅因名称相似或包含相同诊断就建立关联。
        </p>
        <h2>实例如何计数</h2>
        <p>
          上游共有 {data.manifest.rawRustFiles} 份候选 Rust 文件。当前收录{" "}
          {data.manifest.allowedPairCount} 对模式—实例关联。 完整 Rust
          文件作为一个实例，不按诊断行数拆分。
        </p>
        <p>
          实例总数按唯一案例去重；来源分组中的共享实例可能重复出现，所以各来源数量不一定可直接相加。“有实例／无实例”表示本知识库是否已收录关联，并不代表上游是否存在其他案例。
        </p>
        <h2>Positive 与 Negative</h2>
        <p>
          Positive 表示相对于关联规则预期匹配，Negative 表示预期不匹配。Negative
          不代表代码整体安全。分类表示该实例相对于关联模式的预期， 源代码或
          .stderr 中出现诊断，不会改变该分类。
        </p>
        <h2>状态与验证</h2>
        <p>
          所有模式目前为“待验证”，实例实际结果为 Not
          Run。检测状态只有在导入对应规则、代码版本与运行配置的证据后才更新。上游
          .stderr 是预期输出基准，不能作为新的实际运行报告。
        </p>
        <h2>代码与高亮</h2>
        <p>
          源代码保持上游原文；复制会复制完整文件。高亮来自允许关联范围内的源码标注，仅为定位线索，不表示实际检测已经命中；没有标注时展示完整文件。RPL
          使用独立的基础语法高亮，Rust 使用 Shiki 的 Rust 语法。所有 GitHub
          链接固定到相同提交。
        </p>
      </section>
    </>
  );
}
function Layout() {
  const data = useData(),
    loc = useLocation(),
    [menu, setMenu] = useState(false);
  useEffect(() => {
    setMenu(false);
    window.scrollTo(0, 0);
  }, [loc.pathname]);
  return (
    <div className={styles.app}>
      <aside className={`${styles.sidebar} ${menu ? styles.sidebarOpen : ""}`}>
        <Link to="/" className={styles.brand}>
          RPL Atlas
        </Link>
        <div className={styles.sideSection}>WORKSPACE</div>
        <Link
          to="/"
          className={`${styles.navItem} ${loc.pathname !== "/about" ? styles.navActive : ""}`}
        >
          <Layers size={18} />
          模式目录 <span>{data.patterns.length}</span>
        </Link>
        <Link
          to="/about"
          className={`${styles.navItem} ${loc.pathname === "/about" ? styles.navActive : ""}`}
        >
          <BookOpen size={18} />
          数据说明
          <ArrowUpRight size={14} />
        </Link>
        <div className={styles.sideSection}>PATTERN SOURCES</div>
        <div className={styles.sourceNav}>
          {(["clippy", "codeql", "cve", "other"] as Source[]).map((s) => (
            <Link key={s} to={`/?source=${s}`}>
              <span className={`${styles.dot} ${styles[`dot_${s}`]}`} />
              {sourceLabels[s]}
              <b>{data.patterns.filter((x) => x.source === s).length}</b>
            </Link>
          ))}
        </div>
        <div className={styles.sideBottom}>
          <a
            href={data.manifest.sourceRepository}
            target="_blank"
            rel="noreferrer"
          >
            <FolderGit2 size={17} />
            RPL Toolchain
            <ArrowUpRight size={14} />
          </a>
          <span>
            <span className={styles.dot} />
            数据版本 {data.manifest.sourceCommit.slice(0, 7)}
          </span>
        </div>
      </aside>
      {menu && (
        <button
          aria-label="关闭导航遮罩"
          className={styles.backdrop}
          onClick={() => setMenu(false)}
        />
      )}
      <div className={styles.mainWrap}>
        <header className={styles.topbar}>
          <div>
            <button
              className={styles.menuButton}
              aria-label="切换导航"
              onClick={() => setMenu(!menu)}
            >
              {menu ? <X size={20} /> : <Menu size={20} />}
            </button>
            <span>知识库</span>
            <span>/</span>
            <b>
              {loc.pathname === "/about"
                ? "数据说明"
                : loc.pathname.startsWith("/patterns")
                  ? "模式详情"
                  : loc.pathname.startsWith("/instances")
                    ? "实例详情"
                    : "模式目录"}
            </b>
          </div>
          <div>
            <span className={styles.version}>FIRST EDITION</span>
            <Github url={data.manifest.sourceRepository}>GitHub 仓库</Github>
          </div>
        </header>
        <main className={styles.main}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/patterns/:id" element={<PatternPage />} />
            <Route path="/instances/:id" element={<InstancePage />} />
            <Route path="/about" element={<About />} />
            <Route path="*" element={<Missing />} />
          </Routes>
          <footer className={styles.footer}>
            <span>RPL Atlas</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
function App() {
  const [data, setData] = useState<Catalog | null>(null),
    [error, setError] = useState(false);
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}generated/catalog.json`)
      .then((r) => {
        if (!r.ok) throw Error();
        return r.json();
      })
      .then((value: unknown) => setData(catalogSchema.parse(value)))
      .catch(() => setError(true));
  }, []);
  if (error)
    return (
      <div className={styles.startScreen}>
        <Info />
        <h1>知识库数据加载失败</h1>
        <p>请检查网络连接，或运行 npm run data:build 生成数据。</p>
        <button onClick={() => location.reload()}>重新加载</button>
      </div>
    );
  if (!data)
    return (
      <div className={styles.startScreen}>
        <h1>RPL Atlas</h1>
        <p>正在加载模式知识库…</p>
      </div>
    );
  return (
    <DataContext.Provider value={data}>
      <HashRouter>
        <Layout />
      </HashRouter>
    </DataContext.Provider>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
