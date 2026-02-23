/**
 * @module lib/fred-client
 * @description Fetches Federal Reserve economic data (treasury yields, fed funds rate) from FRED API with automatic rate limiting and business day handling
 *
 * PURPOSE:
 * - Retrieve current and historical US treasury rates (3-month, 2-year, 10-year) and federal funds rate from FRED API
 * - Calculate yield curve spread (10y - 2y) automatically from fetched treasury data
 * - Handle missing data for weekends/holidays by looking back up to 5 business days for most recent valid observations
 * - Enforce 100ms rate limiting between API requests to prevent throttling
 *
 * DEPENDENCIES:
 * - process.env.FRED_API_KEY - Required API key for authenticated requests to Federal Reserve Economic Data API
 *
 * EXPORTS:
 * - TreasuryRates (interface) - Shape containing fedFundsRate, treasury3m, treasury2y, treasury10y, and calculated yieldCurve2y10y spread, all nullable numbers
 * - getTreasuryRates (function) - Fetches treasury rates for single date, returns TreasuryRates with most recent valid values within 5-day lookback window
 * - getTreasuryHistory (function) - Bulk fetches treasury rates for date range, returns Map of date string to TreasuryRates for backfilling operations
 * - getTreasury10yFromHistory (function) - Extracts 10-year treasury value from N days prior in history map for calculating rate changes
 * - fredClient (default) - Object bundling getTreasuryRates, getTreasuryHistory, and getTreasury10yFromHistory methods
 *
 * PATTERNS:
 * - Call getTreasuryRates('2024-01-15') for single date retrieval; automatically handles weekends by looking back for latest valid data
 * - Use getTreasuryHistory('2024-01-01', '2024-12-31') for bulk backfills; extends start date by 45 days internally to calculate 30-day changes
 * - Access yieldCurve2y10y from returned TreasuryRates for inverted yield curve detection (negative values indicate inversion)
 * - Set FRED_API_KEY environment variable before use; missing key returns empty arrays with console warnings
 *
 * CLAUDE NOTES:
 * - Implements 100ms rate limiting via lastRequestTime tracking and Promise-based delays between fredFetch calls
 * - FRED API returns '.' string for missing observations; parseValue converts these to null for consistent handling
 * - Fetches extended date range (startDate - 45 days) in getTreasuryHistory to ensure first few days have valid comparison values for change calculations
 * - Yield curve calculation rounds to 3 decimal places (Math.round * 1000 / 1000) for consistent precision across dates
 */
/**
 * FRED (Federal Reserve Economic Data) API Client
 *
 * Fetches treasury/interest rate data from FRED:
 * - Federal funds rate (DFF)
 * - 3-month treasury yield (DGS3MO)
 * - 2-year treasury yield (DGS2)
 * - 10-year treasury yield (DGS10)
 * - Yield curve spread (10y - 2y, calculated)
 *
 * FRED API is free with no daily call limit.
 * Docs: https://fred.stlouisfed.org/docs/api/fred/
 */

const FRED_BASE_URL = 'https://api.stlouisfed.org/fred/series/observations';
const RATE_LIMIT_MS = 100;

let lastRequestTime = 0;

// FRED series IDs for the data we need
const SERIES = {
  fedFundsRate: 'DFF',
  treasury3m: 'DGS3MO',
  treasury2y: 'DGS2',
  treasury10y: 'DGS10',
} as const;

export interface TreasuryRates {
  fedFundsRate: number | null;
  treasury3m: number | null;
  treasury2y: number | null;
  treasury10y: number | null;
  yieldCurve2y10y: number | null;
}

interface FredObservation {
  date: string;
  value: string; // numeric string or "." for missing
}

async function rateLimitDelay(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < RATE_LIMIT_MS) {
    await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_MS - elapsed));
  }
  lastRequestTime = Date.now();
}

/**
 * Fetch observations for a single FRED series
 */
async function fredFetch(
  seriesId: string,
  startDate: string,
  endDate: string
): Promise<FredObservation[]> {
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) {
    console.warn('[FRED] No FRED_API_KEY configured');
    return [];
  }

  await rateLimitDelay();

  const url = new URL(FRED_BASE_URL);
  url.searchParams.set('series_id', seriesId);
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('file_type', 'json');
  url.searchParams.set('observation_start', startDate);
  url.searchParams.set('observation_end', endDate);

  try {
    const response = await fetch(url.toString());
    if (!response.ok) {
      console.error(`[FRED] HTTP ${response.status} for ${seriesId}`);
      return [];
    }
    const data = await response.json();
    return (data.observations || []) as FredObservation[];
  } catch (error: any) {
    console.error(`[FRED] Fetch error for ${seriesId}:`, error.message);
    return [];
  }
}

/**
 * Parse a FRED observation value. Returns null for missing data ("." values).
 */
function parseValue(value: string): number | null {
  if (!value || value === '.') return null;
  const num = parseFloat(value);
  return isNaN(num) ? null : num;
}

/**
 * Fetch treasury rates for a single date.
 * FRED data is published with a 1-business-day lag, so for today's date
 * you may get yesterday's values.
 */
