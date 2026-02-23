/**
 * @module backfill-all-data
 * @description Local backfill script for stock prices, macro indicators, and analyst data
 *
 * PURPOSE:
 * This script performs comprehensive data backfilling for the SEC Filing Analyzer,
 * matching the Vercel cron job's data pipeline exactly. It fetches and stores:
 * - Stock prices and fundamental metrics via Yahoo Finance API
 * - Macro economic indicators via Yahoo Finance v8 chart API
 * - Treasury rates and Fed funds rate via FRED API
 * - Analyst ratings, consensus data, and earnings surprises
 *
 * All data is sourced from free, unlimited APIs (Yahoo Finance + FRED).
 * The script prioritizes updating the oldest data first and supports selective
 * execution via CLI flags for efficient partial updates.
 *
 * EXPORTS:
 * - backfillStockPrices: Updates company stock prices and enriched metrics
 * - backfillMacroIndicators: Fetches S&P 500, VIX, sector returns, and treasury rates
 * - backfillAnalystData: Enriches recent filings with analyst consensus and earnings data
 * - main: Orchestrates all backfill operations based on CLI flags
 *
 * CLAUDE NOTES:
 * - Uses Yahoo Finance v2 library for quote/quoteSummary (unlimited free tier)
 * - Yahoo v8 raw HTTP API used for historical macro charts (rate limited to 300ms)
 * - FRED API requires FRED_API_KEY env var (free, 100ms rate limit enforced)
 * - Updates oldest data first (yahooLastUpdated ASC) to maintain freshness
 * - Analyst data only processes financial filings (10-K, 10-Q, earnings 8-Ks)
 * - Major analyst firms are weighted higher (Goldman, JPMorgan, Morgan Stanley, etc.)
 * - EPS/revenue surprise calculated from closest earnings period within 90 days
 * - Consensus score normalized to 0-100 scale (100 = unanimous Strong Buy)
 * - Treasury rates use forward-fill logic (up to 5 days back for weekends/holidays)
 * - CLI flags: --skip-prices, --skip-macro, --skip-analyst, --max-prices=N
 */

#!/usr/bin/env npx tsx
/**
 * Local backfill script — matches Vercel cron data exactly.
 *
 * All data fetched via Yahoo Finance API (unlimited, free).
 * Macro indicators use Yahoo Finance v8 raw API + FRED for treasury rates.
 *
 * Usage:
 *   npx tsx scripts/backfill-all-data.ts                  # Run all
 *   npx tsx scripts/backfill-all-data.ts --skip-prices     # Skip stock prices
 *   npx tsx scripts/backfill-all-data.ts --skip-macro      # Skip macro indicators
 *   npx tsx scripts/backfill-all-data.ts --skip-analyst    # Skip analyst data
 *   npx tsx scripts/backfill-all-data.ts --max-prices=100  # Limit price updates (default 828)
 */

import { PrismaClient } from '@prisma/client';
import YahooFinance from 'yahoo-finance2';

const prisma = new PrismaClient(); // Also loads .env via dotenv
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

// ─── CLI ARGS ──────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const skipPrices = args.includes('--skip-prices');
const skipMacro = args.includes('--skip-macro');
const skipAnalyst = args.includes('--skip-analyst');
const maxPricesArg = args.find(a => a.startsWith('--max-prices='));
const maxPrices = maxPricesArg ? parseInt(maxPricesArg.split('=')[1]) : 828;

// ─── SHARED UTILS ──────────────────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── YAHOO V8 RAW (for macro indicators — chart API with raw HTTP) ───────

const YAHOO_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';
const YAHOO_BASE = 'https://query1.finance.yahoo.com/v8/finance';

async function yahooFetch(url: string, retries = 2): Promise<any> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': YAHOO_UA } });
      if (res.status === 429) {
        console.log('  Rate limited, waiting 5s...');
        await sleep(5000);
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e: any) {
      if (attempt === retries) throw e;
      await sleep(2000);
    }
  }
}

// ─── STOCK PRICES (Yahoo Finance quote + quoteSummary) ───────────────────

