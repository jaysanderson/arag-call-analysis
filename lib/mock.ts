/**
 * Demo bootstrap for the in-process mock ARAG server (`ARAG_MOCK=1`).
 *
 * The mock is seeded with real call transcripts (the platform's `SAMPLE_CALL_TRANSCRIPT` plus the
 * synthetic health-insurance scenarios this repo ships) and then the taxonomy's own labeler and
 * ask data-augmentation tasks are run against it, exactly as they would be on a live Knowledge
 * Box. That means a mock-backed run has labels, paragraph moments, `call_analysis` and
 * `call_metrics` — the dashboard, rails, filters and detail page all have real data with no
 * credentials.
 */
import type { Logger, MockOptions } from "@/vendor/arag-platform/src/index.ts";
import { AragClient, startMockArag } from "@/vendor/arag-platform/src/index.ts";
// `SAMPLE_CALL_TRANSCRIPT` is not re-exported from the platform index (platform gap PG-1).
import { SAMPLE_CALL_TRANSCRIPT } from "@/vendor/arag-platform/src/arag/mock/fixtures.ts";
import { AGENTS, ALL_LABELSETS } from "@/lib/domain/taxonomy";
import { estimatedDurationSec, iconFor, mediaTypeFor, SCENARIOS, transcriptOf } from "@/lib/domain/scenarios";
import type { CallsEnv } from "@/lib/runtime";

export interface DemoMock {
  url: string;
  kbId: string;
  apiKey: string;
  seeded: number;
  close: () => Promise<void>;
}

const GLOBAL_KEY = "__callAnalysisMock__";
type GlobalWithMock = typeof globalThis & { [GLOBAL_KEY]?: DemoMock };

/** The seed set: the platform's canonical transcript first, then the repo's own scenarios. */
export type DemoSeed = NonNullable<MockOptions["seed"]>;

export function demoSeed(limit: number): DemoSeed {
  const seed: DemoSeed = [
    {
      id: "demo0000000000000000000000000001",
      title: "Billing complaint - duplicate premium charge (sample)",
      slug: "sample-billing-complaint",
      transcript: SAMPLE_CALL_TRANSCRIPT,
      contentType: "audio/mpeg",
      filename: "sample-billing-complaint.mp3",
      created: "2026-06-01T14:02:00Z",
      metadata: {
        agent_name: "Maria Gonzales",
        member_id: "IFP-558200",
        queue: "Billing",
        duration_sec: 66,
        media_type: "audio",
      },
    },
  ];
  for (const [i, sc] of SCENARIOS.slice(0, Math.max(0, limit)).entries()) {
    const contentType = iconFor(sc.format);
    seed.push({
      id: `demo${String(i + 2).padStart(28, "0")}`,
      title: sc.title,
      slug: sc.slug,
      transcript: transcriptOf(sc),
      contentType,
      filename: sc.format === "transcript" ? `${sc.slug}.txt` : `${sc.slug}.${sc.format}`,
      created: sc.createdISO,
      metadata: {
        agent_name: sc.agentName,
        member_id: sc.memberId,
        queue: sc.queue,
        duration_sec: estimatedDurationSec(sc),
        media_type: mediaTypeFor(sc.format),
      },
    });
  }
  return seed;
}

/** Start (once per process) a mock ARAG server seeded and augmented for the demo. */
export async function startDemoMock(env: CallsEnv, log: Logger): Promise<DemoMock> {
  const g = globalThis as GlobalWithMock;
  if (g[GLOBAL_KEY]) return g[GLOBAL_KEY];

  const seed = demoSeed(env.mockSeedCalls);
  const server = await startMockArag({
    seed,
    processingMs: 0,
    streamDelayMs: Number(process.env.CALLS_MOCK_STREAM_DELAY_MS ?? 0),
    generativeModel: env.arag.generativeModel || "chatgpt-azure-4o",
    log,
  });

  const client = new AragClient({ kbId: server.kbId, apiKey: server.apiKey, baseUrl: server.url });

  // Pre-create the labelsets so the facets carry the taxonomy's titles and colours (a labeler
  // auto-creates a labelset, but only with its bare identifier as the title).
  for (const def of ALL_LABELSETS) {
    await client.putLabelset(def.id, {
      title: def.title,
      color: def.color,
      multiple: def.multiple,
      kind: [def.kind],
      labels: def.labels.map((l) => ({ title: l.label })),
    });
  }

  // Run the product's own augmentation agents against the seeded KB so the demo has labels,
  // moments, analysis and metrics. The mock applies each task synchronously at start.
  for (const agent of AGENTS) {
    try {
      await client.startTask({ name: agent.type, parameters: agent.parameters });
    } catch (err) {
      log.warn("mock.agent.failed", { agent: agent.key, message: (err as Error).message });
    }
  }

  const demo: DemoMock = {
    url: server.url,
    kbId: server.kbId,
    apiKey: server.apiKey,
    seeded: seed.length,
    close: () => server.close(),
  };
  g[GLOBAL_KEY] = demo;
  return demo;
}

/** Close the process-wide mock (tests must call this or the open handle keeps the runner alive). */
export async function closeDemoMock(): Promise<void> {
  const g = globalThis as GlobalWithMock;
  const demo = g[GLOBAL_KEY];
  if (!demo) return;
  g[GLOBAL_KEY] = undefined;
  try {
    await demo.close();
  } catch {
    /* already closed */
  }
}
