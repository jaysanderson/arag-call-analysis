import { describe, expect, it } from "vitest";
import { clientIp, parseCookies, rateLimit, toHttpError } from "@/lib/api";
import { AragError, HttpError } from "@/vendor/arag-platform/src/index.ts";

describe("parseCookies", () => {
  it("parses and decodes a cookie header", () => {
    expect(parseCookies("a=1; b=hello%20world")).toEqual({ a: "1", b: "hello world" });
  });

  it("tolerates an absent or malformed header", () => {
    expect(parseCookies(null)).toEqual({});
    expect(parseCookies("garbage")).toEqual({});
  });
});

describe("rateLimit", () => {
  it("allows up to the burst then returns a retry delay", () => {
    const store = new Map();
    const now = 1_000_000;
    for (let i = 0; i < 3; i++) expect(rateLimit("ip:a", 1, 3, now, store)).toBeNull();
    const retry = rateLimit("ip:a", 1, 3, now, store);
    expect(retry).toBeGreaterThanOrEqual(1);
  });

  it("refills over time", () => {
    const store = new Map();
    const now = 1_000_000;
    for (let i = 0; i < 3; i++) rateLimit("ip:b", 1, 3, now, store);
    expect(rateLimit("ip:b", 1, 3, now, store)).not.toBeNull();
    expect(rateLimit("ip:b", 1, 3, now + 2_000, store)).toBeNull();
  });

  it("keeps separate buckets per key", () => {
    const store = new Map();
    const now = 1_000_000;
    rateLimit("ip:c", 1, 1, now, store);
    expect(rateLimit("ip:c", 1, 1, now, store)).not.toBeNull();
    expect(rateLimit("ip:d", 1, 1, now, store)).toBeNull();
  });

  it("is disabled when rps is zero", () => {
    const store = new Map();
    for (let i = 0; i < 50; i++) expect(rateLimit("ip:e", 0, 1, 1, store)).toBeNull();
  });
});

describe("clientIp", () => {
  const req = (headers: Record<string, string>) => new Request("http://x/", { headers });

  it("trusts Fly-Client-IP by default", () => {
    expect(clientIp(req({ "fly-client-ip": "1.2.3.4", "x-forwarded-for": "9.9.9.9" }))).toBe("1.2.3.4");
  });

  it("ignores X-Forwarded-For unless TRUST_PROXY=xff", () => {
    expect(clientIp(req({ "x-forwarded-for": "9.9.9.9" }), "fly")).toBe("unknown");
    expect(clientIp(req({ "x-forwarded-for": "9.9.9.9, 8.8.8.8" }), "xff")).toBe("9.9.9.9");
  });

  it("trusts nothing with TRUST_PROXY=none", () => {
    expect(clientIp(req({ "fly-client-ip": "1.2.3.4", "x-forwarded-for": "9.9.9.9" }), "none")).toBe(
      "unknown",
    );
  });
});

describe("toHttpError", () => {
  it("passes HttpError through", () => {
    const e = new HttpError(409, "Conflict", "nope");
    expect(toHttpError(e, true)).toBe(e);
  });

  it("maps ARAG timeouts to 504 without leaking upstream detail", () => {
    const mapped = toHttpError(new AragError("timed out", "timeout", "POST /ask"), true);
    expect(mapped.status).toBe(504);
    expect(mapped.message).not.toContain("/ask");
  });

  it("maps an upstream 401 to 502 and never echoes the token", () => {
    const mapped = toHttpError(new AragError("bad token", "http", "GET /catalog", 401, "Bearer abc"), true);
    expect(mapped.status).toBe(502);
    expect(mapped.message).not.toContain("abc");
  });

  it("maps an upstream 404 to 404", () => {
    expect(toHttpError(new AragError("gone", "http", "GET /resource", 404), true).status).toBe(404);
  });

  it("maps other ARAG failures to 502 with a generic detail", () => {
    const mapped = toHttpError(new AragError("boom", "http", "POST /find", 500, "stack trace"), true);
    expect(mapped.status).toBe(502);
    expect(mapped.message).not.toContain("stack trace");
  });

  it("hides internal error messages in production only", () => {
    expect(toHttpError(new Error("secret detail"), true).message).toBe("Internal server error");
    expect(toHttpError(new Error("secret detail"), false).message).toBe("secret detail");
  });
});
