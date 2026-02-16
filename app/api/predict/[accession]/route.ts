import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { predictAlpha, extractAlphaFeatures } from '@/lib/alpha-model';
import { predictionEngine } from '@/lib/predictions';
import { accuracyTracker } from '@/lib/accuracy-tracker';
import { requireUnauthRateLimit } from '@/lib/api-middleware';

const MAJOR_FIRMS = ['Goldman Sachs', 'Morgan Stanley', 'JP Morgan', 'Bank of America',
                     'Citi', 'Wells Fargo', 'Barclays', 'UBS'];

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ accession: string }> }
) {
  try {
    const { accession } = await params;

    // Check authentication/rate limit (authenticated users bypass, unauth limited to 20/day)
    const authCheck = await requireUnauthRateLimit(request);
    if (!authCheck.allowed) {
      return authCheck.response!;
    }

    // Normalize accession number (add dashes if missing)
    const normalizedAccession = accession.includes('-')
      ? accession
      : `${accession.slice(0, 10)}-${accession.slice(10, 12)}-${accession.slice(12)}`;

    // Get filing with analysis
    const filing = await prisma.filing.findUnique({
      where: { accessionNumber: normalizedAccession },
      include: { company: true },
    });

    if (!filing) {
      return NextResponse.json({ error: 'Filing not found' }, { status: 404 });
    }

    // If alpha prediction already exists, return cached + accuracy check
    if ((filing as any).predicted30dAlpha !== null && (filing as any).predicted30dAlpha !== undefined) {
      console.log(`[Predict API] Alpha prediction exists: alpha=${(filing as any).predicted30dAlpha}%, filing date: ${filing.filingDate}, ticker: ${filing.company.ticker}`);

      // Check if we have actual results or can calculate them
      let accuracyResult = null;
      if (filing.company.ticker && filing.predicted7dReturn !== null) {
        try {
          accuracyResult = await accuracyTracker.checkAccuracy(
            filing.company.ticker,
            filing.filingDate,
            filing.predicted7dReturn!
          );

          // If we got actual data and haven't stored it yet, update the database
          if (accuracyResult?.hasData && accuracyResult.actual7dReturn && !filing.actual7dReturn) {
            await accuracyTracker.updateActualReturn(
              normalizedAccession,
              accuracyResult.actual7dReturn
            );
          }
        } catch (error) {
          console.error(`[Predict API] Error checking accuracy:`, error);
        }
      }

      // Try to get stored features from prediction record
      let storedFeatures = null;
      try {
        const predictionRecord = await prisma.prediction.findFirst({
          where: { filingId: filing.id },
          orderBy: { createdAt: 'desc' },
        });
        if (predictionRecord?.features) {
          storedFeatures = JSON.parse(predictionRecord.features);
        }
      } catch (e) {
        console.error('Error loading prediction features:', e);
      }

      const confidenceVal = filing.predictionConfidence || 0.5;
      const result = {
        prediction: {
          signal: (filing as any).predicted30dAlpha > 0 ? 'LONG' : (filing as any).predicted30dAlpha < 0 ? 'SHORT' : 'NEUTRAL',
          confidence: confidenceVal >= 0.80 ? 'high' : confidenceVal >= 0.60 ? 'medium' : 'low',
          expectedAlpha: (filing as any).predicted30dAlpha,
          predicted30dReturn: filing.predicted30dReturn,
          predicted7dReturn: filing.predicted7dReturn,
          featureContributions: storedFeatures,
          actual7dReturn: filing.actual7dReturn || accuracyResult?.actual7dReturn,
          actual7dAlpha: filing.actual7dAlpha,
          actual30dAlpha: filing.actual30dAlpha,
          modelVersion: 'alpha-v1.0',
        },
        accuracy: accuracyResult,
        filing: {
          accessionNumber: filing.accessionNumber,
          filingType: filing.filingType,
          filingDate: filing.filingDate,
          company: filing.company.ticker,
        },
      };

      return NextResponse.json(result);
    }

    // No alpha prediction yet — generate one using the alpha model

    // Query analyst activity from AnalystActivity table (30 days before filing)
    let upgradeCount = 0;
    let majorDowngradeCount = 0;

    try {
      const thirtyDaysAgo = new Date(filing.filingDate);
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const analystActivities = await prisma.analystActivity.findMany({
        where: {
          companyId: filing.companyId,
          activityDate: {
            gte: thirtyDaysAgo,
            lt: filing.filingDate
          }
        },
        select: {
          actionType: true,
          firm: true,
        }
      });

      upgradeCount = analystActivities.filter(a => a.actionType === 'upgrade').length;
      majorDowngradeCount = analystActivities.filter(a =>
        a.actionType === 'downgrade' && MAJOR_FIRMS.some(firm => a.firm.includes(firm))
      ).length;

      if (analystActivities.length > 0) {
        console.log(`[Analyst Activity] ${filing.company.ticker}: ${upgradeCount} upgrades, ${majorDowngradeCount} major downgrades in 30d before filing`);
      }
    } catch (analystError) {
      console.error('Error fetching analyst activity:', analystError);
    }

    // Check if we have the minimum required data for the alpha model
    const hasMinimumData = filing.company.currentPrice && filing.company.currentPrice > 0 &&
      (filing.company.fiftyTwoWeekLow || filing.concernLevel != null);

    let alphaPrediction;

    if (hasMinimumData) {
      console.log(`[Predict API] Using ALPHA MODEL v1.0 for ${filing.company.ticker}`);

      const alphaFeatures = extractAlphaFeatures(
        {
          currentPrice: filing.company.currentPrice || 0,
          fiftyTwoWeekHigh: filing.company.fiftyTwoWeekHigh || 0,
          fiftyTwoWeekLow: filing.company.fiftyTwoWeekLow || 0,
          marketCap: filing.company.marketCap || 0,
          analystTargetPrice: filing.company.analystTargetPrice,
        },
        {
          concernLevel: filing.concernLevel,
          sentimentScore: filing.sentimentScore,
        },
        { upgradesLast30d: upgradeCount, majorDowngradesLast30d: majorDowngradeCount },
      );

      alphaPrediction = predictAlpha(alphaFeatures);
      console.log(`[Predict API] Alpha prediction: signal=${alphaPrediction.signal} (${alphaPrediction.confidence}), alpha=${alphaPrediction.expectedAlpha}%, 30d return=${alphaPrediction.predicted30dReturn}%`);
    } else {
      // Last-resort fallback: use legacy rule-based engine (rare — only if no Yahoo Finance data)
      console.log(`[Predict API] Insufficient data for alpha model, using LEGACY fallback for ${filing.company.ticker}`);

      const legacyPrediction = await predictionEngine.predict({
        riskScoreDelta: 0,
        sentimentScore: filing.sentimentScore || 0,
        concernLevel: filing.concernLevel || undefined,
        riskCountNew: 0,
        filingType: filing.filingType as '10-K' | '10-Q' | '8-K',
        avgHistoricalReturn: 0,
      });

      // Map legacy prediction to alpha-like result
      alphaPrediction = {
        signal: legacyPrediction.predicted7dReturn > 1 ? 'LONG' as const
          : legacyPrediction.predicted7dReturn < -1 ? 'SHORT' as const : 'NEUTRAL' as const,
        confidence: legacyPrediction.confidence >= 0.7 ? 'medium' as const : 'low' as const,
        expectedAlpha: legacyPrediction.predicted7dReturn * (30 / 7),
        predicted30dReturn: legacyPrediction.predicted7dReturn * (30 / 7) + 0.8,
        featureContributions: {},
        percentile: 'unknown',
        rawScore: 0,
      };
    }

    // Map confidence to numeric for DB
    const confidenceNumeric = alphaPrediction.confidence === 'high' ? 0.85
      : alphaPrediction.confidence === 'medium' ? 0.65 : 0.5;

    // Store prediction
    await prisma.filing.update({
      where: { accessionNumber: normalizedAccession },
      data: {
        predicted30dReturn: alphaPrediction.predicted30dReturn,
        predicted30dAlpha: alphaPrediction.expectedAlpha,
        predictionConfidence: confidenceNumeric,
        // Keep predicted7dReturn for backward compat
        predicted7dReturn: alphaPrediction.predicted30dReturn * (7 / 30),
      },
    });

    await prisma.prediction.create({
      data: {
        filingId: filing.id,
        predictedReturn: alphaPrediction.predicted30dReturn,
        confidence: confidenceNumeric,
        features: JSON.stringify(alphaPrediction.featureContributions),
        modelVersion: 'alpha-v1.0',
      },
    });

    // Automatically evaluate for paper trading
    let paperTradingResult = null;
    try {
      const { PaperTradingEngine } = await import('@/lib/paper-trading');

      const portfolio = await prisma.paperPortfolio.findFirst({
        where: { isActive: true }
      });

      if (portfolio) {
        const engine = new PaperTradingEngine(portfolio.id);

        const signal = {
          ticker: filing.company.ticker || '',
          filingId: filing.id,
          predictedReturn: alphaPrediction.predicted30dReturn,
          confidence: confidenceNumeric,
          direction: alphaPrediction.signal === 'SHORT' ? 'SHORT' : 'LONG' as 'LONG' | 'SHORT',
          marketCap: filing.company.marketCap || undefined
        };

        const shouldTrade = await engine.evaluateTradeSignal(signal);

        if (shouldTrade) {
          paperTradingResult = await engine.executeTrade(signal);
          console.log(`[Predict API] Paper trade executed:`, paperTradingResult);
        } else {
          console.log(`[Predict API] Signal did not meet trading criteria`);
        }
      }
    } catch (error) {
      console.error('[Predict API] Error in paper trading automation:', error);
    }

    const result = {
      prediction: {
        signal: alphaPrediction.signal,
        confidence: alphaPrediction.confidence,
        expectedAlpha: alphaPrediction.expectedAlpha,
        predicted30dReturn: alphaPrediction.predicted30dReturn,
        predicted7dReturn: alphaPrediction.predicted30dReturn * (7 / 30),
        featureContributions: alphaPrediction.featureContributions,
        percentile: alphaPrediction.percentile,
        modelVersion: 'alpha-v1.0',
      },
      filing: {
        accessionNumber: filing.accessionNumber,
        filingType: filing.filingType,
        company: filing.company.ticker,
      },
      paperTrading: paperTradingResult || { evaluated: true, executed: false },
    };

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Error generating prediction:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate prediction' },
      { status: 500 }
    );
  }
}
