import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import yahooFinance from 'yahoo-finance2';

// Suppress yahoo-finance2 survey notice
yahooFinance.suppressNotices(['yahooSurvey']);

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Daily Cron Job: Update analyst data for recent filings
 *
 * Fetches:
 * 1. Analyst consensus (rating, target price, coverage)
 * 2. Analyst activity (upgrades/downgrades in 30 days before filing)
 * 3. Earnings surprise data
 * 4. Paper trading operations
 *
 * NOTE: Stock price updates moved to separate /update-stock-prices job
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

function getAnalystActivityFromData(data: any, filingDate: Date): AnalystActivity {
  try {
    const history = data.upgradeDowngradeHistory?.history || [];

    // Calculate date 30 days before filing
    const thirtyDaysBefore = new Date(filingDate);
    thirtyDaysBefore.setDate(thirtyDaysBefore.getDate() - 30);

    // Filter events in the 30 days before filing
    const recentEvents = history.filter((event: any) => {
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
  const startTime = Date.now();
  let currentOperation = 'initialization';

  // Verify request is from Vercel cron or has valid auth header
  const authHeader = request.headers.get('authorization');
  const userAgent = request.headers.get('user-agent');
  const cronSecret = process.env.CRON_SECRET;

  // Check multiple indicators that this is a Vercel cron request
  const isVercelCron = userAgent?.includes('vercel-cron/') ||
                       request.headers.get('x-vercel-cron') === '1' ||
                       request.headers.get('user-agent')?.toLowerCase().includes('vercel');
  const hasValidAuth = cronSecret && authHeader === `Bearer ${cronSecret}`;

  if (!isVercelCron && !hasValidAuth) {
    console.error('[AnalystCron] ❌ Unauthorized request', {
      userAgent,
      hasAuthHeader: !!authHeader,
      hasCronSecret: !!cronSecret
    });
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  let updated = 0;
  let errors = 0;

  // Clean up stuck jobs (older than 10 minutes and still marked as running)
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
  await prisma.cronJobRun.updateMany({
    where: {
      jobName: 'update-analyst-data',
      status: 'running',
      startedAt: {
        lt: tenMinutesAgo,
      },
    },
    data: {
      status: 'failed',
      completedAt: new Date(),
      errorMessage: 'Job timed out - auto-cleaned by next run',
    },
  });

  // Create job run record
  const jobRun = await prisma.cronJobRun.create({
    data: {
      jobName: 'update-analyst-data',
      status: 'running',
    },
  });

  try {
    console.log('[AnalystCron] 🚀 Starting analyst data update job...');

    // Get filings from the past 7 days that need analyst data
    currentOperation = 'database_query';
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // Keywords to identify earnings 8-Ks
    const earningsKeywords = [
      'earnings', 'quarterly results', 'financial results',
      'q1 20', 'q2 20', 'q3 20', 'q4 20',
      'first quarter', 'second quarter', 'third quarter', 'fourth quarter',
      'net income', 'revenue', 'eps', 'diluted earnings'
    ];

    const allRecentFilings = await prisma.filing.findMany({
      where: {
        filingDate: {
          gte: sevenDaysAgo
        },
        filingType: {
          in: ['10-K', '10-Q', '8-K']
        },
        analysisData: {
          not: null
        }
      },
      include: {
        company: true
      },
      orderBy: {
        filingDate: 'desc'
      }
    });

    // Filter for financial filings (10-K, 10-Q, and earnings 8-Ks only)
    const recentFilings = allRecentFilings.filter(filing => {
      if (filing.filingType === '10-K' || filing.filingType === '10-Q') return true;
      if (filing.filingType === '8-K' && filing.analysisData) {
        try {
          const data = JSON.parse(filing.analysisData);
          const summary = (data.filingContentSummary || data.summary || '').toLowerCase();
          return earningsKeywords.some(kw => summary.includes(kw));
        } catch {
          return false;
        }
      }
      return false;
    });

    console.log(`[AnalystCron] 📊 Found ${allRecentFilings.length} total filings, ${recentFilings.length} financial filings from past 7 days`);

    // Process each filing with comprehensive error handling
    currentOperation = 'analyst_data_updates';
    for (let i = 0; i < recentFilings.length; i++) {
      const filing = recentFilings[i];

      try {
        // Check timeout (leave 30s buffer)
        const elapsedSeconds = (Date.now() - startTime) / 1000;
        if (elapsedSeconds > 270) {
          console.log(`[AnalystCron] ⏱️  Approaching timeout at ${elapsedSeconds}s, stopping early`);
          break;
        }

        const ticker = filing.company?.ticker;
        if (!ticker) {
          console.log(`[AnalystCron] ⚠️  Skipping filing ${filing.id}: no ticker`);
          continue;
        }

        // Log progress every 5 filings
        if ((i + 1) % 5 === 0) {
          console.log(`[AnalystCron] 🔄 Progress: ${i + 1}/${recentFilings.length} filings (${updated} updated, ${errors} errors)`);
        }

        // Fetch all analyst data in a single Yahoo Finance call (5 modules)
        currentOperation = `yahoo_finance_${ticker}`;
        const quotePromise = yahooFinance.quoteSummary(ticker, {
          modules: ['financialData', 'recommendationTrend', 'earnings', 'earningsHistory', 'upgradeDowngradeHistory']
        });

        const quote = await Promise.race([
          quotePromise,
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Request timeout')), 10000)
          )
        ]) as any;

        const fd = quote.financialData;
        const trend = quote.recommendationTrend?.trend?.[0];

        // Extract analyst activity from the same response (no extra call)
        const activity = getAnalystActivityFromData(quote, filing.filingDate);

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

        // Extract earnings surprise data from the same response (no extra call)
        currentOperation = `earnings_history_${ticker}`;
        let consensusEPS: number | null = null;
        let actualEPS: number | null = null;
        let epsSurprise: 'beat' | 'miss' | 'inline' | 'unknown' = 'unknown';
        let epsSurpriseMagnitude: number | null = null;
        let revenueSurprise: 'beat' | 'miss' | 'inline' | 'unknown' = 'unknown';
        let revenueSurpriseMagnitude: number | null = null;

        try {
          const history = quote.earningsHistory?.history;
          if (history && history.length > 0) {
            // Find earnings report closest to filing date (within 90 days)
            let closestEarnings = null;
            let smallestDiff = Infinity;
            const filingTime = filing.filingDate.getTime();

            for (const period of history) {
              const quarterFmt = (period.quarter as any)?.fmt;
              if (!quarterFmt) continue;

              const quarterMatch = quarterFmt.match(/(\d)Q(\d{4})/);
              if (!quarterMatch) continue;

              const quarter = parseInt(quarterMatch[1]);
              const year = parseInt(quarterMatch[2]);
              const monthMap = [0, 0, 3, 6, 9];
              const earningsDate = new Date(year, monthMap[quarter], [31, 30, 31, 31][quarter - 1]);

              const diff = Math.abs(earningsDate.getTime() - filingTime);
              if (diff < smallestDiff) {
                smallestDiff = diff;
                closestEarnings = period;
              }
            }

            const daysDiff = smallestDiff / (1000 * 60 * 60 * 24);
            if (closestEarnings && daysDiff <= 90) {
              const epsEstimate = (closestEarnings.epsEstimate as any)?.raw ?? closestEarnings.epsEstimate;
              const epsActual = (closestEarnings.epsActual as any)?.raw ?? closestEarnings.epsActual;
              const surprisePercent = (closestEarnings.surprisePercent as any)?.raw ?? closestEarnings.surprisePercent;

              if (typeof epsEstimate === 'number') consensusEPS = epsEstimate;
              if (typeof epsActual === 'number') actualEPS = epsActual;

              if (typeof surprisePercent === 'number') {
                epsSurpriseMagnitude = surprisePercent * 100;
                if (epsSurpriseMagnitude > 2) epsSurprise = 'beat';
                else if (epsSurpriseMagnitude < -2) epsSurprise = 'miss';
                else epsSurprise = 'inline';
              }
            }
          }
        } catch (earningsError: any) {
          // Silently handle - not all tickers have earnings data
        }

        // Merge analyst data into analysisData JSON
        currentOperation = `database_update_${ticker}`;
        let existingData: any = {};
        if (filing.analysisData) {
          try {
            existingData = typeof filing.analysisData === 'string'
              ? JSON.parse(filing.analysisData)
              : filing.analysisData;
          } catch (e) {
            console.error(`[AnalystCron] ⚠️  Failed to parse existing analysisData for filing ${filing.id}`);
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

        // Update filing with both dedicated fields and analysisData
        await prisma.filing.update({
          where: { id: filing.id },
          data: {
            consensusEPS,
            actualEPS,
            epsSurprise: epsSurpriseMagnitude,
            revenueSurprise: revenueSurpriseMagnitude,
            analysisData: JSON.stringify(updatedAnalysisData)
          }
        });

        updated++;

        // Rate limit: 250ms delay between requests (~4 req/sec to stay under Yahoo's ~2,500/hr limit)
        await new Promise(resolve => setTimeout(resolve, 250));

      } catch (error: any) {
        errors++;
        console.error(`[AnalystCron] ❌ Error updating filing ${filing.id} (${filing.company?.ticker}):`, {
          operation: currentOperation,
          error: error.message,
          stack: error.stack?.split('\n')[0]
        });
        // Continue with next filing
        continue;
      }
    }

    console.log(`[AnalystCron] ✅ Analyst data complete: ${updated} updated, ${errors} errors`);

    // Paper trading disabled - model needs recalibration
    // TODO: Re-enable once stock forecasting model is updated
    console.log('[AnalystCron] ⏸️  Paper trading disabled (model recalibration needed)');

    const elapsedSeconds = Math.round((Date.now() - startTime) / 1000);
    console.log(`[AnalystCron] 🎉 Job complete in ${elapsedSeconds}s`);

    // Mark job run as successful
    await prisma.cronJobRun.update({
      where: { id: jobRun.id },
      data: {
        status: 'success',
        completedAt: new Date(),
        filingsFetched: recentFilings.length,
        filingsStored: updated,
        companiesProcessed: updated,
      },
    });

    return NextResponse.json({
      success: true,
      message: `Updated analyst data for ${updated} filings`,
      results: {
        analystData: {
          updated,
          errors,
          total: recentFilings.length
        },
        elapsedSeconds
      }
    });

  } catch (error: any) {
    const elapsedSeconds = Math.round((Date.now() - startTime) / 1000);
    console.error('[AnalystCron] ❌ Fatal error:', {
      operation: currentOperation,
      error: error.message,
      stack: error.stack,
      elapsedSeconds
    });

    // Mark job run as failed
    await prisma.cronJobRun.update({
      where: { id: jobRun.id },
      data: {
        status: 'failed',
        completedAt: new Date(),
        errorMessage: error.message,
      },
    });

    return NextResponse.json(
      {
        error: error.message,
        failedOperation: currentOperation,
        partialResults: {
          updated,
          errors,
          elapsedSeconds
        }
      },
      { status: 500 }
    );
  }
}
