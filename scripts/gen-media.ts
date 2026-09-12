/**
 * OPTIONAL: render the 24 demo scenarios into real audio/video files and write a manifest for
 * `scripts/ingest.ts`.
 *
 *   node scripts/gen-media.ts [--out scripts/output] [--limit 4] [--transcripts-only]
 *
 * Audio/video rendering uses macOS `say` plus `ffmpeg` and therefore only works on a Mac with
 * ffmpeg installed. Everywhere else (and with `--transcripts-only`) the script still writes a
 * complete manifest with `transcript` bodies, which `scripts/ingest.ts` ingests as text calls —
 * the product never depends on rendered media.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  estimatedDurationSec,
  iconFor,
  mediaTypeFor,
  SCENARIOS,
  type Scenario,
  transcriptOf,
} from "../lib/domain/scenarios.ts";
import { renderCall } from "./lib/media.ts";

export interface ManifestEntry {
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
  filePath?: string;
  transcript?: string;
}

function arg(name: string): string | undefined {
  const withEq = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (withEq) return withEq.slice(name.length + 3);
  const i = process.argv.indexOf(`--${name}`);
  const next = i !== -1 ? process.argv[i + 1] : undefined;
  return next && !next.startsWith("--") ? next : undefined;
}

function canRenderMedia(): boolean {
  try {
    execFileSync("say", ["-v", "?"], { stdio: "ignore" });
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function main(): void {
  const out = arg("out") ?? join("scripts", "output");
  const limit = Number(arg("limit") ?? SCENARIOS.length);
  const transcriptsOnly = process.argv.includes("--transcripts-only");
  const media = !transcriptsOnly && canRenderMedia();
  if (!media && !transcriptsOnly) {
    console.log("`say` or `ffmpeg` not available — writing a transcript-only manifest (this is fine).");
  }
  mkdirSync(out, { recursive: true });

  const manifest: ManifestEntry[] = [];
  const list = SCENARIOS.slice(0, limit);
  for (const [i, sc] of list.entries()) {
    const rendered =
      media && sc.format !== "transcript"
        ? renderCall({ id: sc.slug, title: sc.title, turns: sc.turns }, out, sc.format)
        : null;
    const filePath = rendered?.audioPath ?? rendered?.videoPath;
    manifest.push({
      slug: sc.slug,
      title: sc.title,
      format: filePath ? sc.format : "transcript",
      icon: filePath ? iconFor(sc.format) : "text/plain",
      mediaType: filePath ? mediaTypeFor(sc.format) : "transcript",
      createdISO: sc.createdISO,
      agentName: sc.agentName,
      memberId: sc.memberId,
      queue: sc.queue,
      durationSec: rendered?.duration ?? estimatedDurationSec(sc),
      filePath,
      transcript: filePath ? undefined : transcriptOf(sc),
    });
    console.log(`  [${i + 1}/${list.length}] ${(filePath ? sc.format : "transcript").padEnd(10)} ${sc.slug}`);
  }
  const manifestPath = join(out, "manifest.json");
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`\nManifest written: ${manifestPath} (${manifest.length} calls)`);
}

main();
