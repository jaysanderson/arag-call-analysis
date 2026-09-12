/**
 * Dependency audit gate for CI.
 *
 *   node scripts/audit.ts [--level high]
 *
 * `bun audit` alone cannot be used as a gate here: the corporate registry blocks releases newer
 * than about two weeks, and TEAM-BRIEF pins `nanoid` and `baseline-browser-mapping` to older
 * versions precisely because the current ones are unreachable. Rather than disabling the check
 * with `|| true` — which hides everything, including a genuinely dangerous finding — this script
 * fails on any advisory at or above the chosen severity unless the package is listed in
 * `.audit-allowlist.json` with a reason and a review date.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LEVELS = ["low", "moderate", "high", "critical"];

interface AllowEntry {
  package: string;
  reason: string;
  reviewBy: string;
}

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? (process.argv[i + 1] ?? fallback) : fallback;
}

function main(): void {
  const level = arg("level", "high");
  const minIndex = LEVELS.indexOf(level);
  if (minIndex === -1) {
    console.error(`--level must be one of ${LEVELS.join(", ")}`);
    process.exit(2);
  }

  const allowPath = join(ROOT, ".audit-allowlist.json");
  const allow: AllowEntry[] = existsSync(allowPath)
    ? (JSON.parse(readFileSync(allowPath, "utf8")).allow as AllowEntry[])
    : [];
  const allowed = new Map(allow.map((a) => [a.package, a]));

  const res = spawnSync("bun", ["audit", "--json"], { cwd: ROOT, encoding: "utf8" });
  if (res.error) {
    console.error(`could not run bun audit: ${res.error.message}`);
    process.exit(2);
  }
  let report: Record<string, unknown>;
  try {
    report = JSON.parse(res.stdout || "{}") as Record<string, unknown>;
  } catch {
    console.error("bun audit did not return JSON:");
    console.error(res.stdout.slice(0, 500));
    process.exit(2);
  }

  const advisories = (report.advisories ?? report) as Record<string, unknown>;
  const blocking: Array<{ pkg: string; severity: string; title: string }> = [];
  const waived: Array<{ pkg: string; severity: string }> = [];

  for (const [pkg, value] of Object.entries(advisories)) {
    const list = Array.isArray(value) ? value : [value];
    for (const raw of list) {
      const a = raw as { severity?: string; title?: string };
      const severity = (a.severity ?? "low").toLowerCase();
      if (LEVELS.indexOf(severity) < minIndex) continue;
      const title = (a.title ?? "").split("\n")[0]!.slice(0, 90);
      if (allowed.has(pkg)) waived.push({ pkg, severity });
      else blocking.push({ pkg, severity, title });
    }
  }

  for (const a of allow) {
    const expired = Date.parse(a.reviewBy) < Date.now();
    console.log(
      `  waived  ${a.package.padEnd(28)} ${a.reason}${expired ? "  [REVIEW DATE PASSED]" : ` (review by ${a.reviewBy})`}`,
    );
  }
  console.log(`  ${waived.length} advisory(ies) at >= ${level} covered by the allowlist`);

  if (blocking.length === 0) {
    console.log(`\nNo un-waived advisories at or above "${level}".`);
    process.exit(0);
  }
  console.error(`\n${blocking.length} un-waived advisory(ies) at or above "${level}":`);
  for (const b of blocking) console.error(`  ${b.severity.padEnd(9)} ${b.pkg.padEnd(28)} ${b.title}`);
  console.error(
    "\nFix them (`bun update`), or add the package to .audit-allowlist.json with a reason and a review date.",
  );
  process.exit(1);
}

main();
