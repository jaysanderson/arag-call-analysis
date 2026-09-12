/**
 * Ingest calls from a manifest into a running Call Analysis server via `POST /api/v1/calls`.
 *
 *   node scripts/ingest.ts --manifest scripts/output/manifest.json [--limit 5] [--no-wait]
 *
 * The manifest is what `scripts/gen-media.ts` writes; entries without a `filePath` are ingested as
 * transcript-only calls, so the whole pipeline works on machines with no `say`/`ffmpeg`.
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { api, arg, BASE, flag, type JobView, waitForJob } from "./lib/client.ts";

interface ManifestEntry {
  slug: string;
  title: string;
  format: "mp3" | "mp4" | "transcript";
  icon: string;
  mediaType: "audio" | "video" | "transcript";
  createdISO: string;
  agentName: string;
  memberId: string;
  queue: string;
  durationSec: number;
  filePath?: string;
  transcript?: string;
}

async function ingest(entry: ManifestEntry, wait: boolean): Promise<string> {
  const form = new FormData();
  form.set("title", entry.title);
  form.set("agent_name", entry.agentName);
  form.set("member_id", entry.memberId);
  form.set("queue", entry.queue);
  form.set("created", entry.createdISO);
  form.set("duration_sec", String(entry.durationSec));
  if (entry.filePath) {
    const bytes = new Uint8Array(readFileSync(entry.filePath));
    form.set("recording", new File([bytes], basename(entry.filePath), { type: entry.icon }));
  } else if (entry.transcript) {
    form.set("transcript", entry.transcript);
  } else {
    throw new Error(`${entry.slug}: manifest entry has neither filePath nor transcript`);
  }
  const res = await api<{ job: JobView; call: { id: string } }>("/api/v1/calls", {
    method: "POST",
    body: form,
  });
  if (wait) await waitForJob(res.job.id);
  return res.call.id;
}

async function main(): Promise<void> {
  const manifestPath = arg("manifest") ?? "scripts/output/manifest.json";
  const limit = Number(arg("limit") ?? Number.POSITIVE_INFINITY);
  const wait = !flag("no-wait");
  const manifest = (JSON.parse(readFileSync(manifestPath, "utf8")) as ManifestEntry[]).slice(0, limit);
  console.log(`Ingesting ${manifest.length} calls into ${BASE} …`);
  let i = 0;
  for (const entry of manifest) {
    i++;
    const id = await ingest(entry, wait);
    console.log(`  [${i}/${manifest.length}] ${entry.format.padEnd(10)} ${entry.slug} → ${id}`);
  }
  console.log("Done. Run scripts/provision.ts to (re)run the augmentation agents over them.");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
