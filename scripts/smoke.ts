/**
 * OPT-IN live smoke test — read-only against the real Knowledge Box.
 *
 *   make smoke          # uses .env (ARAG_KB_ID / ARAG_API_KEY / ARAG_REGION or ARAG_BASE_URL)
 *
 * It performs exactly three kinds of read: a health/catalog read, a handful of resource reads to
 * rebuild the dashboard aggregation, and one scoped `/ask`. It never creates, updates or deletes
 * anything — the demo Knowledge Box holds the seeded calls the showcase depends on.
 */

import { parseSummary } from "../lib/parse.ts";
import { aggregate } from "../services/dashboard.ts";
import { AragClient, assertAragEnv, loadDotEnv, readEnv } from "../vendor/arag-platform/src/index.ts";

function fail(msg: string): never {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

async function main(): Promise<void> {
  loadDotEnv();
  if (!process.env.ARAG_BASE_URL && process.env.ARAG_BASE) process.env.ARAG_BASE_URL = process.env.ARAG_BASE;
  const env = readEnv(process.env);
  if (env.arag.mock) fail("ARAG_MOCK=1 — the smoke test is only meaningful against a live Knowledge Box.");
  assertAragEnv(env);

  const arag = new AragClient({
    kbId: env.arag.kbId,
    apiKey: env.arag.apiKey,
    region: env.arag.region,
    baseUrl: env.arag.baseUrl || undefined,
    timeoutMs: env.arag.timeoutMs,
  });

  console.log(`Live smoke against KB ${env.arag.kbId.slice(0, 8)}… (read-only)`);

  const health = await arag.health();
  if (!health.ok) fail(`health check failed: ${health.error}`);
  console.log(
    `  ✓ connection ok — ${health.resources} resources, model ${health.generativeModel ?? "default"} (${health.ms} ms)`,
  );

  const ids = await arag.listResourceIds({ max: 200 });
  if (ids.length === 0) fail("catalog is empty");
  const summaries = [];
  for (const id of ids.slice(0, 24)) {
    const res = await arag.getResource(id, {
      show: ["basic", "values", "extracted", "extra"],
      extracted: ["metadata"],
    });
    summaries.push(parseSummary(res));
  }
  const dash = aggregate(summaries);
  console.log(
    `  ✓ dashboard — ${dash.total} calls, ${dash.withMetrics} with generated metrics, ` +
      `${dash.byReason.length} reasons, complaint rate ${Math.round(dash.complaintRate * 100)}%`,
  );
  if (dash.withMetrics === 0) fail("no call carries a generated call_metrics field");

  const target = summaries.find((s) => s.metrics) ?? summaries[0]!;
  const answer = await arag.ask({
    query: "Summarize this call in two sentences.",
    resource_filters: [target.id],
    features: ["keyword", "semantic"],
    citations: true,
    top_k: 8,
    ...(env.arag.generativeModel ? { generative_model: env.arag.generativeModel } : {}),
  });
  if (!answer.answerText.trim()) fail("ask returned an empty answer");
  console.log(
    `  ✓ ask "${target.title}" — ${answer.answerText.length} chars, ` +
      `${Object.keys(answer.citations).length} citations, first token ${answer.timings.firstTokenMs} ms, total ${answer.timings.totalMs} ms`,
  );
  console.log(`    ${answer.answerText.slice(0, 180).replace(/\s+/g, " ")}…`);
  console.log("\n✅ live smoke passed (no writes performed)");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
