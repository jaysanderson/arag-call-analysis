import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Lightweight .env.local loader (no dependency) so scripts can be run with `tsx`.
const here = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(here, "../../.env.local");

function loadEnv() {
  try {
    const raw = readFileSync(envPath, "utf8");
    for (const line of raw.split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq === -1) continue;
      const key = t.slice(0, eq).trim();
      const val = t.slice(eq + 1).trim();
      if (!(key in process.env)) process.env[key] = val;
    }
  } catch {
    // ignore — env may be provided by the shell
  }
}
loadEnv();

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var ${name} (set it in .env.local)`);
  return v;
}

export const ARAG_BASE = required("ARAG_BASE").replace(/\/$/, "");
export const ARAG_KB_ID = required("ARAG_KB_ID");
export const ARAG_API_KEY = required("ARAG_API_KEY");
export const KB_URL = `${ARAG_BASE}/kb/${ARAG_KB_ID}`;
