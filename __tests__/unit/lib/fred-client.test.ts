```typescript
/**
 * @module fred-client.test
 * 
 * @description
 * Unit tests for the FRED (Federal Reserve Economic Data) API client module.
 * Tests the retrieval and parsing of treasury rates, yield curves, and historical
 * economic data from the St. Louis Federal Reserve's FRED API.
 * 
 * PURPOSE:
 * - Verify correct fetching and parsing of treasury rates (Fed Funds, 3M, 2Y, 10Y)
 * - Test yield curve calculation (2Y-10Y spread) with proper decimal precision
 * - Validate handling of missing data markers ("." values from FRED)
 * - Ensure graceful error handling for network failures and API errors
 * - Verify weekend/holiday data backfill logic using most recent business day
 * - Test historical data retrieval and date range processing
 * - Confirm proper handling of missing API keys and authentication
 * 
 * EXPORTS:
 * - Test suites for getTreasuryRates() function
 * - Test suites for getTreasuryHistory() function
 * - Test suites for getTreasury10yFromHistory() function
 * - Mock utilities for FRED API responses
 * 
 * CLAUDE NOTES:
 * - Uses Vitest's global fetch mocking via vi.stubGlobal()
 * - Mock must be established before importing the module under test
 * - Tests validate 3 decimal precision for yield curve calculations
 * - Lookback window of up to 5 days handles weekend/holiday gaps
 * - FRED returns "." string to indicate missing/unavailable data points
 * - All functions gracefully degrade to null values on errors
 * - Test coverage includes edge cases: empty responses, null values, network errors
 */
```

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Must import after mocking fetch
import { getTreasuryRates, getTreasuryHistory, getTreasury10yFromHistory, TreasuryRates } from '@/lib/fred-client';

function makeFredResponse(observations: { date: string; value: string }[]) {
  return {
    ok: true,
    json: () => Promise.resolve({ observations }),
  };
}

