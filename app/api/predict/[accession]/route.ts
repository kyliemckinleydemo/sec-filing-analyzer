import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { predictionEngine } from '@/lib/predictions';
import { cache } from '@/lib/cache';
import { accuracyTracker } from '@/lib/accuracy-tracker';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ accession: string }> }
) {
  try {
    const { accession } = await params;

    // Caching disabled - always regenerate predictions for fresh accuracy data
    // const cacheKey = `prediction:${accession}`;
    // const cached = cache.get(cacheKey);
    // if (cached) {
    //   return NextResponse.json(cached);
    // }

    // Get filing with analysis
    const filing = await prisma.filing.findUnique({
      where: { accessionNumber: accession },
      include: { company: true },
    });

    if (!filing) {
      return NextResponse.json({ error: 'Filing not found' }, { status: 404 });
    }

    // If prediction already exists, check if we can calculate accuracy
    if (filing.predicted7dReturn !== null) {
      // Check if we have actual results or can calculate them
      let accuracyResult = null;
      if (filing.company.ticker) {
        accuracyResult = await accuracyTracker.checkAccuracy(
          filing.company.ticker,
          filing.filingDate,
          filing.predicted7dReturn
        );

        // If we got actual data and haven't stored it yet, update the database
        if (accuracyResult.hasData && accuracyResult.actual7dReturn && !filing.actual7dReturn) {
          await accuracyTracker.updateActualReturn(
            accession,
            accuracyResult.actual7dReturn
          );
        }
      }

      const result = {
        prediction: {
          predicted7dReturn: filing.predicted7dReturn,
          confidence: filing.predictionConfidence || 0.6,
          actual7dReturn: filing.actual7dReturn || accuracyResult?.actual7dReturn,
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
    let filingContentSummary = undefined;

    if (filing.analysisData) {
      try {
        const analysis = JSON.parse(filing.analysisData);
        filingContentSummary = analysis.filingContentSummary;

        // Check if we have financial metrics
        if (analysis.financialMetrics) {
          hasFinancialMetrics =
            analysis.financialMetrics.revenueGrowth ||
            analysis.financialMetrics.marginTrend ||
            analysis.financialMetrics.keyMetrics?.length > 0;

          guidanceDirection = analysis.financialMetrics.guidanceDirection;
        }
      } catch (e) {
        console.error('Error parsing analysis data:', e);
      }
    }

    // Classify 8-K event type if this is an 8-K filing
    if (filing.filingType === '8-K') {
      eventType = predictionEngine.classify8KEvent(filingContentSummary);
    }

    // Generate prediction with enhanced features
    const features = {
      riskScoreDelta: filing.riskScore || 0,
      sentimentScore: filing.sentimentScore || 0,
      riskCountNew: 2, // Mock - would parse from analysisData
      filingType: filing.filingType as '10-K' | '10-Q' | '8-K',
      eventType,
      hasFinancialMetrics,
      guidanceDirection,
      avgHistoricalReturn: await predictionEngine.getHistoricalPattern(
        filing.company.ticker || '',
        filing.filingType
      ),
    };

    const prediction = await predictionEngine.predict(features);

    // Store prediction
    await prisma.filing.update({
      where: { accessionNumber: accession },
      data: {
        predicted7dReturn: prediction.predicted7dReturn,
        predictionConfidence: prediction.confidence,
      },
    });

    await prisma.prediction.create({
      data: {
        filingId: filing.id,
        predictedReturn: prediction.predicted7dReturn,
        confidence: prediction.confidence,
        features: JSON.stringify(prediction.features),
        modelVersion: 'v1.0-pattern',
      },
    });

    const result = {
      prediction: {
        predicted7dReturn: prediction.predicted7dReturn,
        confidence: prediction.confidence,
        reasoning: prediction.reasoning,
      },
      filing: {
        accessionNumber: filing.accessionNumber,
        filingType: filing.filingType,
        company: filing.company.ticker,
      },
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
