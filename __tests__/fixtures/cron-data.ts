/**
 * @module __tests__/fixtures/cron-data
 * @description Provides comprehensive mock data fixtures for testing cron jobs, SEC filings, company profiles, analyst activities, and financial market indicators across multiple data sources (SEC RSS, Yahoo Finance, FMP API).
 *
 * PURPOSE:
 * - Supply realistic test fixtures representing successful, running, and failed cron job execution states with timestamps and metrics
 * - Mock SEC filing data structures from RSS feeds including accession numbers, filing types, and report dates for integration testing
 * - Provide complete company profiles with financial metrics (market cap, P/E ratios, 52-week ranges, analyst ratings) for AAPL and MSFT
 * - Define mock responses from external APIs (Yahoo Finance quote summaries, FMP historical prices, earnings data) matching production schemas
 *
 * EXPORTS:
 * - MOCK_CRON_JOB_RUN_SUCCESS (const) - Completed cron job run with 25 filings fetched, 20 stored, 15 companies processed
 * - MOCK_CRON_JOB_RUN_RUNNING (const) - Stuck cron job running for 15 minutes with no progress on filings
 * - MOCK_CRON_JOB_RUN_FAILED (const) - Failed cron job with connection timeout error after 1 minute
 * - MOCK_RSS_FILING (const) - Apple 10-K filing from SEC RSS feed with accession number and filing URL
 * - MOCK_RSS_FILING_2 (const) - Microsoft 10-Q filing from SEC RSS feed for multi-filing test scenarios
 * - MOCK_COMPANY_AAPL_FULL (const) - Complete Apple company record with current price $195, market cap $3T, P/E 31.5, and 38 analyst ratings
 * - MOCK_COMPANY_MSFT_FULL (const) - Complete Microsoft company record with current price $380, market cap $2.8T, and software industry classification
 * - MOCK_FILING_RECENT (const) - Recent 10-K filing with AI analysis, risk score 3.5, sentiment 0.2, and nested company relationship
 * - MOCK_FILING_8K_EARNINGS (const) - 8-K earnings filing with EPS beat analysis in filing content summary
 * - MOCK_YAHOO_FINANCIALS (const) - Yahoo Finance financial data including EPS estimates for current/next quarter and year
 * - MOCK_YAHOO_QUOTE_SUMMARY (const) - Yahoo Finance quote summary with price, recommendation trends, upgrade/downgrade history, and earnings history
 * - MOCK_ANALYST_ACTIVITY (const) - Goldman Sachs upgrade from Hold to Buy with target raised from $180 to $210
 * - MOCK_PAPER_PORTFOLIO (const) - Paper trading portfolio with $100K starting capital, 60% win rate, 1.5 Sharpe ratio, and 10% max position size
 * - MOCK_USER_WITH_WATCHLIST (const) - Pro tier user with watchlist (AAPL, MSFT), sector watchlist (Technology), and immediate filing/analyst alerts
 * - MOCK_FMP_PROFILE (const) - FMP API company profile response with price, market cap, beta, and analyst target
 * - MOCK_FMP_PROFILE_NO_DATA (const) - Null response representing missing FMP data for error handling tests
 * - MOCK_FMP_HISTORICAL_PRICES (const) - Two days of historical OHLCV price data from FMP API
 * - MOCK_FMP_SPX_HISTORICAL (const) - Two days of S&P 500 index historical prices for benchmark comparison
 * - MOCK_FMP_UPGRADES_DOWNGRADES (const) - Array of analyst rating changes with Goldman upgrade and Morgan Stanley reiteration
 * - MOCK_FMP_ANALYST_RECOMMENDATION (const) - FMP analyst rating distribution with 10 strong buy, 15 buy, 10 hold, 2 sell, 1 strong sell
 * - MOCK_FMP_EARNINGS (const) - Apple earnings with actual EPS $1.56 beating estimate $1.50, revenue $94.93B vs $94.2B estimate
 * - MOCK_MACRO_INDICATORS (const) - Macro economic indicators including S&P 500 returns, VIX 14.5, Fed funds 5.25%, inverted yield curve -0.30%
 *
 * PATTERNS:
 * - Import specific fixtures in test files with destructuring: import { MOCK_COMPANY_AAPL_FULL, MOCK_FILING_RECENT } from './__tests__/fixtures/cron-data'
 * - Use MOCK_CRON_JOB_RUN_* variants to test different cron execution states (success, running/stuck, failed)
 * - Combine MOCK_RSS_FILING with MOCK_COMPANY_AAPL_FULL to test complete filing ingestion pipelines
 * - Use MOCK_YAHOO_QUOTE_SUMMARY for testing Yahoo Finance API integration with nested price, summaryDetail, and upgrade/downgrade history objects
 * - Reference MOCK_USER_WITH_WATCHLIST.alerts and .watchlist arrays for testing notification and tracking features
 *
 * CLAUDE NOTES:
 * - MOCK_CRON_JOB_RUN_RUNNING simulates stuck job with Date.now() - 15 minutes for testing timeout detection
 * - BigInt used for volume fields (volume, averageVolume) matching database schema requirements for large integers
 * - MOCK_FILING_RECENT includes nested company object enabling tests of relational queries without separate joins
 * - Yahoo Finance mock structures nested objects (price, summaryDetail, financialData) matching actual API response shape for accurate integration testing
 * - MOCK_FMP_UPGRADES_DOWNGRADES uses Date.now() - days calculation for relative timestamps, ensuring recent data in tests regardless of when run
 */
