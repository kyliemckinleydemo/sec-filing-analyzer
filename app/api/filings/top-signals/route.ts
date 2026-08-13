/**
 * @module app/api/filings/top-signals/route
 * @description Returns the highest-conviction filing prediction signals for the home
 * dashboard. Conviction = |predicted 30-day alpha| weighted by prediction confidence,
 * over filings from the last 90 days that have both a prediction and a confidence score.
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const filings = await prisma.filing.findMany({
      where: {
        predicted30dAlpha: { not: null },
        predictionConfidence: { not: null },
        filingDate: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
      },
      include: { company: { select: { ticker: true, name: true } } },
      orderBy: { predictionConfidence: 'desc' },
      take: 200,
    });

    const signals = filings
      .map((f) => ({
        ticker: f.company.ticker,
        companyName: f.company.name,
        formType: f.filingType,
        filingDate: f.filingDate.toISOString(),
        accessionNumber: f.accessionNumber,
        predicted30dAlpha: f.predicted30dAlpha as number,
        predictionConfidence: f.predictionConfidence as number,
      }))
      .sort(
        (a, b) =>
          Math.abs(b.predicted30dAlpha) * b.predictionConfidence -
          Math.abs(a.predicted30dAlpha) * a.predictionConfidence
      )
      .slice(0, 20);

    return NextResponse.json({ signals });
  } catch (error: any) {
    console.error('Error fetching top signals:', error);
    return NextResponse.json(
      { error: 'Failed to fetch top signals', details: error?.message || String(error) },
      { status: 500 }
    );
  }
}
