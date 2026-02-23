/**
 * @module backfill-analyst-activity
 * 
 * @description
 * Backfills analyst upgrade/downgrade activity data for SEC filings by querying Yahoo Finance
 * historical data and storing structured analyst sentiment metrics in the analysisData field.
 * 
 * PURPOSE:
 * - Track analyst upgrades, downgrades, and rating changes in the 30 days preceding each SEC filing
 * - Capture "smart money" sentiment shifts that may predict post-filing stock performance
 * - Identify activity from major institutional firms (Goldman Sachs, Morgan Stanley, etc.)
 * - Generate ML training features by correlating pre-filing analyst sentiment with actual returns
 * - Support hypothesis that analyst activity patterns can improve filing return predictions
 * 
 * EXPORTS:
 * - getAnalystActivity(): Fetches and classifies analyst events within 30-day window before filing
 * - backfillAnalystActivity(): Main execution function that processes all historical filings
 * - AnalystEvent: TypeScript interface for individual analyst rating changes
 * - AnalystActivity: TypeScript interface for aggregated sentiment metrics
 * 
 * CLAUDE NOTES:
 * - Uses 30-day lookback window (changed from 7 days) to improve coverage and capture broader trends
 * - Rating classification uses weighted hierarchy (Strong Buy=5 down to Strong Sell=1)
 * - Major firm detection includes 17 top-tier institutional analysts with normalized name matching
 * - Handles Yahoo Finance epochGradeDate as Date objects (NOT Unix timestamps despite naming)
 * - Implements rate limiting (2s delay per 5 requests) to avoid API throttling
 * - Merges new analyst data with existing analysisData JSON without overwriting other fields
 * - Generates comprehensive statistics including coverage %, sentiment distribution, and sample output
 * - Intended to be run as one-time backfill script before ML dataset re-export
 */

/**
 * Backfill Analyst Activity Around Filings
 *
 * Track analyst upgrades/downgrades in the 30 days before each SEC filing
 * This captures market sentiment shifts that could predict stock performance
 * (Changed from 7 days to 30 days for better coverage)
 */

import { prisma } from '../lib/prisma';
import yahooFinance from '../lib/yahoo-finance-singleton';

interface AnalystEvent {
  date: Date;
  firm: string;
  toGrade: string;
  fromGrade: string;
  action: 'upgrade' | 'downgrade' | 'initiated' | 'reiterated';
}

interface AnalystActivity {
  upgradesLast30d: number;
  downgradesLast30d: number;
  netUpgrades: number;
  analystEventsLast30d: number;
  majorUpgrades: number; // Upgrades from notable firms
  majorDowngrades: number;
}

// Rating hierarchy for comparison
const ratingValue: { [key: string]: number } = {
  'Strong Buy': 5,
  'Buy': 4,
  'Outperform': 4,
  'Overweight': 4,
  'Accumulate': 4,
  'Hold': 3,
  'Neutral': 3,
  'Market Perform': 3,
  'Peer Perform': 3,
  'Underperform': 2,
  'Underweight': 2,
  'Sell': 1,
  'Strong Sell': 1,
  'Reduce': 1
};

// Major firms whose ratings carry more weight
const majorFirms = new Set([
  'Goldman Sachs', 'Morgan Stanley', 'JPMorgan', 'Bank of America',
  'Citigroup', 'Wells Fargo', 'Barclays', 'Credit Suisse', 'UBS',
  'Deutsche Bank', 'BofA Securities', 'Jefferies', 'Piper Sandler',
  'Raymond James', 'RBC Capital', 'Stifel', 'Evercore ISI'
]);

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
    // Fetch upgrade/downgrade history
    const quote = await yahooFinance.quoteSummary(ticker, {
      modules: ['upgradeDowngradeHistory']
    });

    const history = quote.upgradeDowngradeHistory?.history || [];

    // Calculate date 30 days before filing (changed from 7 for better coverage)
    const thirtyDaysBefore = new Date(filingDate);
    thirtyDaysBefore.setDate(thirtyDaysBefore.getDate() - 30);

    // Filter events in the 30 days before filing
    // Note: epochGradeDate is already a Date object or ISO string, NOT a Unix timestamp
    const recentEvents = history.filter(event => {
      if (!event.epochGradeDate) return false;
      const eventDate = new Date(event.epochGradeDate);
      return eventDate >= thirtyDaysBefore && eventDate <= filingDate;
    });

    // Classify events
    let upgrades = 0;
    let downgrades = 0;
    let majorUpgrades = 0;
    let majorDowngrades = 0;

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

    return {
      upgradesLast30d: upgrades,
      downgradesLast30d: downgrades,
      netUpgrades: upgrades - downgrades,
      analystEventsLast30d: recentEvents.length,
      majorUpgrades,
      majorDowngrades
    };

  } catch (error) {
    console.warn(`⚠️  Failed to fetch analyst activity for ${ticker}:`, (error as Error).message);
    return {
      upgradesLast30d: 0,
      downgradesLast30d: 0,
      netUpgrades: 0,
      analystEventsLast30d: 0,
      majorUpgrades: 0,
      majorDowngrades: 0
    };
  }
}

