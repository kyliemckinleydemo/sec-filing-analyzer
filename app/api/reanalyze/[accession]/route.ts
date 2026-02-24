/**
 * @module app/api/reanalyze/[accession]/route
 * @description API route handler that clears cached AI analysis data and predictions for a specific SEC filing by accession number, forcing fresh analysis on next view
 *
 * PURPOSE:
 * - Validates user authentication and available AI quota before allowing re-analysis
 * - Normalizes accession number format from XXXXXXXXXX-XX-XXXXXX or continuous string to hyphenated format
 * - Clears all analysis fields (analysisData, sentimentScore, riskScore, concernLevel, predictions) from database
 * - Deletes associated prediction records to ensure complete reset of filing analysis state
 *
 * DEPENDENCIES:
 * - next/server - Provides NextRequest and NextResponse for API route handling
 * - @/lib/prisma - Database client for querying and updating Filing and Prediction records
 * - @/lib/api-middleware - Provides requireAuthAndAIQuota middleware to enforce auth and AI usage limits
 *
 * EXPORTS:
 * - POST (function) - Clears analysis data for filing matching accession parameter and returns success confirmation with filing metadata
 *
 * PATTERNS:
 * - POST to /api/reanalyze/[accession] with authenticated request header
 * - Returns 401/403 if auth fails or AI quota exceeded, 404 if filing not found, 500 on database errors
 * - Success response includes ticker, filingType, and normalized accessionNumber for UI confirmation
 * - Accession can be passed with or without hyphens - both formats are supported and normalized
 *
 * CLAUDE NOTES:
 * - Re-analysis consumes AI quota even though it only clears data - actual AI processing happens on subsequent filing view
 * - Accession normalization assumes format XXXXXXXXXX-XX-XXXXXX (10 digits, 2 digits, remaining digits)
 * - Deletes prediction records separately via cascade-style manual deletion rather than database cascade
 * - Console logs indicate this is meant for admin/debug use - UI should refresh after clearing to trigger new analysis
 */
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
