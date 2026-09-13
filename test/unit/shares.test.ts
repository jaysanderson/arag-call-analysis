/** Share links: token generation, expiry, revocation and the "never say which" resolution rule. */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Runtime } from "@/lib/runtime";
import {
  createShare,
  hashShareToken,
  listShares,
  MAX_SHARE_TTL_DAYS,
  migrateShares,
  newShareToken,
  resolveShare,
  revokeShare,
  SHARES_COLLECTION,
  type ShareDoc,
  toShareView,
} from "@/services/shares";
import { Store } from "@/vendor/arag-platform/src/index.ts";

let dir: string;
let rt: Runtime;

beforeEach(() => {
  // In-memory only: the platform Store flushes on a deferred timer, so a disk-backed store in a
  // unit test writes after the temp directory has already been removed and throws out of band.
  dir = mkdtempSync(join(tmpdir(), "ca-shares-"));
  rt = {
    store: new Store(dir, { persist: false }),
    // `migrateShares` runs on every read and logs when it re-keys a row, so the fixture needs a
    // logger as well as a store.
    log: { info() {}, warn() {}, error() {}, debug() {} },
  } as unknown as Runtime;
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("share tokens", () => {
  it("are 256 bits of base64url with no padding and never repeat", () => {
    const tokens = new Set(Array.from({ length: 200 }, () => newShareToken()));
    expect(tokens.size).toBe(200);
    for (const t of tokens) expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("are not derived from the call id", () => {
    const a = createShare(rt, { callId: "call-1", callTitle: "One" });
    const b = createShare(rt, { callId: "call-1", callTitle: "One" });
    expect(a.token).not.toBe(b.token);
    expect(a.token).not.toContain("call-1");
  });
});

describe("createShare", () => {
  it("defaults to a seven-day life and returns the /s/ URL", () => {
    const share = createShare(rt, { callId: "c1", callTitle: "A call" });
    expect(share.url).toBe(`/s/${share.token}`);
    const days = (Date.parse(share.expiresISO) - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThan(7.1);
    expect(share.revoked).toBe(false);
    expect(share.expired).toBe(false);
  });

  it("clamps the requested lifetime instead of rejecting it", () => {
    const long = createShare(rt, { callId: "c1", callTitle: "A", ttlDays: 9999 });
    const days = (Date.parse(long.expiresISO) - Date.now()) / 86_400_000;
    expect(Math.round(days)).toBe(MAX_SHARE_TTL_DAYS);
    const short = createShare(rt, { callId: "c1", callTitle: "A", ttlDays: 0 });
    expect(Math.round((Date.parse(short.expiresISO) - Date.now()) / 86_400_000)).toBe(1);
  });

  it("rejects a missing call id", () => {
    expect(() => createShare(rt, { callId: "", callTitle: "A" })).toThrow(/callId/);
  });

  it("bounds the stored title and note", () => {
    const share = createShare(rt, {
      callId: "c1",
      callTitle: "t".repeat(500),
      note: "n".repeat(500),
    });
    expect(share.callTitle).toHaveLength(200);
    expect(share.note).toHaveLength(200);
  });
});

describe("resolveShare", () => {
  it("resolves a live link", () => {
    const share = createShare(rt, { callId: "c1", callTitle: "A call" });
    expect(resolveShare(rt, share.token)?.callId).toBe("c1");
  });

  it("returns null for unknown, revoked and expired links alike", () => {
    expect(resolveShare(rt, "nope")).toBeNull();

    const revokedLink = createShare(rt, { callId: "c1", callTitle: "A" });
    revokeShare(rt, revokedLink.token);
    expect(resolveShare(rt, revokedLink.token)).toBeNull();

    const expiredToken = "expired-token";
    const expired = rt.store.collection<ShareDoc>(SHARES_COLLECTION).put({
      id: hashShareToken(expiredToken),
      callId: "c1",
      callTitle: "A",
      expiresISO: new Date(Date.now() - 1000).toISOString(),
    });
    expect(resolveShare(rt, expiredToken)).toBeNull();
    // …but the owner's own list still shows it, flagged.
    expect(toShareView(expired).expired).toBe(true);
  });
});

describe("listShares", () => {
  it("keeps dead links in the history and filters by call", () => {
    const a = createShare(rt, { callId: "c1", callTitle: "One" });
    createShare(rt, { callId: "c2", callTitle: "Two" });
    revokeShare(rt, a.token);

    expect(listShares(rt)).toHaveLength(2);
    const forCall = listShares(rt, "c1");
    expect(forCall).toHaveLength(1);
    expect(forCall[0]!.revoked).toBe(true);
  });
});

describe("revokeShare", () => {
  it("is idempotent and 404s on an unknown token", () => {
    const share = createShare(rt, { callId: "c1", callTitle: "A" });
    expect(revokeShare(rt, share.token).revoked).toBe(true);
    expect(revokeShare(rt, share.token).revoked).toBe(true);
    expect(() => revokeShare(rt, "unknown")).toThrow(/not found/i);
  });
});

describe("tokens are stored as digests", () => {
  it("never writes the token to the store, and returns it exactly once", () => {
    const created = createShare(rt, { callId: "c1", callTitle: "A call" });
    expect(created.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(created.url).toBe(`/s/${created.token}`);
    expect(created.id).toBe(hashShareToken(created.token));

    const stored = JSON.stringify(rt.store.collection(SHARES_COLLECTION).list());
    expect(stored).not.toContain(created.token);
    // The register carries the digest and no way back to the link.
    const listed = listShares(rt, "c1")[0];
    expect(JSON.stringify(listed)).not.toContain(created.token);
    expect(listed?.id).toBe(created.id);
  });

  it("refuses to resolve the digest, which the register does publish", () => {
    // Otherwise the management view would be a page of working links.
    const created = createShare(rt, { callId: "c1", callTitle: "A call" });
    expect(resolveShare(rt, created.token)).not.toBeNull();
    expect(resolveShare(rt, created.id)).toBeNull();
  });

  it("revokes by the stored id or by the token", () => {
    const a = createShare(rt, { callId: "c1", callTitle: "A" });
    expect(revokeShare(rt, a.id).revoked).toBe(true);
    const b = createShare(rt, { callId: "c1", callTitle: "B" });
    expect(revokeShare(rt, b.token).revoked).toBe(true);
  });

  it("re-keys rows written before hashing, so existing links keep working", () => {
    // The migration is what lets this ship without invalidating every link a customer already has.
    const legacyToken = "legacy-plaintext-token";
    rt.store.collection<ShareDoc>(SHARES_COLLECTION).put({
      id: legacyToken,
      callId: "c9",
      callTitle: "An older call",
      expiresISO: new Date(Date.now() + 86_400_000).toISOString(),
    });

    expect(migrateShares(rt)).toBe(1);
    const stored = JSON.stringify(rt.store.collection(SHARES_COLLECTION).list());
    expect(stored).not.toContain(legacyToken);
    // The link in someone's inbox still opens.
    expect(resolveShare(rt, legacyToken)?.callId).toBe("c9");
    // Idempotent: a second pass finds nothing to do.
    expect(migrateShares(rt)).toBe(0);
  });
});
