"use client";

import Link from "next/link";
import { useState } from "react";
import { StateChip } from "@/components/kit";
import type { SettingsView } from "@/services/settings";
import { CardHead, Field, ReadOnlyNotice, SaveRow, SourceLine, useSettingsWrites } from "./common";

/**
 * What this deployment is pointed at.
 *
 * Two things shape the screen. The service-account key is **write-only** — `SettingsView` reports
 * only that one is set — so it is a rotate control rather than a field with a value in it. And the
 * Knowledge Box id arrives truncated (`effective()` returns the first eight characters), so the
 * form cannot round-trip it: the current id is shown as a value and the input asks for a
 * replacement, which is also the only honest way to render something the browser is never sent.
 */

type Form = {
  kbId: string;
  region: string;
  baseUrl: string;
  generativeModel: string;
  reranker: string;
  timeoutMs: number;
};

function formOf(v: SettingsView): Form {
  return {
    // Deliberately empty: `connection.kbId` is a truncated preview, not a value that can be sent
    // back. The current one is rendered beside the field instead.
    kbId: "",
    region: v.connection.region,
    // In sample mode the endpoint reads "in-process mock", which is a description rather than a
    // URL; the field is disabled there and the value is never submitted.
    baseUrl: v.connection.mode === "mock" ? "" : v.connection.baseUrl,
    generativeModel: v.connection.generativeModel,
    reranker: v.connection.reranker,
    timeoutMs: v.connection.timeoutMs,
  };
}

