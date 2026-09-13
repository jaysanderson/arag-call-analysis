"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { IconClose, IconCopy, IconPlus, IconWarning } from "@/components/icons";
import { StateChip } from "@/components/kit";
import { Markdown } from "@/components/Markdown";
import {
  buildCurl,
  buildRequestPlan,
  emptyValues,
  type FormField,
  formatBytes,
  NOTABLE_HEADERS,
  readProblem,
  responseRender,
  statusTone,
  type TryItDescriptor,
  type TryItValues,
} from "./spec";

/**
 * The form that actually calls the API.
 *
 * Two rules shape it. The pasted key lives in React state and nowhere else — never localStorage,
 * never the URL, never the curl — because an explorer that persists a credential turns a shared
 * demo machine into a credential store. And every destructive operation takes two clicks, because
 * this runs against the deployment's real Knowledge Box.
 */

const MAX_BODY_BYTES = 256 * 1024;
const MAX_BODY_MS = 8000;

interface RunResult {
  status: number;
  statusText: string;
  ms: number;
  headers: Array<[string, string]>;
  contentType: string;
  render: "json" | "problem" | "text" | "binary";
  parsed?: unknown;
  text?: string;
  size: number;
  truncated: boolean;
}

/**
 * Read a response body with a byte and a time budget. `text/event-stream` never ends on its own
 * and `GET /calls/{id}/media` can be tens of megabytes, so `res.text()` is not an option here.
 */
async function readCapped(res: Response): Promise<{ bytes: Uint8Array; truncated: boolean }> {
  if (!res.body) return { bytes: new Uint8Array(0), truncated: false };
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let truncated = false;
  const deadline = Date.now() + MAX_BODY_MS;
  try {
    while (size < MAX_BODY_BYTES) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        truncated = true;
        break;
      }
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<"timeout">((resolve) => {
        timer = setTimeout(() => resolve("timeout"), remaining);
      });
      const winner = await Promise.race([reader.read(), timeout]);
      if (timer) clearTimeout(timer);
      if (winner === "timeout") {
        truncated = true;
        break;
      }
      if (winner.done) break;
      if (winner.value) {
        chunks.push(winner.value);
        size += winner.value.byteLength;
      }
    }
    if (size >= MAX_BODY_BYTES) truncated = true;
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { bytes, truncated };
}

function copyText(text: string): void {
  navigator.clipboard?.writeText(text).catch(() => {
    // Clipboard permission can be refused (an iframe, an older browser); the selection fallback
    // still puts the curl on the clipboard rather than failing silently.
    const area = document.createElement("textarea");
    area.value = text;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    try {
      document.execCommand("copy");
    } finally {
      area.remove();
    }
  });
}

