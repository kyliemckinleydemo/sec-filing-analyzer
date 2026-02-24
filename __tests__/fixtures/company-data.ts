/**
 * @module __tests__/fixtures/company-data
 * @description Test fixture module exporting mock company financial data objects with ticker symbols, prices, and market metrics for unit testing
 *
 * PURPOSE:
 * - Provide consistent mock company data for Apple (AAPL) with realistic market cap of $3T and price range $164-$199
 * - Provide mock company data for Equifax (EFX) with $32B market cap and $200-$310 price range
 * - Provide edge case mock company (XYZ) with zero values and null analyst target for testing empty state handling
 *
 * EXPORTS:
 * - MOCK_COMPANY_AAPL (const) - Apple Inc. mock object with ticker AAPL, CIK 0000320193, $195 current price, and $210 analyst target
 * - MOCK_COMPANY_EFX (const) - Equifax Inc. mock object with ticker EFX, CIK 0000033185, $260 current price, and $290 analyst target
 * - MOCK_COMPANY_NO_DATA (const) - XYZ Corp mock object with all numeric fields set to zero and null analyst target for edge case testing
 *
 * PATTERNS:
 * - Import specific mock by name: import { MOCK_COMPANY_AAPL } from '__tests__/fixtures/company-data'
 * - Use in test assertions to verify component rendering with known data values
 * - Use MOCK_COMPANY_NO_DATA to test null handling and zero-value display logic
 *
 * CLAUDE NOTES:
 * - CIK numbers are real SEC Central Index Keys matching the actual companies Apple and Equifax
 * - Market cap values use underscore separators for readability (3_000_000_000_000 equals 3 trillion)
 * - MOCK_COMPANY_NO_DATA has analystTargetPrice explicitly set to null while other prices are 0, allowing distinction between missing versus zero data
 * - Price ranges follow realistic 52-week high/low patterns with current prices falling within those bounds
 */
export const MOCK_COMPANY_AAPL = {
  id: 'company-001',
  ticker: 'AAPL',
  name: 'Apple Inc.',
  cik: '0000320193',
  currentPrice: 195.0,
  fiftyTwoWeekHigh: 199.62,
  fiftyTwoWeekLow: 164.08,
  marketCap: 3_000_000_000_000,
  analystTargetPrice: 210.0,
};

export const MOCK_COMPANY_EFX = {
  id: 'company-003',
  ticker: 'EFX',
  name: 'Equifax Inc.',
  cik: '0000033185',
  currentPrice: 260.0,
  fiftyTwoWeekHigh: 310.0,
  fiftyTwoWeekLow: 200.0,
  marketCap: 32_000_000_000,
  analystTargetPrice: 290.0,
};

export const MOCK_COMPANY_NO_DATA = {
  id: 'company-002',
  ticker: 'XYZ',
  name: 'XYZ Corp',
  cik: '0001234567',
  currentPrice: 0,
  fiftyTwoWeekHigh: 0,
  fiftyTwoWeekLow: 0,
  marketCap: 0,
  analystTargetPrice: null,
};
