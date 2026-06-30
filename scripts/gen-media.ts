/**
 * Render media for every scenario into scripts/output/ and write a manifest.
 * Idempotent-ish: re-rendering overwrites existing files.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { renderCall, transcriptText } from "./lib/media.js";
import { SCENARIOS, iconFor, mediaTypeFor, type Scenario } from "./config/scenarios.js";

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, "output");

export type ManifestEntry = {
  slug: string;
  title: string;
  format: Scenario["format"];
  icon: string;
  mediaType: "audio" | "video" | "transcript";
  createdISO: string;
  agentName: string;
  memberId: string;
  queue: string;
  durationSec: number;
  filePath?: string; // media file (mp3/mp4)
  transcript?: string; // text body (transcript format)
};

async function main() {
  mkdirSync(OUT, { recursive: true });
  const manifest: ManifestEntry[] = [];
  let i = 0;
  for (const sc of SCENARIOS) {
    i++;
    const r = renderCall({ id: sc.slug, title: sc.title, turns: sc.turns }, OUT, sc.format);
    const entry: ManifestEntry = {
      slug: sc.slug,
      title: sc.title,
      format: sc.format,
      icon: iconFor(sc.format),
      mediaType: mediaTypeFor(sc.format),
      createdISO: sc.createdISO,
      agentName: sc.agentName,
      memberId: sc.memberId,
      queue: sc.queue,
      durationSec: r.duration,
      filePath: r.audioPath ?? r.videoPath,
      transcript: sc.format === "transcript" ? transcriptText({ id: sc.slug, title: sc.title, turns: sc.turns }) : undefined,
    };
    manifest.push(entry);
    console.log(`  [${i}/${SCENARIOS.length}] ${sc.format.padEnd(10)} ${sc.slug} (${r.duration}s)`);
  }
  const manifestPath = join(OUT, "manifest.json");
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`\nManifest written: ${manifestPath} (${manifest.length} calls)`);
}
main().catch((e) => { console.error(e); process.exit(1); });
