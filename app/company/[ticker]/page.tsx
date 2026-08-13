/**
 * @module app/company/[ticker]/page
 * @description Server component wrapper for a company detail page. Emits unique,
 * database-driven SEO metadata per ticker so each of the 640+ company URLs is distinct
 * to search engines and AI answer engines. The interactive snapshot UI is rendered by
 * the client component, which fetches its own data.
 */
import type { Metadata } from 'next';
import { prisma } from '@/lib/prisma';
import CompanyClient from './company-client';

interface PageProps {
  params: { ticker: string };
}

async function getCompany(tickerParam: string) {
  const ticker = decodeURIComponent(tickerParam).toUpperCase();
  try {
    return await prisma.company.findUnique({
      where: { ticker },
      select: {
        ticker: true,
        name: true,
        sector: true,
        industry: true,
        currentPrice: true,
        marketCap: true,
      },
    });
  } catch (error) {
    console.error('company metadata: db lookup failed', error);
    return null;
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const company = await getCompany(params.ticker);

  if (!company) {
    const ticker = decodeURIComponent(params.ticker).toUpperCase();
    return {
      title: `${ticker} — SEC Filings & AI Analysis`,
      description: `SEC filings, financial snapshot, and AI-powered 30-day stock predictions for ${ticker}.`,
    };
  }

  const { ticker, name, sector, industry } = company;
  const title = `${ticker} — ${name} SEC Filings & AI Analysis`;
  const sectorPart = [industry, sector].filter(Boolean).join(', ');
  const description = `${name} (${ticker})${sectorPart ? ` — ${sectorPart}.` : '.'} Latest SEC filings (10-K, 10-Q, 8-K), financial snapshot, and AI-powered 30-day stock predictions. Data from SEC EDGAR and Yahoo Finance.`;

  const canonical = `/company/${ticker}`;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: { title, description, url: canonical, type: 'website' },
    twitter: { card: 'summary', title, description },
  };
}

export default function Page() {
  return <CompanyClient />;
}
