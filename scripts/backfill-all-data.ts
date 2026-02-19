#!/usr/bin/env npx tsx
/**
 * Local backfill script — matches Vercel FMP cron data exactly.
 *
 * Stock prices & analyst data use FMP API (same source as Vercel crons).
 * Macro indicators use Yahoo Finance v8 API (works locally, saves FMP budget).
 *
 * Usage:
 *   npx tsx scripts/backfill-all-data.ts                  # Run all
 *   npx tsx scripts/backfill-all-data.ts --skip-prices     # Skip stock prices
 *   npx tsx scripts/backfill-all-data.ts --skip-macro      # Skip macro indicators
 *   npx tsx scripts/backfill-all-data.ts --skip-analyst    # Skip analyst data
 *   npx tsx scripts/backfill-all-data.ts --max-prices=100  # Limit price updates (default 200)
 *   npx tsx scripts/backfill-all-data.ts --yahoo-fallback  # Use Yahoo v8 for prices (no FMP needed)
 *
 * --yahoo-fallback: Uses Yahoo v8 chart API for stock prices instead of FMP.
 *   Covers: currentPrice, volume, fiftyTwoWeekHigh/Low (4 fields).
 *   Missing: marketCap, peRatio, beta, dividendYield, averageVolume, analystTargetPrice.
 *   No daily API limit — useful when FMP quota is exhausted.
 *
 * FMP free tier: 250 API calls/day. Budget:
 *   - Macro: 0 FMP calls (uses Yahoo v8)
 *   - Analyst: ~4 calls per filing (typically 40-120 total)
 *   - Stock prices: 1 call per company (default max 200)
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient(); // Also loads .env via dotenv

// ─── CLI ARGS ──────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const skipPrices = args.includes('--skip-prices');
const skipMacro = args.includes('--skip-macro');
const skipAnalyst = args.includes('--skip-analyst');
const yahooFallback = args.includes('--yahoo-fallback');
const maxPricesArg = args.find(a => a.startsWith('--max-prices='));
const maxPrices = maxPricesArg ? parseInt(maxPricesArg.split('=')[1]) : (yahooFallback ? 828 : 200);

// ─── SHARED UTILS ──────────────────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── YAHOO V8 (for macro indicators only) ──────────────────────────────────

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

// ─── FMP API (for stock prices & analyst data) ─────────────────────────────

const FMP_BASE = 'https://financialmodelingprep.com';
const FMP_RATE_LIMIT_MS = 150;
let fmpLastRequest = 0;
let fmpCallCount = 0;

async function fmpFetch<T>(path: string, params: Record<string, string> = {}): Promise<T | null> {
  const apiKey = process.env.FMP_API_KEY;
  if (!apiKey) {
    console.error('[FMP] No FMP_API_KEY in .env — cannot fetch stock/analyst data');
    return null;
  }

  // Rate limit
  const elapsed = Date.now() - fmpLastRequest;
  if (elapsed < FMP_RATE_LIMIT_MS) await sleep(FMP_RATE_LIMIT_MS - elapsed);
  fmpLastRequest = Date.now();
  fmpCallCount++;

  const url = new URL(path, FMP_BASE);
  url.searchParams.set('apikey', apiKey);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  for (let attempt = 0; attempt <= 2; attempt++) {
    try {
      const res = await fetch(url.toString(), { headers: { 'User-Agent': 'SEC Filing Analyzer' } });
      if (!res.ok) {
        if (res.status === 429 && attempt < 2) {
          console.log(`  [FMP] Rate limited (429), retrying in ${attempt + 1}s...`);
          await sleep(1000 * (attempt + 1));
          continue;
        }
        return null;
      }
      const data = await res.json();
      // FMP returns 200 with {"Error Message": "Limit Reach ..."} when rate limited
      if (data && typeof data === 'object' && !Array.isArray(data) && 'Error Message' in data) {
        console.error(`[FMP] ${(data as any)['Error Message']}`);
        return null;
      }
      return data as T;
    } catch {
      if (attempt === 2) return null;
      await sleep(1000 * (attempt + 1));
    }
  }
  return null;
}

async function fmpGetProfile(symbol: string) {
  const data = await fmpFetch<any[]>('/stable/profile', { symbol });
  return data?.[0] ?? null;
}

async function fmpGetUpgradesDowngrades(symbol: string): Promise<any[]> {
  const data = await fmpFetch<any[]>('/stable/upgrades-downgrades', { symbol });
  return Array.isArray(data) ? data : [];
}

async function fmpGetRecommendation(symbol: string) {
  const data = await fmpFetch<any[]>('/stable/analyst-recommendation', { symbol });
  return data?.[0] ?? null;
}

async function fmpGetEarnings(symbol: string, limit = 5): Promise<any[]> {
  const data = await fmpFetch<any[]>('/stable/earnings', { symbol, limit: String(limit) });
  return Array.isArray(data) ? data : [];
}

function parseRange(range: string): { low: number; high: number } | null {
  if (!range) return null;
  const parts = range.split('-').map(s => parseFloat(s.trim()));
  if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
    return { low: Math.min(parts[0], parts[1]), high: Math.max(parts[0], parts[1]) };
  }
  return null;
}

// ─── STOCK PRICES ──────────────────────────────────────────────────────────

async function backfillStockPricesFMP(batch: { id: string; ticker: string; yahooLastUpdated: Date | null }[]) {
  let updated = 0, errors = 0, skipped = 0;
  for (let i = 0; i < batch.length; i++) {
    const c = batch[i];
    try {
      if ((i + 1) % 50 === 0) {
        console.log(`  Progress: ${i + 1}/${batch.length} (${updated} updated, ${errors} errors, ${skipped} skipped)`);
      }

      const profile = await fmpGetProfile(c.ticker);
      if (!profile || !profile.price) {
        skipped++;
        continue;
      }

      const range = parseRange(profile.range);

      await prisma.company.update({
        where: { id: c.id },
        data: {
          currentPrice: profile.price ?? null,
          marketCap: profile.mktCap ?? null,
          peRatio: profile.pe ?? null,
          beta: profile.beta ?? null,
          dividendYield: profile.lastDiv ? profile.lastDiv / (profile.price || 1) : null,
          fiftyTwoWeekHigh: range?.high ?? null,
          fiftyTwoWeekLow: range?.low ?? null,
          volume: profile.volume ? BigInt(profile.volume) : null,
          averageVolume: profile.volAvg ? BigInt(profile.volAvg) : null,
          analystTargetPrice: profile.targetMeanPrice ?? null,
          yahooLastUpdated: new Date(),
        },
      });
      updated++;
    } catch (e: any) {
      errors++;
      if (!e.message?.includes('Not Found')) {
        console.error(`  Error ${c.ticker}: ${e.message}`);
      }
    }
  }
  console.log(`Stock prices done: ${updated} updated, ${errors} errors, ${skipped} skipped`);
  console.log(`  FMP API calls so far: ${fmpCallCount}`);
}

async function backfillStockPricesYahoo(batch: { id: string; ticker: string; yahooLastUpdated: Date | null }[]) {
  console.log('  (Yahoo v8 fallback — basic fields only: price, volume, 52wk range)');
  let updated = 0, errors = 0, skipped = 0;
  for (let i = 0; i < batch.length; i++) {
    const c = batch[i];
    try {
      if ((i + 1) % 50 === 0) {
        console.log(`  Progress: ${i + 1}/${batch.length} (${updated} updated, ${errors} errors, ${skipped} skipped)`);
      }

      const url = `${YAHOO_BASE}/chart/${c.ticker}?interval=1d&range=5d`;
      const data = await yahooFetch(url);
      const meta = data?.chart?.result?.[0]?.meta;
      if (!meta?.regularMarketPrice) {
        skipped++;
        continue;
      }

      await prisma.company.update({
        where: { id: c.id },
        data: {
          currentPrice: meta.regularMarketPrice ?? null,
          fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh ?? null,
          fiftyTwoWeekLow: meta.fiftyTwoWeekLow ?? null,
          volume: meta.regularMarketVolume ? BigInt(meta.regularMarketVolume) : null,
          yahooLastUpdated: new Date(),
        },
      });
      updated++;
      await sleep(300);
    } catch (e: any) {
      errors++;
      if (!e.message?.includes('Not Found') && !e.message?.includes('HTTP 404')) {
        console.error(`  Error ${c.ticker}: ${e.message}`);
      }
    }
  }
  console.log(`Stock prices done: ${updated} updated, ${errors} errors, ${skipped} skipped`);
}

async function backfillStockPrices() {
  const source = yahooFallback ? 'Yahoo v8' : 'FMP';
  console.log(`\n═══ STOCK PRICES (${source}) ═══`);

  if (!yahooFallback && !process.env.FMP_API_KEY) {
    console.error('Skipping stock prices: no FMP_API_KEY (use --yahoo-fallback to use Yahoo instead)');
    return;
  }

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

  if (yahooFallback) {
    await backfillStockPricesYahoo(batch);
  } else {
    await backfillStockPricesFMP(batch);
  }
}

// ─── MACRO INDICATORS (Yahoo v8 — saves FMP budget) ────────────────────────

async function backfillMacroIndicators() {
  console.log('\n═══ MACRO INDICATORS (Yahoo v8) ═══');

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

  const spyData = historicalData['SPY'] || [];
  const spyDates = new Set(spyData.map(d => d.date));
  const vixData = historicalData['^VIX'] || [];

  let stored = 0;
  for (const dateStr of spyDates) {
    if (dateStr < startDate.toISOString().split('T')[0]) continue;

    const dbDate = new Date(dateStr + 'T00:00:00.000Z');
    const spxClose = findClose(spyData, dateStr);
    const vixClose = findClose(vixData, dateStr);

    const macroData = {
      spxClose,
      spxReturn7d: calcReturn(spyData, dateStr, 7),
      spxReturn14d: calcReturn(spyData, dateStr, 14),
      spxReturn21d: calcReturn(spyData, dateStr, 21),
      spxReturn30d: calcReturn(spyData, dateStr, 30),
      vixClose,
      vixMA30: vixMA30(vixData, dateStr),
      fedFundsRate: null,
      treasury3m: null,
      treasury2y: null,
      treasury10y: null,
      yieldCurve2y10y: null,
      treasury10yChange30d: null,
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

// ─── ANALYST DATA (FMP — matches Vercel cron exactly) ──────────────────────

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
    if (!e.publishedDate) return false;
    const d = new Date(e.publishedDate);
    return d >= thirtyDaysBefore && d <= filingDate;
  });

  let upgrades = 0, downgrades = 0, majorUpgrades = 0, majorDowngrades = 0;
  for (const event of recentEvents) {
    const action = classifyAnalystEvent(event.previousGrade || '', event.newGrade || '');
    const isMajor = isMajorFirm(event.gradingCompany || '');
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
  console.log('\n═══ ANALYST DATA (FMP) ═══');

  if (!process.env.FMP_API_KEY) {
    console.error('Skipping analyst data: no FMP_API_KEY');
    return;
  }

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

  const estimatedCalls = filings.length * 4;
  console.log(`  Estimated FMP calls: ~${estimatedCalls} (4 per filing)`);

  let updated = 0, errors = 0;
  for (let i = 0; i < filings.length; i++) {
    const filing = filings[i];
    const ticker = filing.company?.ticker;
    if (!ticker) continue;

    try {
      if ((i + 1) % 5 === 0) {
        console.log(`  Progress: ${i + 1}/${filings.length} (${updated} updated, ${errors} errors)`);
      }

      // 4 parallel FMP calls per ticker (matches Vercel cron)
      const [profile, upgradeEvents, recommendation, earnings] = await Promise.all([
        fmpGetProfile(ticker),
        fmpGetUpgradesDowngrades(ticker),
        fmpGetRecommendation(ticker),
        fmpGetEarnings(ticker, 5),
      ]);

      // Analyst activity from upgrade/downgrade history
      const activity = getAnalystActivity(upgradeEvents, filing.filingDate);

      // Consensus score (0-100 scale, 100 = Strong Buy)
      let consensusScore = null;
      if (recommendation) {
        const total = (recommendation.analystRatingsStrongBuy || 0) +
          (recommendation.analystRatingsbuy || 0) +
          (recommendation.analystRatingsHold || 0) +
          (recommendation.analystRatingsSell || 0) +
          (recommendation.analystRatingsStrongSell || 0);
        if (total > 0) {
          consensusScore = Math.round(
            ((recommendation.analystRatingsStrongBuy || 0) * 100 +
             (recommendation.analystRatingsbuy || 0) * 75 +
             (recommendation.analystRatingsHold || 0) * 50 +
             (recommendation.analystRatingsSell || 0) * 25) / total
          );
        }
      }

      // Upside potential
      let upsidePotential = null;
      if (profile?.targetMeanPrice && profile?.price) {
        upsidePotential = ((profile.targetMeanPrice - profile.price) / profile.price) * 100;
      }

      // Number of analysts
      const numberOfAnalysts = recommendation
        ? (recommendation.analystRatingsStrongBuy || 0) +
          (recommendation.analystRatingsbuy || 0) +
          (recommendation.analystRatingsHold || 0) +
          (recommendation.analystRatingsSell || 0) +
          (recommendation.analystRatingsStrongSell || 0)
        : null;

      // Earnings surprise data
      let consensusEPS: number | null = null;
      let actualEPS: number | null = null;
      let epsSurprise: 'beat' | 'miss' | 'inline' | 'unknown' = 'unknown';
      let epsSurpriseMagnitude: number | null = null;
      let revenueSurprise: 'beat' | 'miss' | 'inline' | 'unknown' = 'unknown';
      let revenueSurpriseMagnitude: number | null = null;

      if (earnings && earnings.length > 0) {
        // Find earnings report closest to filing date (within 90 days)
        let closestEarnings = null;
        let smallestDiff = Infinity;
        const filingTime = filing.filingDate.getTime();

        for (const period of earnings) {
          if (!period.date) continue;
          const diff = Math.abs(new Date(period.date).getTime() - filingTime);
          if (diff < smallestDiff) {
            smallestDiff = diff;
            closestEarnings = period;
          }
        }

        const daysDiff = smallestDiff / (1000 * 60 * 60 * 24);
        if (closestEarnings && daysDiff <= 90) {
          if (typeof closestEarnings.epsEstimated === 'number') consensusEPS = closestEarnings.epsEstimated;
          if (typeof closestEarnings.epsActual === 'number') actualEPS = closestEarnings.epsActual;

          if (closestEarnings.epsActual != null && closestEarnings.epsEstimated != null && closestEarnings.epsEstimated !== 0) {
            epsSurpriseMagnitude = ((closestEarnings.epsActual - closestEarnings.epsEstimated) / Math.abs(closestEarnings.epsEstimated)) * 100;
            if (epsSurpriseMagnitude > 2) epsSurprise = 'beat';
            else if (epsSurpriseMagnitude < -2) epsSurprise = 'miss';
            else epsSurprise = 'inline';
          }

          if (closestEarnings.revenueActual != null && closestEarnings.revenueEstimated != null && closestEarnings.revenueEstimated !== 0) {
            revenueSurpriseMagnitude = ((closestEarnings.revenueActual - closestEarnings.revenueEstimated) / closestEarnings.revenueEstimated) * 100;
            if (revenueSurpriseMagnitude > 2) revenueSurprise = 'beat';
            else if (revenueSurpriseMagnitude < -2) revenueSurprise = 'miss';
            else revenueSurprise = 'inline';
          }
        }
      }

      // Merge into analysisData JSON (matches Vercel cron format exactly)
      let existingData: any = {};
      if (filing.analysisData) {
        try {
          existingData = typeof filing.analysisData === 'string'
            ? JSON.parse(filing.analysisData)
            : filing.analysisData;
        } catch { existingData = {}; }
      }

      const updatedAnalysisData = {
        ...existingData,
        analyst: {
          consensusScore,
          upsidePotential,
          numberOfAnalysts,
          targetPrice: profile?.targetMeanPrice ?? null,
          activity: {
            upgradesLast30d: activity.upgradesLast30d,
            downgradesLast30d: activity.downgradesLast30d,
            netUpgrades: activity.netUpgrades,
            majorUpgrades: activity.majorUpgrades,
            majorDowngrades: activity.majorDowngrades,
          },
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

      // Update filing with dedicated fields AND analysisData (matches cron)
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
      await sleep(250);
    } catch (e: any) {
      errors++;
      console.error(`  Error ${ticker}: ${e.message}`);
    }
  }
  console.log(`Analyst data done: ${updated} updated, ${errors} errors`);
  console.log(`  FMP API calls total: ${fmpCallCount}`);
}

// ─── MAIN ──────────────────────────────────────────────────────────────────

async function main() {
  console.log('Starting comprehensive data backfill...');
  console.log(`Time: ${new Date().toISOString()}`);
  console.log(`FMP API key: ${process.env.FMP_API_KEY ? 'configured' : 'MISSING'}`);
  console.log(`Options: maxPrices=${maxPrices}, skipPrices=${skipPrices}, skipMacro=${skipMacro}, skipAnalyst=${skipAnalyst}, yahooFallback=${yahooFallback}\n`);

  try {
    if (!skipMacro) {
      await backfillMacroIndicators();
    }

    if (!skipPrices) {
      await backfillStockPrices();
    }

    if (!skipAnalyst) {
      await backfillAnalystData();
    }

    console.log(`\nAll backfills complete! (${fmpCallCount} FMP API calls used)`);
  } catch (e: any) {
    console.error('\nFatal error:', e.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
