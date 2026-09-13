import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { TaxonomyScreen } from "@/components/taxonomy/TaxonomyView";
import { isOperator } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * The operator's taxonomy view is the same screen the product shows, with provisioning enabled:
 * an operator and a reviewer must never be looking at two different accounts of what is live.
 *
 * Unlike `/taxonomy`, which renders read-only for a visitor, this route is part of the operator
 * console and simply requires the sign-in. It was a client component with no gate, so an anonymous
 * visitor was handed the full editor and a Re-provision button that answers 401 — the D-CA-33 rule
 * inverted. The reads behind it are public, so nothing was disclosed; the affordances were the bug.
 */
export default async function AdminTaxonomyPage() {
  if (!(await isOperator())) redirect("/admin/login?next=/admin/taxonomy");
  return (
    <AdminShell
      title="Taxonomy & Agents"
      description="What this Knowledge Box classifies calls with, and whether the agents that apply it are running."
    >
      <TaxonomyScreen canProvision canEdit />
    </AdminShell>
  );
}