describe('fred-client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.FRED_API_KEY = 'test-fred-key';
  });

  afterEach(() => {
    delete process.env.FRED_API_KEY;
  });

  // --- getTreasuryRates ---

  describe('getTreasuryRates', () => {
    it('fetches all 4 series and returns parsed rates', async () => {
      mockFetch
        .mockResolvedValueOnce(makeFredResponse([{ date: '2026-02-18', value: '4.33' }]))  // DFF
        .mockResolvedValueOnce(makeFredResponse([{ date: '2026-02-18', value: '4.28' }]))  // DGS3MO
        .mockResolvedValueOnce(makeFredResponse([{ date: '2026-02-18', value: '4.12' }]))  // DGS2
        .mockResolvedValueOnce(makeFredResponse([{ date: '2026-02-18', value: '4.50' }])); // DGS10

      const rates = await getTreasuryRates('2026-02-18');

      expect(rates.fedFundsRate).toBe(4.33);
      expect(rates.treasury3m).toBe(4.28);
      expect(rates.treasury2y).toBe(4.12);
      expect(rates.treasury10y).toBe(4.50);
      expect(rates.yieldCurve2y10y).toBe(0.38);
      expect(mockFetch).toHaveBeenCalledTimes(4);
    });

    it('handles "." (missing data) values as null', async () => {
      mockFetch
        .mockResolvedValueOnce(makeFredResponse([{ date: '2026-02-18', value: '.' }]))
        .mockResolvedValueOnce(makeFredResponse([{ date: '2026-02-18', value: '.' }]))
        .mockResolvedValueOnce(makeFredResponse([{ date: '2026-02-18', value: '.' }]))
        .mockResolvedValueOnce(makeFredResponse([{ date: '2026-02-18', value: '.' }]));

      const rates = await getTreasuryRates('2026-02-18');

      expect(rates.fedFundsRate).toBeNull();
      expect(rates.treasury3m).toBeNull();
      expect(rates.treasury2y).toBeNull();
      expect(rates.treasury10y).toBeNull();
      expect(rates.yieldCurve2y10y).toBeNull();
    });

    it('picks the most recent valid value (skips "." at end)', async () => {
      // Series has valid data on Friday, "." on weekend
      mockFetch
        .mockResolvedValueOnce(makeFredResponse([
          { date: '2026-02-13', value: '4.33' },
          { date: '2026-02-14', value: '.' },
        ]))
        .mockResolvedValueOnce(makeFredResponse([{ date: '2026-02-13', value: '4.28' }]))
        .mockResolvedValueOnce(makeFredResponse([{ date: '2026-02-13', value: '4.12' }]))
        .mockResolvedValueOnce(makeFredResponse([{ date: '2026-02-13', value: '4.50' }]));

      const rates = await getTreasuryRates('2026-02-15');

      // Should return the Friday value, not the "." weekend value
      expect(rates.fedFundsRate).toBe(4.33);
    });

    it('returns all nulls when FRED_API_KEY is missing', async () => {
      delete process.env.FRED_API_KEY;

      const rates = await getTreasuryRates('2026-02-18');

      expect(rates.fedFundsRate).toBeNull();
      expect(rates.treasury10y).toBeNull();
      expect(rates.yieldCurve2y10y).toBeNull();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('returns all nulls when FRED API returns empty observations', async () => {
      mockFetch.mockResolvedValue(makeFredResponse([]));

      const rates = await getTreasuryRates('2026-02-18');

      expect(rates.fedFundsRate).toBeNull();
      expect(rates.treasury10y).toBeNull();
    });

    it('handles HTTP errors gracefully', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 500 });

      const rates = await getTreasuryRates('2026-02-18');

      expect(rates.fedFundsRate).toBeNull();
      expect(rates.treasury10y).toBeNull();
    });

    it('handles network errors gracefully', async () => {
      mockFetch.mockRejectedValue(new Error('Network timeout'));

      const rates = await getTreasuryRates('2026-02-18');

      expect(rates.fedFundsRate).toBeNull();
      expect(rates.treasury10y).toBeNull();
    });

    it('calculates yield curve correctly with 3 decimal precision', async () => {
      mockFetch
        .mockResolvedValueOnce(makeFredResponse([{ date: '2026-02-18', value: '4.33' }]))
        .mockResolvedValueOnce(makeFredResponse([{ date: '2026-02-18', value: '4.28' }]))
        .mockResolvedValueOnce(makeFredResponse([{ date: '2026-02-18', value: '4.507' }])) // 2y
        .mockResolvedValueOnce(makeFredResponse([{ date: '2026-02-18', value: '4.203' }])); // 10y

      const rates = await getTreasuryRates('2026-02-18');

      // 4.203 - 4.507 = -0.304
      expect(rates.yieldCurve2y10y).toBe(-0.304);
    });
  });

  // --- getTreasuryHistory ---

  describe('getTreasuryHistory', () => {
    it('returns a map of dates to rates for the requested range', async () => {
      const obs = [
        { date: '2026-02-17', value: '4.33' },
        { date: '2026-02-18', value: '4.35' },
      ];
      mockFetch
        .mockResolvedValueOnce(makeFredResponse(obs))  // DFF
        .mockResolvedValueOnce(makeFredResponse(obs))  // DGS3MO
        .mockResolvedValueOnce(makeFredResponse(obs))  // DGS2
        .mockResolvedValueOnce(makeFredResponse(obs)); // DGS10

      const result = await getTreasuryHistory('2026-02-17', '2026-02-18');

      expect(result.size).toBe(2);
      expect(result.get('2026-02-17')?.fedFundsRate).toBe(4.33);
      expect(result.get('2026-02-18')?.fedFundsRate).toBe(4.35);
    });

    it('fills weekend dates with nearest prior business day values', async () => {
      // Only Friday has data
      const obs = [{ date: '2026-02-20', value: '4.33' }]; // Friday
      mockFetch.mockResolvedValue(makeFredResponse(obs));

      const result = await getTreasuryHistory('2026-02-20', '2026-02-22'); // Fri-Sun

      // Saturday and Sunday should get Friday's value via lookback
      expect(result.get('2026-02-20')?.fedFundsRate).toBe(4.33);
      expect(result.get('2026-02-21')?.fedFundsRate).toBe(4.33); // Saturday
      expect(result.get('2026-02-22')?.fedFundsRate).toBe(4.33); // Sunday
    });
  });

  // --- getTreasury10yFromHistory ---

  describe('getTreasury10yFromHistory', () => {
    it('returns 10y value from N days ago', () => {
      const map = new Map<string, TreasuryRates>();
      map.set('2026-01-19', {
        fedFundsRate: 4.33,
        treasury3m: 4.28,
        treasury2y: 4.12,
        treasury10y: 4.05,
        yieldCurve2y10y: -0.07,
      });

      const result = getTreasury10yFromHistory(map, '2026-02-18', 30);

      expect(result).toBe(4.05);
    });

    it('looks back up to 5 days for weekends/holidays', () => {
      const map = new Map<string, TreasuryRates>();
      // Only Friday has data (Jan 17 is a Friday if 30 days before Feb 16)
      map.set('2026-01-16', {
        fedFundsRate: 4.33,
        treasury3m: 4.28,
        treasury2y: 4.12,
        treasury10y: 4.10,
        yieldCurve2y10y: -0.02,
      });

      // Target would be Jan 19 (30 days before Feb 18) — a Monday with no data
      // Should look back and find Jan 16
      const result = getTreasury10yFromHistory(map, '2026-02-18', 30);

      expect(result).toBe(4.10);
    });

    it('returns null when no data found in lookback window', () => {
      const map = new Map<string, TreasuryRates>();

      const result = getTreasury10yFromHistory(map, '2026-02-18', 30);

      expect(result).toBeNull();
    });

    it('returns null when treasury10y is null in matching entry', () => {
      const map = new Map<string, TreasuryRates>();
      map.set('2026-01-19', {
        fedFundsRate: 4.33,
        treasury3m: 4.28,
        treasury2y: 4.12,
        treasury10y: null,
        yieldCurve2y10y: null,
      });

      const result = getTreasury10yFromHistory(map, '2026-02-18', 30);

      expect(result).toBeNull();
    });
  });
});