// Shared mock data for cron/pipeline integration tests

export const MOCK_CRON_JOB_RUN_SUCCESS = {
  id: 'cron-run-001',
  jobName: 'daily-filings-rss',
  status: 'success',
  startedAt: new Date('2024-12-01T10:00:00Z'),
  completedAt: new Date('2024-12-01T10:05:00Z'),
  filingsFetched: 25,
  filingsStored: 20,
  companiesProcessed: 15,
  errorMessage: null,
};

export const MOCK_CRON_JOB_RUN_RUNNING = {
  id: 'cron-run-002',
  jobName: 'daily-filings-rss',
  status: 'running',
  startedAt: new Date(Date.now() - 15 * 60 * 1000), // 15 min ago (stuck)
  completedAt: null,
  filingsFetched: 0,
  filingsStored: 0,
  companiesProcessed: 0,
  errorMessage: null,
};

export const MOCK_CRON_JOB_RUN_FAILED = {
  id: 'cron-run-003',
  jobName: 'daily-filings-rss',
  status: 'failed',
  startedAt: new Date('2024-12-01T10:00:00Z'),
  completedAt: new Date('2024-12-01T10:01:00Z'),
  filingsFetched: 0,
  filingsStored: 0,
  companiesProcessed: 0,
  errorMessage: 'Connection timeout',
};

export const MOCK_RSS_FILING = {
  ticker: 'AAPL',
  cik: '0000320193',
  companyName: 'Apple Inc.',
  accessionNumber: '0001193125-24-050001',
  formType: '10-K',
  filingDate: '2024-12-01',
  reportDate: '2024-09-30',
  filingUrl: 'https://www.sec.gov/Archives/edgar/data/320193/000119312524050001.txt',
};

export const MOCK_RSS_FILING_2 = {
  ticker: 'MSFT',
  cik: '0000789019',
  companyName: 'Microsoft Corporation',
  accessionNumber: '0001193125-24-050002',
  formType: '10-Q',
  filingDate: '2024-12-01',
  reportDate: '2024-09-30',
  filingUrl: 'https://www.sec.gov/Archives/edgar/data/789019/000119312524050002.txt',
};

export const MOCK_COMPANY_AAPL_FULL = {
  id: 'company-001',
  ticker: 'AAPL',
  name: 'Apple Inc.',
  cik: '0000320193',
  sector: 'Technology',
  industry: 'Consumer Electronics',
  currentPrice: 195.0,
  fiftyTwoWeekHigh: 199.62,
  fiftyTwoWeekLow: 164.08,
  marketCap: 3_000_000_000_000,
  analystTargetPrice: 210.0,
  peRatio: 31.5,
  forwardPE: 28.2,
  dividendYield: 0.005,
  beta: 1.2,
  volume: BigInt(55000000),
  averageVolume: BigInt(60000000),
  analystRating: 2.1,
  analystRatingCount: 38,
  yahooLastUpdated: new Date('2024-12-01'),
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-12-01'),
};

