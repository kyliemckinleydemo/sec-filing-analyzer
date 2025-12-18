import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import yahooFinance from 'yahoo-finance2';
import { yfinanceClient } from '@/lib/yfinance-client';

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
  // Verify request is from Vercel cron or has valid auth header
  const authHeader = request.headers.get('authorization');
  const userAgent = request.headers.get('user-agent');
  const cronSecret = process.env.CRON_SECRET;

  const isVercelCron = userAgent?.includes('vercel-cron/');
  const hasValidAuth = cronSecret && authHeader === `Bearer ${cronSecret}`;

  if (!isVercelCron && !hasValidAuth) {
    console.error('[Cron] Unauthorized request - not from Vercel cron and no valid auth header');
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    console.log('[Cron] Starting analyst data update...');

    // Get filings from the past 7 days that need analyst data
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

    console.log(`[Cron] Found ${allRecentFilings.length} total filings, ${recentFilings.length} financial filings from past 7 days`);

    let updated = 0;
    let errors = 0;

    for (const filing of recentFilings) {
      try {
        const ticker = filing.company?.ticker;
        if (!ticker) continue;

        // Fetch analyst consensus and earnings data
        const quote = await yahooFinance.quoteSummary(ticker, {
          modules: ['financialData', 'recommendationTrend', 'earnings']
        });

        const fd = quote.financialData;
        const trend = quote.recommendationTrend?.trend?.[0];
        const earnings = quote.earnings;

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

        // Fetch earnings surprise data using our yfinance client
        const earningsResponse = await yfinanceClient.getEarningsHistory(ticker);

        let consensusEPS: number | null = null;
        let actualEPS: number | null = null;
        let epsSurprise: 'beat' | 'miss' | 'inline' | 'unknown' = 'unknown';
        let epsSurpriseMagnitude: number | null = null;
        let revenueSurprise: 'beat' | 'miss' | 'inline' | 'unknown' = 'unknown';
        let revenueSurpriseMagnitude: number | null = null;

        if (earningsResponse.success && earningsResponse.data.length > 0) {
          // Find earnings report closest to filing date
          const closestEarnings = yfinanceClient.findClosestEarnings(
            earningsResponse.data,
            filing.filingDate,
            90 // Within 90 days
          );

          if (closestEarnings) {
            // Store consensus and actual EPS
            consensusEPS = closestEarnings.epsEstimate;
            actualEPS = closestEarnings.epsActual;

            // Calculate surprise if we have both values
            if (closestEarnings.epsSurprise !== null) {
              epsSurpriseMagnitude = closestEarnings.epsSurprise * 100; // Convert to percentage
              if (epsSurpriseMagnitude > 2) epsSurprise = 'beat';
              else if (epsSurpriseMagnitude < -2) epsSurprise = 'miss';
              else epsSurprise = 'inline';
            }

            // Revenue surprise (if available)
            if (closestEarnings.revenueSurprise !== null) {
              revenueSurpriseMagnitude = closestEarnings.revenueSurprise;
              if (revenueSurpriseMagnitude > 2) revenueSurprise = 'beat';
              else if (revenueSurpriseMagnitude < -2) revenueSurprise = 'miss';
              else revenueSurprise = 'inline';
            }
          }
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
            // Store in dedicated fields for model training
            consensusEPS,
            actualEPS,
            epsSurprise: epsSurpriseMagnitude,
            revenueSurprise: revenueSurpriseMagnitude,
            // Keep analysisData for backwards compatibility
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

    // Update stock prices for companies with recent filings (past 7 days)
    console.log('[Cron] Updating stock prices for recently filed companies...');
    let stockPriceUpdates = 0;
    let stockPriceErrors = 0;

    try {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      // Get companies with recent filings (past 7 days) - these are priority
      const activeCompanies = await prisma.company.findMany({
        where: {
          filings: {
            some: {
              filingDate: {
                gte: sevenDaysAgo
              }
            }
          }
        },
        select: { id: true, ticker: true }
      });

      console.log(`[Cron] Found ${activeCompanies.length} recently filed companies to update (past 7 days)`);

      // Update in batches to avoid rate limits and timeout
      const BATCH_SIZE = 100;
      const BATCH_DELAY_MS = 2000; // 2 seconds between batches

      for (let i = 0; i < activeCompanies.length; i += BATCH_SIZE) {
        const batch = activeCompanies.slice(i, i + BATCH_SIZE);
        console.log(`[Cron] Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(activeCompanies.length / BATCH_SIZE)}`);

        for (const company of batch) {
          try {
            // Fetch latest quote data
            const quote = await yahooFinance.quoteSummary(company.ticker, {
              modules: ['price', 'summaryDetail', 'financialData']
            });

            const price = quote.price;
            const summaryDetail = quote.summaryDetail;
            const financialData = quote.financialData;

            if (price || summaryDetail || financialData) {
              await prisma.company.update({
                where: { id: company.id },
                data: {
                  currentPrice: price?.regularMarketPrice ?? null,
                  marketCap: price?.marketCap ?? null,
                  peRatio: summaryDetail?.trailingPE ?? null,
                  forwardPE: summaryDetail?.forwardPE ?? null,
                  beta: summaryDetail?.beta ?? null,
                  dividendYield: summaryDetail?.dividendYield ?? null,
                  fiftyTwoWeekHigh: summaryDetail?.fiftyTwoWeekHigh ?? null,
                  fiftyTwoWeekLow: summaryDetail?.fiftyTwoWeekLow ?? null,
                  volume: price?.regularMarketVolume ? BigInt(price.regularMarketVolume) : null,
                  averageVolume: summaryDetail?.averageVolume ? BigInt(summaryDetail.averageVolume) : null,
                  analystTargetPrice: financialData?.targetMeanPrice ?? null,
                  yahooLastUpdated: new Date()
                }
              });

              stockPriceUpdates++;
            }

            // Rate limit: 100ms delay between requests
            await new Promise(resolve => setTimeout(resolve, 100));

          } catch (error: any) {
            // Skip companies with errors (delisted, invalid ticker, etc.)
            if (!error.message?.includes('Not Found')) {
              console.error(`[Cron] Error updating stock price for ${company.ticker}:`, error.message);
            }
            stockPriceErrors++;
          }
        }

        // Delay between batches to avoid rate limits
        if (i + BATCH_SIZE < activeCompanies.length) {
          await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
        }
      }

      console.log(`[Cron] Stock price updates complete: ${stockPriceUpdates} updated, ${stockPriceErrors} errors`);
    } catch (error: any) {
      console.error('[Cron] Error in stock price update:', error.message);
    }

    // Also handle paper trading operations (since we're limited to 2 cron jobs)
    // 1. Execute pending trades at market open
    // 2. Close expired positions (7+ days)
    console.log('[Cron] Processing paper trading operations...');
    let pendingExecuted = 0;
    let paperTradingClosed = 0;

    try {
      const { PaperTradingEngine } = await import('@/lib/paper-trading');

      const portfolios = await prisma.paperPortfolio.findMany({
        where: { isActive: true }
      });

      for (const portfolio of portfolios) {
        try {
          const engine = new PaperTradingEngine(portfolio.id);

          // Execute any PENDING trades at market open (if market is open)
          const executed = await engine.executePendingTrades();
          pendingExecuted += executed;

          if (executed > 0) {
            console.log(`[Cron] Portfolio "${portfolio.name}": executed ${executed} pending trades`);
          }

          // Close expired positions
          const closed = await engine.closeExpiredPositions();
          paperTradingClosed += closed;

          if (closed > 0) {
            console.log(`[Cron] Portfolio "${portfolio.name}": closed ${closed} positions`);
          }

          // Update metrics after trading operations
          if (executed > 0 || closed > 0) {
            await engine.updatePortfolioMetrics();
          }
        } catch (error: any) {
          console.error(`[Cron] Error processing portfolio ${portfolio.id}:`, error.message);
        }
      }

      console.log(`[Cron] Paper trading: ${pendingExecuted} pending trades executed, ${paperTradingClosed} positions closed`);
    } catch (error: any) {
      console.error('[Cron] Error in paper trading operations:', error.message);
    }

    return NextResponse.json({
      success: true,
      message: `Updated analyst data for ${updated} filings, updated ${stockPriceUpdates} stock prices, executed ${pendingExecuted} pending trades, closed ${paperTradingClosed} paper trading positions`,
      results: {
        analystData: {
          updated,
          errors,
          total: recentFilings.length
        },
        stockPrices: {
          updated: stockPriceUpdates,
          errors: stockPriceErrors
        },
        paperTrading: {
          pendingExecuted,
          positionsClosed: paperTradingClosed
        }
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
