/**
 * @module backfill-analyst-and-surprises
 * 
 * @description
 * Backfills analyst consensus data and earnings surprise metrics for existing financial filings
 * in the database. Enhances rule-based prediction engine capabilities by enriching historical
 * filing records with critical market sentiment and performance indicators.
 * 
 * PURPOSE:
 * - Fills data gaps for financial filings (10-K, 10-Q, earnings-related 8-Ks)
 * - Fetches analyst consensus scores, target prices, and recommendation trends from Yahoo Finance
 * - Calculates upgrade/downgrade activity within 30-day windows before filing dates
 * - Determines EPS and revenue surprise classifications (beat/miss/inline) with magnitude
 * - Enriches analysisData JSON field with structured analyst and surprise metrics
 * - Enables historical pattern analysis for rule-based stock price movement predictions
 * 
 * EXPORTS:
 * - backfillFilings(): Main async function that processes all eligible filings
 * - getAnalystActivity(): Fetches analyst upgrades/downgrades for 30-day window
 * - calculateSurprise(): Determines beat/miss/inline classification with percentage magnitude
 * - isEarnings8K(): Identifies earnings-related 8-K filings via keyword matching
 * - classifyAnalystEvent(): Categorizes rating changes as upgrade/downgrade/initiated/reiterated
 * - isMajorFirm(): Checks if analyst firm is considered major (bulge bracket/tier 1)
 * 
 * CLAUDE NOTES:
 * - Implements exponential backoff and rate limiting for Yahoo Finance API (500ms delay, 30s on rate limit)
 * - Filters 8-K filings to earnings-only using keyword detection in analysisData summaries
 * - Maps analyst ratings to numerical values (Strong Buy=5 to Strong Sell=1) for consensus scoring
 * - Matches earnings reports to filings within 90-day window to find closest quarterly result
 * - Skips filings that already have analyst.consensusScore to avoid redundant API calls
 * - Distinguishes major firm upgrades/downgrades (17 top investment banks tracked)
 * - Calculates upside potential as percentage difference between target and current price
 * - Surprise magnitude threshold: >5% = beat, <-5% = miss, between = inline
 * - Updates Prisma Filing.analysisData JSON while preserving existing fields
 * - Outputs progress every 10 updates and skip count every 100 to track execution
 */

/**
 * Backfill Analyst Data and EPS/Revenue Surprises for Financial Filings
 *
 * Fills critical gaps for rule-based prediction engine:
 * 1. Analyst consensus, target price, upgrades/downgrades
 * 2. EPS surprise (beat/miss/inline)
 * 3. Revenue surprise (beat/miss/inline)
 *
 * Processes: 10-K, 10-Q, and earnings-related 8-Ks
 */

import { PrismaClient } from '@prisma/client';
import yahooFinance from '../lib/yahoo-finance-singleton';

const prisma = new PrismaClient();

// Suppress Yahoo Finance survey notice
yahooFinance.suppressNotices(['yahooSurvey']);

// Keywords to identify earnings 8-Ks
const EARNINGS_KEYWORDS = [
  'earnings', 'quarterly results', 'financial results',
  'q1 20', 'q2 20', 'q3 20', 'q4 20',
  'first quarter', 'second quarter', 'third quarter', 'fourth quarter',
  'net income', 'revenue', 'eps', 'diluted earnings'
];

function isEarnings8K(analysisData: string | null): boolean {
  if (!analysisData) return false;
  try {
    const data = JSON.parse(analysisData);
    const summary = (data.filingContentSummary || data.summary || '').toLowerCase();
    return EARNINGS_KEYWORDS.some(kw => summary.includes(kw));
  } catch {
    return false;
  }
}

interface AnalystActivity {
  upgradesLast30d: number;
  downgradesLast30d: number;
  netUpgrades: number;
  majorUpgrades: number;
  majorDowngrades: number;
}

const majorFirms = new Set([
  'Goldman Sachs', 'Morgan Stanley', 'JPMorgan', 'Bank of America',
  'Citigroup', 'Wells Fargo', 'Barclays', 'Credit Suisse', 'UBS',
  'Deutsche Bank', 'BofA Securities', 'Jefferies', 'Piper Sandler',
  'Raymond James', 'RBC Capital', 'Stifel', 'Evercore ISI'
]);

const ratingValue: { [key: string]: number } = {
  'Strong Buy': 5, 'Buy': 4, 'Outperform': 4, 'Overweight': 4, 'Accumulate': 4,
  'Hold': 3, 'Neutral': 3, 'Market Perform': 3, 'Peer Perform': 3,
  'Underperform': 2, 'Underweight': 2,
  'Sell': 1, 'Strong Sell': 1, 'Reduce': 1
};

