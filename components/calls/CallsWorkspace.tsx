"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CategoryRails } from "@/components/CategoryRails";
import { IconExport, IconRefresh, IconSearch, IconStop, IconTrash, MediaIcon } from "@/components/icons";
import {
  ConfirmDialog,
  EmptyState,
  ErrorState,
  FacetSelect,
  FilterChip,
  KebabMenu,
  Pagination,
  Segmented,
  SortableHeader,
  TableSkeleton,
  useToast,
} from "@/components/kit";
import { Chip } from "@/components/ui";
import { colorFor, fmtTime, SENTIMENT_COLOR } from "@/lib/format";
import { CALL_LIFECYCLES, LIFECYCLE_COPY } from "@/lib/lifecycle";
import type { CallSummary } from "@/lib/types";
import { ColumnsMenu } from "./ColumnsMenu";
import {
  type CallColumn,
  type CallSortKey,
  COLUMNS_STORAGE_KEY,
  DEFAULT_COLUMNS,
  DENSITY_STORAGE_KEY,
  type Density,
  describeTable,
  isSortKey,
  parseColumns,
  parseDensity,
  serialiseColumns,
  toggleColumn,
  visibleColumns,
} from "./columns";
import { DateRangeFilter, formatBound } from "./DateRangeFilter";
import { LifecycleChip } from "./LifecycleChip";
import { SavedViews } from "./SavedViews";
import { normaliseCallsQuery } from "./view-query";

/**
 * The calls screen: a real data table (search, facet filters, a date window, sort, pagination,
 * selection, bulk actions, configurable columns) with the existing category rails kept as a
 * Browse mode.
 *
 * Every filter lives in the URL, so a view is shareable, back-navigable and bookmarkable, and the
 * dashboard's drill-throughs are ordinary links rather than client-side state hand-offs. Selection
 * deliberately does *not* live in the URL: a link someone sends should carry the question, not a
 * transient set of ticked boxes. Nor do the columns and the row density — those are the reader's
 * own furniture, so they live in `localStorage` (see `columns.ts`), and a saved view carries the
 * question to a colleague without also rearranging their table.
 */

interface FacetCount {
  labelset: string;
  label: string;
  count: number;
}

interface CallPage {
  items: CallSummary[];
  page: number;
  page_size: number;
  total: number;
  facets: FacetCount[];
  agents: string[];
  queues: string[];
}

interface LabelsetView {
  id: string;
  title: string;
  labels: string[];
  kind: string[];
}

/** Facet labelsets offered as first-class dropdowns, in this order. */
const PRIMARY_FACETS = ["call_reason", "call_outcome", "sentiment", "line_of_business", "disposition_flags"];

const DEBOUNCE_MS = 250;

