/**
 * @module fmp-client
 * @description FMP (Financial Modeling Prep) API client for financial data retrieval
 *
 * PURPOSE:
 * - Provides a TypeScript client for the Financial Modeling Prep API
 * - Replaces yahoo-finance2 for Vercel-deployed serverless routes
 * - Implements API key authentication that works in serverless environments
 * - Handles rate limiting (150ms between requests) and retry logic (max 2 retries)
 * - Fetches stock profiles, historical prices, analyst ratings, upgrades/downgrades, and earnings data
 * - Processes FMP-specific error responses (200 status with error messages)
 *
 * EXPORTS:
 * - getProfile(symbol): Fetch company profile and current market data
 * - getHistoricalPrices(symbol, from, to): Retrieve historical OHLCV data
 * - getUpgradesDowngrades(symbol): Get analyst upgrades/downgrades
 * - getAnalystRecommendation(symbol): Fetch most recent analyst recommendation summary
 * - getEarnings(symbol, limit): Retrieve earnings history (actual vs. estimated)
 * - parseRange(range): Parse FMP range string "123.45-234.56" into {low, high}
 * - FMPProfile, FMPHistoricalPrice, FMPUpgradeDowngrade, FMPAnalystRecommendation, FMPEarning (TypeScript interfaces)
 * - default: Object containing all exported functions
 *
 * CLAUDE NOTES:
 * - Requires FMP_API_KEY environment variable
 * - All fetch functions return null on error (except array-returning functions which return [])
 * - Rate limiting enforced at 150ms minimum between requests
 * - Retries on 429 (rate limit) with exponential backoff (1s, 2s)
 * - FMP API docs: https://site.financialmodelingprep.com/developer/docs
 * - Base URL: https://financialmodelingprep.com
 * - User-Agent set to "SEC Filing Analyzer"
 */

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