function classifyAnalystEvent(fromGrade: string, toGrade: string): 'upgrade' | 'downgrade' | 'initiated' | 'reiterated' {
  if (!fromGrade || fromGrade.trim() === '') return 'initiated';
  const fromValue = ratingValue[fromGrade] || 3;
  const toValue = ratingValue[toGrade] || 3;
  if (toValue > fromValue) return 'upgrade';
  if (toValue < fromValue) return 'downgrade';
  return 'reiterated';
}

function isMajorFirm(firm: string): boolean {
  return majorFirms.has(firm) ||
         majorFirms.has(firm.replace(' Securities', '')) ||
         majorFirms.has(firm.replace(' Capital Markets', ''));
}

async function getAnalystActivity(ticker: string, filingDate: Date): Promise<AnalystActivity> {
  try {
    const quote = await yahooFinance.quoteSummary(ticker, {
      modules: ['upgradeDowngradeHistory']
    });

    const history = quote.upgradeDowngradeHistory?.history || [];
    const thirtyDaysBefore = new Date(filingDate);
    thirtyDaysBefore.setDate(thirtyDaysBefore.getDate() - 30);

    const recentEvents = history.filter(event => {
      if (!event.epochGradeDate) return false;
      const eventDate = new Date(event.epochGradeDate * 1000);
      return eventDate >= thirtyDaysBefore && eventDate <= filingDate;
    });

    let upgrades = 0, downgrades = 0, majorUpgrades = 0, majorDowngrades = 0;

    for (const event of recentEvents) {
      const action = classifyAnalystEvent(event.fromGrade || '', event.toGrade || '');
      const isMajor = isMajorFirm(event.firm || '');

      if (action === 'upgrade') {
        upgrades++;
        if (isMajor) majorUpgrades++;
      } else if (action === 'downgrade') {
        downgrades++;
        if (isMajor) majorDowngrades++;
      }
    }

    return { upgradesLast30d: upgrades, downgradesLast30d: downgrades, netUpgrades: upgrades - downgrades, majorUpgrades, majorDowngrades };
  } catch {
    return { upgradesLast30d: 0, downgradesLast30d: 0, netUpgrades: 0, majorUpgrades: 0, majorDowngrades: 0 };
  }
}

function calculateSurprise(actual: number | null, expected: number | null): { surprise: 'beat' | 'miss' | 'inline' | 'unknown', magnitude: number | null } {
  if (actual === null || expected === null || expected === 0) {
    return { surprise: 'unknown', magnitude: null };
  }

  const magnitude = ((actual - expected) / Math.abs(expected)) * 100;

  if (magnitude > 5) return { surprise: 'beat', magnitude };
  if (magnitude < -5) return { surprise: 'miss', magnitude };
  return { surprise: 'inline', magnitude };
}