async function backfillAnalystActivity() {
  console.log('🚀 BACKFILLING ANALYST ACTIVITY AROUND FILINGS\n');
  console.log('═'.repeat(80));

  // Get all filings
  const filings = await prisma.filing.findMany({
    where: {
      actual7dReturn: { not: null },
      filingType: { in: ['10-K', '10-Q'] }
    },
    include: { company: true },
    orderBy: { filingDate: 'desc' }
  });

  console.log(`\n📊 Found ${filings.length} filings to process\n`);

  // Get unique tickers
  const tickers = [...new Set(filings.map(f => f.company?.ticker).filter(Boolean))] as string[];
  console.log(`📈 Processing ${tickers.length} unique tickers\n`);
  console.log('═'.repeat(80));

  let successful = 0;
  let failed = 0;
  let withActivity = 0;
  let totalUpgrades = 0;
  let totalDowngrades = 0;

  for (let i = 0; i < tickers.length; i++) {
    const ticker = tickers[i];
    process.stdout.write(`\r[${i + 1}/${tickers.length}] Processing ${ticker}...`);

    try {
      // Get all filings for this ticker
      const tickerFilings = filings.filter(f => f.company?.ticker === ticker);

      for (const filing of tickerFilings) {
        // Get analyst activity for this filing
        const activity = await getAnalystActivity(ticker, filing.filingDate);

        // Parse existing analysisData
        let existingData: any = {};
        if (filing.analysisData) {
          try {
            existingData = typeof filing.analysisData === 'string'
              ? JSON.parse(filing.analysisData)
              : filing.analysisData;
          } catch (e) {
            existingData = {};
          }
        }

        // Merge analyst activity data
        const updatedAnalysisData = {
          ...existingData,
          analyst: {
            ...(existingData.analyst || {}),
            activity: {
              upgradesLast30d: activity.upgradesLast30d,
              downgradesLast30d: activity.downgradesLast30d,
              netUpgrades: activity.netUpgrades,
              analystEventsLast30d: activity.analystEventsLast30d,
              majorUpgrades: activity.majorUpgrades,
              majorDowngrades: activity.majorDowngrades
            }
          }
        };

        // Update filing
        await prisma.filing.update({
          where: { id: filing.id },
          data: {
            analysisData: JSON.stringify(updatedAnalysisData)
          }
        });

        // Track stats
        if (activity.analystEventsLast30d > 0) {
          withActivity++;
          totalUpgrades += activity.upgradesLast30d;
          totalDowngrades += activity.downgradesLast30d;
        }
      }

      successful++;

    } catch (error) {
      failed++;
      console.log(`\n❌ Error processing ${ticker}: ${(error as Error).message}`);
    }

    // Rate limiting
    if ((i + 1) % 5 === 0) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  console.log('\n\n' + '═'.repeat(80));
  console.log('📊 BACKFILL COMPLETE\n');
  console.log(`✅ Tickers processed: ${successful}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`\n📈 Activity Statistics:`);
  console.log(`   Filings with analyst activity: ${withActivity}/${filings.length} (${((withActivity/filings.length)*100).toFixed(1)}%)`);
  console.log(`   Total upgrades tracked: ${totalUpgrades}`);
  console.log(`   Total downgrades tracked: ${totalDowngrades}`);
  console.log(`   Net sentiment: ${totalUpgrades - totalDowngrades > 0 ? 'Positive' : 'Negative'} (${totalUpgrades - totalDowngrades})`);

  // Sample some filings with activity
  console.log('\n📊 Sample Filings with Analyst Activity:');
  const samplesWithActivity = filings.filter(f => {
    if (!f.analysisData) return false;
    try {
      const data = typeof f.analysisData === 'string' ? JSON.parse(f.analysisData) : f.analysisData;
      return (data as any)?.analyst?.activity?.analystEventsLast30d > 0;
    } catch {
      return false;
    }
  }).slice(0, 10);

  for (const sample of samplesWithActivity) {
    try {
      const data = typeof sample.analysisData === 'string'
        ? JSON.parse(sample.analysisData)
        : sample.analysisData;
      const activity = (data as any)?.analyst?.activity;

      if (activity) {
        console.log(`\n  ${sample.company?.ticker} (${sample.filingDate.toISOString().split('T')[0]}):`);
        console.log(`    Events: ${activity.analystEventsLast30d}`);
        console.log(`    Upgrades: ${activity.upgradesLast30d} (${activity.majorUpgrades} major)`);
        console.log(`    Downgrades: ${activity.downgradesLast30d} (${activity.majorDowngrades} major)`);
        console.log(`    Net: ${activity.netUpgrades > 0 ? '+' : ''}${activity.netUpgrades}`);
      }
    } catch (e) {
      // Skip parsing errors
    }
  }

  console.log('\n' + '═'.repeat(80));
  console.log('\n📋 NEXT STEPS:');
  console.log('   1. Re-export ML dataset with analyst activity features');
  console.log('   2. Features to extract:');
  console.log('      - upgradesLast30d');
  console.log('      - downgradesLast30d');
  console.log('      - netUpgrades');
  console.log('      - majorUpgrades');
  console.log('      - majorDowngrades');
  console.log('   3. Expected impact: Better coverage with 30-day window');
  console.log('   4. This captures "smart money" sentiment shifts before filings\n');

  await prisma.$disconnect();
}

backfillAnalystActivity().catch(console.error);
