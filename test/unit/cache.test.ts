import { beforeEach, describe, expect, it, vi } from "vitest";
import { cacheKeys, TtlCache } from "@/services/cache";

describe("TtlCache", () => {
  let cache: TtlCache;
  beforeEach(() => {
    cache = new TtlCache(1_000, 5);
  });

  it("stores and returns a value within the TTL", () => {
    cache.set("a", 1);
    expect(cache.get("a")).toBe(1);
    expect(cache.has("a")).toBe(true);
  });

  it("expires a value after the TTL and counts the eviction", () => {
    const t0 = 1_000_000;
    cache.set("a", 1, 1_000, t0);
    expect(cache.get("a", t0 + 999)).toBe(1);
    expect(cache.get("a", t0 + 1_001)).toBeUndefined();
    expect(cache.stats().evictions).toBe(1);
  });

  it("evicts the oldest entry when full", () => {
    for (let i = 0; i < 6; i++) cache.set(`k${i}`, i);
    expect(cache.get("k0")).toBeUndefined();
    expect(cache.get("k5")).toBe(5);
  });

  it("counts hits and misses", () => {
    cache.set("a", 1);
    cache.get("a");
    cache.get("b");
    const s = cache.stats();
    expect(s.hits).toBe(1);
    expect(s.misses).toBe(1);
  });

  it("loads on a miss and serves from cache afterwards", async () => {
    const load = vi.fn().mockResolvedValue("value");
    expect(await cache.getOrLoad("k", load)).toBe("value");
    expect(await cache.getOrLoad("k", load)).toBe("value");
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("de-duplicates concurrent loads for the same key (single flight)", async () => {
    let resolveLoad: (v: string) => void = () => {};
    const load = vi.fn(() => new Promise<string>((r) => {
      resolveLoad = r;
    }));
    const a = cache.getOrLoad("k", load);
    const b = cache.getOrLoad("k", load);
    resolveLoad("shared");
    expect(await a).toBe("shared");
    expect(await b).toBe("shared");
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("does not cache a failed load", async () => {
    const failing = vi.fn().mockRejectedValue(new Error("upstream down"));
    await expect(cache.getOrLoad("k", failing)).rejects.toThrow("upstream down");
    const ok = vi.fn().mockResolvedValue("later");
    expect(await cache.getOrLoad("k", ok)).toBe("later");
  });

  it("invalidates by prefix and reports namespaces", () => {
    cache.set("summary:1", "a");
    cache.set("summary:2", "b");
    cache.set("catalog:", "c");
    expect(cache.stats().byNamespace).toEqual({ summary: 2, catalog: 1 });
    expect(cache.invalidatePrefix("summary:")).toBe(2);
    expect(cache.get("summary:1")).toBeUndefined();
    expect(cache.get("catalog:")).toBe("c");
  });

  it("clears everything and reports the count", () => {
    cache.set("a", 1);
    cache.set("b", 2);
    expect(cache.clear()).toBe(2);
    expect(cache.keys()).toEqual([]);
    expect(cache.stats().invalidations).toBe(2);
  });

  it("deletes a single key", () => {
    cache.set("a", 1);
    expect(cache.delete("a")).toBe(true);
    expect(cache.delete("a")).toBe(false);
  });

  it("omits expired keys from keys() and stats()", () => {
    const t0 = 5_000;
    cache.set("live", 1, 1_000, t0);
    cache.set("dead", 1, 1, t0);
    expect(cache.keys(t0 + 500)).toEqual(["live"]);
    expect(cache.stats(t0 + 500).entries).toBe(1);
  });
});

describe("cacheKeys", () => {
  it("namespaces every key so prefix invalidation is precise", () => {
    expect(cacheKeys.summary("x")).toBe("summary:x");
    expect(cacheKeys.detail("x")).toBe("detail:x");
    expect(cacheKeys.catalogIds()).toBe("catalog:");
    expect(cacheKeys.find("premium")).toBe("find:premium");
    expect(cacheKeys.dashboard()).toBe("dashboard:all");
    expect(cacheKeys.labelsets()).toBe("labelsets:all");
  });
});
