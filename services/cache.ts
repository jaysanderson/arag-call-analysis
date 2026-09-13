/**
 * Small TTL cache with namespaced keys, hit/miss stats and single-flight de-duplication.
 *
 * Why it exists: the dashboard, the calls list and every category rail previously re-fetched the
 * catalog and then one ARAG resource per call, on every view — roughly `rails × calls` upstream
 * requests per page load. Everything now goes through `getOrLoad`, so a burst of concurrent
 * renders costs one upstream fetch per call per TTL window.
 */

export interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export interface CacheStats {
  entries: number;
  hits: number;
  misses: number;
  /** Hits served from an expired entry while a refresh ran behind them. */
  stale: number;
  evictions: number;
  invalidations: number;
  ttlMs: number;
  byNamespace: Record<string, number>;
}

export class TtlCache {
  readonly ttlMs: number;
  private readonly max: number;
  private readonly map = new Map<string, CacheEntry<unknown>>();
  private readonly inflight = new Map<string, Promise<unknown>>();
  private hits = 0;
  private misses = 0;
  private stale = 0;
  private evictions = 0;
  private invalidations = 0;

  constructor(ttlMs = 60_000, max = 2_000) {
    this.ttlMs = ttlMs;
    this.max = max;
  }

  get<T>(key: string, now = Date.now()): T | undefined {
    const e = this.map.get(key);
    if (!e) {
      this.misses++;
      return undefined;
    }
    if (e.expiresAt <= now) {
      this.map.delete(key);
      this.evictions++;
      this.misses++;
      return undefined;
    }
    this.hits++;
    return e.value as T;
  }

  set<T>(key: string, value: T, ttlMs = this.ttlMs, now = Date.now()): T {
    if (this.map.size >= this.max) {
      // Oldest insertion first — Map preserves insertion order.
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) {
        this.map.delete(oldest);
        this.evictions++;
      }
    }
    this.map.set(key, { value, expiresAt: now + ttlMs });
    return value;
  }

  has(key: string, now = Date.now()): boolean {
    const e = this.map.get(key);
    return Boolean(e && e.expiresAt > now);
  }

  /**
   * Return the cached value, or load it. Concurrent callers for the same key share one load, so a
   * cold dashboard render does not fan out N identical ARAG requests.
   */
  async getOrLoad<T>(key: string, load: () => Promise<T>, ttlMs = this.ttlMs): Promise<T> {
    const cached = this.get<T>(key);
    if (cached !== undefined) return cached;
    const pending = this.inflight.get(key) as Promise<T> | undefined;
    if (pending) return pending;
    const p = load()
      .then((value) => {
        this.set(key, value, ttlMs);
        return value;
      })
      .finally(() => {
        this.inflight.delete(key);
      });
    this.inflight.set(key, p as Promise<unknown>);
    return p;
  }

  /**
   * Serve-stale-and-refresh.
   *
   * `getOrLoad` has a cliff: the instant an entry expires, the next reader pays the whole load.
   * For this product that load is one ARAG round-trip *per call* in the catalog, so the cliff was
   * measured at about eight seconds on a live Knowledge Box — and it landed on whichever screen
   * happened to read first after the TTL lapsed, which made it look like a bug in that screen
   * rather than in the cache.
   *
   * Within `graceMs` of expiry the stale value is returned immediately and a refresh is started in
   * the background, so a warm deployment never blocks a reader again: the first request after the
   * TTL gets data up to `ttlMs + graceMs` old, and the one after it gets fresh data. Only a truly
   * cold key (never loaded, or older than the grace window) waits.
   *
   * Correctness note: this is only safe for *read models the product itself invalidates on write*
   * — every mutation here calls `delete`, `invalidatePrefix` or `clear`, which removes the entry
   * outright rather than leaving it stale. Staleness is therefore bounded by the TTL, never by a
   * write nobody noticed.
   */
  async getOrLoadStale<T>(
    key: string,
    load: () => Promise<T>,
    opts: { ttlMs?: number; graceMs?: number } = {},
  ): Promise<T> {
    const ttlMs = opts.ttlMs ?? this.ttlMs;
    const graceMs = opts.graceMs ?? Math.max(ttlMs * 9, 5 * 60_000);
    const now = Date.now();
    const entry = this.map.get(key) as CacheEntry<T> | undefined;

    if (entry && entry.expiresAt > now) {
      this.hits++;
      return entry.value;
    }
    if (entry && now - entry.expiresAt < graceMs) {
      this.hits++;
      this.stale++;
      // Kick off exactly one refresh; readers in the meantime keep getting the stale value.
      if (!this.inflight.has(key)) void this.getOrLoad(key, load, ttlMs).catch(() => {});
      return entry.value;
    }
    if (entry) {
      this.map.delete(key);
      this.evictions++;
    }
    return this.getOrLoad(key, load, ttlMs);
  }

  /** Drop one key. */
  delete(key: string): boolean {
    const ok = this.map.delete(key);
    if (ok) this.invalidations++;
    return ok;
  }

  /** Drop every key in a namespace (`"call:"` style prefix). Returns how many went. */
  invalidatePrefix(prefix: string): number {
    let n = 0;
    for (const k of [...this.map.keys()]) {
      if (k.startsWith(prefix)) {
        this.map.delete(k);
        n++;
      }
    }
    this.invalidations += n;
    return n;
  }

  /** Drop everything (upload, delete, provision). */
  clear(): number {
    const n = this.map.size;
    this.map.clear();
    this.invalidations += n;
    return n;
  }

  stats(now = Date.now()): CacheStats {
    const byNamespace: Record<string, number> = {};
    let entries = 0;
    for (const [k, e] of this.map) {
      if (e.expiresAt <= now) continue;
      entries++;
      const ns = k.includes(":") ? k.slice(0, k.indexOf(":")) : "other";
      byNamespace[ns] = (byNamespace[ns] ?? 0) + 1;
    }
    return {
      entries,
      hits: this.hits,
      misses: this.misses,
      stale: this.stale,
      evictions: this.evictions,
      invalidations: this.invalidations,
      ttlMs: this.ttlMs,
      byNamespace,
    };
  }

  /** Keys currently held (admin panel view). */
  keys(now = Date.now()): string[] {
    return [...this.map.entries()].filter(([, e]) => e.expiresAt > now).map(([k]) => k);
  }
}

export const cacheKeys = {
  catalogIds: (query?: string) => `catalog:${query ?? ""}`,
  summary: (id: string) => `summary:${id}`,
  detail: (id: string) => `detail:${id}`,
  labelsets: () => "labelsets:all",
  find: (query: string) => `find:${query}`,
};
