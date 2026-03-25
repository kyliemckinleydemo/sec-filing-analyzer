/**
 * @module scripts/backfill-historical-price-features
 * @description Backfills historically accurate 52-week price ranges at each filing date.
 *
 * PROBLEM SOLVED: The current alpha model uses today's Company.fiftyTwoWeekHigh/Low to
 * evaluate historical filings. A filing from 18 months ago gets evaluated with today's
 * 52W range — completely wrong. This creates noise that explains the low CV R² (0.043).
 *
 * APPROACH: Fetch 5+ years of daily OHLCV for each company ONCE. Then for each training-
 * eligible filing, find the actual 52W high/low at filing date by slicing the cached
 * price series. Creates CompanySnapshot records (triggerType='filing') to store results.
 *
 * COST: ~1 Yahoo Finance call per company = ~830 calls total. ~5 min runtime.
 *
 * Usage: npx tsx scripts/backfill-historical-price-features.ts
 * Next:  npx tsx scripts/backfill-all-returns.ts  (for new filings without returns yet)
 *        npx tsx scripts/retrain-alpha-v2.ts
 */

import { prisma } from '../lib/prisma';
import yahooFinance from '../lib/yahoo-finance-singleton';

const DELAY_MS = 350; // ~3 companies/sec
const MAX_DATE_GAP_MS = 5 * 24 * 60 * 60 * 1000; // 5 calendar days
const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

interface PricePoint {
  date: Date;
  close: number;
  high: number;
  low: number;
}

function sleep(ms: number) {
  return new Promise<void>(r => setTimeout(r, ms));
}

/**
 * Calculate price, 52W high, and 52W low at a specific target date
 * using a pre-fetched sorted price series.
 */
function getPriceRangeAt(
  prices: PricePoint[],
  targetDate: Date,
): { price: number; high52w: number; low52w: number } | null {
  const targetMs = targetDate.getTime();

  // 52-week window: prices from (target - 365 days) to target
  const windowStart = targetMs - ONE_YEAR_MS;
  const window = prices.filter(
    p => p.date.getTime() <= targetMs && p.date.getTime() >= windowStart,
  );

  if (window.length < 20) return null; // Need at least ~1 month of data

  // Find price closest to target date (handles weekends/holidays)
  let closest = window[window.length - 1];
  let minDiff = Math.abs(closest.date.getTime() - targetMs);
  for (const p of window) {
    const diff = Math.abs(p.date.getTime() - targetMs);
    if (diff < minDiff) {
      minDiff = diff;
      closest = p;
    }
  }

  if (minDiff > MAX_DATE_GAP_MS) return null; // No price within 5 calendar days

  return {
    price: closest.close,
    high52w: Math.max(...window.map(p => p.high)),
    low52w: Math.min(...window.map(p => p.low)),
  };
}

async function main() {
  console.log('=== BACKFILL HISTORICAL PRICE FEATURES ===\n');
  console.log('Creates CompanySnapshot records with 52W high/low at filing date.\n');

  const companies = await prisma.company.findMany({
    select: {
      id: true,
      ticker: true,
      filings: {
        where: {
          filingType: { in: ['10-K', '10-Q', '8-K'] },
        },
        select: { id: true, filingDate: true, actual30dAlpha: true },
        orderBy: { filingDate: 'asc' },
      },
    },
    where: {
      filings: {
        some: { filingType: { in: ['10-K', '10-Q', '8-K'] } },
      },
    },
    orderBy: { ticker: 'asc' },
  });

  const totalFilings = companies.reduce((s, c) => s + c.filings.length, 0);
  console.log(`Companies: ${companies.length}`);
  console.log(`Filings to snapshot: ${totalFilings}\n`);

  let companiesOk = 0;
  let companiesErr = 0;
  let snapshotsCreated = 0;
  let snapshotsUpdated = 0;

  for (let ci = 0; ci < companies.length; ci++) {
    const company = companies[ci];
    if (company.filings.length === 0) continue;

    // Start 400 days before the oldest filing to ensure full 52W window
    const oldestFiling = company.filings[0];
    const period1 = new Date(new Date(oldestFiling.filingDate).getTime() - 400 * 24 * 60 * 60 * 1000);

    try {
      const chart = await yahooFinance.chart(company.ticker, {
        period1,
        period2: new Date(),
        interval: '1d',
      });

      if (!chart.quotes || chart.quotes.length < 30) {
        console.log(`[${company.ticker}] Insufficient history (${chart.quotes?.length ?? 0} bars), skipping`);
        companiesErr++;
        await sleep(DELAY_MS);
        continue;
      }

      // Build sorted price series
      const prices: PricePoint[] = chart.quotes
        .filter(q => q.close != null && q.high != null && q.low != null)
        .map(q => ({
          date: new Date(q.date!),
          close: q.close!,
          high: q.high!,
          low: q.low!,
        }))
        .sort((a, b) => a.date.getTime() - b.date.getTime());

      let created = 0;
      let updated = 0;

      for (const filing of company.filings) {
        const range = getPriceRangeAt(prices, new Date(filing.filingDate));
        if (!range) continue;

        const existing = await prisma.companySnapshot.findFirst({
          where: { filingId: filing.id, triggerType: 'filing' },
          select: { id: true },
        });

        const data = {
          snapshotDate: new Date(filing.filingDate),
          currentPrice: range.price,
          fiftyTwoWeekHigh: range.high52w,
          fiftyTwoWeekLow: range.low52w,
        };

        if (existing) {
          await prisma.companySnapshot.update({
            where: { id: existing.id },
            data,
          });
          updated++;
          snapshotsUpdated++;
        } else {
          await prisma.companySnapshot.create({
            data: {
              companyId: company.id,
              filingId: filing.id,
              triggerType: 'filing',
              ...data,
            },
          });
          created++;
          snapshotsCreated++;
        }
      }

      companiesOk++;
      console.log(`[${company.ticker}] ✓ created=${created} updated=${updated} (${prices.length} bars fetched)`);
    } catch (error: any) {
      console.error(`[${company.ticker}] Error: ${error.message}`);
      companiesErr++;
    }

    await sleep(DELAY_MS);

    if (ci > 0 && ci % 50 === 0) {
      console.log(`\n--- ${ci + 1}/${companies.length} | created=${snapshotsCreated} updated=${snapshotsUpdated} ---\n`);
    }
  }

  console.log('\n=== COMPLETE ===');
  console.log(`Companies OK:    ${companiesOk}`);
  console.log(`Companies err:   ${companiesErr}`);
  console.log(`Snapshots created: ${snapshotsCreated}`);
  console.log(`Snapshots updated: ${snapshotsUpdated}`);
  console.log('\nNext steps:');
  console.log('  1. npx tsx scripts/backfill-all-returns.ts   (calculates actual30dAlpha for new filings)');
  console.log('  2. npx tsx scripts/retrain-alpha-v2.ts        (retrain model with expanded data)');
  console.log('  3. npx tsx scripts/backtest-alpha-v2.ts       (compare v1 vs v2)');

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
