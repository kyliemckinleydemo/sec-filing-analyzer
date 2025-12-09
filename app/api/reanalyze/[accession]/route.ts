import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuthAndAIQuota } from '@/lib/api-middleware';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ accession: string }> }
) {
  try {
    const { accession } = await params;

    // Check authentication and AI quota (re-analysis triggers full AI analysis, requires auth)
    const authCheck = await requireAuthAndAIQuota(request);
    if (!authCheck.allowed) {
      return authCheck.response!;
    }

    // Normalize accession number
    const normalizedAccession = accession.includes('-')
      ? accession
      : `${accession.slice(0, 10)}-${accession.slice(10, 12)}-${accession.slice(12)}`;

    // Find the filing
    const filing = await prisma.filing.findUnique({
      where: { accessionNumber: normalizedAccession },
      select: {
        id: true,
        accessionNumber: true,
        filingType: true,
        company: {
          select: {
            ticker: true,
            name: true
          }
        }
      }
    });

    if (!filing) {
      return NextResponse.json({ error: 'Filing not found' }, { status: 404 });
    }

    // Clear analysis data to force re-analysis
    await prisma.filing.update({
      where: { accessionNumber: normalizedAccession },
      data: {
        analysisData: null,
        sentimentScore: null,
        riskScore: null,
        concernLevel: null,
        predicted7dReturn: null,
        predictionConfidence: null
      }
    });

    // Delete prediction records
    await prisma.prediction.deleteMany({
      where: { filingId: filing.id }
    });

    console.log(`[Re-Analyze] Cleared analysis for ${filing.company.ticker} ${filing.filingType} (${normalizedAccession})`);

    return NextResponse.json({
      success: true,
      message: `Analysis cleared for ${filing.company.ticker} ${filing.filingType}. Refresh to see fresh analysis.`,
      filing: {
        ticker: filing.company.ticker,
        filingType: filing.filingType,
        accessionNumber: normalizedAccession
      }
    });
  } catch (error: any) {
    console.error('[Re-Analyze] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to clear analysis' },
      { status: 500 }
    );
  }
}
