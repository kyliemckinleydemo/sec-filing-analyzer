import type { Metadata } from 'next';

/**
 * @module app/model-demo/layout
 * @description Server-side metadata wrapper for the client-rendered alpha-model
 * track-record page. The page is a Client Component ('use client') and cannot
 * export metadata, so this segment layout supplies title, description, and canonical
 * so the "does the AI prediction actually work" track record is discoverable by
 * search engines and AI answer engines.
 */
export const metadata: Metadata = {
  title: 'AI Stock Prediction Track Record — Predicted vs Actual',
  description:
    "See StockHuntr's 30-day alpha prediction track record: predicted vs actual returns, confidence, and model feature contributions. Transparent, data-driven — not investment advice.",
  alternates: { canonical: '/model-demo' },
  openGraph: {
    title: 'AI Stock Prediction Track Record — Predicted vs Actual',
    description:
      "StockHuntr's 30-day alpha prediction track record: predicted vs actual returns and model feature contributions.",
    url: 'https://www.stockhuntr.net/model-demo',
    type: 'website',
  },
};

export default function ModelDemoLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