export function ConnectionPanel({
  initial,
  canEdit,
  adminOff,
}: {
  initial: SettingsView;
  canEdit: boolean;
  adminOff: boolean;
}) {
  const { view, busy, toast, save, reset } = useSettingsWrites(initial);
  const [form, setForm] = useState<Form>(() => formOf(initial));
  const [rotating, setRotating] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [saved, setSaved] = useState<Form>(() => formOf(initial));

  const mock = view.connection.mode === "mock";
  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));

  // Only the target fields are frozen in sample mode: `applyToRuntime` returns early before it
  // rebuilds the client, but it has already applied the model and the reranker, so disabling
  // those two would misdescribe what the backend does.
  const targetsDisabled = !canEdit || mock;

  const dirty =
    form.kbId.trim() !== "" ||
    form.region !== saved.region ||
    form.baseUrl !== saved.baseUrl ||
    form.generativeModel !== saved.generativeModel ||
    form.reranker !== saved.reranker ||
    form.timeoutMs !== saved.timeoutMs;

  async function submit() {
    const patch: Record<string, unknown> = {};
    if (form.kbId.trim()) patch.kbId = form.kbId.trim();
    if (form.region !== saved.region) patch.region = form.region;
    if (form.baseUrl !== saved.baseUrl) patch.baseUrl = form.baseUrl;
    if (form.generativeModel !== saved.generativeModel) patch.generativeModel = form.generativeModel;
    if (form.reranker !== saved.reranker) patch.reranker = form.reranker;
    if (form.timeoutMs !== saved.timeoutMs) patch.timeoutMs = form.timeoutMs;
    const next = await save("connection", patch);
    if (next) {
      setForm(formOf(next));
      setSaved(formOf(next));
    }
  }

  async function rotate() {
    if (!newKey.trim()) return;
    const next = await save("connection", { apiKey: newKey.trim() });
    if (next) {
      setNewKey("");
      setRotating(false);
      setForm(formOf(next));
      setSaved(formOf(next));
    }
  }

  return (
    <section className="arag-stack">
      {!canEdit && <ReadOnlyNotice adminOff={adminOff} />}

      <div className="arag-card pad">
        <CardHead
          title="Knowledge Box"
          aside={<StateChip tone={mock ? "muted" : "ok"}>{mock ? "Sample data" : "Live"}</StateChip>}
        />
        <SourceLine
          section="connection"
          overridden={view.overridden}
          canEdit={canEdit}
          busy={busy}
          onReset={async () => {
            const next = await reset("connection");
            if (next) {
              setForm(formOf(next));
              setSaved(formOf(next));
            }
          }}
        />

        {mock && (
          <div className="arag-alert warn" data-testid="mock-notice" style={{ marginBottom: 14 }}>
            <div>
              This deployment runs the in-process sample Knowledge Box, seeded with{" "}
              {view.connection.seededCalls ?? 0} synthetic calls. Connection edits are not applied to it: the
              Knowledge Box id, region, endpoint, timeout and service-account key below are read-only until{" "}
              <code className="mono">ARAG_KB_ID</code> and <code className="mono">ARAG_API_KEY</code> point at
              a live one. The generative model and reranker do still apply.
            </div>
          </div>
        )}

        <div style={{ display: "grid", gap: 14 }}>
          <Field
            id="c-kbid"
            label="Knowledge Box id"
            hint={
              <>
                Currently <code className="mono">{view.connection.kbId || "in-process"}</code>. The full id is
                never sent to the browser, so replacing it means typing the new one in full.
              </>
            }
          >
            <input
              id="c-kbid"
              className="arag-input mono"
              value={form.kbId}
              disabled={targetsDisabled}
              placeholder="Leave empty to keep the current Knowledge Box"
              maxLength={64}
              onChange={(e) => set("kbId", e.target.value)}
            />
          </Field>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <Field
              id="c-region"
              label="Region"
              hint="The zone the Knowledge Box lives in, e.g. aws-us-east-2-1."
            >
              <input
                id="c-region"
                className="arag-input mono"
                value={form.region}
                disabled={targetsDisabled}
                maxLength={64}
                onChange={(e) => set("region", e.target.value)}
              />
            </Field>
            <Field
              id="c-timeout"
              label="Request timeout"
              hint="How long a single Knowledge Box request may take before it is abandoned (ms)."
            >
              <input
                id="c-timeout"
                className="arag-input"
                type="number"
                min={1000}
                max={300000}
                step={500}
                value={form.timeoutMs}
                disabled={targetsDisabled}
                onChange={(e) => set("timeoutMs", Number(e.target.value))}
              />
            </Field>
          </div>

          <Field
            id="c-baseurl"
            label="Base URL"
            hint={
              mock
                ? "In-process mock: the sample Knowledge Box has no external address."
                : "Set this instead of a region to reach a Knowledge Box on a private endpoint."
            }
          >
            <input
              id="c-baseurl"
              className="arag-input mono"
              value={mock ? "in-process mock" : form.baseUrl}
              disabled={targetsDisabled}
              maxLength={300}
              placeholder="https://…"
              onChange={(e) => set("baseUrl", e.target.value)}
            />
          </Field>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <Field
              id="c-model"
              label="Generative model"
              hint="The model that answers questions and writes the call insights."
            >
              <input
                id="c-model"
                className="arag-input mono"
                value={form.generativeModel}
                disabled={!canEdit}
                maxLength={100}
                onChange={(e) => set("generativeModel", e.target.value)}
              />
            </Field>
            <Field
              id="c-reranker"
              label="Reranker"
              hint="How retrieved paragraphs are re-ordered before the model sees them."
            >
              <select
                id="c-reranker"
                className="arag-select"
                value={form.reranker}
                disabled={!canEdit}
                onChange={(e) => set("reranker", e.target.value)}
              >
                <option value="">Knowledge Box default</option>
                <option value="predict">predict — the platform reranker</option>
                <option value="noop">noop — keep the retrieval order</option>
              </select>
            </Field>
          </div>
        </div>

        <SaveRow
          dirty={dirty}
          busy={busy}
          canEdit={canEdit}
          testId="save-connection"
          onSave={submit}
          onRevert={() => setForm(saved)}
        />
      </div>

      <div className="arag-card pad">
        <CardHead
          title="Service-account key"
          aside={
            <StateChip tone={view.connection.apiKeySet ? "ok" : "warn"}>
              {view.connection.apiKeySet ? "Set" : "Not set"}
            </StateChip>
          }
        />
        <p className="small" style={{ marginTop: 0 }}>
          The credential this product uses to reach the Knowledge Box. It is write-only: it is stored on the
          server, never returned by any endpoint, and never rendered here.{" "}
          {view.connection.apiKeyOverridden
            ? "The stored key is in use, ahead of the environment's."
            : "The environment's key is in use."}
        </p>

        {canEdit && !rotating && (
          <button
            type="button"
            className="arag-btn secondary sm"
            disabled={mock}
            data-testid="rotate-key"
            onClick={() => setRotating(true)}
          >
            {view.connection.apiKeySet ? "Rotate" : "Set a key"}
          </button>
        )}

        {canEdit && rotating && (
          <div style={{ display: "grid", gap: 10, marginTop: 4 }}>
            <Field
              id="c-apikey"
              label="New service-account key"
              hint="Saving replaces the credential immediately, for the very next Knowledge Box request."
            >
              <input
                id="c-apikey"
                className="arag-input mono"
                type="password"
                autoComplete="off"
                value={newKey}
                maxLength={500}
                onChange={(e) => setNewKey(e.target.value)}
              />
            </Field>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                className="arag-btn"
                onClick={rotate}
                disabled={busy || !newKey.trim()}
                data-testid="save-key"
              >
                Save the new key
              </button>
              <button
                type="button"
                className="arag-btn secondary"
                onClick={() => {
                  setNewKey("");
                  setRotating(false);
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="arag-card pad">
        <CardHead title="What this deployment allows" />
        <dl className="arag-kv">
          <div>
            <dt>Uploads</dt>
            <dd>{view.features.uploads ? "Allowed" : "Disabled"}</dd>
          </div>
          <div>
            <dt>Deleting calls</dt>
            <dd>{view.features.deletes ? "Allowed" : "Disabled"}</dd>
          </div>
          <div>
            <dt>Operator panel</dt>
            <dd>{view.features.adminPanel ? "Enabled" : "Disabled (no ADMIN_TOKEN)"}</dd>
          </div>
          <div>
            <dt>API-key authentication</dt>
            <dd>{view.features.apiKeyAuth ? "Required" : "Open"}</dd>
          </div>
        </dl>
        <div style={{ marginTop: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link href="/admin/connection" className="arag-btn secondary sm">
            Run a connection test
          </Link>
          <Link href="/taxonomy" className="arag-btn secondary sm">
            Agents &amp; taxonomy
          </Link>
        </div>
      </div>
      {toast}
    </section>
  );
}