export async function getTreasuryRates(date: string): Promise<TreasuryRates> {
  // Fetch a small window to handle weekends/holidays (look back up to 5 days)
  const startDate = new Date(date);
  startDate.setDate(startDate.getDate() - 5);
  const startStr = startDate.toISOString().split('T')[0];

  const [ffObs, t3mObs, t2yObs, t10yObs] = await Promise.all([
    fredFetch(SERIES.fedFundsRate, startStr, date),
    fredFetch(SERIES.treasury3m, startStr, date),
    fredFetch(SERIES.treasury2y, startStr, date),
    fredFetch(SERIES.treasury10y, startStr, date),
  ]);

  // Get the most recent valid value from each series
  const getLatest = (obs: FredObservation[]): number | null => {
    for (let i = obs.length - 1; i >= 0; i--) {
      const val = parseValue(obs[i].value);
      if (val !== null) return val;
    }
    return null;
  };

  const fedFundsRate = getLatest(ffObs);
  const treasury3m = getLatest(t3mObs);
  const treasury2y = getLatest(t2yObs);
  const treasury10y = getLatest(t10yObs);
  const yieldCurve2y10y = treasury10y !== null && treasury2y !== null
    ? Math.round((treasury10y - treasury2y) * 1000) / 1000
    : null;

  return { fedFundsRate, treasury3m, treasury2y, treasury10y, yieldCurve2y10y };
}

/**
 * Fetch treasury history for a date range (for bulk backfilling).
 * Returns a map of date string → TreasuryRates.
 */
export async function getTreasuryHistory(
  startDate: string,
  endDate: string
): Promise<Map<string, TreasuryRates>> {
  // Fetch extra days before start to fill in the first few days and calculate 30d changes
  const extendedStart = new Date(startDate);
  extendedStart.setDate(extendedStart.getDate() - 45);
  const extStartStr = extendedStart.toISOString().split('T')[0];

  const [ffObs, t3mObs, t2yObs, t10yObs] = await Promise.all([
    fredFetch(SERIES.fedFundsRate, extStartStr, endDate),
    fredFetch(SERIES.treasury3m, extStartStr, endDate),
    fredFetch(SERIES.treasury2y, extStartStr, endDate),
    fredFetch(SERIES.treasury10y, extStartStr, endDate),
  ]);

  // Build per-series maps: date → value
  const buildMap = (obs: FredObservation[]): Map<string, number> => {
    const map = new Map<string, number>();
    for (const o of obs) {
      const val = parseValue(o.value);
      if (val !== null) map.set(o.date, val);
    }
    return map;
  };

  const ffMap = buildMap(ffObs);
  const t3mMap = buildMap(t3mObs);
  const t2yMap = buildMap(t2yObs);
  const t10yMap = buildMap(t10yObs);

  // Helper: find the most recent value on or before a given date
  const findClosest = (map: Map<string, number>, dateStr: string): number | null => {
    // Try exact date first
    if (map.has(dateStr)) return map.get(dateStr)!;
    // Look back up to 5 days for weekends/holidays
    const d = new Date(dateStr);
    for (let i = 1; i <= 5; i++) {
      d.setDate(d.getDate() - 1);
      const key = d.toISOString().split('T')[0];
      if (map.has(key)) return map.get(key)!;
    }
    return null;
  };

  // Build result map for the requested date range
  const result = new Map<string, TreasuryRates>();
  const current = new Date(startDate);
  const end = new Date(endDate);

  while (current <= end) {
    const dateStr = current.toISOString().split('T')[0];

    const fedFundsRate = findClosest(ffMap, dateStr);
    const treasury3m = findClosest(t3mMap, dateStr);
    const treasury2y = findClosest(t2yMap, dateStr);
    const treasury10y = findClosest(t10yMap, dateStr);
    const yieldCurve2y10y = treasury10y !== null && treasury2y !== null
      ? Math.round((treasury10y - treasury2y) * 1000) / 1000
      : null;

    result.set(dateStr, { fedFundsRate, treasury3m, treasury2y, treasury10y, yieldCurve2y10y });

    current.setDate(current.getDate() + 1);
  }

  return result;
}

/**
 * Get the 10-year treasury value from N days ago (for calculating change).
 * Uses the history map if available, otherwise fetches directly.
 */
export function getTreasury10yFromHistory(
  historyMap: Map<string, TreasuryRates>,
  dateStr: string,
  daysBack: number
): number | null {
  const target = new Date(dateStr);
  target.setDate(target.getDate() - daysBack);
  // Look for closest business day within 5 days
  for (let i = 0; i <= 5; i++) {
    const key = new Date(target.getTime() - i * 86400000).toISOString().split('T')[0];
    const rates = historyMap.get(key);
    if (rates?.treasury10y !== null && rates?.treasury10y !== undefined) {
      return rates.treasury10y;
    }
  }
  return null;
}

const fredClient = {
  getTreasuryRates,
  getTreasuryHistory,
  getTreasury10yFromHistory,
};

export default fredClient;