export const MOCK_COMPANY_MSFT_FULL = {
  id: 'company-002',
  ticker: 'MSFT',
  name: 'Microsoft Corporation',
  cik: '0000789019',
  sector: 'Technology',
  industry: 'Software',
  currentPrice: 380.0,
  fiftyTwoWeekHigh: 420.0,
  fiftyTwoWeekLow: 310.0,
  marketCap: 2_800_000_000_000,
  analystTargetPrice: 410.0,
  peRatio: 35.0,
  forwardPE: 30.0,
  dividendYield: 0.008,
  beta: 0.9,
  volume: BigInt(25000000),
  averageVolume: BigInt(28000000),
  analystRating: 1.8,
  analystRatingCount: 42,
  yahooLastUpdated: new Date('2024-12-01'),
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-12-01'),
};

export const MOCK_FILING_RECENT = {
  id: 'filing-100',
  companyId: 'company-001',
  cik: '0000320193',
  accessionNumber: '0001193125-24-050001',
  filingType: '10-K',
  filingDate: new Date('2024-12-01'),
  reportDate: new Date('2024-09-30'),
  filingUrl: 'https://www.sec.gov/test',
  analysisData: JSON.stringify({
    summary: 'Apple quarterly results show revenue growth',
    filingContentSummary: 'Revenue increased 8% year-over-year',
  }),
  aiSummary: 'Revenue growth continues',
  riskScore: 3.5,
  sentimentScore: 0.2,
  concernLevel: 4.5,
  predicted7dReturn: null,
  predicted30dReturn: null,
  predicted30dAlpha: null,
  predictionConfidence: null,
  actual7dReturn: null,
  actual30dReturn: null,
  actual7dAlpha: null,
  actual30dAlpha: null,
  consensusEPS: null,
  actualEPS: null,
  epsSurprise: null,
  consensusRevenue: null,
  actualRevenue: null,
  revenueSurprise: null,
  createdAt: new Date('2024-12-01'),
  updatedAt: new Date('2024-12-01'),
  company: {
    id: 'company-001',
    ticker: 'AAPL',
    name: 'Apple Inc.',
    sector: 'Technology',
  },
};

export const MOCK_FILING_8K_EARNINGS = {
  ...MOCK_FILING_RECENT,
  id: 'filing-101',
  filingType: '8-K',
  accessionNumber: '0001193125-24-050010',
  analysisData: JSON.stringify({
    filingContentSummary: 'Quarterly earnings results: net income up, EPS beats estimates',
  }),
};

export const MOCK_YAHOO_FINANCIALS = {
  marketCap: 3_000_000_000_000,
  peRatio: 31.5,
  forwardPE: 28.2,
  currentPrice: 195.0,
  fiftyTwoWeekHigh: 199.62,
  fiftyTwoWeekLow: 164.08,
  analystTargetPrice: 210.0,
  earningsDate: new Date('2025-01-25'),
  dividendYield: 0.5,
  beta: 1.2,
  volume: 55000000,
  averageVolume: 60000000,
  analystRatingCount: 38,
  epsActual: 1.56,
  epsEstimateCurrentQ: 1.60,
  epsEstimateNextQ: 1.65,
  epsEstimateCurrentY: 6.50,
  epsEstimateNextY: 7.10,
  additionalData: { sector: 'Technology' },
};

export const MOCK_YAHOO_QUOTE_SUMMARY = {
  price: {
    regularMarketPrice: 195.0,
    marketCap: 3_000_000_000_000,
    regularMarketVolume: 55000000,
    regularMarketChangePercent: 1.25,
  },
  summaryDetail: {
    trailingPE: 31.5,
    forwardPE: 28.2,
    beta: 1.2,
    dividendYield: 0.005,
    fiftyTwoWeekHigh: 199.62,
    fiftyTwoWeekLow: 164.08,
    averageVolume: 60000000,
  },
  financialData: {
    targetMeanPrice: 210.0,
    currentPrice: 195.0,
    numberOfAnalystOpinions: 38,
  },
  recommendationTrend: {
    trend: [
      { strongBuy: 10, buy: 15, hold: 10, sell: 2, strongSell: 1 },
    ],
  },
  upgradeDowngradeHistory: {
    history: [
      {
        epochGradeDate: new Date('2024-11-20').getTime() / 1000,
        firm: 'Goldman Sachs',
        toGrade: 'Buy',
        fromGrade: 'Hold',
        action: 'upgrade',
      },
      {
        epochGradeDate: new Date('2024-11-25').getTime() / 1000,
        firm: 'Morgan Stanley',
        toGrade: 'Overweight',
        fromGrade: 'Overweight',
        action: 'main',
      },
    ],
  },
  earningsHistory: {
    history: [
      {
        quarter: { fmt: '3Q2024' },
        epsEstimate: { raw: 1.50 },
        epsActual: { raw: 1.56 },
        surprisePercent: { raw: 0.04 },
      },
    ],
  },
};

