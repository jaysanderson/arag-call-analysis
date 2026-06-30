import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";

export type Turn = { speaker: "Agent" | "Member"; text: string };
export type CallScript = {
  id: string; // slug
  title: string;
  turns: Turn[];
};

// US English macOS voices that ship by default.
const VOICE = { Agent: "Samantha", Member: "Alex" } as const;
const SAMPLE_RATE = 24000;
const GAP_SEC = 0.4;

function run(cmd: string, args: string[], timeout = 60000) {
  return execFileSync(cmd, args, {
    stdio: ["ignore", "pipe", "pipe"],
    timeout, // guard against a stuck `say`/ffmpeg hanging the whole run
    killSignal: "SIGKILL",
    maxBuffer: 1024 * 1024 * 16,
  });
}

function ffprobeDuration(path: string): number {
  const out = run("ffprobe", [
    "-v", "error", "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1", path,
  ]).toString().trim();
  return Math.round(parseFloat(out) * 100) / 100;
}

/** Render a call script into a combined WAV (and return its path + duration). */
function renderWav(script: CallScript, work: string): { wav: string; duration: number } {
  mkdirSync(work, { recursive: true });
  // silence spacer (pcm_s16le @ SAMPLE_RATE mono — matches `say` WAV output)
  const silence = join(work, "silence.wav");
  run("ffmpeg", [
    "-y", "-f", "lavfi", "-i", `anullsrc=r=${SAMPLE_RATE}:cl=mono`,
    "-t", String(GAP_SEC), "-c:a", "pcm_s16le", silence,
  ]);

  const parts: string[] = [];
  script.turns.forEach((turn, i) => {
    const txt = join(work, `t${i}.txt`);
    writeFileSync(txt, turn.text);
    const wav = join(work, `t${i}.wav`);
    // `say` writes WAV (pcm_s16le @ SAMPLE_RATE) directly — no per-turn ffmpeg.
    run("say", [
      "-v", VOICE[turn.speaker],
      "--file-format=WAVE", `--data-format=LEI16@${SAMPLE_RATE}`,
      "-f", txt, "-o", wav,
    ], 45000);
    parts.push(wav);
    if (i < script.turns.length - 1) parts.push(silence);
  });

  const list = join(work, "list.txt");
  writeFileSync(list, parts.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n"));
  const combined = join(work, "combined.wav");
  run("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", combined]);
  return { wav: combined, duration: ffprobeDuration(combined) };
}

export type RenderResult = { audioPath?: string; videoPath?: string; duration: number };

/**
 * Produce media for a call.
 *  - format "mp3" -> audio only
 *  - format "mp4" -> waveform video with title overlay
 *  - format "transcript" -> no media (duration still computed for metadata)
 */
export function renderCall(
  script: CallScript,
  outDir: string,
  format: "mp3" | "mp4" | "transcript",
): RenderResult {
  const work = join(outDir, `.work_${script.id}`);
  const { wav, duration } = renderWav(script, work);
  mkdirSync(outDir, { recursive: true });
  const result: RenderResult = { duration };

  if (format === "mp3") {
    const mp3 = join(outDir, `${script.id}.mp3`);
    run("ffmpeg", ["-y", "-i", wav, "-codec:a", "libmp3lame", "-q:a", "4", mp3]);
    result.audioPath = mp3;
  } else if (format === "mp4") {
    const mp4 = join(outDir, `${script.id}.mp4`);
    // This ffmpeg build may lack drawtext (libfreetype); use a waveform over a
    // dark background only. The app renders the call title in the UI chrome.
    const wave = `showwaves=s=1280x720:mode=cline:rate=25:colors=0x38bdf8|0x6366f1`;
    const filter = `[0:a]${wave}[w];color=c=0x0b1220:s=1280x720:r=25[bg];[bg][w]overlay=0:0[v]`;
    run("ffmpeg", [
      "-y", "-i", wav,
      "-filter_complex", filter,
      "-map", "[v]", "-map", "0:a",
      "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "veryfast",
      "-c:a", "aac", "-b:a", "128k", "-shortest", mp4,
    ]);
    result.videoPath = mp4;
  }

  rmSync(work, { recursive: true, force: true });
  return result;
}

export function transcriptText(script: CallScript): string {
  return script.turns.map((t) => `${t.speaker}: ${t.text}`).join("\n\n");
}
