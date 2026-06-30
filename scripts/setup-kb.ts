/** Create all labelsets in the KB (idempotent — re-POST overwrites). */
import { createAllLabelsets, listLabelsets } from "./lib/kb-ops.js";

async function main() {
  console.log("Creating labelsets…");
  await createAllLabelsets();
  const ls = await listLabelsets();
  console.log(`\nLabelsets in KB: ${Object.keys(ls).join(", ")}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