async function backfillStockPrices() {
  console.log('\n═══ STOCK PRICES (Yahoo Finance) ═══');

  // Fetch companies ordered by oldest update first
  const companies = await prisma.company.findMany({
    orderBy: { yahooLastUpdated: 'asc' },
    select: { id: true, ticker: true, yahooLastUpdated: true },
  });

  const batch = companies.slice(0, maxPrices);
  console.log(`Found ${companies.length} companies, updating ${batch.length} (oldest first, --max-prices=${maxPrices})`);

  if (batch.length > 0 && batch[0].yahooLastUpdated) {
    console.log(`  Oldest update: ${batch[0].ticker} @ ${batch[0].yahooLastUpdated.toISOString()}`);
  }

  let updated = 0, errors = 0, skipped = 0;

  for (let i = 0; i < batch.length; i++) {
    const c = batch[i];
    try {
      if ((i + 1) % 50 === 0) {
        console.log(`  Progress: ${i + 1}/${batch.length} (${updated} updated, ${errors} errors, ${skipped} skipped)`);
      }

      // Fetch quote data from Yahoo Finance
      const quote = await yahooFinance.quote(c.ticker);

      if (!quote || quote.regularMarketPrice == null) {
        skipped++;
        continue;
      }

      // Fetch enriched metrics from quoteSummary
      let enrichedData: Record<string, any> = {
        analystTargetPrice: null,
        revenueGrowth: null,
        earningsGrowth: null,
        grossMargins: null,
        operatingMargins: null,
        profitMargins: null,
        freeCashflow: null,
        pegRatio: null,
        shortRatio: null,
        shortPercentOfFloat: null,
        enterpriseToRevenue: null,
        enterpriseToEbitda: null,
      };
      try {
        const summary = await yahooFinance.quoteSummary(c.ticker, {
          modules: ['financialData', 'defaultKeyStatistics'],
        });
        enrichedData = {
          analystTargetPrice: summary.financialData?.targetMeanPrice ?? null,
          revenueGrowth: summary.financialData?.revenueGrowth ?? null,
          earningsGrowth: summary.financialData?.earningsGrowth ?? null,
          grossMargins: summary.financialData?.grossMargins ?? null,
          operatingMargins: summary.financialData?.operatingMargins ?? null,
          profitMargins: summary.financialData?.profitMargins ?? null,
          freeCashflow: summary.financialData?.freeCashflow ?? null,
          pegRatio: summary.defaultKeyStatistics?.pegRatio ?? null,
          shortRatio: summary.defaultKeyStatistics?.shortRatio ?? null,
          shortPercentOfFloat: summary.defaultKeyStatistics?.shortPercentOfFloat ?? null,
          enterpriseToRevenue: summary.defaultKeyStatistics?.enterpriseToRevenue ?? null,
          enterpriseToEbitda: summary.defaultKeyStatistics?.enterpriseToEbitda ?? null,
        };
      } catch {
        // Skip if quoteSummary fails — enriched fields will remain null
      }

      await prisma.company.update({
        where: { id: c.id },
        data: {
          currentPrice: quote.regularMarketPrice ?? null,
          marketCap: quote.marketCap ?? null,
          peRatio: quote.trailingPE ?? null,
          beta: (quote as any).beta ?? null,
          dividendYield: ('dividendYield' in quote && (quote as any).dividendYield != null)
            ? (quote as any).dividendYield / 100
            : null,
          fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh ?? null,
          fiftyTwoWeekLow: quote.fiftyTwoWeekLow ?? null,
          fiftyDayAverage: (quote as any).fiftyDayAverage ?? null,
          twoHundredDayAverage: (quote as any).twoHundredDayAverage ?? null,
          volume: quote.regularMarketVolume ? BigInt(quote.regularMarketVolume) : null,
          averageVolume: quote.averageDailyVolume10Day ? BigInt(quote.averageDailyVolume10Day) : null,
          ...enrichedData,
          yahooLastUpdated: new Date(),
        },
      });
      updated++;

      // Small polite delay between requests
      await sleep(50);

    } catch (e: any) {
      errors++;
      if (!e.message?.includes('Not Found') && !e.message?.includes('404')) {
        console.error(`  Error ${c.ticker}: ${e.message}`);
      }
    }
  }
  console.log(`Stock prices done: ${updated} updated, ${errors} errors, ${skipped} skipped`);
}

// ─── FRED API (for treasury rates) ──────────────────────────────────────────

const FRED_BASE_URL = 'https://api.stlouisfed.org/fred/series/observations';
const FRED_RATE_LIMIT_MS = 100;
let fredLastRequest = 0;

