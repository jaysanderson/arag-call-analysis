/**
 * Full seed pipeline (one command):
 *   1. create labelsets
 *   2. render media for every scenario (say + ffmpeg)
 *   3. ingest (file or text) and wait for transcription
 *   4. run augmentation agents sequentially (label + analyze + metrics)
 *
 * Re-runnable: pass `--reset` to wipe existing resources/tasks first.
 */
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync } from "node:fs";
import { api, tryApi } from "./lib/arag-admin.js";
import {
  createAllLabelsets, waitForProcessed, runAgentsSequentially, deleteAllTasks,
} from "./lib/kb-ops.js";
import { renderCall, transcriptText } from "./lib/media.js";
import { createMediaResource, createTextResource, type CallMeta } from "./lib/ingest.js";
import { SCENARIOS, iconFor, mediaTypeFor } from "./config/scenarios.js";

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, "output");

async function resetResources() {
  console.log("Resetting (deleting tasks + resources)…");
  await deleteAllTasks();
  const d = await api<any>("/catalog", { query: { page_size: "200" } });
  for (const rid of Object.keys(d.resources ?? {})) {
    await tryApi(`/resource/${rid}`, { method: "DELETE" });
  }
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  if (process.argv.includes("--reset")) await resetResources();

  console.log(`\n[1/4] Labelsets`);
  await createAllLabelsets();

  console.log(`\n[2/4] Render + ingest ${SCENARIOS.length} calls`);
  const rids: string[] = [];
  let i = 0;
  for (const sc of SCENARIOS) {
    i++;
    const r = renderCall({ id: sc.slug, title: sc.title, turns: sc.turns }, OUT, sc.format);
    const meta: CallMeta = {
      slug: sc.slug, title: sc.title, icon: iconFor(sc.format), createdISO: sc.createdISO,
      agentName: sc.agentName, memberId: sc.memberId, queue: sc.queue,
      durationSec: r.duration, mediaType: mediaTypeFor(sc.format),
    };
    const rid = sc.format === "transcript"
      ? await createTextResource(meta, transcriptText({ id: sc.slug, title: sc.title, turns: sc.turns }))
      : await createMediaResource(meta, (r.audioPath ?? r.videoPath)!);
    rids.push(rid);
    console.log(`  [${i}/${SCENARIOS.length}] ${sc.format.padEnd(10)} ${sc.slug} -> ${rid} (${r.duration}s)`);
  }

  console.log(`\n[3/4] Wait for transcription/processing`);
  await waitForProcessed(rids);

  console.log(`\n[4/4] Run augmentation agents (sequential)`);
  await runAgentsSequentially();

  console.log(`\n✅ Seed complete: ${rids.length} calls ingested, labeled, and analyzed.`);
}
main().catch((e) => { console.error(e); process.exit(1); });