function QueryControl({
  field,
  value,
  onChange,
}: {
  field: FormField;
  value: string | string[];
  onChange: (v: string | string[]) => void;
}) {
  const id = `param-${field.in}-${field.name}`;
  if (field.control === "array") {
    const rows = Array.isArray(value) ? value : [value ?? ""];
    const set = (i: number, v: string) => onChange(rows.map((r, j) => (j === i ? v : r)));
    return (
      <div className="arag-field">
        <span className="arag-label" id={`${id}-label`}>
          {field.name}
          {field.required && <span className="ca-api-req"> required</span>}
          <span className="ca-api-ptype"> {field.type}</span>
        </span>
        {rows.map((row, i) => (
          <div key={i} style={{ display: "flex", gap: 6 }}>
            {field.itemControl === "select" ? (
              <select
                className="arag-select"
                aria-label={`${field.name} value ${i + 1}`}
                value={row}
                onChange={(e) => set(i, e.target.value)}
              >
                <option value="">(none)</option>
                {field.itemOptions.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            ) : (
              <input
                className="arag-input"
                type={field.itemControl === "number" ? "number" : "text"}
                aria-label={`${field.name} value ${i + 1}`}
                value={row}
                onChange={(e) => set(i, e.target.value)}
              />
            )}
            <button
              type="button"
              className="arag-btn ghost sm"
              aria-label={`Remove ${field.name} value ${i + 1}`}
              onClick={() => onChange(rows.length === 1 ? [""] : rows.filter((_, j) => j !== i))}
            >
              <IconClose size={14} />
            </button>
          </div>
        ))}
        <div>
          <button type="button" className="arag-btn ghost sm" onClick={() => onChange([...rows, ""])}>
            <IconPlus size={13} /> Add {field.name}
          </button>
        </div>
        {field.description && <Markdown text={field.description} className="arag-help" />}
      </div>
    );
  }

  const scalar = Array.isArray(value) ? (value[0] ?? "") : value;
  return (
    <div className="arag-field">
      <label htmlFor={id}>
        {field.name}
        {field.required && <span className="ca-api-req"> required</span>}
        <span className="ca-api-ptype"> {field.type}</span>
      </label>
      {field.control === "select" ? (
        <select id={id} className="arag-select" value={scalar} onChange={(e) => onChange(e.target.value)}>
          <option value="">{field.required ? "(choose a value)" : "(not sent)"}</option>
          {field.options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : field.control === "checkbox" ? (
        <label className="ca-api-check" htmlFor={id}>
          <input
            id={id}
            type="checkbox"
            checked={scalar === "true"}
            onChange={(e) => onChange(e.target.checked ? "true" : "")}
          />
          <span>Send {field.name}=true</span>
        </label>
      ) : (
        <input
          id={id}
          className="arag-input"
          type={field.control === "number" ? "number" : "text"}
          value={scalar}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {field.description && <Markdown text={field.description} className="arag-help" />}
    </div>
  );
}

export function TryIt({
  desc,
  apiKey,
  onApiKey,
  onNotify,
}: {
  desc: TryItDescriptor;
  apiKey: string;
  onApiKey: (v: string) => void;
  onNotify: (message: string, tone?: "error") => void;
}) {
  const [values, setValues] = useState<TryItValues>(() => emptyValues(desc));
  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [confirming, setConfirming] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  // Switching operation must not carry the previous one's parameters, body or response across.
  // The pasted key is the exception: it belongs to the viewer, not to the operation.
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on the operation, not the object identity
  useEffect(() => {
    setValues(emptyValues(desc));
    setFiles({});
    setConfirming(false);
    setResult(null);
    setFailure(null);
  }, [desc.operation.id]);

  useEffect(() => {
    if (confirming) confirmRef.current?.focus();
  }, [confirming]);

  const plan = useMemo(
    () => buildRequestPlan(desc, { ...values, apiKey: apiKey.trim() !== "" }),
    [desc, values, apiKey],
  );
  const curl = useMemo(
    () => buildCurl(plan, { origin: typeof window === "undefined" ? "" : window.location.origin, apiKey }),
    [plan, apiKey],
  );

  const bodyError = useMemo(() => {
    if (desc.body.kind !== "json" || values.body.trim() === "") return null;
    try {
      JSON.parse(values.body);
      return null;
    } catch (e) {
      return (e as Error).message;
    }
  }, [desc.body.kind, values.body]);

  const blocked = plan.missing.length > 0 || bodyError !== null;

  const run = async () => {
    setConfirming(false);
    setRunning(true);
    setFailure(null);
    const headers: Record<string, string> = { ...plan.headers };
    if (apiKey.trim() !== "") headers["X-API-Key"] = apiKey.trim();

    let body: BodyInit | undefined;
    if (desc.body.kind === "multipart") {
      const form = new FormData();
      for (const field of desc.body.fields) {
        if (field.kind === "file") {
          const file = files[field.name];
          if (file) form.append(field.name, file);
        } else {
          const value = values.form[field.name];
          if (value !== undefined && value !== "") form.append(field.name, value);
        }
      }
      body = form;
    } else if (plan.bodyText !== undefined) {
      body = plan.bodyText;
    }
    if (desc.operation.method === "GET" || desc.operation.method === "HEAD") body = undefined;

    const started = performance.now();
    try {
      const res = await fetch(plan.url, {
        method: desc.operation.method,
        headers,
        body,
        credentials: "same-origin",
      });
      const ms = Math.round(performance.now() - started);
      const contentType = res.headers.get("content-type") ?? "";
      const render = responseRender(contentType);
      const { bytes, truncated } = await readCapped(res);
      const declared = Number(res.headers.get("content-length") ?? Number.NaN);
      const size = Number.isFinite(declared) ? declared : bytes.byteLength;

      const next: RunResult = {
        status: res.status,
        statusText: res.statusText,
        ms,
        headers: [...res.headers.entries()].filter(([k]) =>
          (NOTABLE_HEADERS as readonly string[]).includes(k.toLowerCase()),
        ),
        contentType,
        render,
        size,
        truncated,
      };
      if (render !== "binary") {
        const text = new TextDecoder().decode(bytes);
        next.text = text;
        if (render === "json" || render === "problem") {
          try {
            next.parsed = JSON.parse(text);
          } catch {
            next.render = "text";
          }
        }
      }
      setResult(next);
    } catch (e) {
      setResult(null);
      setFailure((e as Error).message || "The request could not be sent.");
    } finally {
      setRunning(false);
    }
  };

  const setQuery = (name: string, v: string | string[]) =>
    setValues((prev) => ({ ...prev, query: { ...prev.query, [name]: v } }));

  return (
    <section className="arag-card" aria-labelledby="tryit-heading">
      <div className="head">
        <h2 id="tryit-heading">Try it</h2>
        <span className="arag-help">
          Sent from this browser with your own cookies, against {desc.operation.method} {desc.operation.path}.
        </span>
      </div>
      <div className="body">
        {desc.pathFields.length > 0 && (
          <fieldset className="ca-api-fieldset">
            <legend>Path parameters</legend>
            <div className="ca-api-grid">
              {desc.pathFields.map((f) => (
                <QueryControl
                  key={f.name}
                  field={f}
                  value={values.path[f.name] ?? ""}
                  onChange={(v) =>
                    setValues((prev) => ({
                      ...prev,
                      path: { ...prev.path, [f.name]: Array.isArray(v) ? (v[0] ?? "") : v },
                    }))
                  }
                />
              ))}
            </div>
          </fieldset>
        )}

        {desc.queryFields.length > 0 && (
          <fieldset className="ca-api-fieldset">
            <legend>Query parameters</legend>
            <p className="arag-help">
              Blank fields, unselected options and unticked boxes are left out of the request.
            </p>
            <div className="ca-api-grid">
              {desc.queryFields.map((f) => (
                <QueryControl
                  key={f.name}
                  field={f}
                  value={values.query[f.name] ?? ""}
                  onChange={(v) => setQuery(f.name, v)}
                />
              ))}
            </div>
          </fieldset>
        )}

        {desc.body.kind === "json" && (
          <fieldset className="ca-api-fieldset">
            <legend>Request body · application/json</legend>
            <div className="arag-field">
              <label htmlFor="tryit-body">
                Body{desc.body.required && <span className="ca-api-req"> required</span>}
              </label>
              <textarea
                id="tryit-body"
                className="arag-textarea"
                spellCheck={false}
                rows={Math.min(18, Math.max(5, values.body.split("\n").length + 1))}
                value={values.body}
                onChange={(e) => setValues((prev) => ({ ...prev, body: e.target.value }))}
                data-testid="tryit-body"
              />
              <span className="arag-help">
                Prefilled from the schema: required fields, enums, defaults and formats. Edit it before
                sending.
              </span>
              {bodyError && (
                <span className="ca-api-req" role="alert">
                  Not valid JSON: {bodyError}
                </span>
              )}
            </div>
          </fieldset>
        )}

        {desc.body.kind === "multipart" && (
          <fieldset className="ca-api-fieldset">
            <legend>Request body · multipart/form-data</legend>
            <div className="ca-api-grid">
              {desc.body.fields.map((f) => {
                const id = `form-${f.name}`;
                return (
                  <div className="arag-field" key={f.name}>
                    <label htmlFor={id}>
                      {f.name}
                      {f.required && <span className="ca-api-req"> required</span>}
                      <span className="ca-api-ptype"> {f.kind === "file" ? "file" : f.kind}</span>
                    </label>
                    {f.kind === "file" ? (
                      <input
                        id={id}
                        className="arag-input"
                        type="file"
                        onChange={(e) => {
                          const file = e.target.files?.[0] ?? null;
                          setFiles((prev) => ({ ...prev, [f.name]: file }));
                          setValues((prev) => ({
                            ...prev,
                            files: { ...prev.files, [f.name]: file?.name ?? "" },
                          }));
                        }}
                      />
                    ) : (
                      <input
                        id={id}
                        className="arag-input"
                        type={f.kind === "number" ? "number" : "text"}
                        value={values.form[f.name] ?? ""}
                        onChange={(e) =>
                          setValues((prev) => ({
                            ...prev,
                            form: { ...prev.form, [f.name]: e.target.value },
                          }))
                        }
                      />
                    )}
                    {f.description && <Markdown text={f.description} className="arag-help" />}
                  </div>
                );
              })}
            </div>
          </fieldset>
        )}

        {desc.body.kind === "other" && (
          <p className="arag-help">
            This operation takes a <code>{desc.body.mediaType}</code> body, which this form does not compose.
            Use the curl below.
          </p>
        )}

        <fieldset className="ca-api-fieldset">
          <legend>Credentials</legend>
          <div className="arag-field" style={{ maxWidth: 420 }}>
            <label htmlFor="tryit-apikey">API key</label>
            <input
              id="tryit-apikey"
              className="arag-input"
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder="Leave blank to use this browser's session"
              value={apiKey}
              onChange={(e) => onApiKey(e.target.value)}
              data-testid="tryit-apikey"
            />
            <span className="arag-help">
              Sent as <code>X-API-Key</code>. Held in this tab only — never stored, never put in the URL, and
              shown in the curl as <code>$CALL_ANALYSIS_API_KEY</code>. This operation needs{" "}
              {desc.auth.label.toLowerCase()}.
            </span>
          </div>
        </fieldset>

        {plan.missing.length > 0 && (
          <div className="arag-alert warn">
            <div>
              Fill in {plan.missing.map((m) => `{${m}}`).join(", ")} before sending: the path is not complete
              without it.
            </div>
          </div>
        )}

        {confirming ? (
          <div className="arag-alert warn" role="alert" data-testid="destructive-confirm">
            <div>
              <strong>
                Send {desc.operation.method} {plan.url}?
              </strong>
              <div style={{ marginTop: 2 }}>
                {desc.operation.summary}. This runs against this deployment's Knowledge Box and cannot be
                undone.
              </div>
              <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
                <button
                  ref={confirmRef}
                  type="button"
                  className="arag-btn danger sm"
                  onClick={run}
                  data-testid="tryit-confirm"
                >
                  Confirm and send
                </button>
                <button type="button" className="arag-btn secondary sm" onClick={() => setConfirming(false)}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button
              type="button"
              className={`arag-btn${desc.destructive ? " danger" : ""}`}
              disabled={blocked || running}
              onClick={() => (desc.destructive ? setConfirming(true) : run())}
              data-testid="tryit-send"
            >
              {running ? "Sending…" : desc.destructive ? "Send — needs confirmation" : "Send request"}
            </button>
            {desc.destructive && (
              <span className="arag-help">
                <IconWarning size={13} /> Destructive: a second click confirms.
              </span>
            )}
          </div>
        )}

        <div>
          <div className="ca-api-snippethead">
            <span className="arag-label">curl</span>
          </div>
          <pre className="arag-snippet" data-testid="tryit-curl">
            <button
              type="button"
              className="copy"
              onClick={() => {
                copyText(curl);
                onNotify("curl copied to the clipboard");
              }}
              data-testid="tryit-copy-curl"
            >
              <IconCopy size={12} /> Copy
            </button>
            {curl}
          </pre>
        </div>

        {failure && (
          <div className="arag-alert error" role="alert">
            <div>
              <strong>The request could not be sent.</strong>
              <div>{failure}</div>
            </div>
          </div>
        )}

        {result && <ResponseView result={result} />}
      </div>
    </section>
  );
}

function ResponseView({ result }: { result: RunResult }) {
  const problem = result.render === "problem" ? readProblem(result.parsed) : null;
  return (
    <section aria-label="Response" data-testid="tryit-response">
      <output className="ca-api-respbar" aria-live="polite" data-testid="tryit-response-status">
        <StateChip tone={statusTone(result.status)}>
          {result.status} {result.statusText || httpReason(result.status)}
        </StateChip>
        <span className="arag-help">{result.ms} ms</span>
        <span className="arag-help">{formatBytes(result.size)}</span>
        {result.truncated && <span className="arag-chip warn">body truncated</span>}
      </output>
      {result.headers.length > 0 && (
        <dl className="arag-kv ca-api-headers">
          {result.headers.map(([k, v]) => (
            <Fragment key={k}>
              <dt>{k}</dt>
              <dd>
                <code>{v}</code>
              </dd>
            </Fragment>
          ))}
        </dl>
      )}

      {problem && (
        <div className="arag-alert error" data-testid="tryit-problem">
          <div>
            <strong>{problem.problem.title ?? "Problem"}</strong>
            {problem.problem.detail && <div style={{ marginTop: 2 }}>{problem.problem.detail}</div>}
            <dl className="arag-kv" style={{ marginTop: 8 }}>
              <dt>status</dt>
              <dd>{problem.problem.status ?? result.status}</dd>
              {problem.problem.type && (
                <>
                  <dt>type</dt>
                  <dd>
                    <code>{problem.problem.type}</code>
                  </dd>
                </>
              )}
              {problem.problem.instance && (
                <>
                  <dt>instance</dt>
                  <dd>
                    <code>{problem.problem.instance}</code>
                  </dd>
                </>
              )}
              {problem.problem.requestId && (
                <>
                  <dt>requestId</dt>
                  <dd>
                    <code>{problem.problem.requestId}</code>
                  </dd>
                </>
              )}
            </dl>
            {problem.problem.errors && problem.problem.errors.length > 0 && (
              <ul style={{ marginTop: 6, paddingLeft: 18 }}>
                {problem.problem.errors.map((e, i) => (
                  <li key={i}>
                    <code>{e.path || "(body)"}</code> — {e.message}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {result.size === 0 ? (
        <p className="arag-help" data-testid="tryit-response-body">
          No response body.
        </p>
      ) : result.render === "binary" ? (
        <div className="arag-alert">
          <div>
            <strong>Not shown</strong>
            <div>
              {result.contentType || "unknown content type"} · {formatBytes(result.size)}. Binary and streamed
              responses are reported rather than parsed.
            </div>
          </div>
        </div>
      ) : (
        <pre className="arag-json" data-testid="tryit-response-body">
          {result.parsed !== undefined ? JSON.stringify(result.parsed, null, 2) : (result.text ?? "")}
        </pre>
      )}
    </section>
  );
}

const REASONS: Record<number, string> = {
  200: "OK",
  201: "Created",
  202: "Accepted",
  204: "No Content",
  400: "Bad Request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not Found",
  409: "Conflict",
  413: "Payload Too Large",
  415: "Unsupported Media Type",
  429: "Too Many Requests",
  500: "Internal Server Error",
  502: "Bad Gateway",
};

/** `Response.statusText` is empty over HTTP/2, so the reason phrase is filled in here. */
function httpReason(status: number): string {
  return REASONS[status] ?? "";
}