const FRED_SERIES = {
  fedFundsRate: 'DFF',
  treasury3m: 'DGS3MO',
  treasury2y: 'DGS2',
  treasury10y: 'DGS10',
} as const;

async function fredFetchSeries(seriesId: string, startDate: string, endDate: string): Promise<Array<{ date: string; value: number }>> {
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) return [];

  const elapsed = Date.now() - fredLastRequest;
  if (elapsed < FRED_RATE_LIMIT_MS) await sleep(FRED_RATE_LIMIT_MS - elapsed);
  fredLastRequest = Date.now();

  const url = new URL(FRED_BASE_URL);
  url.searchParams.set('series_id', seriesId);
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('file_type', 'json');
  url.searchParams.set('observation_start', startDate);
  url.searchParams.set('observation_end', endDate);

  try {
    const res = await fetch(url.toString());
    if (!res.ok) {
      console.error(`  [FRED] HTTP ${res.status} for ${seriesId}`);
      return [];
    }
    const data = await res.json();
    const results: Array<{ date: string; value: number }> = [];
    for (const obs of data.observations || []) {
      if (obs.value && obs.value !== '.') {
        const val = parseFloat(obs.value);
        if (!isNaN(val)) results.push({ date: obs.date, value: val });
      }
    }
    return results;
  } catch (e: any) {
    console.error(`  [FRED] Error fetching ${seriesId}: ${e.message}`);
    return [];
  }
}

function buildFredMap(obs: Array<{ date: string; value: number }>): Map<string, number> {
  const map = new Map<string, number>();
  for (const o of obs) map.set(o.date, o.value);
  return map;
}

function findFredValue(map: Map<string, number>, dateStr: string): number | null {
  if (map.has(dateStr)) return map.get(dateStr)!;
  const d = new Date(dateStr);
  for (let i = 1; i <= 5; i++) {
    d.setDate(d.getDate() - 1);
    const key = d.toISOString().split('T')[0];
    if (map.has(key)) return map.get(key)!;
  }
  return null;
}

// ─── MACRO INDICATORS (Yahoo v8 + FRED) ──────────────────────────────────

