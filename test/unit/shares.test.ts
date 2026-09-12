/** Share links: token generation, expiry, revocation and the "never say which" resolution rule. */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Runtime } from "@/lib/runtime";
import {
  createShare,
  listShares,
  MAX_SHARE_TTL_DAYS,
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
  rt = { store: new Store(dir, { persist: false }) } as unknown as Runtime;
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

    const expired = rt.store.collection<ShareDoc>(SHARES_COLLECTION).put({
      id: "expired-token",
      callId: "c1",
      callTitle: "A",
      expiresISO: new Date(Date.now() - 1000).toISOString(),
    });
    expect(resolveShare(rt, expired.id)).toBeNull();
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
