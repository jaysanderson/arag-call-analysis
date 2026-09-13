"use client";

import { useEffect, useState } from "react";
import { IconActivity } from "@/components/icons";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/kit";
import { apiJson, CardHead, fmtWhen } from "./common";

/**
 * Who changed what, when.
 *
 * Every mutating settings path writes one of these rows, so the trail is the answer to "who turned
 * the rate limit down?" — the question a settings screen creates the moment it becomes editable.
 * It is an operator view: the actor column names people and credentials.
 */

interface AuditEntry {
  id: string;
  action: string;
  actor: string;
  createdAt: string;
  detail?: Record<string, unknown>;
}

/** `settings.branding` → "Branding settings changed", and so on for the actions this product writes. */
function describe(action: string): string {
  const map: Record<string, string> = {
    "settings.branding": "Branding changed",
    "settings.connection": "Connection changed",
    "settings.limits": "Limits changed",
    "settings.retention": "Retention policy changed",
    "settings.branding.reset": "Branding reset to the environment",
    "settings.connection.reset": "Connection reset to the environment",
    "settings.limits.reset": "Limits reset to the environment",
    "settings.retention.reset": "Retention reset to the environment",
    "settings.logo.upload": "Logo uploaded",
    "settings.logo.remove": "Logo removed",
    "apikey.create": "API key created",
    "apikey.rename": "API key renamed",
    "apikey.revoke": "API key revoked",
    "retention.purge": "Calls purged",
  };
  return map[action] ?? action;
}

function summarise(detail: Record<string, unknown> | undefined): string {
  if (!detail) return "";
  const parts = Object.entries(detail).map(
    ([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`,
  );
  return parts.join(" · ");
}

export function AuditTrail() {
  const [items, setItems] = useState<AuditEntry[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    apiJson<{ items: AuditEntry[] }>("/api/v1/admin/audit?limit=50")
      .then((body) => setItems(body.items))
      .catch((err: Error) => setError(err.message));
  }, []);

  return (
    <div className="arag-card pad">
      <CardHead title="Audit trail" />
      <p className="small" style={{ marginTop: 0 }}>
        The last 50 changes made through the product. Credentials are recorded as having changed, never quoted
        — an audit trail that repeats a secret is a second place to leak it.
      </p>

      {error && <ErrorState title="The audit trail could not be read." detail={error} />}
      {!items && !error && <TableSkeleton rows={4} cols={3} />}
      {items && items.length === 0 && (
        <EmptyState
          icon={<IconActivity size={26} />}
          title="Nothing has been changed yet"
          body="Every settings edit, key issue and purge from now on appears here with who made it and when."
        />
      )}

      {items && items.length > 0 && (
        <div className="arag-datatable" data-testid="audit-table">
          <div className="scroll">
            <table>
              <thead>
                <tr>
                  <th scope="col">When</th>
                  <th scope="col">Who</th>
                  <th scope="col">What</th>
                </tr>
              </thead>
              <tbody>
                {items.map((e) => (
                  <tr key={e.id}>
                    <td style={{ whiteSpace: "nowrap" }}>{fmtWhen(e.createdAt)}</td>
                    <td className="mono" style={{ fontSize: 12 }}>
                      {e.actor}
                    </td>
                    <td>
                      <span className="cell-title">{describe(e.action)}</span>
                      {summarise(e.detail) && <span className="cell-sub">{summarise(e.detail)}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