async function backfillMacroIndicators() {
  console.log('\n═══ MACRO INDICATORS (Yahoo v8 + FRED) ═══');

  const lastReal = await prisma.macroIndicators.findFirst({
    where: { spxClose: { not: null } },
    orderBy: { date: 'desc' },
    select: { date: true },
  });
  const startDate = lastReal
    ? new Date(lastReal.date.getTime() + 86400000)
    : new Date('2025-12-12');

  const endDate = new Date();
  console.log(`Backfilling from ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`);

  const period1 = Math.floor(new Date(startDate.getTime() - 45 * 86400000).getTime() / 1000);
  const period2 = Math.floor(endDate.getTime() / 1000);

  const tickers = ['SPY', '^VIX', 'XLK', 'XLF', 'XLE', 'XLV'];
  const historicalData: Record<string, Array<{ date: string; close: number }>> = {};

  for (const ticker of tickers) {
    try {
      const url = `${YAHOO_BASE}/chart/${ticker}?period1=${period1}&period2=${period2}&interval=1d`;
      const data = await yahooFetch(url);
      const result = data?.chart?.result?.[0];
      if (!result?.timestamp) { console.log(`  No data for ${ticker}`); continue; }

      const ts = result.timestamp;
      const closes = result.indicators.quote[0].close;
      historicalData[ticker] = [];
      for (let i = 0; i < ts.length; i++) {
        if (closes[i] != null) {
          historicalData[ticker].push({
            date: new Date(ts[i] * 1000).toISOString().split('T')[0],
            close: closes[i],
          });
        }
      }
      console.log(`  ${ticker}: ${historicalData[ticker].length} data points`);
      await sleep(300);
    } catch (e: any) {
      console.error(`  Error fetching ${ticker}: ${e.message}`);
    }
  }

  function findClose(data: Array<{ date: string; close: number }>, dateStr: string): number | null {
    for (let i = data.length - 1; i >= 0; i--) {
      if (data[i].date <= dateStr) return data[i].close;
    }
    return null;
  }

  function calcReturn(data: Array<{ date: string; close: number }>, dateStr: string, daysBack: number): number | null {
    const current = findClose(data, dateStr);
    const targetDate = new Date(dateStr);
    targetDate.setDate(targetDate.getDate() - daysBack);
    const past = findClose(data, targetDate.toISOString().split('T')[0]);
    if (current == null || past == null) return null;
    return ((current - past) / past) * 100;
  }

  function vixMA30(vixData: Array<{ date: string; close: number }>, dateStr: string): number | null {
    const filtered = vixData.filter(d => d.date <= dateStr).slice(-30);
    if (filtered.length < 20) return null;
    return filtered.reduce((sum, d) => sum + d.close, 0) / filtered.length;
  }

  // Fetch FRED treasury rates for the same date range
  const fredStartStr = new Date(startDate.getTime() - 45 * 86400000).toISOString().split('T')[0];
  const fredEndStr = endDate.toISOString().split('T')[0];

  let ffMap = new Map<string, number>();
  let t3mMap = new Map<string, number>();
  let t2yMap = new Map<string, number>();
  let t10yMap = new Map<string, number>();

  if (process.env.FRED_API_KEY) {
    console.log('  Fetching FRED treasury rates...');
    const [ffObs, t3mObs, t2yObs, t10yObs] = await Promise.all([
      fredFetchSeries(FRED_SERIES.fedFundsRate, fredStartStr, fredEndStr),
      fredFetchSeries(FRED_SERIES.treasury3m, fredStartStr, fredEndStr),
      fredFetchSeries(FRED_SERIES.treasury2y, fredStartStr, fredEndStr),
      fredFetchSeries(FRED_SERIES.treasury10y, fredStartStr, fredEndStr),
    ]);
    ffMap = buildFredMap(ffObs);
    t3mMap = buildFredMap(t3mObs);
    t2yMap = buildFredMap(t2yObs);
    t10yMap = buildFredMap(t10yObs);
    console.log(`  FRED data: FF=${ffObs.length}, 3M=${t3mObs.length}, 2Y=${t2yObs.length}, 10Y=${t10yObs.length} observations`);
  } else {
    console.log('  No FRED_API_KEY — treasury rates will be null');
  }

  const spyData = historicalData['SPY'] || [];
  const spyDates = new Set(spyData.map(d => d.date));
  const vixData = historicalData['^VIX'] || [];

  let stored = 0;
  for (const dateStr of spyDates) {
    if (dateStr < startDate.toISOString().split('T')[0]) continue;

    const dbDate = new Date(dateStr + 'T00:00:00.000Z');
    const spxClose = findClose(spyData, dateStr);
    const vixClose = findClose(vixData, dateStr);

    // Treasury rates from FRED
    const fedFundsRate = findFredValue(ffMap, dateStr);
    const treasury3m = findFredValue(t3mMap, dateStr);
    const treasury2y = findFredValue(t2yMap, dateStr);
    const treasury10y = findFredValue(t10yMap, dateStr);
    const yieldCurve2y10y = treasury10y !== null && treasury2y !== null
      ? Math.round((treasury10y - treasury2y) * 1000) / 1000
      : null;

    // 10Y change over 30 days
    const thirtyDaysAgoDate = new Date(dateStr);
    thirtyDaysAgoDate.setDate(thirtyDaysAgoDate.getDate() - 30);
    const t10y30dAgo = findFredValue(t10yMap, thirtyDaysAgoDate.toISOString().split('T')[0]);
    const treasury10yChange30d = treasury10y !== null && t10y30dAgo !== null
      ? Math.round((treasury10y - t10y30dAgo) * 1000) / 1000
      : null;

    const macroData = {
      spxClose,
      spxReturn7d: calcReturn(spyData, dateStr, 7),
      spxReturn14d: calcReturn(spyData, dateStr, 14),
      spxReturn21d: calcReturn(spyData, dateStr, 21),
      spxReturn30d: calcReturn(spyData, dateStr, 30),
      vixClose,
      vixMA30: vixMA30(vixData, dateStr),
      fedFundsRate,
      treasury3m,
      treasury2y,
      treasury10y,
      yieldCurve2y10y,
      treasury10yChange30d,
      techSectorReturn30d: calcReturn(historicalData['XLK'] || [], dateStr, 30),
      financialSectorReturn30d: calcReturn(historicalData['XLF'] || [], dateStr, 30),
      energySectorReturn30d: calcReturn(historicalData['XLE'] || [], dateStr, 30),
      healthcareSectorReturn30d: calcReturn(historicalData['XLV'] || [], dateStr, 30),
    };

    await prisma.macroIndicators.upsert({
      where: { date: dbDate },
      update: macroData,
      create: { date: dbDate, ...macroData },
    });
    stored++;
  }
  console.log(`Macro indicators done: ${stored} days stored`);
}