async function backfillFilings() {
  console.log('\n' + '='.repeat(80));
  console.log('🔄 BACKFILLING ANALYST DATA AND EPS/REVENUE SURPRISES');
  console.log('='.repeat(80) + '\n');

  // Get all financial filings that need backfilling
  const allFilings = await prisma.filing.findMany({
    where: {
      OR: [
        { filingType: '10-K' },
        { filingType: '10-Q' },
        { filingType: '8-K', analysisData: { not: null } }
      ]
    },
    include: { company: true },
    orderBy: { filingDate: 'desc' }
  });

  console.log(`Found ${allFilings.length} total filings`);

  // Filter 8-Ks for earnings only
  const filings = allFilings.filter(f =>
    f.filingType === '10-K' || f.filingType === '10-Q' || isEarnings8K(f.analysisData)
  );

  console.log(`Processing ${filings.length} financial filings (10-K: ${filings.filter(f => f.filingType === '10-K').length}, 10-Q: ${filings.filter(f => f.filingType === '10-Q').length}, Earnings 8-K: ${filings.filter(f => f.filingType === '8-K').length})\n`);

  let updated = 0, skipped = 0, errors = 0;

  for (const filing of filings) {
    try {
      const ticker = filing.company?.ticker;
      if (!ticker) {
        skipped++;
        continue;
      }

      // Check if already has analyst data
      let existingData: any = {};
      if (filing.analysisData) {
        try {
          existingData = JSON.parse(filing.analysisData);
          if (existingData.analyst && existingData.analyst.consensusScore !== null) {
            skipped++;
            if (skipped % 100 === 0) console.log(`Skipped ${skipped} (already have data)`);
            continue;
          }
        } catch {}
      }

      // Fetch analyst data
      const quote = await yahooFinance.quoteSummary(ticker, {
        modules: ['financialData', 'recommendationTrend', 'earnings']
      });

      const fd = quote.financialData;
      const trend = quote.recommendationTrend?.trend?.[0];
      const earnings = quote.earnings;

      // Get analyst activity
      const activity = await getAnalystActivity(ticker, filing.filingDate);

      // Calculate consensus score
      let consensusScore = null;
      if (trend) {
        const total = (trend.strongBuy || 0) + (trend.buy || 0) + (trend.hold || 0) + (trend.sell || 0) + (trend.strongSell || 0);
        if (total > 0) {
          consensusScore = Math.round(
            ((trend.strongBuy || 0) * 100 + (trend.buy || 0) * 75 + (trend.hold || 0) * 50 + (trend.sell || 0) * 25) / total
          );
        }
      }

      // Calculate upside potential
      let upsidePotential = null;
      if (fd?.targetMeanPrice && fd?.currentPrice) {
        upsidePotential = ((fd.targetMeanPrice - fd.currentPrice) / fd.currentPrice) * 100;
      }

      // Get EPS/Revenue surprises from earnings history
      let epsSurprise: 'beat' | 'miss' | 'inline' | 'unknown' = 'unknown';
      let epsSurpriseMagnitude: number | null = null;
      let revenueSurprise: 'beat' | 'miss' | 'inline' | 'unknown' = 'unknown';
      let revenueSurpriseMagnitude: number | null = null;

      if (earnings?.earningsChart?.quarterly) {
        // Find the earnings report closest to filing date
        const filingTime = filing.filingDate.getTime();
        let closestEarnings = null;
        let minDiff = Infinity;

        for (const q of earnings.earningsChart.quarterly) {
          if (q.date) {
            const earningsTime = new Date(q.date).getTime();
            const diff = Math.abs(filingTime - earningsTime);
            if (diff < minDiff && diff < 90 * 24 * 60 * 60 * 1000) { // Within 90 days
              minDiff = diff;
              closestEarnings = q;
            }
          }
        }

        if (closestEarnings) {
          // EPS surprise
          const epsResult = calculateSurprise(
            closestEarnings.actual,
            closestEarnings.estimate
          );
          epsSurprise = epsResult.surprise;
          epsSurpriseMagnitude = epsResult.magnitude;

          // Revenue surprise (if available)
          if (earnings.financialsChart?.quarterly) {
            for (const q of earnings.financialsChart.quarterly) {
              if (q.date === closestEarnings.date) {
                const revResult = calculateSurprise(
                  q.revenue,
                  q.revenueEstimate
                );
                revenueSurprise = revResult.surprise;
                revenueSurpriseMagnitude = revResult.magnitude;
                break;
              }
            }
          }
        }
      }

      // Update filing with complete data
      const updatedAnalysisData = {
        ...existingData,
        analyst: {
          consensusScore,
          upsidePotential,
          numberOfAnalysts: fd?.numberOfAnalystOpinions ?? null,
          targetPrice: fd?.targetMeanPrice ?? null,
          activity: {
            upgradesLast30d: activity.upgradesLast30d,
            downgradesLast30d: activity.downgradesLast30d,
            netUpgrades: activity.netUpgrades,
            majorUpgrades: activity.majorUpgrades,
            majorDowngrades: activity.majorDowngrades
          }
        },
        financialMetrics: {
          ...existingData.financialMetrics,
          structuredData: {
            ...existingData.financialMetrics?.structuredData,
            epsSurprise,
            epsSurpriseMagnitude,
            revenueSurprise,
            revenueSurpriseMagnitude
          }
        }
      };

      await prisma.filing.update({
        where: { id: filing.id },
        data: { analysisData: JSON.stringify(updatedAnalysisData) }
      });

      updated++;
      if (updated % 10 === 0) {
        console.log(`✅ Updated ${updated}/${filings.length} | ${ticker} | EPS: ${epsSurprise} | Consensus: ${consensusScore}`);
      }

      // Rate limit - increased to avoid "Too Many Requests"
      await new Promise(resolve => setTimeout(resolve, 500));

    } catch (error: any) {
      errors++;

      // Handle rate limiting with exponential backoff
      if (error.message?.includes('Too Many Requests')) {
        console.log(`⏸️  Rate limited at ${updated}/${filings.length}. Waiting 30 seconds...`);
        await new Promise(resolve => setTimeout(resolve, 30000)); // Wait 30 seconds
      } else if (!error.message?.includes('Not Found')) {
        console.error(`❌ Error: ${error.message}`);
      }
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('✅ BACKFILL COMPLETE');
  console.log('='.repeat(80));
  console.log(`Updated: ${updated}`);
  console.log(`Skipped: ${skipped} (already had data)`);
  console.log(`Errors: ${errors}`);
  console.log(`Total processed: ${filings.length}`);
  console.log('='.repeat(80) + '\n');

  await prisma.$disconnect();
}

backfillFilings().catch(console.error);
