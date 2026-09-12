/**
 * Share links: a revocable, expiring URL to one call's read-only workspace.
 *
 * The product's read endpoints are open by default, so a share link is not a way *around* access
 * control — it is the record of who was given a pointer to what, and the means to take it back.
 * That record is what makes "send this to the supervisor" an auditable action instead of a pasted
 * URL: every link has an owner-visible creation time, an expiry, and a revoke button.
 *
 * Tokens are 256 bits of `randomUUID`-grade entropy, base64url encoded, and are never derived
 * from the call id — a token cannot be guessed from a call you already know about.
 */

import { randomBytes } from "node:crypto";
import type { Runtime } from "@/lib/runtime";
import type { StoredDoc } from "@/vendor/arag-platform/src/index.ts";
import { badRequest, notFound } from "@/vendor/arag-platform/src/index.ts";

export const SHARES_COLLECTION = "shares";

/** How long a link lasts when the caller does not say. Seven days suits a review hand-off. */
export const DEFAULT_SHARE_TTL_DAYS = 7;
export const MAX_SHARE_TTL_DAYS = 90;

export interface ShareDoc extends StoredDoc {
  /** `id` is the opaque token that appears in the URL. */
  callId: string;
  callTitle: string;
  expiresISO: string;
  revokedISO?: string;
  note?: string;
}

export interface ShareView {
  token: string;
  callId: string;
  callTitle: string;
  url: string;
  createdISO: string;
  expiresISO: string;
  revoked: boolean;
  expired: boolean;
  note?: string;
}

function collection(rt: Runtime) {
  // Capped so a long-lived deployment cannot grow the file without bound; the oldest links are
  // the ones already past their expiry.
  return rt.store.collection<ShareDoc>(SHARES_COLLECTION, { cap: 2000 });
}

export function newShareToken(): string {
  return randomBytes(32).toString("base64url");
}

export function shareUrl(token: string): string {
  return `/s/${token}`;
}

export function toShareView(doc: ShareDoc, now = Date.now()): ShareView {
  return {
    token: doc.id,
    callId: doc.callId,
    callTitle: doc.callTitle,
    url: shareUrl(doc.id),
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
): ShareView {
  const days = Math.min(MAX_SHARE_TTL_DAYS, Math.max(1, Math.round(input.ttlDays ?? DEFAULT_SHARE_TTL_DAYS)));
  if (!input.callId) throw badRequest("callId is required");
  const doc = collection(rt).put({
    id: newShareToken(),
    callId: input.callId,
    callTitle: input.callTitle.slice(0, 200),
    expiresISO: new Date(Date.now() + days * 86_400_000).toISOString(),
    note: input.note?.slice(0, 200),
  });
  return toShareView(doc);
}

/** Resolve a token. Returns null for unknown, revoked or expired links — never says which. */
export function resolveShare(rt: Runtime, token: string): ShareView | null {
  const doc = collection(rt).get(token);
  if (!doc) return null;
  const view = toShareView(doc);
  return view.revoked || view.expired ? null : view;
}

/** Every link ever created for a call (including dead ones, so the owner can see the history). */
export function listShares(rt: Runtime, callId?: string): ShareView[] {
  return collection(rt)
    .list({ filter: callId ? (d) => d.callId === callId : undefined })
    .map((d) => toShareView(d));
}

export function revokeShare(rt: Runtime, token: string): ShareView {
  const doc = collection(rt).get(token);
  if (!doc) throw notFound("Share link");
  const next = collection(rt).update(token, { revokedISO: new Date().toISOString() });
  return toShareView(next ?? doc);
}
