"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CategoryRails } from "@/components/CategoryRails";
import { IconExport, IconRefresh, IconSearch, IconTrash, MediaIcon } from "@/components/icons";
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
import { LifecycleChip } from "./LifecycleChip";

/**
 * The calls screen: a real data table (search, facet filters, sort, pagination, selection, bulk
 * actions) with the existing category rails kept as a Browse mode.
 *
 * Every filter lives in the URL, so a view is shareable, back-navigable and bookmarkable, and the
 * dashboard's drill-throughs are ordinary links rather than client-side state hand-offs. Selection
 * deliberately does *not* live in the URL: a link someone sends should carry the question, not a
 * transient set of ticked boxes.
 */

type SortKey = "created" | "title" | "duration" | "agent" | "sentiment" | "compliance" | "csat";

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

  const q = params.get("q") ?? "";
  const labels = useMemo(() => params.getAll("label"), [params]);
  const agent = params.get("agent") ?? "";
  const queue = params.get("queue") ?? "";
  const mediaType = params.get("media_type") ?? "";
  const lifecycle = params.get("lifecycle") ?? "";
  const sortKey = (params.get("sort") as SortKey | null) ?? "created";
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
    s.set("sort", sortKey);
    s.set("order", order);
    s.set("page", String(page));
    s.set("page_size", String(pageSize));
    return s.toString();
  }, [q, labels, agent, queue, mediaType, lifecycle, sortKey, order, page, pageSize]);

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

  const onSort = (key: SortKey) =>
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
          <TableSkeleton rows={8} cols={8} />
        ) : data && data.items.length === 0 ? (
          <EmptyState
            title={
              searchOnly
                ? `No call mentions \u201c${q}\u201d`
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
          <div className="arag-datatable" data-testid="calls-table" aria-busy={loading}>
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
                  {data.total} call{data.total === 1 ? "" : "s"}, sorted by {sortKey}, {order}ending
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
                    <SortableHeader
                      label="Call"
                      sortKey="title"
                      sort={{ key: sortKey, order }}
                      onSort={onSort}
                    />
                    <SortableHeader
                      label="Date"
                      sortKey="created"
                      sort={{ key: sortKey, order }}
                      onSort={onSort}
                      width={104}
                    />
                    <SortableHeader
                      label="Duration"
                      sortKey="duration"
                      sort={{ key: sortKey, order }}
                      onSort={onSort}
                      align="right"
                      width={84}
                    />
                    <SortableHeader
                      label="Agent / Queue"
                      sortKey="agent"
                      sort={{ key: sortKey, order }}
                      onSort={onSort}
                      width={136}
                    />
                    <SortableHeader label="Reason" width={140} />
                    <SortableHeader label="Outcome" width={126} />
                    <SortableHeader
                      label="Sentiment"
                      sortKey="sentiment"
                      sort={{ key: sortKey, order }}
                      onSort={onSort}
                      width={104}
                    />
                    <SortableHeader label="Status" width={122} />
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

function CallRow({
  call,
  selected,
  onSelect,
  onChanged,
  onCopied,
  canWrite,
}: {
  call: CallSummary;
  selected: boolean;
  onSelect: (on: boolean) => void;
  onChanged: () => void;
  onCopied: (message: string, tone?: "error") => void;
  canWrite: boolean;
}) {
  const date = call.createdISO ? new Date(call.createdISO) : null;
  const flags = call.labels.filter((l) => l.labelset === "disposition_flags").slice(0, 2);
  return (
    <tr aria-selected={selected}>
      <td>
        <input
          type="checkbox"
          checked={selected}
          onChange={(e) => onSelect(e.target.checked)}
          aria-label={`Select ${call.title}`}
        />
      </td>
      <td>
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
      </td>
      <td>
        {date ? (
          <>
            <div>{date.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })}</div>
            <div className="cell-sub">
              {date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" })}
            </div>
          </>
        ) : (
          <span className="cell-sub">Unknown</span>
        )}
      </td>
      <td className="num">{call.durationSec ? fmtTime(call.durationSec) : "—"}</td>
      <td>
        <div>{call.agentName ?? "—"}</div>
        {call.queue && <div className="cell-sub">{call.queue}</div>}
      </td>
      <td>
        {call.metrics?.call_reason ? (
          <Chip label={call.metrics.call_reason} className={colorFor(call.metrics.call_reason)} />
        ) : (
          <span className="cell-sub">—</span>
        )}
      </td>
      <td>
        {call.metrics?.outcome ? (
          <Chip label={call.metrics.outcome} className={colorFor(call.metrics.outcome)} />
        ) : (
          <span className="cell-sub">—</span>
        )}
      </td>
      <td>
        {call.metrics?.sentiment ? (
          <Chip label={call.metrics.sentiment} className={SENTIMENT_COLOR[call.metrics.sentiment]} />
        ) : (
          <span className="cell-sub">—</span>
        )}
      </td>
      <td>
        <LifecycleChip state={call.lifecycle} />
      </td>
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
