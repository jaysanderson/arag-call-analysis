/**
 * Danger: wipe the KB back to empty — delete all tasks and all resources.
 * Labelsets are left in place (cheap to recreate, useful to keep). Pass
 * `--labelsets` to also delete labelsets.
 */
import { api, tryApi } from "./lib/arag-admin.js";
import { deleteAllTasks } from "./lib/kb-ops.js";
import { ALL_LABELSETS } from "./config/taxonomy.js";

async function main() {
  const alsoLabelsets = process.argv.includes("--labelsets");

  console.log("Deleting tasks…");
  await deleteAllTasks();

  console.log("Deleting resources…");
  const d = await api<any>("/catalog", { query: { page_size: "200" } });
  const ids = Object.keys(d.resources ?? {});
  for (const rid of ids) {
    const r = await tryApi(`/resource/${rid}`, { method: "DELETE" });
    console.log(`  resource ✗ ${rid} -> ${r.ok ? "deleted" : r.status}`);
  }
  console.log(`Deleted ${ids.length} resources.`);

  if (alsoLabelsets) {
    console.log("Deleting labelsets…");
    for (const ls of ALL_LABELSETS) {
      const r = await tryApi(`/labelset/${ls.id}`, { method: "DELETE" });
      console.log(`  labelset ✗ ${ls.id} -> ${r.ok ? "deleted" : r.status}`);
    }
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