export const MOCK_ANALYST_ACTIVITY = {
  id: 'analyst-001',
  companyId: 'company-001',
  activityDate: new Date('2024-12-01T10:00:00Z'),
  firm: 'Goldman Sachs',
  actionType: 'upgrade',
  previousRating: 'Hold',
  newRating: 'Buy',
  previousTarget: 180.0,
  newTarget: 210.0,
  analystName: 'John Smith',
  note: null,
  source: 'yahoo',
  createdAt: new Date('2024-12-01'),
  company: {
    ticker: 'AAPL',
    name: 'Apple Inc.',
  },
};

export const MOCK_PAPER_PORTFOLIO = {
  id: 'portfolio-001',
  name: 'Main Portfolio',
  startingCapital: 100000,
  currentCash: 85000,
  totalValue: 102000,
  totalReturn: 2.0,
  winRate: 60.0,
  sharpeRatio: 1.5,
  maxDrawdown: -3.0,
  totalTrades: 10,
  winningTrades: 6,
  losingTrades: 4,
  maxPositionSize: 0.10,
  minConfidence: 0.60,
  isActive: true,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-12-01'),
};

export const MOCK_USER_WITH_WATCHLIST = {
  id: 'user-001',
  email: 'trader@example.com',
  name: 'Test Trader',
  tier: 'pro',
  apiKey: null,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-12-01'),
  alerts: [
    {
      id: 'alert-001',
      userId: 'user-001',
      alertType: 'new_filing',
      ticker: null,
      sector: null,
      enabled: true,
      frequency: 'immediate',
      deliveryTime: 'both',
      minConcernLevel: null,
      minPredictedReturn: null,
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
    },
    {
      id: 'alert-002',
      userId: 'user-001',
      alertType: 'analyst_change',
      ticker: null,
      sector: null,
      enabled: true,
      frequency: 'immediate',
      deliveryTime: 'both',
      minConcernLevel: null,
      minPredictedReturn: null,
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
    },
  ],
  watchlist: [
    { id: 'watch-001', userId: 'user-001', ticker: 'AAPL', createdAt: new Date() },
    { id: 'watch-002', userId: 'user-001', ticker: 'MSFT', createdAt: new Date() },
  ],
  sectorWatchlist: [
    { id: 'sector-001', userId: 'user-001', sector: 'Technology', createdAt: new Date() },
  ],
};

// Yahoo Finance API mock responses
export const MOCK_YAHOO_QUOTE = {
  symbol: 'AAPL',
  shortName: 'Apple Inc.',
  quoteType: 'EQUITY' as const,
  regularMarketPrice: 195.0,
  marketCap: 3_000_000_000_000,
  trailingPE: 31.5,
  beta: 1.2,
  dividendYield: 0.5, // Yahoo returns percentage (0.5 = 0.5%)
  fiftyTwoWeekHigh: 199.62,
  fiftyTwoWeekLow: 164.08,
  regularMarketVolume: 55000000,
  averageDailyVolume10Day: 60000000,
  language: 'en-US',
  region: 'US',
  triggerable: true,
  marketState: 'REGULAR' as const,
  tradeable: true,
  exchange: 'NMS',
  exchangeTimezoneName: 'America/New_York',
  exchangeTimezoneShortName: 'EST',
  gmtOffSetMilliseconds: -18000000,
  market: 'us_market',
  esgPopulated: false,
  sourceInterval: 15,
  exchangeDataDelayedBy: 0,
  fullExchangeName: 'NasdaqGS',
};

