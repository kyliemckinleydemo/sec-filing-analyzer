/**
 * @module __tests__/fixtures/filing-data
 * @description Provides mock SEC filing objects with varying company data completeness for testing filing list rendering, prediction display, and edge cases
 *
 * PURPOSE:
 * - Supply complete filing fixture with full company data including AAPL stock metrics and market cap
 * - Provide filing fixture with cached prediction values (alpha 2.5%, confidence 0.85) to test prediction UI
 * - Expose filing fixture with zeroed company fields to test null/missing data handling in components
 *
 * EXPORTS:
 * - MOCK_FILING_WITH_COMPANY (const) - Complete filing object for AAPL 10-K with concernLevel 4.5, no predictions, full company pricing data
 * - MOCK_FILING_WITH_CACHED_PREDICTION (const) - Filing object extending base mock with predicted30dAlpha 2.5, predicted30dReturn 3.3, confidence 0.85
 * - MOCK_FILING_NO_COMPANY_DATA (const) - Filing object for XYZ Corp 8-K with all company numeric fields set to 0 or null
 *
 * PATTERNS:
 * - Import specific mock in test: import { MOCK_FILING_WITH_COMPANY } from '@/__tests__/fixtures/filing-data'
 * - Use MOCK_FILING_WITH_COMPANY to test normal filing display with full company info
 * - Use MOCK_FILING_WITH_CACHED_PREDICTION to verify prediction badges show percentages and confidence correctly
 * - Use MOCK_FILING_NO_COMPANY_DATA to test fallback rendering when company data is incomplete or missing
 *
 * CLAUDE NOTES:
 * - All mocks use same base filing structure but vary in prediction and company data completeness for different test scenarios
 * - MOCK_FILING_WITH_CACHED_PREDICTION uses spread operator to inherit all base properties then overrides prediction fields
 * - Company market cap in base mock is 3 trillion (3_000_000_000_000) representing large-cap stock like Apple
 * - Prediction confidence values range 0-1 (0.85 = 85% confidence), alpha/return values are percentage points
 */
export const MOCK_FILING_WITH_COMPANY = {
  id: 'filing-001',
  accessionNumber: '0001193125-24-012345',
  filingType: '10-K',
  filingDate: new Date('2024-11-15'),
  companyId: 'company-001',
  concernLevel: 4.5,
  sentimentScore: 0.15,
  predicted7dReturn: null,
  predicted30dReturn: null,
  predicted30dAlpha: null,
  predictionConfidence: null,
  actual7dReturn: null,
  actual7dAlpha: null,
  actual30dAlpha: null,
  company: {
    id: 'company-001',
    ticker: 'AAPL',
    name: 'Apple Inc.',
    cik: '0000320193',
    currentPrice: 195.0,
    fiftyTwoWeekHigh: 199.62,
    fiftyTwoWeekLow: 164.08,
    marketCap: 3_000_000_000_000,
    analystTargetPrice: 210.0,
  },
};

export const MOCK_FILING_WITH_CACHED_PREDICTION = {
  ...MOCK_FILING_WITH_COMPANY,
  id: 'filing-002',
  accessionNumber: '0001193125-24-023456',
  predicted30dAlpha: 2.5,
  predicted30dReturn: 3.3,
  predicted7dReturn: 0.77,
  predictionConfidence: 0.85,
};

export const MOCK_FILING_NO_COMPANY_DATA = {
  id: 'filing-003',
  accessionNumber: '0001193125-24-034567',
  filingType: '8-K',
  filingDate: new Date('2024-12-01'),
  companyId: 'company-002',
  concernLevel: 6.0,
  sentimentScore: -0.1,
  predicted7dReturn: null,
  predicted30dReturn: null,
  predicted30dAlpha: null,
  predictionConfidence: null,
  actual7dReturn: null,
  actual7dAlpha: null,
  actual30dAlpha: null,
  company: {
    id: 'company-002',
    ticker: 'XYZ',
    name: 'XYZ Corp',
    cik: '0001234567',
    currentPrice: 0,
    fiftyTwoWeekHigh: 0,
    fiftyTwoWeekLow: 0,
    marketCap: 0,
    analystTargetPrice: null,
  },
};
