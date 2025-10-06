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
};