export const MOCK_YAHOO_QUOTE_SUMMARY_FINANCIAL_DATA = {
  financialData: {
    targetMeanPrice: 210.0,
    currentPrice: 195.0,
    numberOfAnalystOpinions: 38,
    recommendationKey: 'buy',
  },
};

// FMP API mock responses (legacy, used by other tests)
export const MOCK_FMP_PROFILE = {
  symbol: 'AAPL',
  companyName: 'Apple Inc.',
  price: 195.0,
  mktCap: 3_000_000_000_000,
  beta: 1.2,
  volAvg: 60000000,
  volume: 55000000,
  lastDiv: 0.975,
  range: '164.08-199.62',
  sector: 'Technology',
  industry: 'Consumer Electronics',
  exchangeShortName: 'NASDAQ',
  currency: 'USD',
  pe: 31.5,
  targetMeanPrice: 210.0,
  dividendYield: 0.005,
  previousClose: 194.0,
};

export const MOCK_FMP_PROFILE_NO_DATA = null;

export const MOCK_FMP_HISTORICAL_PRICES = [
  { date: '2025-09-02', open: 30.5, high: 32, low: 30, close: 31, volume: 1100000 },
  { date: '2025-09-01', open: 29.5, high: 31, low: 29, close: 30, volume: 1000000 },
];

export const MOCK_FMP_SPX_HISTORICAL = [
  { date: '2025-09-02', open: 5530, high: 5560, low: 5530, close: 5550, volume: 3100000000 },
  { date: '2025-09-01', open: 5480, high: 5520, low: 5480, close: 5500, volume: 3000000000 },
];

export const MOCK_FMP_UPGRADES_DOWNGRADES = [
  {
    symbol: 'AAPL',
    publishedDate: new Date(Date.now() - 5 * 86400000).toISOString(),
    newsURL: 'https://example.com/news1',
    newsTitle: 'Goldman Sachs upgrades Apple',
    newsBaseURL: 'example.com',
    newsPublisher: 'Bloomberg',
    newGrade: 'Buy',
    previousGrade: 'Hold',
    gradingCompany: 'Goldman Sachs',
    action: 'upgrade',
    priceWhenPosted: 190.0,
  },
  {
    symbol: 'AAPL',
    publishedDate: new Date(Date.now() - 3 * 86400000).toISOString(),
    newsURL: 'https://example.com/news2',
    newsTitle: 'Morgan Stanley reiterates Overweight',
    newsBaseURL: 'example.com',
    newsPublisher: 'Reuters',
    newGrade: 'Overweight',
    previousGrade: 'Overweight',
    gradingCompany: 'Morgan Stanley',
    action: 'reiterated',
    priceWhenPosted: 192.0,
  },
];

export const MOCK_FMP_ANALYST_RECOMMENDATION = {
  symbol: 'AAPL',
  date: '2024-12-01',
  analystRatingsStrongBuy: 10,
  analystRatingsbuy: 15,
  analystRatingsHold: 10,
  analystRatingsSell: 2,
  analystRatingsStrongSell: 1,
};

export const MOCK_FMP_EARNINGS = [
  {
    symbol: 'AAPL',
    date: '2024-10-31',
    epsActual: 1.56,
    epsEstimated: 1.50,
    revenueActual: 94_930_000_000,
    revenueEstimated: 94_200_000_000,
  },
];

export const MOCK_MACRO_INDICATORS = {
  id: 'macro-001',
  date: new Date('2024-12-01'),
  spxClose: 5000.0,
  spxReturn7d: 1.5,
  spxReturn14d: 2.0,
  spxReturn21d: 3.0,
  spxReturn30d: 4.0,
  vixClose: 14.5,
  vixMA30: 15.0,
  fedFundsRate: 5.25,
  treasury3m: 5.30,
  treasury2y: 4.50,
  treasury10y: 4.20,
  yieldCurve2y10y: -0.30,
  fedFundsChange30d: 0,
  treasury10yChange30d: -0.10,
  techSectorReturn30d: 5.0,
  financialSectorReturn30d: 2.0,
  energySectorReturn30d: -1.0,
  healthcareSectorReturn30d: 1.5,
  createdAt: new Date('2024-12-01'),
};
