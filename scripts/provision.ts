/**
 * Provision the Knowledge Box: create every labelset in the taxonomy and (re)start the three
 * data-augmentation agents, sequentially. Thin wrapper over `POST /api/v1/admin/provision`.
 *
 *   ADMIN_TOKEN=… node scripts/provision.ts [--no-agents] [--url http://localhost:3000]
 */
import { api, BASE, flag, type JobView, requireAdminToken, waitForJob } from "./lib/client.ts";

async function main(): Promise<void> {
  requireAdminToken();
  console.log(`Provisioning ${BASE} …`);
  const job = await api<JobView>("/api/v1/admin/provision", {
    method: "POST",
    admin: true,
    json: { agents: !flag("no-agents") },
  });
  console.log(`  job ${job.id}`);
  const done = await waitForJob(job.id);
  if (done.status !== "succeeded") {
    console.error(`  ✗ provisioning ${done.status}: ${done.error?.message ?? ""}`);
    process.exit(1);
  }
  console.log(`  ✓ ${JSON.stringify(done.result)}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
