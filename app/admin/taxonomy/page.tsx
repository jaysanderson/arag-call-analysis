"use client";

import { AdminShell } from "@/components/admin/AdminShell";
import { TaxonomyScreen } from "@/components/taxonomy/TaxonomyView";

/**
 * The operator's taxonomy view is the same screen the product shows, with provisioning enabled:
 * an operator and a reviewer must never be looking at two different accounts of what is live.
 */
export default function AdminTaxonomyPage() {
  return (
    <AdminShell
      title="Taxonomy & Agents"
      description="What this Knowledge Box classifies calls with, and whether the agents that apply it are running."
    >
      <TaxonomyScreen canProvision />
    </AdminShell>
  );
}
