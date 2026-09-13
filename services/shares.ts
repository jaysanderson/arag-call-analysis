/**
 * Share links: a revocable, expiring URL to one call's read-only workspace.
 *
 * The product's read endpoints are open by default, so a share link is not a way *around* access
 * control — it is the record of who was given a pointer to what, and the means to take it back.
 * That record is what makes "send this to the supervisor" an auditable action instead of a pasted
 * URL: every link has an owner-visible creation time, an expiry, and a revoke button.
 *
 * Tokens are 256 bits of `randomBytes` entropy, base64url encoded, and are never derived from the
 * call id — a token cannot be guessed from a call you already know about.
 *
 * **The token is stored as a SHA-256 digest, never in clear**, for the same reason API keys are:
 * the token is the credential, so a leaked `shares.json` — a backup, a support bundle, a mounted
 * volume — would otherwise hand over every live link. It is returned exactly once, when the link
 * is created, and the register can list, audit and revoke a link it can no longer reconstruct.
 * Rows written before this change are re-keyed on first read (`migrateShares`), so existing links
 * keep working and the plaintext leaves disk.
 */

import { createHash, randomBytes } from "node:crypto";
import type { Runtime } from "@/lib/runtime";
import type { StoredDoc } from "@/vendor/arag-platform/src/index.ts";
import { badRequest, notFound } from "@/vendor/arag-platform/src/index.ts";

export const SHARES_COLLECTION = "shares";

/** How long a link lasts when the caller does not say. Seven days suits a review hand-off. */
export const DEFAULT_SHARE_TTL_DAYS = 7;
export const MAX_SHARE_TTL_DAYS = 90;

export interface ShareDoc extends StoredDoc {
  /** `id` is the SHA-256 digest of the token, hex. The token itself is never stored. */
  callId: string;
  callTitle: string;
  expiresISO: string;
  revokedISO?: string;
  note?: string;
}

export interface ShareView {
  /** The digest, safe to list and to revoke by. Not a credential. */
  id: string;
  callId: string;
  callTitle: string;
  createdISO: string;
  expiresISO: string;
  revoked: boolean;
  expired: boolean;
  note?: string;
}

/** What `createShare` returns: the view, plus the one and only sight of the token and its URL. */
export interface CreatedShare extends ShareView {
  token: string;
  url: string;
}

function collection(rt: Runtime) {
  // Capped so a long-lived deployment cannot grow the file without bound; the oldest links are
  // the ones already past their expiry.
  return rt.store.collection<ShareDoc>(SHARES_COLLECTION, { cap: 2000 });
}

export function newShareToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashShareToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** A stored id is a 64-character hex digest; anything else is a pre-hashing plaintext row. */
const isDigest = (id: string) => /^[0-9a-f]{64}$/.test(id);

/**
 * Re-key rows written before tokens were hashed.
 *
 * Idempotent and cheap (the collection is capped at 2000 and the check is a regex), so it runs on
 * every read rather than behind a flag nobody would remember to set. Existing links keep working
 * because the new id is the digest of the old one — the URL a customer already has in their inbox
 * still resolves — and the plaintext is gone from disk afterwards.
 */
export function migrateShares(rt: Runtime): number {
  const c = collection(rt);
  const stale = c.list({ filter: (d) => !isDigest(d.id) });
  for (const doc of stale) {
    c.put({ ...doc, id: hashShareToken(doc.id) });
    c.delete(doc.id);
  }
  if (stale.length) rt.log.info("shares.migrated", { count: stale.length });
  return stale.length;
}

export function shareUrl(token: string): string {
  return `/s/${token}`;
}

export function toShareView(doc: ShareDoc, now = Date.now()): ShareView {
  return {
    id: doc.id,
    callId: doc.callId,
    callTitle: doc.callTitle,
    createdISO: doc.createdAt,
    expiresISO: doc.expiresISO,
    revoked: Boolean(doc.revokedISO),
    expired: Date.parse(doc.expiresISO) <= now,
    note: doc.note,
  };
}

/** Create a link to one call. `ttlDays` is clamped; the call must exist (checked by the caller). */
export function createShare(
  rt: Runtime,
  input: { callId: string; callTitle: string; ttlDays?: number; note?: string },
): CreatedShare {
  const days = Math.min(MAX_SHARE_TTL_DAYS, Math.max(1, Math.round(input.ttlDays ?? DEFAULT_SHARE_TTL_DAYS)));
  if (!input.callId) throw badRequest("callId is required");
  const token = newShareToken();
  const doc = collection(rt).put({
    id: hashShareToken(token),
    callId: input.callId,
    callTitle: input.callTitle.slice(0, 200),
    expiresISO: new Date(Date.now() + days * 86_400_000).toISOString(),
    note: input.note?.slice(0, 200),
  });
  // The only moment the token exists outside the caller's hands.
  return { ...toShareView(doc), token, url: shareUrl(token) };
}

/**
 * Resolve a token. Returns null for unknown, revoked or expired links — never says which.
 *
 * Only a plaintext token resolves: the digest is listed in the register, so accepting one here
 * would turn the management view into a set of working links.
 */
export function resolveShare(rt: Runtime, token: string): ShareView | null {
  migrateShares(rt);
  const doc = collection(rt).get(hashShareToken(token));
  if (!doc) return null;
  const view = toShareView(doc);
  return view.revoked || view.expired ? null : view;
}

/** Every link ever created for a call (including dead ones, so the owner can see the history). */
export function listShares(rt: Runtime, callId?: string): ShareView[] {
  migrateShares(rt);
  return collection(rt)
    .list({ filter: callId ? (d) => d.callId === callId : undefined })
    .map((d) => toShareView(d));
}

/**
 * Revoke by the stored id, or by the token itself.
 *
 * The register only knows the digest, so that has to work; but the person holding the link knows
 * only the token, and "I have been sent this, take it back" is a real request. Accepting both
 * costs nothing — the digest is not a credential and the token is already one.
 */
export function revokeShare(rt: Runtime, idOrToken: string): ShareView {
  migrateShares(rt);
  const c = collection(rt);
  const id = c.has(idOrToken) ? idOrToken : hashShareToken(idOrToken);
  const doc = c.get(id);
  if (!doc) throw notFound("Share link");
  const next = c.update(id, { revokedISO: new Date().toISOString() });
  return toShareView(next ?? doc);
}