export function CallsWorkspace({ canWrite }: { canWrite: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const { toast, show } = useToast();

  const mode = (params.get("mode") as "table" | "browse" | null) ?? null;
  const [resolvedMode, setResolvedMode] = useState<"table" | "browse">(mode ?? "table");

  // An explicit ?mode= always wins; otherwise the last choice this browser made is restored.
  useEffect(() => {
    if (mode) {
      setResolvedMode(mode);
      return;
    }
    try {
      const saved = localStorage.getItem("ca.calls.mode");
      if (saved === "browse" || saved === "table") setResolvedMode(saved);
    } catch {
      /* private mode: table stands */
    }
  }, [mode]);

  /**
   * Column and density preferences.
   *
   * Read after mount rather than during render: the server has no `localStorage`, so reading it
   * initially would make the first client render disagree with the markup Next.js sent and
   * hydration would tear the table apart. The default set is therefore what is drawn for one
   * frame, which is also what a first-time reader gets.
   */
  const [columnKeys, setColumnKeys] = useState<string[]>([...DEFAULT_COLUMNS]);
  const [density, setDensity] = useState<Density>("comfortable");

  useEffect(() => {
    try {
      setColumnKeys(parseColumns(localStorage.getItem(COLUMNS_STORAGE_KEY)));
      setDensity(parseDensity(localStorage.getItem(DENSITY_STORAGE_KEY)));
    } catch {
      /* private mode: the defaults stand */
    }
  }, []);

  const persistColumns = (next: string[]) => {
    setColumnKeys(next);
    try {
      localStorage.setItem(COLUMNS_STORAGE_KEY, serialiseColumns(next));
    } catch {
      /* ignore */
    }
  };

  const persistDensity = (next: Density) => {
    setDensity(next);
    try {
      localStorage.setItem(DENSITY_STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  };

  const columns = useMemo(() => visibleColumns(columnKeys), [columnKeys]);

  const q = params.get("q") ?? "";
  const labels = useMemo(() => params.getAll("label"), [params]);
  const agent = params.get("agent") ?? "";
  const queue = params.get("queue") ?? "";
  const mediaType = params.get("media_type") ?? "";
  const lifecycle = params.get("lifecycle") ?? "";
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const rawSort = params.get("sort");
  const sortKey: CallSortKey = isSortKey(rawSort) ? rawSort : "created";
  const order = (params.get("order") as "asc" | "desc" | null) ?? "desc";
  const page = Number(params.get("page") ?? 1) || 1;
  const pageSize = Number(params.get("page_size") ?? 25) || 25;

  const [search, setSearch] = useState(q);
  const [data, setData] = useState<CallPage | null>(null);
  const [labelsets, setLabelsets] = useState<LabelsetView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const firstRender = useRef(true);

  useEffect(() => setSearch(q), [q]);

  /** Replace the query string, always resetting to page 1 unless the page itself changed. */
  const setParams = useCallback(
    (patch: Record<string, string | string[] | null>, keepPage = false) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch)) {
        next.delete(k);
        if (v === null || v === "") continue;
        if (Array.isArray(v)) for (const item of v) next.append(k, item);
        else next.set(k, v);
      }
      if (!keepPage) next.delete("page");
      router.replace(`/calls${next.toString() ? `?${next}` : ""}`, { scroll: false });
    },
    [params, router],
  );

  // Debounce only the search box; every other control writes the URL immediately.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (search === q) return;
    const t = setTimeout(() => setParams({ q: search || null }), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [search, q, setParams]);

  useEffect(() => {
    fetch("/api/v1/labelsets")
      .then((r) => r.json())
      .then((d) => setLabelsets(d.items ?? []))
      .catch(() => setLabelsets([]));
  }, []);

  const query = useMemo(() => {
    const s = new URLSearchParams();
    if (q) s.set("q", q);
    for (const l of labels) s.append("label", l);
    if (agent) s.set("agent", agent);
    if (queue) s.set("queue", queue);
    if (mediaType) s.set("media_type", mediaType);
    if (lifecycle) s.set("lifecycle", lifecycle);
    if (from) s.set("from", from);
    if (to) s.set("to", to);
    s.set("sort", sortKey);
    s.set("order", order);
    s.set("page", String(page));
    s.set("page_size", String(pageSize));
    return s.toString();
  }, [q, labels, agent, queue, mediaType, lifecycle, from, to, sortKey, order, page, pageSize]);

  /**
   * The URL as a saved view would store it: the allowlisted parameters only, in a fixed order, so
   * "is this a saved view?" is a string comparison rather than a guess.
   */
  const viewQuery = useMemo(() => normaliseCallsQuery(params.toString()), [params]);

  /**
   * One in-flight list request at a time.
   *
   * Facet cost varies with selectivity and several controls write the URL immediately, so an
   * earlier request can easily resolve after a later one. Without the abort, that older response
   * would overwrite the fresher table with no error anywhere — the worst kind of wrong, because it
   * looks like a working screen.
   */
  const inFlight = useRef<AbortController | null>(null);

  const load = useCallback(() => {
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    setLoading(true);
    setError(null);
    fetch(`/api/v1/calls?${query}`, { signal: controller.signal })
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body?.detail ?? body?.title ?? `Request failed (${r.status})`);
        return body as CallPage;
      })
      .then((page) => {
        if (!controller.signal.aborted) setData(page);
      })
      .catch((e: Error) => {
        // An abort is this component superseding itself, not a failure to report.
        if (e.name !== "AbortError") setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
  }, [query]);

  useEffect(() => {
    load();
    return () => inFlight.current?.abort();
  }, [load]);

  // A row that is no longer in the result set must not stay silently selected.
  useEffect(() => {
    if (!data) return;
    setSelected((s) => {
      const visible = new Set(data.items.map((c) => c.id));
      const next = new Set([...s].filter((id) => visible.has(id)));
      return next.size === s.size ? s : next;
    });
  }, [data]);

  const countOf = useCallback(
    (labelset: string, label: string) =>
      data?.facets.find((f) => f.labelset === labelset && f.label === label)?.count,
    [data],
  );

  const toggleLabel = (key: string) =>
    setParams({ label: labels.includes(key) ? labels.filter((l) => l !== key) : [...labels, key] });

  const onSort = (key: CallSortKey) =>
    setParams({ sort: key, order: sortKey === key && order === "desc" ? "asc" : "desc" });

  const clearAll = () => {
    setSearch("");
    router.replace(`/calls?mode=${resolvedMode}`, { scroll: false });
  };

  const switchMode = (m: "table" | "browse") => {
    setResolvedMode(m);
    try {
      localStorage.setItem("ca.calls.mode", m);
    } catch {
      /* ignore */
    }
    setParams({ mode: m }, true);
  };

  const bulk = async (action: "delete" | "reanalyze") => {
    setBusy(true);
    try {
      const res = await fetch("/api/v1/calls/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ids: [...selected] }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.detail ?? `Request failed (${res.status})`);
      const failed = (body.failed ?? []).length;
      show(
        action === "delete"
          ? `Deleted ${body.succeeded} call${body.succeeded === 1 ? "" : "s"}${failed ? `; ${failed} failed` : ""}`
          : `Queued ${body.succeeded} call${body.succeeded === 1 ? "" : "s"} for re-analysis`,
        failed ? "error" : undefined,
      );
      setSelected(new Set());
      load();
    } catch (e) {
      show((e as Error).message, "error");
    } finally {
      setBusy(false);
      setConfirmDelete(false);
    }
  };

  const exportHref = `/api/v1/calls/export?format=csv&${
    selected.size > 0 ? [...selected].map((id) => `ids=${encodeURIComponent(id)}`).join("&") : query
  }`;

  const activeFilters: Array<{ label: string; clear: () => void }> = [
    ...labels.map((l) => ({ label: l.split("/").slice(1).join("/") || l, clear: () => toggleLabel(l) })),
    ...(agent ? [{ label: `Agent: ${agent}`, clear: () => setParams({ agent: null }) }] : []),
    ...(queue ? [{ label: `Queue: ${queue}`, clear: () => setParams({ queue: null }) }] : []),
    ...(mediaType ? [{ label: `Type: ${mediaType}`, clear: () => setParams({ media_type: null }) }] : []),
    ...(lifecycle
      ? [
          {
            label: `Status: ${LIFECYCLE_COPY[lifecycle as keyof typeof LIFECYCLE_COPY]?.label ?? lifecycle}`,
            clear: () => setParams({ lifecycle: null }),
          },
        ]
      : []),
    // The two date bounds are separate chips so widening one end of the window does not cost the
    // other: a drill-through from the dashboard usually needs loosening, not discarding.
    ...(from ? [{ label: `From ${formatBound(from)}`, clear: () => setParams({ from: null }) }] : []),
    ...(to ? [{ label: `To ${formatBound(to)}`, clear: () => setParams({ to: null }) }] : []),
    ...(q ? [{ label: `Search: ${q}`, clear: () => setSearch("") }] : []),
  ];

  // A fruitless search deserves different advice from a fruitless filter stack.
  const searchOnly = Boolean(q) && activeFilters.length === 1;

  const facetSets = labelsets
    .filter((ls) => ls.labels.length > 0 && PRIMARY_FACETS.includes(ls.id))
    .sort((a, b) => PRIMARY_FACETS.indexOf(a.id) - PRIMARY_FACETS.indexOf(b.id));

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <Segmented
          label="View mode"
          value={resolvedMode}
          onChange={switchMode}
          options={[
            { value: "table", label: "Table" },
            { value: "browse", label: "Browse" },
          ]}
        />
        <span className="small" style={{ color: "var(--arag-text-subtle)" }}>
          {resolvedMode === "table"
            ? "Search, filter, sort and act on the whole queue."
            : "Discover by category. Searching switches to Table."}
        </span>
      </div>

      <div className="arag-filterbar" data-testid="filter-bar">
        <div className="arag-search">
          <IconSearch size={15} />
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              if (resolvedMode === "browse" && e.target.value) switchMode("table");
            }}
            placeholder="Search transcripts"
            aria-label="Search transcripts"
          />
        </div>

        {resolvedMode === "table" && (
          <>
            {facetSets.map((ls) => (
              <FacetSelect
                key={ls.id}
                label={ls.title}
                selected={new Set(labels)}
                onToggle={toggleLabel}
                options={ls.labels.map((l) => ({
                  value: `${ls.id}/${l}`,
                  label: l,
                  count: countOf(ls.id, l),
                }))}
              />
            ))}
            <FacetSelect
              label="Agent"
              selected={new Set(agent ? [agent] : [])}
              onToggle={(v) => setParams({ agent: agent === v ? null : v })}
              options={(data?.agents ?? []).map((a) => ({ value: a, label: a }))}
            />
            <FacetSelect
              label="Status"
              selected={new Set(lifecycle ? [lifecycle] : [])}
              onToggle={(v) => setParams({ lifecycle: lifecycle === v ? null : v })}
              options={CALL_LIFECYCLES.map((l) => ({ value: l, label: LIFECYCLE_COPY[l].label }))}
            />
            <DateRangeFilter
              from={from}
              to={to}
              onChange={(nextFrom, nextTo) => setParams({ from: nextFrom, to: nextTo })}
            />

            <span className="spacer" />

            {/* Saved views are `auth: "api"`, not a write capability: the API accepts a create,
                rename or delete from any session that can read the list, and the settings screen
                already offers Delete to everyone. Gating them on `canWrite` hid a feature the
                server was willing to perform — the wrong flag, not a stricter one. */}
            <SavedViews query={viewQuery} onNotify={show} />
            <ColumnsMenu
              columns={columnKeys}
              onToggle={(key) => persistColumns(toggleColumn(columnKeys, key))}
              onReset={() => persistColumns([...DEFAULT_COLUMNS])}
            />
            <Segmented
              label="Row density"
              value={density}
              onChange={persistDensity}
              options={[
                { value: "comfortable" as Density, label: "Comfortable" },
                { value: "compact" as Density, label: "Compact" },
              ]}
            />
          </>
        )}
      </div>

      {activeFilters.length > 0 && (
        <div className="arag-filterchips" style={{ marginTop: 10 }} data-testid="filter-chips">
          {activeFilters.map((f) => (
            <FilterChip key={f.label} label={f.label} onRemove={f.clear} />
          ))}
          <button type="button" className="arag-btn ghost sm" onClick={clearAll}>
            Clear all
          </button>
          <span style={{ marginLeft: "auto", color: "var(--arag-text-muted)" }}>
            {data ? `${data.total} call${data.total === 1 ? "" : "s"}` : ""}
          </span>
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        {error ? (
          <ErrorState
            title="The call list could not be loaded."
            detail={error}
            action={
              <button type="button" className="arag-btn secondary sm" onClick={load}>
                Try again
              </button>
            }
          />
        ) : resolvedMode === "browse" ? (
          <BrowseMode />
        ) : loading && !data ? (
          <TableSkeleton rows={8} cols={columns.length + 2} />
        ) : data && data.items.length === 0 ? (
          <EmptyState
            title={
              searchOnly
                ? `No call mentions “${q}”`
                : activeFilters.length > 0
                  ? "No calls match these filters"
                  : "No calls yet"
            }
            body={
              searchOnly
                ? "Search covers every transcript, not just titles. Try fewer words, or a phrase someone would actually have said."
                : activeFilters.length > 0
                  ? "Remove a filter to widen the search, or clear them all to see the whole queue."
                  : "Upload a recording or a transcript, or load the sample dataset to see the product working."
            }
            actions={
              activeFilters.length > 0 ? (
                <button type="button" className="arag-btn secondary sm" onClick={clearAll}>
                  {searchOnly ? "Clear search" : "Clear all filters"}
                </button>
              ) : (
                <>
                  <Link href="/upload" className="arag-btn sm">
                    Upload a call
                  </Link>
                  <Link href="/welcome" className="arag-btn secondary sm">
                    Try with sample calls
                  </Link>
                </>
              )
            }
          />
        ) : data ? (
          <div
            className={`arag-datatable${density === "compact" ? " compact" : ""}`}
            data-testid="calls-table"
            data-density={density}
            aria-busy={loading}
          >
            {selected.size > 0 ? (
              <div className="arag-bulkbar" data-testid="bulk-bar">
                <span className="count">{selected.size} selected</span>
                <button type="button" onClick={() => setSelected(new Set(data.items.map((c) => c.id)))}>
                  Select all {data.items.length} on this page
                </button>
                <span className="spacer" />
                <a href={exportHref} download className="arag-btn sm" style={{ textDecoration: "none" }}>
                  <IconExport size={14} /> Export
                </a>
                <button type="button" disabled={busy} onClick={() => bulk("reanalyze")}>
                  <IconRefresh size={14} /> Re-run analysis
                </button>
                <button
                  type="button"
                  className="danger"
                  disabled={busy}
                  onClick={() => setConfirmDelete(true)}
                >
                  <IconTrash size={14} /> Delete
                </button>
                <button type="button" onClick={() => setSelected(new Set())}>
                  Clear
                </button>
              </div>
            ) : null}

            <div className="scroll">
              <table>
                <caption className="arag sr-only">
                  {describeTable({ total: data.total, sortKey, order, columns })}
                </caption>
                <thead>
                  <tr>
                    <th scope="col" style={{ width: 40 }}>
                      <input
                        type="checkbox"
                        aria-label="Select all calls on this page"
                        checked={data.items.length > 0 && selected.size === data.items.length}
                        onChange={(e) =>
                          setSelected(e.target.checked ? new Set(data.items.map((c) => c.id)) : new Set())
                        }
                      />
                    </th>
                    {columns.map((col) => (
                      <SortableHeader
                        key={col.key}
                        label={col.label}
                        sortKey={col.sortKey}
                        sort={col.sortKey ? { key: sortKey, order } : undefined}
                        onSort={col.sortKey ? onSort : undefined}
                        align={col.align}
                        width={col.width}
                      />
                    ))}
                    <th scope="col" style={{ width: 44 }}>
                      <span className="arag sr-only">Row actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((c) => (
                    <CallRow
                      key={c.id}
                      call={c}
                      columns={columns}
                      canWrite={canWrite}
                      onChanged={load}
                      onCopied={show}
                      selected={selected.has(c.id)}
                      onSelect={(on) =>
                        setSelected((s) => {
                          const next = new Set(s);
                          on ? next.add(c.id) : next.delete(c.id);
                          return next;
                        })
                      }
                    />
                  ))}
                </tbody>
              </table>
            </div>

            <Pagination
              page={data.page}
              pageSize={data.page_size}
              total={data.total}
              onPage={(p) => setParams({ page: String(p) }, true)}
              onPageSize={(n) => setParams({ page_size: String(n) })}
            />
          </div>
        ) : null}
      </div>

      {confirmDelete && (
        <ConfirmDialog
          title={`Delete ${selected.size} call${selected.size === 1 ? "" : "s"}?`}
          body={
            <p>
              The {selected.size === 1 ? "call and its" : "calls and their"} Knowledge Box resource
              {selected.size === 1 ? "" : "s"}, including the recording and every label and analysis derived
              from {selected.size === 1 ? "it" : "them"}, will be removed. This cannot be undone.
            </p>
          }
          confirmLabel={`Delete ${selected.size} call${selected.size === 1 ? "" : "s"}`}
          danger
          busy={busy}
          onConfirm={() => bulk("delete")}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
      {toast}
    </>
  );
}

/** Sentence case in the cell, lower case on the wire: `media_type=audio` is the filter value. */
const MEDIA_LABEL: Record<string, string> = {
  audio: "Audio",
  video: "Video",
  transcript: "Transcript",
};

/** A dash that reads as "nothing here", never a blank cell that reads as a broken one. */
function Blank() {
  return <span className="cell-sub">—</span>;
}

function Flag({ on }: { on?: boolean }) {
  if (on === undefined) return <Blank />;
  return on ? (
    <Chip label="Yes" className="bg-danger-bg text-danger-fg" />
  ) : (
    <span className="cell-sub">No</span>
  );
}

/** One table cell. Kept as a lookup so adding a column is a row in `CALL_COLUMNS` plus a case. */
function Cell({ column, call }: { column: CallColumn; call: CallSummary }) {
  const m = call.metrics;
  switch (column.key) {
    case "call": {
      const flags = call.labels.filter((l) => l.labelset === "disposition_flags").slice(0, 2);
      return (
        <div style={{ display: "flex", gap: 8 }}>
          <span style={{ color: "var(--arag-text-subtle)", paddingTop: 1 }}>
            <MediaIcon type={call.mediaType} size={16} />
          </span>
          <div style={{ minWidth: 0 }}>
            <Link href={`/calls/${call.id}`} className="cell-title">
              {call.title}
            </Link>
            {flags.length > 0 && (
              <div style={{ display: "flex", gap: 4, marginTop: 4, flexWrap: "wrap" }}>
                {flags.map((f) => (
                  <Chip key={f.label} label={f.label} className={colorFor(f.label)} />
                ))}
              </div>
            )}
          </div>
        </div>
      );
    }
    case "created": {
      const date = call.createdISO ? new Date(call.createdISO) : null;
      if (!date) return <span className="cell-sub">Unknown</span>;
      return (
        <>
          <div>{date.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })}</div>
          <div className="cell-sub">
            {date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" })}
          </div>
        </>
      );
    }
    case "duration":
      return call.durationSec ? fmtTime(call.durationSec) : "—";
    case "agent":
      return (
        <>
          <div>{call.agentName ?? "—"}</div>
          {call.queue && <div className="cell-sub">{call.queue}</div>}
        </>
      );
    case "queue":
      return call.queue ? call.queue : <Blank />;
    case "reason":
      return m?.call_reason ? <Chip label={m.call_reason} className={colorFor(m.call_reason)} /> : <Blank />;
    case "outcome":
      return m?.outcome ? <Chip label={m.outcome} className={colorFor(m.outcome)} /> : <Blank />;
    case "sentiment":
      return m?.sentiment ? <Chip label={m.sentiment} className={SENTIMENT_COLOR[m.sentiment]} /> : <Blank />;
    case "status":
      return <LifecycleChip state={call.lifecycle} />;
    case "csat":
      return typeof m?.csat_estimate === "number" ? m.csat_estimate.toFixed(1) : <Blank />;
    case "compliance":
      return typeof m?.compliance_score === "number" ? String(Math.round(m.compliance_score)) : <Blank />;
    case "lob":
      return m?.line_of_business ? (
        <Chip label={m.line_of_business} className={colorFor(m.line_of_business)} />
      ) : (
        <Blank />
      );
    case "media":
      return (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <MediaIcon type={call.mediaType} size={14} />
          {MEDIA_LABEL[call.mediaType] ?? call.mediaType}
        </span>
      );
    case "complaint":
      return <Flag on={m?.complaint} />;
    case "escalated":
      return <Flag on={m?.escalated} />;
    default:
      return <Blank />;
  }
}

