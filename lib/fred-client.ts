/**
 * FRED (Federal Reserve Economic Data) API Client
 *
 * Fetches treasury/interest rate data not available via FMP free tier:
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
