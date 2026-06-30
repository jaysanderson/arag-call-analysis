import { api, tryApi, sleep } from "./arag-admin.js";
import { ALL_LABELSETS, AGENTS, type LabelsetDef, type AgentDef } from "../config/taxonomy.js";

// ---------- Labelsets ----------
export async function createLabelset(ls: LabelsetDef) {
  const body = {
    title: ls.title,
    color: ls.color,
    multiple: ls.multiple,
    kind: [ls.kind],
    labels: ls.labels.map((l) => ({ title: l.label })),
  };
  await api(`/labelset/${ls.id}`, { method: "POST", body });
}

export async function createAllLabelsets() {
  for (const ls of ALL_LABELSETS) {
    await createLabelset(ls);
    console.log(`  labelset ✓ ${ls.id} (${ls.labels.length} labels, ${ls.kind})`);
  }
}

export async function listLabelsets(): Promise<Record<string, any>> {
  const r = await api<{ labelsets: Record<string, any> }>("/labelsets");
  return r.labelsets ?? {};
}

// ---------- Tasks / agents ----------
export type TaskInfo = { id: string; name: string; parameters?: any; completed?: boolean; stopped?: boolean };

export async function listTasks() {
  const d = await api<{ configs: any[]; running: any[]; done: any[] }>("/tasks");
  return d;
}

export async function startAgent(agent: AgentDef): Promise<string> {
  const res = await api<{ id: string; status: string; name: string }>("/task/start", {
    method: "POST",
    body: { name: agent.type, parameters: agent.parameters },
  });
  return res.id;
}

export async function startAllAgents(): Promise<Record<string, string>> {
  const ids: Record<string, string> = {};
  for (const a of AGENTS) {
    const id = await startAgent(a);
    ids[a.key] = id;
    console.log(`  agent ▶ ${a.key} (${a.type}) -> ${id}`);
  }
  return ids;
}

/** Wait until no tasks are in the `running` bucket (with startup grace). */
export async function waitForTasksIdle(timeoutMs = 1000 * 60 * 8) {
  await sleep(8000); // let the just-started task spin up into `running`
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const d = await listTasks();
    const running = (d.running ?? []).filter((t: any) => !t.stopped);
    if (running.length === 0) {
      await sleep(6000); // settle: allow write-back of results
      return true;
    }
    await sleep(6000);
  }
  console.log("  ⚠ tasks still running after timeout");
  return false;
}

/**
 * Run the agents ONE AT A TIME, waiting for each to finish before starting the
 * next. Required because the platform allows only one running task per
 * operation type (two `label` or two `ask` tasks at once => 422).
 */
export async function runAgentsSequentially(): Promise<Record<string, string>> {
  await deleteAllTasks();
  const ids: Record<string, string> = {};
  for (const a of AGENTS) {
    const id = await startAgent(a);
    ids[a.key] = id;
    console.log(`  agent ▶ ${a.key} (${a.type}) -> ${id}  … waiting`);
    await waitForTasksIdle();
    console.log(`  agent ✓ ${a.key} settled`);
  }
  return ids;
}

/** Delete every configured/running task (cleanup / reset). */
export async function deleteAllTasks() {
  const d = await listTasks();
  const all = [...(d.configs ?? []), ...(d.running ?? []), ...(d.done ?? [])];
  const ids = new Set<string>();
  for (const t of all) if (t.id) ids.add(t.id);
  for (const id of ids) {
    const r = await tryApi(`/task/${id}`, { method: "DELETE" });
    console.log(`  task ✗ ${id} -> ${r.ok ? "deleted" : r.status}`);
  }
}

// ---------- Resources ----------
export async function getResource(rid: string, show: string[] = ["basic", "values", "extracted", "origin"]) {
  return api(`/resource/${rid}`, {
    query: { show, extracted: ["text", "metadata"], field_type: undefined },
  });
}

export async function listResources(): Promise<any[]> {
  const d = await api<any>(`/catalog`, { query: { page_size: "100" } });
  const resources = d.resources ?? {};
  return Object.values(resources);
}

export async function waitForProcessed(rids: string[], timeoutMs = 1000 * 60 * 15) {
  const start = Date.now();
  const pending = new Set(rids);
  while (pending.size && Date.now() - start < timeoutMs) {
    for (const rid of [...pending]) {
      const r = await tryApi(`/resource/${rid}`, { query: { show: ["basic"] } });
      if (r.ok && (r as any).data?.metadata?.status === "PROCESSED") {
        pending.delete(rid);
        console.log(`  processed ✓ ${rid} (${rids.length - pending.size}/${rids.length})`);
      }
    }
    if (pending.size) await sleep(8000);
  }
  if (pending.size) console.log(`  ⚠ still pending after timeout: ${[...pending].join(", ")}`);
  return pending.size === 0;
}