function CallRow({
  call,
  columns,
  selected,
  onSelect,
  onChanged,
  onCopied,
  canWrite,
}: {
  call: CallSummary;
  columns: readonly CallColumn[];
  selected: boolean;
  onSelect: (on: boolean) => void;
  onChanged: () => void;
  onCopied: (message: string, tone?: "error") => void;
  canWrite: boolean;
}) {
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  // A call that has not been picked up, or is still being transcribed, still has a live ingest
  // job behind it. Once it is being labelled the job is done and there is nothing left to stop.
  const cancellable = call.lifecycle === "queued" || call.lifecycle === "transcribing";

  const cancel = async () => {
    setCancelling(true);
    try {
      // Ingest jobs are keyed by `ref = callId`, so the call's own job is looked up rather than
      // stored on the call. `ref` is sent for the server that filters on it and the result is
      // matched here as well, so this works against either.
      const res = await fetch(`/api/v1/jobs?ref=${encodeURIComponent(call.id)}&kind=ingest-call&limit=200`);
      const body = await res.json();
      if (!res.ok) throw new Error(body?.detail ?? body?.title ?? `Request failed (${res.status})`);
      const job = ((body.items ?? []) as Array<{ id: string; ref?: string; status: string }>).find(
        (j) => j.ref === call.id && (j.status === "queued" || j.status === "running"),
      );
      if (!job)
        throw new Error(
          "No ingest job for this call is still running, so there is nothing left to cancel. Refresh the list to see where it got to.",
        );
      const del = await fetch(`/api/v1/jobs/${job.id}`, { method: "DELETE" });
      if (!del.ok) {
        const problem = await del.json().catch(() => null);
        throw new Error(problem?.detail ?? problem?.title ?? `Request failed (${del.status})`);
      }
      onCopied("Processing cancelled");
      setConfirmCancel(false);
      onChanged();
    } catch (e) {
      onCopied((e as Error).message, "error");
      setConfirmCancel(false);
    } finally {
      setCancelling(false);
    }
  };

  return (
    <>
      <tr aria-selected={selected}>
        <td>
          <input
            type="checkbox"
            checked={selected}
            onChange={(e) => onSelect(e.target.checked)}
            aria-label={`Select ${call.title}`}
          />
        </td>
        {columns.map((col) => (
          <td key={col.key} className={col.align === "right" ? "num" : undefined}>
            <Cell column={col} call={call} />
          </td>
        ))}
        <td>
          <KebabMenu label={`Actions for ${call.title}`}>
            {(close) => (
              <>
                <Link href={`/calls/${call.id}`} onClick={close}>
                  Open the call
                </Link>
                <a href={`/api/v1/calls/${call.id}/export?format=json`} download onClick={close}>
                  <IconExport size={15} /> Export this call
                </a>
                {canWrite && (
                  <button
                    type="button"
                    onClick={async () => {
                      close();
                      try {
                        const res = await fetch(`/api/v1/calls/${call.id}/reanalyze`, { method: "POST" });
                        if (!res.ok) throw new Error((await res.json())?.detail ?? "Request failed");
                        onCopied("Re-analysis queued");
                        onChanged();
                      } catch (e) {
                        onCopied((e as Error).message, "error");
                      }
                    }}
                  >
                    <IconRefresh size={15} /> Re-run analysis
                  </button>
                )}
                {canWrite && cancellable && (
                  <button
                    type="button"
                    className="danger"
                    onClick={() => {
                      close();
                      setConfirmCancel(true);
                    }}
                  >
                    <IconStop size={15} /> Cancel processing
                  </button>
                )}
                <div className="sep" />
                <button
                  type="button"
                  onClick={async () => {
                    close();
                    try {
                      await navigator.clipboard.writeText(`${window.location.origin}/calls/${call.id}`);
                      onCopied("Link copied");
                    } catch {
                      onCopied("Your browser refused clipboard access.", "error");
                    }
                  }}
                >
                  Copy link to this call
                </button>
              </>
            )}
          </KebabMenu>
        </td>
      </tr>

      {confirmCancel && (
        <ConfirmDialog
          title={`Stop processing “${call.title}”?`}
          body={
            <>
              <p>
                Transcription and analysis stop where they are. The Knowledge Box resource already created for
                this call is <strong>not</strong> removed — the call stays in the list and shows as
                incomplete.
              </p>
              <p>To get rid of it entirely, delete the call instead.</p>
            </>
          }
          confirmLabel="Cancel processing"
          danger
          busy={cancelling}
          onConfirm={() => void cancel()}
          onCancel={() => setConfirmCancel(false)}
        />
      )}
    </>
  );
}

/** Browse mode: the category rails, which is discovery rather than work. */
function BrowseMode() {
  const [dash, setDash] = useState<{
    byReason: Array<{ name: string; value: number }>;
    bySentiment: Array<{ name: string; value: number }>;
  } | null>(null);
  useEffect(() => {
    fetch("/api/v1/dashboard")
      .then((r) => r.json())
      .then(setDash)
      .catch(() => setDash(null));
  }, []);
  if (!dash) return <TableSkeleton rows={3} cols={4} />;
  return <CategoryRails byReason={dash.byReason} bySentiment={dash.bySentiment} />;
}
