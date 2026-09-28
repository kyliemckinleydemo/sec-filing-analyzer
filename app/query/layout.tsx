import type { Metadata } from 'next';

/**
 * @module app/query/layout
 * @description Server-side metadata wrapper for the client-rendered "Ask the Market"
 * page. The page itself is a Client Component ('use client') and cannot export
 * metadata, so this segment layout supplies the title, description, and canonical
 * needed for search + AI-answer-engine discovery.
 */
export const metadata: Metadata = {
  title: 'Ask the Market — Screen Stocks & Query SEC Filings in Plain English',
  description:
    'Ask questions in plain English to screen 800+ US companies by fundamentals or get AI answers cited from SEC filings. Free, grounded in primary-source SEC EDGAR data.',
  alternates: { canonical: '/query' },
  openGraph: {
    title: 'Ask the Market — Screen Stocks & Query SEC Filings',
    description:
      'Screen 800+ US companies by fundamentals or get cited AI answers from SEC filings, in plain English. Free.',
    url: 'https://www.stockhuntr.net/query',
    type: 'website',
  },
};

export default function QueryLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
