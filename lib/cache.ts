/**
 * @module lib/cache
 * @description In-memory cache singleton implementing TTL-based expiration for storing API responses and computed data with automatic cleanup
 *
 * PURPOSE:
 * - Store arbitrary typed data with configurable time-to-live (default 1 hour)
 * - Automatically expire and delete entries when TTL exceeded on retrieval
 * - Run background cleanup every 5 minutes in server environment to purge expired entries
 * - Provide standardized cache key generators for company facts, filings, stock prices, and snapshot data
 *
 * EXPORTS:
 * - cache (const) - SimpleCache singleton instance for storing and retrieving cached data with TTL
 * - cacheKeys (const) - Object containing functions that generate consistent cache keys for SEC filings, stock data, and company information
 *
 * PATTERNS:
 * - Store data: cache.set('myKey', data, 60000) for 1-minute TTL or omit for default 1-hour
 * - Retrieve data: const result = cache.get<MyType>('myKey') returns typed data or null if missing/expired
 * - Use key generators: cache.set(cacheKeys.stockQuote('AAPL'), quoteData) for consistent naming
 * - Manual cleanup: cache.delete('specificKey') or cache.clear() to flush all entries
 *
 * CLAUDE NOTES:
 * - Cleanup interval only runs server-side (typeof window === 'undefined' check prevents browser execution)
 * - Expired entries removed lazily on get() calls AND proactively every 5 minutes via cleanup()
 * - Cache is in-memory only - all data lost on process restart, comment suggests Redis for production persistence
 * - Generic type parameter on get<T>() provides type safety but doesn't validate actual cached data structure
 */
/**
 * Simple in-memory cache with TTL
 * Can be replaced with Redis for production use
 */

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

class SimpleCache {
  private cache = new Map<string, CacheEntry<any>>();
  private readonly defaultTTL = 3600000; // 1 hour in ms

  set<T>(key: string, value: T, ttlMs?: number): void {
    const ttl = ttlMs || this.defaultTTL;
    this.cache.set(key, {
      data: value,
      expiresAt: Date.now() + ttl,
    });
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);

    if (!entry) return null;

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.data as T;
  }

  delete(key: string): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  // Clean up expired entries periodically
  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
      }
    }
  }
}

// Export singleton
export const cache = new SimpleCache();

// Run cleanup every 5 minutes
if (typeof window === 'undefined') {
  setInterval(() => cache.cleanup(), 300000);
}

// Cache key generators
export const cacheKeys = {
  companyFacts: (cik: string) => `company:${cik}:facts`,
  companyFilings: (cik: string) => `company:${cik}:filings`,
  filingContent: (accession: string) => `filing:${accession}:content`,
  stockPrices: (ticker: string) => `stock:${ticker}:prices`,
  stockQuote: (ticker: string) => `stock:${ticker}:quote`,
  snapshotData: (ticker: string) => `snapshot:${ticker}:data`,
};
