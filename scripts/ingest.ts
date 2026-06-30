/**
 * Ingest every call in the manifest, wait for processing, then start the
 * augmentation agents so they batch-process the transcribed resources.
 * Writes scripts/output/ingested.json (slug -> resource id).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createMediaResource, createTextResource, type CallMeta } from "./lib/ingest.js";
import { waitForProcessed, startAllAgents, deleteAllTasks } from "./lib/kb-ops.js";
import type { ManifestEntry } from "./gen-media.js";

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, "output");

async function main() {
  const manifest: ManifestEntry[] = JSON.parse(readFileSync(join(OUT, "manifest.json"), "utf8"));
  console.log(`Ingesting ${manifest.length} calls…`);

  const ingested: Record<string, string> = {};
  for (const e of manifest) {
    const meta: CallMeta = {
      slug: e.slug, title: e.title, icon: e.icon, createdISO: e.createdISO,
      agentName: e.agentName, memberId: e.memberId, queue: e.queue,
      durationSec: e.durationSec, mediaType: e.mediaType,
    };
    const rid = e.format === "transcript"
      ? await createTextResource(meta, e.transcript ?? "")
      : await createMediaResource(meta, e.filePath!);
    ingested[e.slug] = rid;
    console.log(`  ✓ ${e.format.padEnd(10)} ${e.slug} -> ${rid}`);
  }
  writeFileSync(join(OUT, "ingested.json"), JSON.stringify(ingested, null, 2));

  console.log("\nWaiting for transcription/processing…");
  await waitForProcessed(Object.values(ingested));

  console.log("\nStarting augmentation agents (label + analyze + metrics)…");
  await deleteAllTasks(); // clear any prior run
  await startAllAgents();
  console.log("\nAgents started. They will batch-process the processed resources.");
  console.log("Use `npm run kb:probe` to watch outputs appear.");
}
main().catch((e) => { console.error(e); process.exit(1); });
