import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import yahooFinance from 'yahoo-finance2';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Daily Cron Job: Update analyst data for recent filings
 *
 * Fetches:
 * 1. Analyst consensus (rating, target price, coverage)
 * 2. Analyst activity (upgrades/downgrades in 30 days before filing)
 *
 * Runs after daily-filings-rss to update analyst data for newly fetched filings
 */

interface AnalystActivity {
  upgradesLast30d: number;
  downgradesLast30d: number;
  netUpgrades: number;
  majorUpgrades: number;
  majorDowngrades: number;
}

// Major firms whose ratings carry more weight
const majorFirms = new Set([
  'Goldman Sachs', 'Morgan Stanley', 'JPMorgan', 'Bank of America',
  'Citigroup', 'Wells Fargo', 'Barclays', 'Credit Suisse', 'UBS',
  'Deutsche Bank', 'BofA Securities', 'Jefferies', 'Piper Sandler',
  'Raymond James', 'RBC Capital', 'Stifel', 'Evercore ISI'
]);

// Rating hierarchy
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

    // Calculate date 30 days before filing
    const thirtyDaysBefore = new Date(filingDate);
    thirtyDaysBefore.setDate(thirtyDaysBefore.getDate() - 30);

    // Filter events in the 30 days before filing
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
      majorUpgrades,
      majorDowngrades
    };

  } catch (error) {
    return {
      upgradesLast30d: 0,
      downgradesLast30d: 0,
      netUpgrades: 0,
      majorUpgrades: 0,
      majorDowngrades: 0
    };
  }
}

export async function GET(request: Request) {
  try {
    console.log('[Cron] Starting analyst data update...');

    // Get filings from the past 7 days that need analyst data
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const recentFilings = await prisma.filing.findMany({
      where: {
        filingDate: {
          gte: sevenDaysAgo
        },
        filingType: {
          in: ['10-K', '10-Q']
        }
      },
      include: {
        company: true
      },
      orderBy: {
        filingDate: 'desc'
      }
    });

    console.log(`[Cron] Found ${recentFilings.length} filings from past 7 days`);

    let updated = 0;
    let errors = 0;

    for (const filing of recentFilings) {
      try {
        const ticker = filing.company?.ticker;
        if (!ticker) continue;

        // Fetch analyst consensus
        const quote = await yahooFinance.quoteSummary(ticker, {
          modules: ['financialData', 'recommendationTrend']
        });

        const fd = quote.financialData;
        const trend = quote.recommendationTrend?.trend?.[0];

        // Fetch analyst activity
        const activity = await getAnalystActivity(ticker, filing.filingDate);

        // Calculate consensus score (0-100 scale, 100 = Strong Buy)
        let consensusScore = null;
        if (trend) {
          const total = (trend.strongBuy || 0) + (trend.buy || 0) +
                       (trend.hold || 0) + (trend.sell || 0) + (trend.strongSell || 0);
          if (total > 0) {
            consensusScore = Math.round(
              ((trend.strongBuy || 0) * 100 + (trend.buy || 0) * 75 +
               (trend.hold || 0) * 50 + (trend.sell || 0) * 25) / total
            );
          }
        }

        // Calculate upside potential
        let upsidePotential = null;
        if (fd?.targetMeanPrice && fd?.currentPrice) {
          upsidePotential = ((fd.targetMeanPrice - fd.currentPrice) / fd.currentPrice) * 100;
        }

        // Merge analyst data into analysisData JSON
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
          }
        };

        // Update filing
        await prisma.filing.update({
          where: { id: filing.id },
          data: {
            analysisData: JSON.stringify(updatedAnalysisData)
          }
        });

        updated++;

        // Rate limit: 100ms delay between requests
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (error: any) {
        console.error(`[Cron] Error updating analyst data for filing ${filing.id}:`, error.message);
        errors++;
      }
    }

    console.log(`[Cron] Analyst data update complete: ${updated} updated, ${errors} errors`);

    return NextResponse.json({
      success: true,
      message: `Updated analyst data for ${updated} filings`,
      results: {
        updated,
        errors,
        total: recentFilings.length
      }
    });

  } catch (error: any) {
    console.error('[Cron] Error in analyst data update:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
