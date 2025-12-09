import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { predictionEngine } from '@/lib/predictions';
import { cache } from '@/lib/cache';
import { accuracyTracker } from '@/lib/accuracy-tracker';
import { marketMomentumClient } from '@/lib/market-momentum';
import { macroIndicatorsClient } from '@/lib/macro-indicators';
import { requireUnauthRateLimit } from '@/lib/api-middleware';

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

    // Caching disabled - always regenerate predictions for fresh accuracy data
    // const cacheKey = `prediction:${normalizedAccession}`;
    // const cached = cache.get(cacheKey);
    // if (cached) {
    //   return NextResponse.json(cached);
    // }

    // Get filing with analysis
    const filing = await prisma.filing.findUnique({
      where: { accessionNumber: normalizedAccession },
      include: { company: true },
    });

    if (!filing) {
      return NextResponse.json({ error: 'Filing not found' }, { status: 404 });
    }

    // DEBUG: Log filing fields to diagnose concernLevel issue
    console.log(`[Predict API DEBUG] Filing ${normalizedAccession}:`, {
      concernLevel: filing.concernLevel,
      sentimentScore: filing.sentimentScore,
      riskScore: filing.riskScore,
      predicted7dReturn: filing.predicted7dReturn,
      hasAnalysisData: !!filing.analysisData
    });

    // If prediction already exists, check if we can calculate accuracy
    if (filing.predicted7dReturn !== null) {
      console.log(`[Predict API] Prediction exists: ${filing.predicted7dReturn}%, filing date: ${filing.filingDate}, ticker: ${filing.company.ticker}`);

      // Check if we have actual results or can calculate them
      let accuracyResult = null;
      if (filing.company.ticker) {
        console.log(`[Predict API] About to check accuracy for ${filing.company.ticker}...`);
        try {
          accuracyResult = await accuracyTracker.checkAccuracy(
            filing.company.ticker,
            filing.filingDate,
            filing.predicted7dReturn
          );
          console.log(`[Predict API] Accuracy result:`, JSON.stringify(accuracyResult, null, 2));
        } catch (error) {
          console.error(`[Predict API] Error checking accuracy:`, error);
        }

        // If we got actual data and haven't stored it yet, update the database
        if (accuracyResult?.hasData && accuracyResult.actual7dReturn && !filing.actual7dReturn) {
          console.log(`[Predict API] Updating actual return in database: ${accuracyResult.actual7dReturn}%`);
          await accuracyTracker.updateActualReturn(
            normalizedAccession,
            accuracyResult.actual7dReturn
          );
        }
      } else {
        console.log(`[Predict API] No ticker available for accuracy check`);
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

      const result = {
        prediction: {
          predicted7dReturn: filing.predicted7dReturn,
          confidence: filing.predictionConfidence || 0.6,
          actual7dReturn: filing.actual7dReturn || accuracyResult?.actual7dReturn,
          features: storedFeatures,
          modelVersion: 'v2.0-research-2025',
        },
        accuracy: accuracyResult,
        filing: {
          accessionNumber: filing.accessionNumber,
          filingType: filing.filingType,
          filingDate: filing.filingDate,
          company: filing.company.ticker,
        },
      };

      // Caching disabled for fresh accuracy checks
      // cache.set(cacheKey, result, 86400000);
      return NextResponse.json(result);
    }

    // Parse analysis data for enhanced features
    let eventType = undefined;
    let hasFinancialMetrics = false;
    let guidanceDirection = undefined;
    let guidanceChange = undefined;
    let epsSurprise = undefined;
    let epsSurpriseMagnitude = undefined;
    let revenueSurprise = undefined;
    let revenueSurpriseMagnitude = undefined;
    let filingContentSummary = undefined;
    let peRatio = undefined;
    let marketCap = undefined;
    let riskScoreDelta = 0; // Default to 0 if no comparison available

    if (filing.analysisData) {
      try {
        const analysis = JSON.parse(filing.analysisData);
        filingContentSummary = analysis.filingContentSummary;

        // Extract risk score delta from analysis (change from prior period)
        if (analysis.risks?.riskScore !== undefined && analysis.risks?.priorRiskScore !== undefined) {
          riskScoreDelta = analysis.risks.riskScore - analysis.risks.priorRiskScore;
        } else {
          // No prior period comparison available - default to 0 (no change)
          riskScoreDelta = 0;
        }

        // Check if we have financial metrics
        if (analysis.financialMetrics) {
          hasFinancialMetrics =
            analysis.financialMetrics.revenueGrowth ||
            analysis.financialMetrics.marginTrend ||
            analysis.financialMetrics.keyMetrics?.length > 0 ||
            analysis.financialMetrics.structuredData;

          guidanceDirection = analysis.financialMetrics.guidanceDirection;

          // NEW: Guidance comparison vs prior period (MAJOR PRICE DRIVER)
          if (analysis.financialMetrics.guidanceComparison) {
            guidanceChange = analysis.financialMetrics.guidanceComparison.change;
          }

          // NEW: Extract P/E ratio and market cap from structured data (Yahoo Finance)
          if (analysis.financialMetrics.structuredData) {
            peRatio = analysis.financialMetrics.structuredData.peRatio;
            marketCap = analysis.financialMetrics.structuredData.marketCap; // in billions
          }

          // NEW: Extract earnings surprises from structured data
          if (analysis.financialMetrics.structuredData) {
            epsSurprise = analysis.financialMetrics.structuredData.epsSurprise;
            epsSurpriseMagnitude = analysis.financialMetrics.structuredData.epsSurpriseMagnitude;
            revenueSurprise = analysis.financialMetrics.structuredData.revenueSurprise;
            revenueSurpriseMagnitude = analysis.financialMetrics.structuredData.revenueSurpriseMagnitude;
          }

          // Fallback: Parse from surprises array if structured data missing
          if (!epsSurprise && analysis.financialMetrics.surprises) {
            for (const surprise of analysis.financialMetrics.surprises) {
              if (surprise.toLowerCase().includes('eps')) {
                if (surprise.toLowerCase().includes('beat')) {
                  epsSurprise = 'beat';
                } else if (surprise.toLowerCase().includes('miss')) {
                  epsSurprise = 'miss';
                }
              }
              if (surprise.toLowerCase().includes('revenue')) {
                if (surprise.toLowerCase().includes('beat')) {
                  revenueSurprise = 'beat';
                } else if (surprise.toLowerCase().includes('miss')) {
                  revenueSurprise = 'miss';
                }
              }
            }
          }
        }
      } catch (e) {
        console.error('Error parsing analysis data:', e);
      }
    }

    // Classify 8-K event type if this is an 8-K filing
    if (filing.filingType === '8-K') {
      eventType = predictionEngine.classify8KEvent(filingContentSummary);
    }

    // Fetch market momentum, regime, and flight-to-quality indicators
    let marketMomentum = undefined;
    let marketRegime = undefined;
    let marketVolatility = undefined;
    let flightToQuality = undefined;
    try {
      const momentumData = await marketMomentumClient.fetchMomentum(filing.filingDate);
      if (momentumData && momentumData.success) {
        marketMomentum = momentumData.marketMomentum;
        marketRegime = momentumData.regime;
        marketVolatility = momentumData.volatility;
        flightToQuality = momentumData.flightToQuality;
      }
    } catch (momentumError) {
      console.error('Error fetching market momentum:', momentumError);
      // Continue without market data
    }

    // Fetch macro indicators (DXY dollar index, GDP proxy)
    let dollarStrength = undefined;
    let dollar30dChange = undefined;
    let gdpProxyTrend = undefined;
    let equityFlowBias = undefined;
    try {
      const macroData = await macroIndicatorsClient.fetchIndicators(filing.filingDate);
      if (macroData && macroData.success) {
        dollarStrength = macroData.dollarStrength;
        dollar30dChange = macroData.dollar30dChange;
        gdpProxyTrend = macroData.gdpProxyTrend;
        equityFlowBias = macroData.equityFlowBias;
      }
    } catch (macroError) {
      console.error('Error fetching macro indicators:', macroError);
      // Continue without macro data
    }

    // Query analyst activity from AnalystActivity table (30 days before filing)
    let analystNetUpgrades = undefined;
    let analystMajorUpgrades = undefined;
    let analystMajorDowngrades = undefined;
    let analystConsensus = undefined;
    let analystUpsidePotential = undefined;

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

      if (analystActivities.length > 0) {
        const majorFirms = ['Goldman Sachs', 'Morgan Stanley', 'JP Morgan', 'Bank of America', 'Citi', 'Wells Fargo', 'Barclays', 'UBS'];

        const upgrades = analystActivities.filter(a => a.actionType === 'upgrade').length;
        const downgrades = analystActivities.filter(a => a.actionType === 'downgrade').length;

        analystNetUpgrades = upgrades - downgrades;
        analystMajorUpgrades = analystActivities.filter(a =>
          a.actionType === 'upgrade' && majorFirms.some(firm => a.firm.includes(firm))
        ).length;
        analystMajorDowngrades = analystActivities.filter(a =>
          a.actionType === 'downgrade' && majorFirms.some(firm => a.firm.includes(firm))
        ).length;

        console.log(`[Analyst Activity] ${filing.company.ticker}: ${upgrades} upgrades, ${downgrades} downgrades in 30d before filing`);
      }

      // Get analyst consensus and upside from Yahoo Finance data (current snapshot)
      if (filing.company.analystTargetPrice && filing.company.currentPrice) {
        analystUpsidePotential = ((filing.company.analystTargetPrice - filing.company.currentPrice) / filing.company.currentPrice) * 100;
      }

      // Calculate consensus score from analyst rating counts if available
      if (filing.company.analystRating) {
        // Convert 1-5 scale (1=Strong Buy, 5=Sell) to 0-100 (100=Strong Buy)
        analystConsensus = (5 - filing.company.analystRating) * 25;
      }
    } catch (analystError) {
      console.error('Error fetching analyst activity:', analystError);
      // Continue without analyst data
    }

    // Generate prediction with research-backed enhanced features
    const features = {
      riskScoreDelta: riskScoreDelta, // Use calculated delta, not absolute score
      sentimentScore: filing.sentimentScore || 0,
      concernLevel: filing.concernLevel || undefined, // Multi-factor concern assessment
      riskCountNew: 2, // Mock - would parse from analysisData
      filingType: filing.filingType as '10-K' | '10-Q' | '8-K',
      eventType,
      hasFinancialMetrics,
      guidanceDirection,
      // NEW: Major price drivers
      guidanceChange: guidanceChange as any,
      epsSurprise: epsSurprise as any,
      epsSurpriseMagnitude: epsSurpriseMagnitude,
      revenueSurprise: revenueSurprise as any,
      revenueSurpriseMagnitude: revenueSurpriseMagnitude,
      // NEW: Valuation context (from Yahoo Finance)
      peRatio: peRatio,
      marketCap: marketCap, // in billions
      // NEW: Market context (SPY momentum + regime)
      marketMomentum: marketMomentum,
      marketRegime: marketRegime as any,
      marketVolatility: marketVolatility,
      flightToQuality: flightToQuality,
      // NEW: Macro economic context
      dollarStrength: dollarStrength as any,
      dollar30dChange: dollar30dChange,
      gdpProxyTrend: gdpProxyTrend as any,
      equityFlowBias: equityFlowBias as any,
      // NEW: Analyst activity & sentiment
      analystNetUpgrades: analystNetUpgrades,
      analystMajorUpgrades: analystMajorUpgrades,
      analystMajorDowngrades: analystMajorDowngrades,
      analystConsensus: analystConsensus,
      analystUpsidePotential: analystUpsidePotential,
      // Company-specific patterns
      ticker: filing.company.ticker || undefined,
      avgHistoricalReturn: await predictionEngine.getHistoricalPattern(
        filing.company.ticker || '',
        filing.filingType
      ),
    };

    // DEBUG: Log key features being passed to prediction engine
    console.log(`[Predict API DEBUG] Features for prediction:`, {
      concernLevel: features.concernLevel,
      sentimentScore: features.sentimentScore,
      riskScoreDelta: features.riskScoreDelta,
      analystNetUpgrades: features.analystNetUpgrades
    });

    const prediction = await predictionEngine.predict(features);

    // Store prediction
    await prisma.filing.update({
      where: { accessionNumber: normalizedAccession },
      data: {
        predicted7dReturn: prediction.predicted7dReturn,
        predictionConfidence: prediction.confidence,
      },
    });

    const predictionRecord = await prisma.prediction.create({
      data: {
        filingId: filing.id,
        predictedReturn: prediction.predicted7dReturn,
        confidence: prediction.confidence,
        features: JSON.stringify(prediction.features),
        modelVersion: 'v2.0-research-2025', // Updated with 2024-2025 academic research
      },
    });

    // Automatically evaluate for paper trading
    let paperTradingResult = null;
    try {
      const { PaperTradingEngine } = await import('@/lib/paper-trading');

      // Get the main portfolio
      const portfolio = await prisma.paperPortfolio.findFirst({
        where: { isActive: true }
      });

      if (portfolio) {
        const engine = new PaperTradingEngine(portfolio.id);

        const signal = {
          ticker: filing.company.ticker || '',
          filingId: filing.id,
          predictedReturn: prediction.predicted7dReturn,
          confidence: prediction.confidence,
          direction: prediction.predicted7dReturn > 0 ? 'LONG' : 'SHORT' as 'LONG' | 'SHORT',
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
      // Don't fail the prediction if paper trading fails
    }

    const result = {
      prediction: {
        predicted7dReturn: prediction.predicted7dReturn,
        confidence: prediction.confidence,
        reasoning: prediction.reasoning,
        features: prediction.features, // Include feature breakdown for transparency
        modelVersion: 'v2.0-research-2025',
      },
      filing: {
        accessionNumber: filing.accessionNumber,
        filingType: filing.filingType,
        company: filing.company.ticker,
      },
      paperTrading: paperTradingResult || { evaluated: true, executed: false },
    };

    // Caching disabled
    // cache.set(cacheKey, result, 86400000);
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Error generating prediction:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate prediction' },
      { status: 500 }
    );
  }
}
