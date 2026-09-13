"use client";

import { useEffect, useId, useState } from "react";
import { IconEdit, IconPlay, IconStop } from "@/components/icons";
import { Drawer, StateChip, type StateTone } from "@/components/kit";
import { type AgentRow, api } from "./api";

/**
 * The agents half of the screen: what each agent is instructed to do, whether it is switched on,
 * and whether the Knowledge Box is actually running it.
 *
 * The split between "enabled" and "running" is the thing this panel exists to make legible.
 * Enabling is configuration held by the product; running is a task held by the Knowledge Box. A
 * disabled agent whose task is still live keeps labelling calls until someone stops it, so the
 * card says so and offers the stop rather than pretending the toggle did it.
 */

export const AGENT_TONE: Record<AgentRow["state"], StateTone> = {
  running: "neutral",
  completed: "ok",
  failed: "error",
  configured: "muted",
  absent: "warn",
};

export const AGENT_LABEL: Record<AgentRow["state"], string> = {
  running: "Running",
  completed: "Completed",
  failed: "Failed",
  configured: "Configured, not started",
  absent: "Not in the Knowledge Box",
};

const TYPE_LABEL: Record<AgentRow["type"], string> = {
  labeler: "Labeler",
  ask: "Ask",
};

export function AgentsPanel({
  agents,
  canEdit,
  labelsetTitles,
  onEditLabelset,
  onDone,
  onError,
}: {
  agents: AgentRow[];
  canEdit: boolean;
  /** Labelset id → title, so a labeler can name what it applies rather than listing identifiers. */
  labelsetTitles: Record<string, string>;
  onEditLabelset: (id: string) => void;
  /** Called after every successful write: the parent re-reads and toasts. */
  onDone: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<AgentRow | null>(null);
  /**
   * What the toggle shows while the write is in flight.
   *
   * The switch is a controlled input over server state, so without this it snaps back to its old
   * position the moment React re-renders and only settles when the re-read lands — which reads as
   * the click having failed. The override is dropped as soon as fresh agents arrive.
   */
  const [pending, setPending] = useState<Record<string, boolean>>({});
  // biome-ignore lint/correctness/useExhaustiveDependencies: the new props ARE the reset
  useEffect(() => setPending({}), [agents]);

  const run = async (key: string, work: () => Promise<string>) => {
    setBusy(key);
    try {
      onDone(await work());
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const setEnabled = (a: AgentRow, enabled: boolean) => {
    setPending((p) => ({ ...p, [a.key]: enabled }));
    return run(a.key, async () => {
      await api(`/api/v1/agents/${encodeURIComponent(a.key)}`, {
        method: "PUT",
        body: JSON.stringify({ enabled }),
      });
      return enabled
        ? `${a.key} is enabled. Provision to start it in the Knowledge Box.`
        : `${a.key} is disabled. The next provision will not start it.`;
    });
  };

  const start = (a: AgentRow) =>
    run(a.key, async () => {
      await api(`/api/v1/agents/${encodeURIComponent(a.key)}/start`, { method: "POST" });
      return `${a.key} started in the Knowledge Box.`;
    });

  const stop = (a: AgentRow) =>
    run(a.key, async () => {
      await api(`/api/v1/agents/${encodeURIComponent(a.key)}`, { method: "DELETE" });
      return `${a.key} stopped. Its configuration is unchanged.`;
    });

  return (
    /* `agents-table` is the testid the operator journey already looks for; the layout changed from a
       table to cards, the contract did not. */
    <div style={{ display: "grid", gap: 12 }} data-testid="agents-table">
      {agents.map((a) => {
        const live = a.state === "running" || a.state === "configured";
        const enabled = pending[a.key] ?? a.enabled;
        const working = busy === a.key;
        const applies = a.labelsets ?? [];
        return (
          <section key={a.key} className="arag-card" data-testid={`agent-${a.key}`}>
            <div className="head">
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", minWidth: 0 }}>
                <h3 className="mono" style={{ fontSize: 14 }}>
                  {a.key}
                </h3>
                <span className="arag-chip outline">{TYPE_LABEL[a.type]}</span>
                <StateChip tone={AGENT_TONE[a.state]} busy={a.state === "running"}>
                  {AGENT_LABEL[a.state]}
                </StateChip>
              </div>
              {canEdit ? (
                <label className="arag-switch" style={{ whiteSpace: "nowrap" }}>
                  <input
                    type="checkbox"
                    checked={enabled}
                    disabled={working}
                    data-testid={`agent-enabled-${a.key}`}
                    onChange={(e) => setEnabled(a, e.target.checked)}
                  />
                  <span>{enabled ? "Enabled" : "Disabled"}</span>
                </label>
              ) : (
                <span className="arag-chip outline">{enabled ? "Enabled" : "Disabled"}</span>
              )}
            </div>

            <div className="body" style={{ display: "grid", gap: 10 }}>
              <p style={{ margin: 0, fontSize: 13 }}>{a.description}</p>

              {a.type === "labeler" ? (
                <div>
                  <div className="arag-label">
                    Applies {applies.length} labelset{applies.length === 1 ? "" : "s"}
                  </div>
                  <div className="arag-chips" style={{ marginTop: 6 }}>
                    {applies.length === 0 && (
                      <span className="arag-help">
                        No labelset at this level, so this agent has nothing to apply.
                      </span>
                    )}
                    {applies.map((id) =>
                      canEdit ? (
                        <button
                          key={id}
                          type="button"
                          className="arag-chip outline"
                          style={{ cursor: "pointer" }}
                          onClick={() => onEditLabelset(id)}
                        >
                          {labelsetTitles[id] ?? id}
                        </button>
                      ) : (
                        <span key={id} className="arag-chip outline">
                          {labelsetTitles[id] ?? id}
                        </span>
                      ),
                    )}
                  </div>
                  <p className="arag-help" style={{ margin: "8px 0 0" }}>
                    This agent has no prompt of its own: its instructions are built from the labelsets above —
                    each label's description is what it reads. Edit the labelset to change what it is told.
                  </p>
                </div>
              ) : (
                <div>
                  <div className="arag-label">Writes {Object.keys(a.prompts ?? {}).length} fields</div>
                  <div className="arag-chips" style={{ marginTop: 6 }}>
                    {Object.keys(a.prompts ?? {}).map((dest) => (
                      <span key={dest} className="arag-chip outline mono">
                        {dest}
                      </span>
                    ))}
                  </div>
                  {canEdit && (
                    <button
                      type="button"
                      className="arag-btn secondary sm"
                      style={{ marginTop: 10 }}
                      data-testid={`agent-edit-prompts-${a.key}`}
                      onClick={() => setEditing(a)}
                    >
                      <IconEdit size={14} /> Edit instructions
                    </button>
                  )}
                </div>
              )}

              {!enabled && live && (
                <div className="arag-alert warn" style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <span style={{ flex: 1 }}>
                    Switched off here, but its Knowledge Box task is still{" "}
                    {AGENT_LABEL[a.state].toLowerCase()}. It keeps working on new calls until the task is
                    stopped.
                  </span>
                  {canEdit && (
                    <button
                      type="button"
                      className="arag-btn danger sm"
                      disabled={working}
                      onClick={() => stop(a)}
                    >
                      Stop now
                    </button>
                  )}
                </div>
              )}

              <div
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                  borderTop: "1px solid var(--arag-border)",
                  paddingTop: 10,
                }}
              >
                <span className="arag-help mono">{a.taskId ? `task ${a.taskId}` : "no task"}</span>
                {a.model && <span className="arag-help mono">{a.model}</span>}
                <span style={{ flex: 1 }} />
                {canEdit && enabled && !live && (
                  <button
                    type="button"
                    className="arag-btn secondary sm"
                    disabled={working}
                    onClick={() => start(a)}
                  >
                    <IconPlay size={13} /> Start
                  </button>
                )}
                {canEdit && live && (
                  <button
                    type="button"
                    className="arag-btn secondary sm"
                    disabled={working}
                    onClick={() => stop(a)}
                  >
                    <IconStop size={13} /> Stop
                  </button>
                )}
              </div>
            </div>
          </section>
        );
      })}

      {editing && (
        <InstructionsDrawer
          agent={editing}
          onClose={() => setEditing(null)}
          onSaved={(message) => {
            setEditing(null);
            onDone(message);
          }}
        />
      )}
    </div>
  );
}

/** The `ask` agent's prompts, one textarea per destination field. */
function InstructionsDrawer({
  agent,
  onClose,
  onSaved,
}: {
  agent: AgentRow;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const uid = useId();
  const [prompts, setPrompts] = useState<Record<string, string>>({ ...(agent.prompts ?? {}) });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const tooShort = Object.entries(prompts)
    .filter(([, v]) => v.trim().length < 20)
    .map(([k]) => k);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/v1/agents/${encodeURIComponent(agent.key)}`, {
        method: "PUT",
        body: JSON.stringify({ prompts }),
      });
      onSaved(`${agent.key} instructions saved. They apply from the next provision.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer
      title={`${agent.key} instructions`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="arag-btn secondary" onClick={onClose}>
            Cancel
          </button>
          <span style={{ flex: 1 }} />
          <button
            type="button"
            className="arag-btn"
            data-testid="agent-prompts-save"
            disabled={busy || tooShort.length > 0}
            onClick={save}
          >
            {busy ? "Saving…" : "Save instructions"}
          </button>
        </>
      }
    >
      <p style={{ marginTop: 0, fontSize: 13 }}>{agent.description}</p>
      <p className="arag-help">
        One instruction per output field. The agent's answer is written to that field on the call record, and
        the product parses it — so a change of format changes what the call page and the dashboard can read.
      </p>

      <div style={{ display: "grid", gap: 16, marginTop: 14 }}>
        {Object.entries(prompts).map(([dest, value]) => (
          <div className="arag-field" key={dest}>
            <label htmlFor={`${uid}-${dest}`}>
              Written to <span className="mono">{dest}</span>
            </label>
            <textarea
              id={`${uid}-${dest}`}
              className="arag-textarea mono"
              data-testid={`prompt-${dest}`}
              style={{ minHeight: 260, fontSize: 12, lineHeight: 1.5 }}
              value={value}
              spellCheck={false}
              onChange={(e) => setPrompts((p) => ({ ...p, [dest]: e.target.value }))}
            />
            <span className="arag-help">
              {value.trim().length < 20
                ? "Too short to be an instruction — at least 20 characters."
                : `${value.length} characters.`}
            </span>
          </div>
        ))}
      </div>

      {error && (
        <div className="arag-alert error" role="alert" style={{ marginTop: 14 }} data-testid="prompt-error">
          {error}
        </div>
      )}

      <p className="arag-help" style={{ marginTop: 14 }}>
        A change takes effect on the next provision: the Knowledge Box holds the running task, and it reads
        the instruction it was started with.
      </p>
    </Drawer>
  );
}
