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
import QASection from '@/app/components/QASection';
import { buildCompanyQA } from '@/lib/qa-builders';

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

/** Fetch company + recent filings to server-render a grounded Q&A block. */
async function getCompanyQAData(tickerParam: string) {
  const ticker = decodeURIComponent(tickerParam).toUpperCase();
  try {
    const company = await prisma.company.findUnique({
      where: { ticker },
      select: {
        ticker: true,
        name: true,
        sector: true,
        industry: true,
        currentPrice: true,
        marketCap: true,
        filings: {
          orderBy: { filingDate: 'desc' },
          take: 5,
          select: {
            filingType: true,
            filingDate: true,
            concernLevel: true,
            predicted30dAlpha: true,
            analysisData: true,
          },
        },
      },
    });
    if (!company) return null;

    const filings = company.filings;
    const latestRaw = filings[0];
    let latest = null;
    if (latestRaw) {
      let netAssessment: string | null = null;
      let concernLabel: string | null = null;
      if (latestRaw.analysisData) {
        try {
          const a = JSON.parse(latestRaw.analysisData);
          netAssessment = a?.concernAssessment?.netAssessment ?? null;
          concernLabel = a?.concernAssessment?.concernLabel ?? null;
        } catch {
          /* ignore malformed JSON */
        }
      }
      latest = {
        filingType: latestRaw.filingType,
        filingDate: latestRaw.filingDate,
        concernLabel,
        netAssessment,
        predicted30dAlpha: latestRaw.predicted30dAlpha,
      };
    }

    return buildCompanyQA({
      ticker: company.ticker,
      name: company.name,
      sector: company.sector,
      industry: company.industry,
      currentPrice: company.currentPrice,
      marketCap: company.marketCap,
      recentFilings: filings.map((f) => ({ filingType: f.filingType, filingDate: f.filingDate })),
      latest,
    });
  } catch (error) {
    console.error('company QA: db lookup failed', error);
    return null;
  }
}

export default async function Page({ params }: PageProps) {
  const qaItems = await getCompanyQAData(params.ticker);

  return (
    <>
      {qaItems && qaItems.length > 0 && (
        <div className="bg-[#020617]">
          <QASection
            heading="Company overview — key questions"
            items={qaItems}
            note="Answers are generated from SEC filings and StockHuntr's analysis. Not investment advice."
          />
        </div>
      )}
      <CompanyClient />
    </>
  );
}
