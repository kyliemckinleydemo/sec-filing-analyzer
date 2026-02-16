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
