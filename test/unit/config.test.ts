/**
 * The settings store's pure parts: validation, the effective-value merge and the retention
 * arithmetic. Everything here is the code that decides whether a value an operator typed is
 * allowed to reach a server-rendered `<style>` element, a rate limiter, or a delete loop, so it is
 * tested directly rather than only through a form.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PLATFORM_VERSION } from "@/lib/version";
import { generateKey, hashKey, KEY_PREFIX, previewOf } from "@/services/apikeys";
import { TtlCache } from "@/services/cache";
import { validateBranding, validateConnection, validateLimits, validateRetention } from "@/services/config";
import { DASHBOARD_RANGES, resolveWindow } from "@/services/dashboard";
import { ageDays } from "@/services/retention";
import { validateLabelsetDef } from "@/services/taxonomy-store";
import { normaliseQuery, VIEW_PARAMS } from "@/services/views";

describe("branding validation", () => {
  it("accepts the colour notations the renderer can safely interpolate", () => {
    expect(validateBranding({ primaryColor: "#123abc" }).primaryColor).toBe("#123abc");
    expect(validateBranding({ accentColor: "rgb(10, 20, 30)" }).accentColor).toBe("rgb(10, 20, 30)");
  });

  it("refuses a colour that could close the declaration", () => {
    // The value is interpolated into a <style> element; anything that can escape it is an
    // injection, not a typo, and a settings form must not be a way past the boot-time grammar.
    expect(() => validateBranding({ primaryColor: "red; } body { display:none" })).toThrow(/valid CSS/);
    expect(() => validateBranding({ accentColor: "url(javascript:alert(1))" })).toThrow(/valid CSS/);
  });

  it("refuses a logo or docs URL that is not http(s) or same-origin", () => {
    expect(() => validateBranding({ logoUrl: "javascript:alert(1)" })).toThrow(/https URL/);
    expect(() => validateBranding({ docsUrl: "data:text/html,<script>" })).toThrow(/https URL/);
    expect(validateBranding({ logoUrl: "/branding/logo.svg" }).logoUrl).toBe("/branding/logo.svg");
    expect(validateBranding({ supportUrl: "https://example.com/help" }).supportUrl).toBe(
      "https://example.com/help",
    );
  });

  it("treats an explicitly empty tagline or footer as a removal, not a default", () => {
    expect(validateBranding({ tagline: "" }).tagline).toBe("");
    expect(validateBranding({ footerText: "" }).footerText).toBe("");
  });

  it("refuses an empty product name — there is no such product", () => {
    expect(() => validateBranding({ productName: "   " })).toThrow(/cannot be empty/);
  });

  it("only returns the keys the patch mentioned", () => {
    expect(Object.keys(validateBranding({ tagline: "x" }))).toEqual(["tagline"]);
  });
});

describe("limits validation", () => {
  it("clamps to the documented bounds and rejects outside them", () => {
    expect(validateLimits({ maxQuestionChars: 800 }).maxQuestionChars).toBe(800);
    expect(() => validateLimits({ maxQuestionChars: 10 })).toThrow(/between 40 and 4000/);
    expect(() => validateLimits({ rateLimitRps: -1 })).toThrow(/between 0 and 10000/);
    expect(() => validateLimits({ cacheTtlMs: "soon" })).toThrow(/must be a number/);
  });

  it("allows a rate limit of zero, which means unlimited", () => {
    expect(validateLimits({ rateLimitRps: 0 }).rateLimitRps).toBe(0);
  });
});

describe("connection validation", () => {
  it("requires https for a base URL and a zone slug for a region", () => {
    expect(() => validateConnection({ baseUrl: "http://insecure.example" })).toThrow(/https/);
    expect(() => validateConnection({ region: "not a slug" })).toThrow(/zone slug/);
    expect(validateConnection({ baseUrl: "https://x.example/api/v1/" }).baseUrl).toBe(
      "https://x.example/api/v1",
    );
  });

  it("treats an empty apiKey as 'leave it alone' rather than 'clear it'", () => {
    // Clearing the service-account token from a form would take the deployment offline with no
    // way back through the UI.
    expect(validateConnection({ apiKey: "" }).apiKey).toBeUndefined();
    expect(validateConnection({ apiKey: " secret " }).apiKey).toBe("secret");
  });

  it("only accepts the two rerankers the platform has", () => {
    expect(validateConnection({ reranker: "predict" }).reranker).toBe("predict");
    expect(() => validateConnection({ reranker: "magic" })).toThrow(/predict or noop/);
  });
});

describe("retention validation", () => {
  it("accepts 0 (no limit) up to ten years", () => {
    expect(validateRetention({ days: 0 }).days).toBe(0);
    expect(validateRetention({ days: 3650 }).days).toBe(3650);
    expect(() => validateRetention({ days: 3651 })).toThrow(/between 0 and 3650/);
  });
});

describe("age arithmetic", () => {
  const now = Date.parse("2026-09-13T12:00:00.000Z");
  it("counts whole days and never goes negative", () => {
    const call = (iso?: string) => ({ id: "1", title: "t", createdISO: iso }) as never;
    expect(ageDays(call("2026-09-03T12:00:00.000Z"), now)).toBe(10);
    expect(ageDays(call("2026-12-03T12:00:00.000Z"), now)).toBe(0);
    expect(ageDays(call(undefined), now)).toBe(0);
  });
});

describe("API keys", () => {
  it("issues a recognisable, high-entropy key and stores only its digest", () => {
    const key = generateKey();
    expect(key.startsWith(KEY_PREFIX)).toBe(true);
    expect(key.length).toBeGreaterThan(KEY_PREFIX.length + 30);
    expect(generateKey()).not.toBe(key);
    const digest = hashKey(key);
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(digest).not.toContain(key.slice(KEY_PREFIX.length));
  });

  it("previews the key without revealing enough of it to guess", () => {
    const key = `${KEY_PREFIX}abcdefghijklmnop`;
    expect(previewOf(key)).toBe("abcdefgh");
  });
});

describe("saved-view query normalisation", () => {
  it("keeps only calls-list parameters, in a stable order", () => {
    // Two people who built the same filter stack in a different order must save the same view.
    const a = normaliseQuery("agent=Dana&q=refund&label=sentiment%2FNegative");
    const b = normaliseQuery("?label=sentiment%2FNegative&q=refund&agent=Dana");
    expect(a).toBe(b);
    expect(a.startsWith("q=refund")).toBe(true);
  });

  it("drops anything the list does not understand", () => {
    expect(normaliseQuery("q=x&utm_source=email&redirect=//evil.example")).toBe("q=x");
  });

  it("keeps repeated label filters but collapses repeated scalars to the last", () => {
    expect(normaliseQuery("label=a%2Fb&label=c%2Fd")).toBe("label=a%2Fb&label=c%2Fd");
    expect(normaliseQuery("agent=one&agent=two")).toBe("agent=two");
  });

  it("declares every parameter the calls screen actually uses", () => {
    for (const p of ["q", "label", "agent", "queue", "lifecycle", "from", "to", "sort", "order"])
      expect(VIEW_PARAMS).toContain(p);
  });
});

describe("labelset definition validation", () => {
  const base = {
    id: "utility_reason",
    title: "Reason",
    labels: [{ label: "Outage", description: "The customer has no supply." }],
  };

  it("accepts a well-formed definition and defaults the optional fields", () => {
    const def = validateLabelsetDef(base);
    expect(def.kind).toBe("RESOURCES");
    expect(def.multiple).toBe(false);
    expect(def.color).toMatch(/^#/);
  });

  it("requires a description on every label, because the agent reads it", () => {
    expect(() => validateLabelsetDef({ ...base, labels: [{ label: "Outage", description: "  " }] })).toThrow(
      /the agent reads it/,
    );
  });

  it("rejects an id that would not be a valid Knowledge Box labelset id", () => {
    for (const id of ["Utility", "9lives", "has-dash", "x", ""])
      expect(() => validateLabelsetDef({ ...base, id })).toThrow(/id must start with a letter/);
  });

  it("rejects duplicate labels and an empty vocabulary", () => {
    expect(() =>
      validateLabelsetDef({
        ...base,
        labels: [
          { label: "Outage", description: "a" },
          { label: "outage", description: "b" },
        ],
      }),
    ).toThrow(/duplicate label/);
    expect(() => validateLabelsetDef({ ...base, labels: [] })).toThrow(/at least one label/);
  });
});

describe("dashboard window", () => {
  const now = Date.parse("2026-09-13T09:41:00.000Z");

  it("snaps a named range to whole UTC days so a link is reproducible", () => {
    // Two people opening the same link four minutes apart must get the same window — and the same
    // cache entry.
    const a = resolveWindow({ range: "7d" }, now);
    const b = resolveWindow({ range: "7d" }, now + 4 * 60_000);
    expect(a.from).toBe(b.from);
    expect(a.from?.endsWith("T00:00:00.000Z")).toBe(true);
    expect(a.range).toBe("7d");
  });

  it("counts the range inclusively: 7d starts six days before today", () => {
    expect(resolveWindow({ range: "7d" }, now).from).toBe("2026-09-07T00:00:00.000Z");
  });

  it("treats all-time as no bounds at all", () => {
    expect(resolveWindow({ range: "all" }, now)).toEqual({ range: "all" });
    expect(resolveWindow({}, now)).toEqual({ range: "all" });
  });

  it("lets explicit bounds win over a named range", () => {
    const w = resolveWindow({ range: "7d", from: "2020-01-01T00:00:00.000Z" }, now);
    expect(w.range).toBe("custom");
    expect(w.from).toBe("2020-01-01T00:00:00.000Z");
  });

  it("offers the ranges the picker renders", () => {
    expect(Object.keys(DASHBOARD_RANGES)).toEqual(["7d", "30d", "90d", "12m", "all"]);
  });
});

describe("serve-stale caching", () => {
  it("returns an expired value immediately and refreshes behind it", async () => {
    const cache = new TtlCache(10);
    let loads = 0;
    const load = async () => {
      loads++;
      return `v${loads}`;
    };
    expect(await cache.getOrLoadStale("k", load)).toBe("v1");
    await new Promise((r) => setTimeout(r, 25));
    // Past the TTL, inside the grace window: the reader is not made to wait for the reload.
    expect(await cache.getOrLoadStale("k", load)).toBe("v1");
    await new Promise((r) => setTimeout(r, 20));
    expect(loads).toBe(2);
    expect(cache.stats().stale).toBe(1);
  });

  it("makes a reader wait when the entry is older than the grace window", async () => {
    const cache = new TtlCache(5);
    let loads = 0;
    const load = async () => {
      loads++;
      return loads;
    };
    expect(await cache.getOrLoadStale("k", load, { graceMs: 5 })).toBe(1);
    await new Promise((r) => setTimeout(r, 30));
    expect(await cache.getOrLoadStale("k", load, { graceMs: 5 })).toBe(2);
  });

  it("never serves a value a write invalidated", async () => {
    // Staleness is bounded by the TTL, never by a write nobody noticed: every mutation deletes
    // the key outright rather than leaving it to age out.
    const cache = new TtlCache(10);
    let n = 0;
    const load = async () => ++n;
    await cache.getOrLoadStale("k", load);
    cache.delete("k");
    expect(await cache.getOrLoadStale("k", load)).toBe(2);
  });
});

describe("the vendored platform version", () => {
  it("matches the version sync-platform stamped", () => {
    // PLATFORM BUG (arag-platform 0.2.0): `src/index.ts` still exports "0.1.8", so the constant
    // products import is wrong. `lib/version.ts` carries the correct value locally; this test is
    // what stops that local copy drifting from the vendored tree on the next re-vendor.
    const stamped = readFileSync(
      resolve(import.meta.dirname, "../../vendor/arag-platform/PLATFORM_VERSION"),
      "utf8",
    ).trim();
    expect(PLATFORM_VERSION).toBe(stamped);
  });
});
