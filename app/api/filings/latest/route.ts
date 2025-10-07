import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new Prisma Client();

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50');
    const ticker = searchParams.get('ticker');

    // Fetch latest filings with predictions
    const whereClause: any = {
      predicted7dReturn: { not: null }, // Only show filings with predictions
    };

    if (ticker) {
      whereClause.company = {
        ticker: { contains: ticker, mode: 'insensitive' },
      };
    }

    const filings = await prisma.filing.findMany({
      where: whereClause,
      include: {
        company: true,
      },
      orderBy: {
        filingDate: 'desc',
      },
      take: limit,
    });

    // Calculate days until actual for each filing
    const now = new Date();
    const enrichedFilings = filings.map((filing) => {
      const filingDate = new Date(filing.filingDate);
      const daysSinceFiling = Math.floor(
        (now.getTime() - filingDate.getTime()) / (1000 * 60 * 60 * 24)
      );
      const daysUntilActual = Math.max(0, 7 - daysSinceFiling);

      return {
        id: filing.id,
        ticker: filing.company.ticker,
        companyName: filing.company.name,
        filingType: filing.filingType,
        filingDate: filing.filingDate.toISOString(),
        predicted7dReturn: filing.predicted7dReturn,
        predictionConfidence: filing.predictionConfidence,
        actual7dReturn: filing.actual7dReturn,
        daysUntilActual,
        riskScore: filing.riskScore,
        sentimentScore: filing.sentimentScore,
        marketCap: null, // TODO: Add market cap to Company model
      };
    });

    return NextResponse.json(enrichedFilings);
  } catch (error) {
    console.error('Error fetching latest filings:', error);
    return NextResponse.json(
      { error: 'Failed to fetch latest filings' },
      { status: 500 }
    );
  }
}
