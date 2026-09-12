/**
 * DESTRUCTIVE: delete every call resource from the Knowledge Box the server is pointed at.
 *
 *   node scripts/reset.ts --yes-i-know
 *
 * Two guards, both required for a live KB:
 *   1. the explicit `--yes-i-know` flag, and
 *   2. `CALLS_ALLOW_DESTRUCTIVE=1` unless the target server reports that it is running against the
 *      in-process mock (`/api/v1/admin/health` → `mock: true`).
 *
 * The demo Knowledge Box holds the 24 seeded calls the showcase depends on: never reset it.
 */
import { api, BASE, flag, requireAdminToken } from "./lib/client.ts";

interface CallPage {
  items: Array<{ id: string; title: string }>;
  total: number;
}

async function main(): Promise<void> {
  if (!flag("yes-i-know")) {
    console.error("Refusing to reset without --yes-i-know. This deletes every call in the Knowledge Box.");
    process.exit(2);
  }
  requireAdminToken();
  const health = await api<{ mock: boolean; arag: { kbId: string } }>("/api/v1/admin/health", {
    admin: true,
  });
  if (!health.mock && process.env.CALLS_ALLOW_DESTRUCTIVE !== "1") {
    console.error(
      `Refusing to reset a LIVE Knowledge Box (${health.arag.kbId}) at ${BASE}.\n` +
        "Set CALLS_ALLOW_DESTRUCTIVE=1 only if you are certain this is a throwaway KB.",
    );
    process.exit(2);
  }
  const page = await api<CallPage>("/api/v1/calls?page_size=200");
  console.log(`Deleting ${page.items.length} of ${page.total} calls from ${BASE} …`);
  for (const call of page.items) {
    await api(`/api/v1/calls/${call.id}`, { method: "DELETE", admin: true });
    console.log(`  ✗ ${call.id}  ${call.title}`);
  }
  await api("/api/v1/admin/cache/invalidate", { method: "POST", admin: true, json: {} });
  console.log("Done.");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
