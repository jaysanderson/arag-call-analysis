"use client";

import { useState } from "react";
import type { SettingsView } from "@/services/settings";
import { CardHead, Field, ReadOnlyNotice, SaveRow, SourceLine, useSettingsWrites } from "./common";

/**
 * The caps this deployment enforces.
 *
 * Two of them are stored in units nobody types: bytes and milliseconds. They are edited in MB and
 * seconds and converted on the way in and out, because an operator asked for "a hundred megabytes"
 * should not have to count zeroes — and a mistyped zero here is the difference between a 100 MB
 * upload limit and a 1 GB one.
 */

const MB = 1024 * 1024;

type Form = {
  maxQuestionChars: number;
  maxUploadMb: number;
  rateLimitRps: number;
  rateLimitBurst: number;
  cacheTtlSec: number;
};

function formOf(v: SettingsView): Form {
  return {
    maxQuestionChars: v.limits.maxQuestionChars,
    maxUploadMb: Math.round(v.limits.maxUploadBytes / MB),
    rateLimitRps: v.limits.rateLimitRps,
    rateLimitBurst: v.limits.rateLimitBurst,
    cacheTtlSec: Math.round(v.limits.cacheTtlMs / 1000),
  };
}

export function LimitsPanel({
  initial,
  canEdit,
  adminOff,
}: {
  initial: SettingsView;
  canEdit: boolean;
  adminOff: boolean;
}) {
  const { view, busy, toast, errorBanner, save, reset } = useSettingsWrites(initial);
  const [form, setForm] = useState<Form>(() => formOf(initial));
  const [saved, setSaved] = useState<Form>(() => formOf(initial));

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));
  const dirty = (Object.keys(saved) as Array<keyof Form>).some((k) => form[k] !== saved[k]);

  function adopt(next: SettingsView | null) {
    if (!next) return;
    setForm(formOf(next));
    setSaved(formOf(next));
  }

  async function submit() {
    const patch: Record<string, unknown> = {};
    if (form.maxQuestionChars !== saved.maxQuestionChars) patch.maxQuestionChars = form.maxQuestionChars;
    if (form.maxUploadMb !== saved.maxUploadMb) patch.maxUploadBytes = form.maxUploadMb * MB;
    if (form.rateLimitRps !== saved.rateLimitRps) patch.rateLimitRps = form.rateLimitRps;
    if (form.rateLimitBurst !== saved.rateLimitBurst) patch.rateLimitBurst = form.rateLimitBurst;
    if (form.cacheTtlSec !== saved.cacheTtlSec) patch.cacheTtlMs = form.cacheTtlSec * 1000;
    adopt(await save("limits", patch));
  }

  return (
    <section className="arag-stack">
      {errorBanner}
      {!canEdit && <ReadOnlyNotice adminOff={adminOff} />}

      <div className="arag-card pad">
        <CardHead title="Limits" />
        <SourceLine
          section="limits"
          overridden={view.overridden}
          canEdit={canEdit}
          busy={busy}
          onReset={async () => adopt(await reset("limits"))}
        />

        {/* A `display: grid` with no `gridTemplateColumns` gets one implicit `auto` column whose
            minimum is its content's min-content width, so a single unbreakable value can size the
            column past the viewport. `minmax(0, 1fr)` lets it shrink instead. */}
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 14 }}>
          <Field
            id="l-question"
            label="Longest question"
            hint="Characters a question about a call may contain before it is refused."
          >
            <input
              id="l-question"
              className="arag-input"
              type="number"
              min={40}
              max={4000}
              step={10}
              value={form.maxQuestionChars}
              disabled={!canEdit}
              data-testid="limit-question-chars"
              onChange={(e) => set("maxQuestionChars", Number(e.target.value))}
            />
          </Field>

          <Field
            id="l-upload"
            label="Largest upload"
            hint="Megabytes a single recording or transcript may weigh."
          >
            <input
              id="l-upload"
              className="arag-input"
              type="number"
              min={1}
              max={2048}
              step={1}
              value={form.maxUploadMb}
              disabled={!canEdit}
              data-testid="limit-upload-mb"
              onChange={(e) => set("maxUploadMb", Number(e.target.value))}
            />
          </Field>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <Field
              id="l-rps"
              label="Rate limit"
              hint="Sustained requests per second, per caller. 0 turns the limiter off."
            >
              <input
                id="l-rps"
                className="arag-input"
                type="number"
                min={0}
                max={10000}
                step={1}
                value={form.rateLimitRps}
                disabled={!canEdit}
                data-testid="limit-rps"
                onChange={(e) => set("rateLimitRps", Number(e.target.value))}
              />
            </Field>
            <Field
              id="l-burst"
              label="Burst"
              hint="How many requests a caller may spend at once before the rate applies."
            >
              <input
                id="l-burst"
                className="arag-input"
                type="number"
                min={1}
                max={100000}
                step={1}
                value={form.rateLimitBurst}
                disabled={!canEdit}
                data-testid="limit-burst"
                onChange={(e) => set("rateLimitBurst", Number(e.target.value))}
              />
            </Field>
          </div>

          <Field
            id="l-cache"
            label="Read cache lifetime"
            hint="Seconds a Knowledge Box read is reused before it is fetched again. 0 disables the cache."
          >
            <input
              id="l-cache"
              className="arag-input"
              type="number"
              min={0}
              max={3600}
              step={1}
              value={form.cacheTtlSec}
              disabled={!canEdit}
              data-testid="limit-cache-sec"
              onChange={(e) => set("cacheTtlSec", Number(e.target.value))}
            />
          </Field>
        </div>

        <SaveRow
          dirty={dirty}
          busy={busy}
          canEdit={canEdit}
          testId="save-limits"
          onSave={submit}
          onRevert={() => setForm(saved)}
        />
      </div>

      <div className="arag-card pad">
        <CardHead title="In force now" />
        <dl className="arag-kv" data-testid="limits-in-force">
          <div>
            <dt>Longest question</dt>
            <dd data-testid="in-force-question">{view.limits.maxQuestionChars} characters</dd>
          </div>
          <div>
            <dt>Largest upload</dt>
            <dd data-testid="in-force-upload">{Math.round(view.limits.maxUploadBytes / MB)} MB</dd>
          </div>
          <div>
            <dt>Rate limit</dt>
            <dd>
              {view.limits.rateLimitRps === 0
                ? "Off"
                : `${view.limits.rateLimitRps} requests per second, burst ${view.limits.rateLimitBurst}`}
            </dd>
          </div>
          <div>
            <dt>Read cache</dt>
            <dd>{view.limits.cacheTtlMs === 0 ? "Off" : `${Math.round(view.limits.cacheTtlMs / 1000)} s`}</dd>
          </div>
        </dl>
        <p className="small" style={{ marginBottom: 0, color: "var(--arag-text-subtle)" }}>
          A saved limit applies to the next request; nothing restarts.
        </p>
      </div>
      {toast}
    </section>
  );
}
