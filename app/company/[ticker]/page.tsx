/**
 * @module app/company/[ticker]/page
 * @description Server component wrapper for a company detail page. Emits unique,
 * database-driven SEO metadata per ticker so each of the 800+ company URLs is distinct
 * to search engines and AI answer engines. The interactive snapshot UI is rendered by
 * the client component, which fetches its own data.
 */
import type { Metadata } from 'next';
import { prisma } from '@/lib/prisma';
import CompanyClient from './company-client';
import QASection from '@/app/components/QASection';
import AnalysisProvenance from '@/app/components/AnalysisProvenance';
import CompanyLede from '@/app/components/CompanyLede';
import Breadcrumbs from '@/app/components/Breadcrumbs';
import RelatedCompanies from '@/app/components/RelatedCompanies';
import { buildCompanyQA } from '@/lib/qa-builders';

const SITE = 'https://www.stockhuntr.net';

/** Same-sector peers (by market cap) for internal linking + discovery. Real data only. */
async function getRelatedCompanies(sector: string | null, excludeTicker: string) {
  if (!sector) return [];
  try {
    const peers = await prisma.company.findMany({
      where: { sector, ticker: { not: excludeTicker } },
      orderBy: { marketCap: 'desc' },
      take: 8,
      select: { ticker: true, name: true },
    });
    return peers;
  } catch (error) {
    console.error('related companies: db lookup failed', error);
    return [];
  }
}

/** Company filing history on SEC EDGAR, built from CIK. */
function edgarCompanyUrl(cik?: string | null): string | null {
  if (!cik) return null;
  const cikInt = String(cik).replace(/^0+/, '') || cik;
  return `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cikInt}&type=&dateb=&owner=include&count=40`;
}

// ISR: the server-rendered company shell (metadata + Q&A) changes slowly; prices refresh via
// cron every few hours, so a 15-min revalidate is well within freshness and cuts TTFB from
// ~900ms (dynamic) to ~cached. Interactive/live data still loads client-side.
export const revalidate = 900;

// No build-time prerender; company pages are generated on first request and cached via ISR
// (revalidate above). Opting in makes ISR actually engage for this dynamic route.
export async function generateStaticParams() {
  return [] as { ticker: string }[];
}

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
  const title = `${ticker} Stock Analysis — ${name} SEC Filings, Earnings & AI Scoring`;
  const sectorPart = [industry, sector].filter(Boolean).join(', ');
  const description = `${name} (${ticker})${sectorPart ? ` — ${sectorPart}.` : '.'} Latest SEC filings (10-K, 10-Q, 8-K), earnings, financial snapshot, AI risk scoring, and a 30-day stock outlook — with cited answers to "is ${ticker} a buy?" Grounded in primary-source SEC EDGAR and Yahoo Finance data.`;

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
        cik: true,
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

    const items = buildCompanyQA({
      ticker: company.ticker,
      name: company.name,
      sector: company.sector,
      industry: company.industry,
      currentPrice: company.currentPrice,
      marketCap: company.marketCap,
      recentFilings: filings.map((f) => ({ filingType: f.filingType, filingDate: f.filingDate })),
      latest,
    });
    return {
      items,
      cik: company.cik,
      asOf: latestRaw?.filingDate ?? null,
      lede: {
        name: company.name,
        ticker: company.ticker,
        sector: company.sector,
        industry: company.industry,
        latest,
      },
    };
  } catch (error) {
    console.error('company QA: db lookup failed', error);
    return null;
  }
}

export default async function Page({ params }: PageProps) {
  const qa = await getCompanyQAData(params.ticker);
  const qaItems = qa?.items;
  const related = qa?.lede
    ? await getRelatedCompanies(qa.lede.sector, qa.lede.ticker)
    : [];

  const crumbs = qa?.lede
    ? [
        { name: 'Home', url: `${SITE}/` },
        {
          name: `${qa.lede.name} (${qa.lede.ticker})`,
          url: `${SITE}/company/${qa.lede.ticker}`,
        },
      ]
    : [];

  return (
    <>
      {crumbs.length > 0 && (
        <div className="bg-[#020617]">
          <Breadcrumbs items={crumbs} />
        </div>
      )}
      {qa?.lede && (
        <div className="bg-[#020617]">
          <CompanyLede
            name={qa.lede.name}
            ticker={qa.lede.ticker}
            sector={qa.lede.sector}
            industry={qa.lede.industry}
            latest={qa.lede.latest}
          />
        </div>
      )}
      {qaItems && qaItems.length > 0 && (
        <div className="bg-[#020617]">
          <QASection
            heading="Company overview — key questions"
            items={qaItems}
            note="Answers are generated from SEC filings and StockHuntr's analysis. Not investment advice."
          />
        </div>
      )}
      {qa?.lede?.sector && related.length > 0 && (
        <div className="bg-[#020617]">
          <RelatedCompanies sector={qa.lede.sector} companies={related} />
        </div>
      )}
      {qa && (
        <div className="bg-[#020617]">
          <AnalysisProvenance
            asOf={qa.asOf}
            edgarUrl={edgarCompanyUrl(qa.cik)}
            edgarLabel="View this company's filings on SEC EDGAR"
            extraSources={['Yahoo Finance (market data)']}
          />
        </div>
      )}
      <CompanyClient />
    </>
  );
}