// ─── ANALYST DATA (Yahoo Finance — matches Vercel cron exactly) ──────────

// Major firms whose ratings carry more weight
const majorFirms = new Set([
  'Goldman Sachs', 'Morgan Stanley', 'JPMorgan', 'Bank of America',
  'Citigroup', 'Wells Fargo', 'Barclays', 'Credit Suisse', 'UBS',
  'Deutsche Bank', 'BofA Securities', 'Jefferies', 'Piper Sandler',
  'Raymond James', 'RBC Capital', 'Stifel', 'Evercore ISI'
]);

const ratingValue: Record<string, number> = {
  'Strong Buy': 5, 'Buy': 4, 'Outperform': 4, 'Overweight': 4, 'Accumulate': 4,
  'Hold': 3, 'Neutral': 3, 'Market Perform': 3, 'Peer Perform': 3, 'Equal Weight': 3,
  'Underperform': 2, 'Underweight': 2, 'Sell': 1, 'Strong Sell': 1, 'Reduce': 1,
};

function classifyAnalystEvent(fromGrade: string, toGrade: string): string {
  if (!fromGrade || fromGrade.trim() === '') return 'initiated';
  const fromVal = ratingValue[fromGrade] || 3;
  const toVal = ratingValue[toGrade] || 3;
  if (toVal > fromVal) return 'upgrade';
  if (toVal < fromVal) return 'downgrade';
  return 'reiterated';
}

function isMajorFirm(firm: string): boolean {
  return majorFirms.has(firm) ||
    majorFirms.has(firm.replace(' Securities', '')) ||
    majorFirms.has(firm.replace(' Capital Markets', ''));
}

function getAnalystActivity(events: any[], filingDate: Date) {
  const thirtyDaysBefore = new Date(filingDate);
  thirtyDaysBefore.setDate(thirtyDaysBefore.getDate() - 30);

  const recentEvents = events.filter((e) => {
    const dateField = e.epochGradeDate || e.publishedDate;
    if (!dateField) return false;
    const d = new Date(dateField);
    return d >= thirtyDaysBefore && d <= filingDate;
  });

  let upgrades = 0, downgrades = 0, majorUpgrades = 0, majorDowngrades = 0;
  for (const event of recentEvents) {
    const from = event.fromGrade || event.previousGrade || '';
    const to = event.toGrade || event.newGrade || '';
    const action = classifyAnalystEvent(from, to);
    const firm = event.firm || event.gradingCompany || '';
    const isMajor = isMajorFirm(firm);
    if (action === 'upgrade') { upgrades++; if (isMajor) majorUpgrades++; }
    else if (action === 'downgrade') { downgrades++; if (isMajor) majorDowngrades++; }
  }

  return {
    upgradesLast30d: upgrades,
    downgradesLast30d: downgrades,
    netUpgrades: upgrades - downgrades,
    majorUpgrades,
    majorDowngrades,
  };
}

