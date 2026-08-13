/**
 * @module app/page
 * @description Server component wrapper for the home dashboard. Fetches the initial
 * filings feed and top prediction signals server-side so the first HTTP response
 * contains real content (crawler- and AI-readable), then hands off to the interactive
 * HomeClient. Auth-specific data (watchlist, user) is still fetched client-side.
 */
import type { Metadata } from 'next';
import { getLatestFilings } from '@/lib/filings-server';
import { prisma } from '@/lib/prisma';
import HomeClient, { type TopSignal } from './home-client';

export const metadata: Metadata = {
  alternates: { canonical: '/' },
};

// Rebuild the server-rendered shell periodically (data still refreshes client-side)
export const revalidate = 300;

async function getTopSignals(): Promise<TopSignal[]> {
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

    return filings
      .map((f) => ({
        ticker: f.company.ticker,
        companyName: f.company.name,
        formType: f.filingType,
        filingDate: f.filingDate.toISOString(),
        accessionNumber: f.accessionNumber,
        predicted30dAlpha: f.predicted30dAlpha as number,
        predictionConfidence: f.predictionConfidence as number,
      }))
      // Rank by conviction = |expected alpha| weighted by confidence
      .sort(
        (a, b) =>
          Math.abs(b.predicted30dAlpha) * b.predictionConfidence -
          Math.abs(a.predicted30dAlpha) * a.predictionConfidence
      )
      .slice(0, 20);
  } catch (error) {
    console.error('home: getTopSignals failed', error);
    return [];
  }
}

export default async function Page() {
  const [initialFilings, initialTopSignals] = await Promise.all([
    getLatestFilings({ limit: 8 }).catch((e) => {
      console.error('home: getLatestFilings failed', e);
      return null;
    }),
    getTopSignals(),
  ]);

  return <HomeClient initialFilings={initialFilings} initialTopSignals={initialTopSignals} />;
}
