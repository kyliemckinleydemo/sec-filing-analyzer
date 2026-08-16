/**
 * @module app/latest-filings/page
 * @description Server component wrapper for the Latest Filings browser. Fetches the
 * first page of filings server-side so the full list is present in the initial HTTP
 * response (crawler- and AI-readable), then hands off to the interactive client.
 */
import type { Metadata } from 'next';
import { getLatestFilings, type LatestFilingsResult } from '@/lib/filings-server';
import LatestFilingsClient from './latest-filings-client';

export const metadata: Metadata = {
  title: 'Latest SEC Filings — 10-K, 10-Q & 8-K with AI Analysis',
  description:
    'Browse the latest SEC filings from 800+ US companies with AI-generated analysis and 30-day stock predictions. Filter 10-K, 10-Q, and 8-K forms by ticker, updated daily from SEC EDGAR.',
  alternates: { canonical: '/latest-filings' },
};

export const revalidate = 300;

const EMPTY: LatestFilingsResult = {
  filings: [],
  pagination: { totalCount: 0, totalPages: 0, currentPage: 1, pageSize: 50 },
};

export default async function Page() {
  const initialData = await getLatestFilings({ limit: 50, page: 1 }).catch((e) => {
    console.error('latest-filings: getLatestFilings failed', e);
    return EMPTY;
  });

  return <LatestFilingsClient initialData={initialData} />;
}
