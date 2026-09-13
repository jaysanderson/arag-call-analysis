"use client";

import { useRef, useState } from "react";
import { IconImage, IconTrash } from "@/components/icons";
import type { Branding } from "@/lib/branding";
import type { SettingsView } from "@/services/settings";
import { BrandingPreview } from "./BrandingPreview";
import {
  CardHead,
  Field,
  problemDetail,
  ReadOnlyNotice,
  SaveRow,
  SourceLine,
  useSettingsWrites,
} from "./common";

/**
 * The white-label identity, edited and previewed together.
 *
 * The preview is driven by the *form* state rather than the saved state, so a partner sees the
 * result of a colour or a name before committing it. Everything else on the screen still reports
 * the saved state — the source line, the logo, the reset control — so there is never any doubt
 * about which of the two is live.
 */

const MAX_LOGO_BYTES = 512 * 1024;
const LOGO_TYPES = ["image/svg+xml", "image/png", "image/jpeg", "image/webp"];

function formOf(v: SettingsView): Branding {
  return { ...v.branding };
}

export function BrandingPanel({
  initial,
  canEdit,
  adminOff,
}: {
  initial: SettingsView;
  canEdit: boolean;
  adminOff: boolean;
}) {
  const { view, busy, toast, show, save, reset, run } = useSettingsWrites(initial);
  const [form, setForm] = useState<Branding>(() => formOf(initial));
  const [saved, setSaved] = useState<Branding>(() => formOf(initial));
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const set = <K extends keyof Branding>(key: K, value: Branding[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const dirty = (Object.keys(saved) as Array<keyof Branding>).some((k) => form[k] !== saved[k]);

  function adopt(next: SettingsView | null) {
    if (!next) return;
    setForm(formOf(next));
    setSaved(formOf(next));
  }

  async function submit() {
    // Only what changed: the patch endpoint takes a partial section, and sending the whole block
    // would overwrite a field another operator had just changed in a different tab.
    const patch: Record<string, unknown> = {};
    for (const key of Object.keys(saved) as Array<keyof Branding>) {
      if (key === "logoUrl") continue; // owned by the upload control below
      if (form[key] !== saved[key]) patch[key] = form[key];
    }
    adopt(await save("branding", patch));
  }

  async function upload(file: File) {
    if (!LOGO_TYPES.includes(file.type)) {
      show("A logo must be an SVG, PNG, JPEG or WebP image.", "error");
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      show(`That file is ${Math.round(file.size / 1024)} KB; the limit is 512 KB.`, "error");
      return;
    }
    const body = new FormData();
    body.append("logo", file);
    adopt(
      await run(async () => {
        const res = await fetch("/api/v1/settings/logo", { method: "POST", body });
        if (!res.ok) throw new Error(await problemDetail(res));
        return (await res.json()) as SettingsView;
      }, "Logo uploaded."),
    );
  }

  async function removeLogo() {
    adopt(
      await run(async () => {
        const res = await fetch("/api/v1/settings/logo", { method: "DELETE" });
        if (!res.ok) throw new Error(await problemDetail(res));
        return (await res.json()) as SettingsView;
      }, "Logo removed."),
    );
  }

  return (
    <section className="arag-stack">
      {!canEdit && <ReadOnlyNotice adminOff={adminOff} />}

      <div className="arag-card pad">
        <CardHead title="Identity" />
        <SourceLine
          section="branding"
          overridden={view.overridden}
          canEdit={canEdit}
          busy={busy}
          onReset={async () => adopt(await reset("branding"))}
        />

        <div style={{ display: "grid", gap: 14 }}>
          <Field id="b-name" label="Product name" hint="Names the rail, the browser tab and every export.">
            <input
              id="b-name"
              className="arag-input"
              value={form.productName}
              maxLength={60}
              disabled={!canEdit}
              data-testid="branding-name"
              onChange={(e) => set("productName", e.target.value)}
            />
          </Field>
          <Field
            id="b-tagline"
            label="Tagline"
            hint="One line under the product name in the rail. May be empty."
          >
            <input
              id="b-tagline"
              className="arag-input"
              value={form.tagline}
              maxLength={80}
              disabled={!canEdit}
              onChange={(e) => set("tagline", e.target.value)}
            />
          </Field>
          <Field id="b-footer" label="Footer text" hint="The line along the bottom of every screen.">
            <input
              id="b-footer"
              className="arag-input"
              value={form.footerText}
              maxLength={200}
              disabled={!canEdit}
              onChange={(e) => set("footerText", e.target.value)}
            />
          </Field>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <Swatch
              id="b-primary"
              label="Primary colour"
              hint="Actions, links and the current nav item."
              value={form.primaryColor}
              disabled={!canEdit}
              onChange={(v) => set("primaryColor", v)}
            />
            <Swatch
              id="b-accent"
              label="Accent colour"
              hint="Ready and success states. Never used as text on white."
              value={form.accentColor}
              disabled={!canEdit}
              onChange={(v) => set("accentColor", v)}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <Field id="b-docs" label="Docs URL" hint="Where the Docs link in the band and footer goes.">
              <input
                id="b-docs"
                className="arag-input mono"
                value={form.docsUrl}
                maxLength={500}
                disabled={!canEdit}
                onChange={(e) => set("docsUrl", e.target.value)}
              />
            </Field>
            <Field id="b-support" label="Support URL" hint="Adds a Support link to the footer. May be empty.">
              <input
                id="b-support"
                className="arag-input mono"
                value={form.supportUrl}
                maxLength={500}
                disabled={!canEdit}
                placeholder="https://…"
                onChange={(e) => set("supportUrl", e.target.value)}
              />
            </Field>
          </div>

          <label className="arag-switch" style={{ fontSize: 13 }}>
            <input
              type="checkbox"
              checked={form.poweredBy}
              disabled={!canEdit}
              data-testid="branding-poweredby"
              onChange={(e) => set("poweredBy", e.target.checked)}
            />
            Show the Progress Agentic RAG band and the footer credit
          </label>
        </div>

        <SaveRow
          dirty={dirty}
          busy={busy}
          canEdit={canEdit}
          testId="save-branding"
          onSave={submit}
          onRevert={() => setForm(saved)}
        />
      </div>

      <div className="arag-card pad">
        <CardHead title="Logo" />
        <p className="small" style={{ marginTop: 0 }}>
          Replaces the Progress wordmark in the rail and, where the browser can use it, the tab icon. SVG,
          PNG, JPEG or WebP, up to 512 KB.
        </p>

        {view.branding.logoUrl && (
          <div
            style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}
            data-testid="logo-current"
          >
            <img
              src={view.branding.logoUrl}
              alt="The configured logo"
              style={{ height: 28, width: "auto", maxWidth: 180 }}
            />
            <code className="mono small" style={{ color: "var(--arag-text-subtle)" }}>
              {view.branding.logoUrl}
            </code>
            {canEdit && (
              <button
                type="button"
                className="arag-btn ghost sm danger"
                onClick={removeLogo}
                disabled={busy}
                data-testid="remove-logo"
                style={{ marginLeft: "auto" }}
              >
                <IconTrash size={14} />
                Remove logo
              </button>
            )}
          </div>
        )}

        {canEdit && (
          <>
            <button
              type="button"
              className={`arag-dropzone${dragging ? " drag" : ""}`}
              data-testid="logo-dropzone"
              onClick={() => fileInput.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                const file = e.dataTransfer.files?.[0];
                if (file) void upload(file);
              }}
            >
              <span className="icon">
                <IconImage size={28} />
              </span>
              <span>Drop a logo here, or choose a file</span>
              <span className="small">SVG, PNG, JPEG or WebP · up to 512 KB</span>
            </button>
            <input
              ref={fileInput}
              type="file"
              accept={LOGO_TYPES.join(",")}
              hidden
              data-testid="logo-input"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void upload(file);
                e.target.value = "";
              }}
            />
          </>
        )}
      </div>

      <BrandingPreview branding={form} />
      {toast}
    </section>
  );
}

/**
 * A colour control: the native picker as a swatch with the value beside it, because a swatch alone
 * cannot be read, copied into an environment file, or typed in as a brand's exact hex.
 */
function Swatch({
  id,
  label,
  hint,
  value,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  value: string;
  disabled: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <Field id={id} label={label} hint={hint}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input
          id={id}
          className="arag-input"
          type="color"
          style={{ width: 52, padding: 3, flex: "0 0 auto" }}
          value={hexOf(value)}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />
        <input
          className="arag-input mono"
          aria-label={`${label} value`}
          value={value}
          maxLength={64}
          disabled={disabled}
          data-testid={`${id}-text`}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    </Field>
  );
}

/** `<input type="color">` only accepts `#rrggbb`; anything else falls back to the kit's blue. */
function hexOf(value: string): string {
  return /^#[0-9a-f]{6}$/i.test(value) ? value : "#2b2bb2";
}