async function backfillAnalystData() {
  console.log('\n═══ ANALYST DATA (Yahoo Finance) ═══');

  // Find recent filings with analysisData (same scope as Vercel cron)
  const fourteenDaysAgo = new Date();
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

  // Keywords to identify earnings 8-Ks
  const earningsKeywords = [
    'earnings', 'quarterly results', 'financial results',
    'q1 20', 'q2 20', 'q3 20', 'q4 20',
    'first quarter', 'second quarter', 'third quarter', 'fourth quarter',
    'net income', 'revenue', 'eps', 'diluted earnings'
  ];

  const allFilings = await prisma.filing.findMany({
    where: {
      filingDate: { gte: fourteenDaysAgo },
      analysisData: { not: null },
      filingType: { in: ['10-K', '10-Q', '8-K'] },
    },
    include: { company: true },
    orderBy: { filingDate: 'desc' },
  });

  // Filter for financial filings (matching Vercel cron logic)
  const filings = allFilings.filter(filing => {
    if (filing.filingType === '10-K' || filing.filingType === '10-Q') return true;
    if (filing.filingType === '8-K' && filing.analysisData) {
      try {
        const data = JSON.parse(filing.analysisData as string);
        const summary = (data.filingContentSummary || data.summary || '').toLowerCase();
        return earningsKeywords.some(kw => summary.includes(kw));
      } catch {
        return false;
      }
    }
    return false;
  });

  console.log(`Found ${allFilings.length} total filings, ${filings.length} financial filings from past 14 days`);
  if (filings.length === 0) {
    console.log('No analyzed filings to process. Run filing analysis first.');
    return;
  }

  console.log(`  Processing ${filings.length} filings (1 Yahoo quoteSummary call per ticker)`);

  // Deduplicate tickers and fetch Yahoo data once per ticker
  const tickerSet = new Set(filings.map(f => f.company?.ticker).filter(Boolean) as string[]);
  const tickerData = new Map<string, any>();

  console.log(`  Fetching data for ${tickerSet.size} unique tickers...`);
  for (const ticker of tickerSet) {
    try {
      const summary = await yahooFinance.quoteSummary(ticker, {
        modules: [
          'financialData',
          'recommendationTrend',
          'upgradeDowngradeHistory',
          'earningsHistory',
          'earnings',
          'defaultKeyStatistics',
          'calendarEvents',
        ],
      });
      tickerData.set(ticker, summary);
      await sleep(50);
    } catch (e: any) {
      if (!e.message?.includes('Not Found') && !e.message?.includes('404')) {
        console.error(`  Error fetching ${ticker}: ${e.message}`);
      }
    }
  }
  console.log(`  Retrieved data for ${tickerData.size} tickers`);

  let updated = 0, errors = 0;

  for (let i = 0; i < filings.length; i++) {
    const filing = filings[i];
    const ticker = filing.company?.ticker;
    if (!ticker) continue;

    try {
      if ((i + 1) % 5 === 0) {
        console.log(`  Progress: ${i + 1}/${filings.length} (${updated} updated, ${errors} errors)`);
      }

      const summary = tickerData.get(ticker);
      if (!summary) continue;

      // Extract analyst activity from upgrade/downgrade history
      const upgradeEvents = summary.upgradeDowngradeHistory?.history ?? [];
      const activity = getAnalystActivity(upgradeEvents, filing.filingDate);

      // Calculate consensus score (0-100 scale, 100 = Strong Buy)
      let consensusScore = null;
      const trend = summary.recommendationTrend?.trend?.[0];
      if (trend) {
        const total = (trend.strongBuy || 0) +
                     (trend.buy || 0) +
                     (trend.hold || 0) +
                     (trend.sell || 0) +
                     (trend.strongSell || 0);
        if (total > 0) {
          consensusScore = Math.round(
            ((trend.strongBuy || 0) * 100 +
             (trend.buy || 0) * 75 +
             (trend.hold || 0) * 50 +
             (trend.sell || 0) * 25) / total
          );
        }
      }

      // Calculate upside potential
      let upsidePotential = null;
      const targetMeanPrice = summary.financialData?.targetMeanPrice;
      const currentPrice = summary.financialData?.currentPrice;
      if (targetMeanPrice && currentPrice) {
        upsidePotential = ((targetMeanPrice - currentPrice) / currentPrice) * 100;
      }

      // Extract earnings surprise data
      let consensusEPS: number | null = null;
      let actualEPS: number | null = null;
      let epsSurprise: 'beat' | 'miss' | 'inline' | 'unknown' = 'unknown';
      let epsSurpriseMagnitude: number | null = null;
      let revenueSurprise: 'beat' | 'miss' | 'inline' | 'unknown' = 'unknown';
      let revenueSurpriseMagnitude: number | null = null;

      try {
        const earningsHistory = summary.earningsHistory?.history;
        if (earningsHistory && earningsHistory.length > 0) {
          let closestEarnings: any = null;
          let smallestDiff = Infinity;
          const filingTime = filing.filingDate.getTime();

          for (const period of earningsHistory) {
            if (!period.quarter) continue;
            const earningsDate = new Date(period.quarter);
            const diff = Math.abs(earningsDate.getTime() - filingTime);
            if (diff < smallestDiff) {
              smallestDiff = diff;
              closestEarnings = period;
            }
          }

          const daysDiff = smallestDiff / (1000 * 60 * 60 * 24);
          if (closestEarnings && daysDiff <= 90) {
            if (typeof closestEarnings.epsEstimate === 'number') consensusEPS = closestEarnings.epsEstimate;
            if (typeof closestEarnings.epsActual === 'number') actualEPS = closestEarnings.epsActual;

            if (closestEarnings.epsActual != null && closestEarnings.epsEstimate != null && closestEarnings.epsEstimate !== 0) {
              epsSurpriseMagnitude = ((closestEarnings.epsActual - closestEarnings.epsEstimate) / Math.abs(closestEarnings.epsEstimate)) * 100;
              if (epsSurpriseMagnitude > 2) epsSurprise = 'beat';
              else if (epsSurpriseMagnitude < -2) epsSurprise = 'miss';
              else epsSurprise = 'inline';
            }
          }
        }
      } catch {
        // Silently handle — not all tickers have earnings data
      }

      // Merge analyst data into analysisData JSON
      let existingData: any = {};
      if (filing.analysisData) {
        try {
          existingData = typeof filing.analysisData === 'string'
            ? JSON.parse(filing.analysisData)
            : filing.analysisData;
        } catch {
          existingData = {};
        }
      }

      const numberOfAnalysts = trend
        ? (trend.strongBuy || 0) +
          (trend.buy || 0) +
          (trend.hold || 0) +
          (trend.sell || 0) +
          (trend.strongSell || 0)
        : null;

      const updatedAnalysisData = {
        ...existingData,
        analyst: {
          consensusScore,
          upsidePotential,
          numberOfAnalysts,
          targetPrice: summary.financialData?.targetMeanPrice ?? null,
          activity: {
            upgradesLast30d: activity.upgradesLast30d,
            downgradesLast30d: activity.downgradesLast30d,
            netUpgrades: activity.netUpgrades,
            majorUpgrades: activity.majorUpgrades,
            majorDowngrades: activity.majorDowngrades,
          },
          recommendationTrend: summary.recommendationTrend?.trend ?? null,
        },
        enrichedMetrics: {
          pegRatio: summary.defaultKeyStatistics?.pegRatio ?? null,
          shortRatio: summary.defaultKeyStatistics?.shortRatio ?? null,
          shortPercentOfFloat: summary.defaultKeyStatistics?.shortPercentOfFloat ?? null,
          enterpriseToRevenue: summary.defaultKeyStatistics?.enterpriseToRevenue ?? null,
          enterpriseToEbitda: summary.defaultKeyStatistics?.enterpriseToEbitda ?? null,
          revenueGrowth: summary.financialData?.revenueGrowth ?? null,
          earningsGrowth: summary.financialData?.earningsGrowth ?? null,
          grossMargins: summary.financialData?.grossMargins ?? null,
          operatingMargins: summary.financialData?.operatingMargins ?? null,
          profitMargins: summary.financialData?.profitMargins ?? null,
          freeCashflow: summary.financialData?.freeCashflow ?? null,
        },
        financialMetrics: {
          ...existingData.financialMetrics,
          structuredData: {
            ...existingData.financialMetrics?.structuredData,
            epsSurprise,
            epsSurpriseMagnitude,
            revenueSurprise,
            revenueSurpriseMagnitude,
          },
        },
      };

      // Update filing with both dedicated fields and analysisData
      await prisma.filing.update({
        where: { id: filing.id },
        data: {
          consensusEPS,
          actualEPS,
          epsSurprise: epsSurpriseMagnitude,
          revenueSurprise: revenueSurpriseMagnitude,
          analysisData: JSON.stringify(updatedAnalysisData),
        },
      });

      updated++;
    } catch (e: any) {
      errors++;
      console.error(`  Error updating filing ${filing.id} (${ticker}): ${e.message}`);
    }
  }

  console.log(`Analyst data done: ${updated} updated, ${errors} errors`);
}

// ─── MAIN ────────────────────────────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════════╗');
  console.log('║    SEC Filing Analyzer — Data Backfill   ║');
  console.log('║    Source: Yahoo Finance + FRED           ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log(`\nFlags: skip-prices=${skipPrices}, skip-macro=${skipMacro}, skip-analyst=${skipAnalyst}`);
  console.log(`Max prices: ${maxPrices}`);

  const startTime = Date.now();

  if (!skipPrices) await backfillStockPrices();
  if (!skipMacro) await backfillMacroIndicators();
  if (!skipAnalyst) await backfillAnalystData();

  const elapsed = Math.round((Date.now() - startTime) / 1000);
  console.log(`\n✅ Backfill complete in ${elapsed}s`);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error('Fatal error:', e);
  await prisma.$disconnect();
  process.exit(1);
});
