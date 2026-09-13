"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { IconApi, IconChevronDown, IconChevronRight, IconExternal, IconSearch } from "@/components/icons";
import { EmptyState, ErrorState, Skeleton, useToast } from "@/components/kit";
import { OperationHeader, OperationReference } from "./OperationDetail";
import {
  type ApiOperation,
  authRequirement,
  filterGroups,
  indexOperations,
  methodChipClass,
  type OpenApiDoc,
  tryItDescriptor,
} from "./spec";
import { EXPLORER_CSS } from "./styles";
import { TryIt } from "./TryIt";

/**
 * The in-product API section.
 *
 * The operation list is read from `/api/v1/openapi.json` at runtime and never hard-coded, so an
 * operation added to the contract appears here on the next deploy with no change to this file.
 * The selected operation lives in `?op=`, which makes a link to one operation a real link.
 */

const DOC_LINKS = [
  { href: "/api/v1/docs", label: "Redoc" },
  { href: "/api/v1/swagger", label: "Swagger UI" },
  { href: "/api/v1/openapi.json", label: "openapi.json" },
];

function IndexList({
  groups,
  selectedId,
  collapsed,
  onToggle,
  onSelect,
  filtering,
}: {
  groups: ReturnType<typeof filterGroups>;
  selectedId: string | null;
  collapsed: ReadonlySet<string>;
  onToggle: (tag: string) => void;
  onSelect: (op: ApiOperation) => void;
  filtering: boolean;
}) {
  return (
    <div className="ca-api-index" data-testid="api-index">
      {groups.length === 0 && (
        <p className="arag-help" style={{ padding: 12 }} data-testid="api-index-empty">
          No operation matches that filter.
        </p>
      )}
      {groups.map((group) => {
        // A filter that hid its own matches inside a collapsed group would be unusable, so while
        // the box has text every group with a match is open regardless of the saved state.
        const open = filtering || !collapsed.has(group.name);
        return (
          <section key={group.name} className="ca-api-group">
            <h3>
              <button
                type="button"
                aria-expanded={open}
                onClick={() => onToggle(group.name)}
                data-testid={`api-group-${group.name}`}
              >
                {open ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
                <span>{group.name}</span>
                <span className="count">{group.operations.length}</span>
              </button>
            </h3>
            {open && (
              <ul>
                {group.operations.map((op) => (
                  <li key={op.id}>
                    <a
                      href={`/api?op=${encodeURIComponent(op.id)}`}
                      aria-current={op.id === selectedId ? "true" : undefined}
                      data-testid={`api-op-${op.id}`}
                      onClick={(e) => {
                        // Modified clicks stay real navigations so "open in a new tab" works.
                        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                        e.preventDefault();
                        onSelect(op);
                      }}
                    >
                      <span className={methodChipClass(op.method)}>{op.method}</span>
                      <span className="ca-api-oppath">{op.path}</span>
                      <span className="ca-api-opsummary">{op.summary}</span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

export function ApiExplorer() {
  const [doc, setDoc] = useState<OpenApiDoc | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [apiKey, setApiKey] = useState("");
  const { toast, show } = useToast();

  const load = useCallback(() => {
    setError(null);
    fetch("/api/v1/openapi.json", { credentials: "same-origin" })
      .then(async (r) => {
        // The status line alone tells a reader nothing they can act on; the route answers with an
        // RFC 9457 problem document whose `detail` is the sentence written for them.
        if (!r.ok) {
          const problem = (await r.json().catch(() => null)) as { detail?: string; title?: string } | null;
          throw new Error(
            problem?.detail || problem?.title || `The document could not be read (${r.status}).`,
          );
        }
        return (await r.json()) as OpenApiDoc;
      })
      .then(setDoc)
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => load(), [load]);

  // The selection is URL state. It is read from the address bar on load and on Back/Forward, and
  // written with pushState so choosing an operation does not re-render the whole route.
  useEffect(() => {
    const sync = () => setSelectedId(new URLSearchParams(window.location.search).get("op"));
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  const index = useMemo(() => (doc ? indexOperations(doc) : null), [doc]);
  const groups = useMemo(() => (index ? filterGroups(index.groups, query) : []), [index, query]);
  const selected = useMemo(
    () => index?.operations.find((o) => o.id === selectedId) ?? null,
    [index, selectedId],
  );

  const select = useCallback((op: ApiOperation) => {
    const url = new URL(window.location.href);
    url.searchParams.set("op", op.id);
    window.history.pushState(null, "", `${url.pathname}${url.search}`);
    setSelectedId(op.id);
  }, []);

  const toggle = useCallback((tag: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  }, []);

  if (error) {
    return (
      <ErrorState
        title="The OpenAPI document could not be loaded."
        detail={error}
        action={
          <button type="button" className="arag-btn secondary sm" onClick={load}>
            Try again
          </button>
        }
      />
    );
  }

  if (!index) {
    return (
      <div className="arag-split rail-left">
        <div className="arag-card" style={{ padding: 12 }}>
          <Skeleton height={34} />
          <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
            {Array.from({ length: 10 }).map((_, i) => (
              <Skeleton key={i} height={14} />
            ))}
          </div>
        </div>
        <div className="arag-card" style={{ padding: 16 }}>
          <Skeleton height={20} width="40%" />
          <div style={{ marginTop: 12 }}>
            <Skeleton height={120} />
          </div>
        </div>
      </div>
    );
  }

  const listed = groups.reduce((n, g) => n + g.operations.length, 0);
  const desc = selected && doc ? tryItDescriptor(doc, selected) : null;

  return (
    <>
      <style>{EXPLORER_CSS}</style>

      <div className="arag-card ca-api-cover" data-testid="api-coverage">
        <div className="ca-api-covertext">
          <IconApi size={18} />
          <p>
            <strong>
              {index.declared} operation{index.declared === 1 ? "" : "s"}
            </strong>{" "}
            declared by {index.title} v{index.version}, across {index.groups.length} tags. All{" "}
            {index.declared} are listed below; the index is built from the document, not from a hand-written
            list.
          </p>
        </div>
        <div className="ca-api-coverlinks">
          {DOC_LINKS.map((l) => (
            <a key={l.href} className="arag-btn secondary sm" href={l.href} target="_blank" rel="noreferrer">
              {l.label} <IconExternal size={13} />
            </a>
          ))}
        </div>
      </div>

      <div className="arag-split rail-left">
        <nav className="arag-card ca-api-rail" aria-label="API operations">
          <div className="ca-api-filter">
            <div className="arag-search" style={{ maxWidth: "none" }}>
              <IconSearch size={15} className="arag-icon" />
              <input
                type="search"
                aria-label="Filter operations by method, path, summary or operation id"
                placeholder="Filter operations"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                data-testid="api-filter"
              />
            </div>
            <p className="arag-help" data-testid="api-listed-count">
              {listed} of {index.declared} shown
            </p>
          </div>
          <IndexList
            groups={groups}
            selectedId={selectedId}
            collapsed={collapsed}
            onToggle={toggle}
            onSelect={select}
            filtering={query.trim() !== ""}
          />
        </nav>

        <div className="ca-api-detail">
          {selected && desc && doc ? (
            <>
              <OperationHeader
                op={selected}
                auth={authRequirement(selected)}
                onCopyLink={() => {
                  const href = `${window.location.origin}/api?op=${encodeURIComponent(selected.id)}`;
                  navigator.clipboard?.writeText(href).catch(() => undefined);
                  show("Link to this operation copied");
                }}
              />
              <TryIt desc={desc} apiKey={apiKey} onApiKey={setApiKey} onNotify={show} />
              <OperationReference doc={doc} op={selected} />
            </>
          ) : (
            <EmptyState
              title={selectedId ? "That operation is not in this document" : "Choose an operation"}
              body={
                selectedId
                  ? `No operation with the id "${selectedId}" is declared. Pick one from the index.`
                  : "Pick one from the index to read its parameters and schemas, and to call it against this deployment."
              }
            />
          )}
        </div>
      </div>
      {toast}
    </>
  );
}
