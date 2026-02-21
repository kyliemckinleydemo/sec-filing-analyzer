```typescript
/**
 * @module fmp-client
 * @description Financial Modeling Prep (FMP) API client for stock market data retrieval
 *
 * PURPOSE:
 * - Provides a reliable alternative to yahoo-finance2 for Vercel serverless deployments
 * - Implements FMP API integration with simple API key authentication that bypasses
 *   the cookie/crumb authentication issues encountered with Yahoo Finance on Vercel
 * - Delivers essential stock data: profiles, historical prices, analyst ratings,
 *   upgrades/downgrades, and earnings information
 * - Handles rate limiting (150ms between requests) and retry logic (max 2 retries
 *   with exponential backoff) to ensure reliable API consumption
 *
 * EXPORTS:
 * - Types: FMPProfile, FMPHistoricalPrice, FMPUpgradeDowngrade, 
 *   FMPAnalystRecommendation, FMPEarning
 * - Functions: getProfile(), getHistoricalPrices(), getUpgradesDowngrades(),
 *   getAnalystRecommendation(), getEarnings(), parseRange()
 * - Default: fmpClient object containing all public methods
 *
 * CLAUDE NOTES:
 * - Requires FMP_API_KEY environment variable; gracefully returns null when missing
 * - Rate limiting implemented via lastRequestTime tracking and 150ms delay enforcement
 * - Handles FMP's unusual error format: 200 OK responses with {"Error Message": "..."}
 * - Retry logic specifically handles 429 rate limit responses with backoff
 * - All fetch operations include User-Agent header and comprehensive error logging
 * - parseRange() utility handles FMP's "low-high" range string format
 * - API responses are typed interfaces matching FMP's data structure
 * - Null-safe: all functions return null or empty arrays on failure rather than throwing
 */
```

/**
 * FMP (Financial Modeling Prep) API Client
 *
 * Replaces yahoo-finance2 for Vercel-deployed routes.
 * Yahoo's crumb/cookie auth gets blocked on Vercel serverless;
 * FMP uses simple API key auth that works everywhere.
 *
 * Docs: https://site.financialmodelingprep.com/developer/docs
 */

const FMP_BASE_URL = 'https://financialmodelingprep.com';
const RATE_LIMIT_MS = 150;
const MAX_RETRIES = 2;
const RETRY_BACKOFF_MS = 1000;

let lastRequestTime = 0;

async function rateLimitDelay(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < RATE_LIMIT_MS) {
    await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_MS - elapsed));
  }
  lastRequestTime = Date.now();
}

async function fmpFetch<T>(path: string, params: Record<string, string> = {}): Promise<T | null> {
  const apiKey = process.env.FMP_API_KEY;
  if (!apiKey) {
    console.warn('[FMP] No FMP_API_KEY configured');
    return null;
  }

  const url = new URL(path, FMP_BASE_URL);
  url.searchParams.set('apikey', apiKey);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      await rateLimitDelay();

      const response = await fetch(url.toString(), {
        headers: { 'User-Agent': 'SEC Filing Analyzer' },
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        console.error(`[FMP] HTTP ${response.status} for ${path}: ${text.slice(0, 200)}`);
        if (response.status === 429 && attempt < MAX_RETRIES) {
          await new Promise(r => setTimeout(r, RETRY_BACKOFF_MS * (attempt + 1)));
          continue;
        }
        return null;
      }

      const data = await response.json();

      // FMP returns 200 with {"Error Message": "Limit Reach ..."} when rate limited
      if (data && typeof data === 'object' && !Array.isArray(data) && 'Error Message' in data) {
        console.error(`[FMP] API error for ${path}: ${(data as any)['Error Message']}`);
        return null;
      }

      return data as T;
    } catch (error: any) {
      console.error(`[FMP] Fetch error for ${path} (attempt ${attempt + 1}):`, error.message);
      if (attempt < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, RETRY_BACKOFF_MS * (attempt + 1)));
        continue;
      }
      return null;
    }
  }

  return null;
}

// --- Response types ---

export interface FMPProfile {
  symbol: string;
  companyName: string;
  price: number;
  mktCap: number;
  beta: number;
  volAvg: number;
  volume: number;
  lastDiv: number;
  range: string; // "123.45-234.56"
  sector: string;
  industry: string;
  exchangeShortName: string;
  currency: string;
  pe: number | null;
  targetMeanPrice?: number;
  dividendYield?: number;
  previousClose?: number;
}

export interface FMPHistoricalPrice {
  date: string; // "2025-01-15"
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface FMPUpgradeDowngrade {
  symbol: string;
  publishedDate: string; // ISO datetime
  newsURL: string;
  newsTitle: string;
  newsBaseURL: string;
  newsPublisher: string;
  newGrade: string;
  previousGrade: string;
  gradingCompany: string;
  action: string; // "upgrade", "downgrade", "init", "reiterated"
  priceWhenPosted: number;
}

export interface FMPAnalystRecommendation {
  symbol: string;
  date: string;
  analystRatingsbuy: number;
  analystRatingsHold: number;
  analystRatingsSell: number;
  analystRatingsStrongSell: number;
  analystRatingsStrongBuy: number;
}

export interface FMPEarning {
  symbol: string;
  date: string;
  epsActual: number | null;
  epsEstimated: number | null;
  revenueActual: number | null;
  revenueEstimated: number | null;
}

// --- Public API ---

export async function getProfile(symbol: string): Promise<FMPProfile | null> {
  const data = await fmpFetch<FMPProfile[]>('/stable/profile', { symbol });
  if (!data || !Array.isArray(data) || data.length === 0) return null;
  return data[0];
}

export async function getHistoricalPrices(
  symbol: string,
  from: string,
  to: string
): Promise<FMPHistoricalPrice[]> {
  const data = await fmpFetch<FMPHistoricalPrice[]>('/stable/historical-price-eod/full', {
    symbol,
    from,
    to,
  });
  return data && Array.isArray(data) ? data : [];
}

export async function getUpgradesDowngrades(symbol: string): Promise<FMPUpgradeDowngrade[]> {
  const data = await fmpFetch<FMPUpgradeDowngrade[]>('/stable/upgrades-downgrades', { symbol });
  return data && Array.isArray(data) ? data : [];
}

export async function getAnalystRecommendation(symbol: string): Promise<FMPAnalystRecommendation | null> {
  const data = await fmpFetch<FMPAnalystRecommendation[]>('/stable/analyst-recommendation', { symbol });
  if (!data || !Array.isArray(data) || data.length === 0) return null;
  return data[0]; // Most recent
}

export async function getEarnings(symbol: string, limit = 5): Promise<FMPEarning[]> {
  const data = await fmpFetch<FMPEarning[]>('/stable/earnings', {
    symbol,
    limit: String(limit),
  });
  return data && Array.isArray(data) ? data : [];
}

// --- Helpers ---

/** Parse FMP range string "123.45-234.56" into [low, high] */
export function parseRange(range: string): { low: number; high: number } | null {
  if (!range) return null;
  const parts = range.split('-').map(s => parseFloat(s.trim()));
  if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
    return { low: Math.min(parts[0], parts[1]), high: Math.max(parts[0], parts[1]) };
  }
  return null;
}

const fmpClient = {
  getProfile,
  getHistoricalPrices,
  getUpgradesDowngrades,
  getAnalystRecommendation,
  getEarnings,
  parseRange,
};

export default fmpClient;
