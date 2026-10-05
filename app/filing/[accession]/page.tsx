/**
 * @module app/filing/[accession]/page
 * @description Server component wrapper for a single filing detail page. Emits unique,
 * database-driven SEO metadata per accession number so each of the many programmatic
 * filing URLs is distinct to search engines and AI answer engines. The interactive
 * analysis/prediction UI is rendered by the client component, which fetches its own
 * data (kept client-side to avoid triggering paid Claude analysis during SSR).
 */
import type { Metadata } from 'next';
import { prisma } from '@/lib/prisma';
import FilingClient from './filing-client';
import QASection from '@/app/components/QASection';
import AnalysisProvenance from '@/app/components/AnalysisProvenance';
import FilingLede from '@/app/components/FilingLede';
import Breadcrumbs from '@/app/components/Breadcrumbs';
import { buildFilingQA } from '@/lib/qa-builders';
import { isRefusal, safeSummary } from '@/lib/analysis-quality';

const SITE = 'https://www.stockhuntr.net';

/**
 * Build a direct link to a filing's index on SEC EDGAR from its CIK + accession.
 * e.g. cik=320193, accession=0000320193-24-000123 →
 * https://www.sec.gov/Archives/edgar/data/320193/000032019324000123/0000320193-24-000123-index.htm
 */
function edgarFilingUrl(cik?: string | null, accession?: string | null): string | null {
  if (!cik || !accession) return null;
  const cikInt = String(cik).replace(/^0+/, '') || cik;
  const accNoDashes = accession.replace(/-/g, '');
  if (!/^\d{18}$/.test(accNoDashes)) return null;
  return `https://www.sec.gov/Archives/edgar/data/${cikInt}/${accNoDashes}/${accession}-index.htm`;
}

// ISR: a filing's server-rendered content (metadata + cited Q&A) is essentially static once
// analyzed, so cache it and revalidate hourly. Cuts TTFB from ~600ms (dynamic) to ~cached.
// The interactive/authed data still loads client-side, so nothing user-specific is cached.
export const revalidate = 3600;

// No build-time prerender (there are thousands of filings); pages are generated on first
// request and cached via ISR (revalidate above). Opting in makes ISR actually engage.
export async function generateStaticParams() {
  return [] as { accession: string }[];
}

interface PageProps {
  params: { accession: string };
}

// Accession numbers are stored dashed (0000000000-00-000000). Links use the dashed
// form, but normalize defensively in case an undashed 18-digit value arrives.
function dashedAccession(raw: string): string {
  const decoded = decodeURIComponent(raw);
  if (decoded.includes('-')) return decoded;
  if (/^\d{18}$/.test(decoded)) {
    return `${decoded.slice(0, 10)}-${decoded.slice(10, 12)}-${decoded.slice(12)}`;
  }
  return decoded;
}

async function getFiling(accessionParam: string) {
  const accession = dashedAccession(accessionParam);
  try {
    return await prisma.filing.findUnique({
      where: { accessionNumber: accession },
      select: {
        accessionNumber: true,
        filingType: true,
        filingDate: true,
        aiSummary: true,
        company: { select: { ticker: true, name: true, cik: true } },
      },
    });
  } catch (error) {
    console.error('filing metadata: db lookup failed', error);
    return null;
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const filing = await getFiling(params.accession);

  if (!filing) {
    return {
      title: 'SEC Filing Analysis',
      description:
        'AI-powered analysis and 30-day stock prediction for an SEC filing, sourced from SEC EDGAR.',
    };
  }

  const dateStr = filing.filingDate.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
  const { ticker, name } = filing.company;
  // Title mirrors how people search — "{Company} ({TICKER}) {form} filing summary" —
  // capturing "[ticker] 10-K summary" / "[company] 8-K explained" intent, while keeping
  // the AI-analysis differentiator.
  const title = `${name} (${ticker}) ${filing.filingType} Filing Summary — ${dateStr} | AI Analysis`;

  // If the stored summary is a refusal/error (see lib/analysis-quality), never render
  // it as the snippet AND keep the page out of the index until it's regenerated.
  const broken = isRefusal(filing.aiSummary);

  // Strip markdown (bold, bullets, headings) so the AI summary reads cleanly
  // as a plain-text search/AI snippet.
  const cleanSummary = broken
    ? null
    : filing.aiSummary
        ?.replace(/[*_#`]+/g, '')
        .replace(/[•\-]\s+/g, '')
        .replace(/\s+/g, ' ')
        .trim();
  const description = cleanSummary
    ? cleanSummary.slice(0, 155)
    : `AI analysis of ${name} (${ticker}) ${filing.filingType} filed ${dateStr}: financial highlights, risk assessment, and a 30-day market-relative stock prediction. Sourced from SEC EDGAR.`;

  const canonical = `/filing/${filing.accessionNumber}`;

  return {
    title,
    description,
    alternates: { canonical },
    // Broken analyses are followable (keep EDGAR/company links flowing) but not
    // indexable, so they drop out of search until regenerated.
    ...(broken ? { robots: { index: false, follow: true } } : {}),
    openGraph: {
      title,
      description,
      url: canonical,
      type: 'article',
    },
    twitter: { card: 'summary', title, description },
  };
}

/** Fetch the analysis fields needed to server-render a grounded Q&A block. */
async function getFilingQAData(accessionParam: string) {
  const accession = dashedAccession(accessionParam);
  try {
    const filing = await prisma.filing.findUnique({
      where: { accessionNumber: accession },
      select: {
        filingType: true,
        filingDate: true,
        aiSummary: true,
        analysisData: true,
        predicted30dAlpha: true,
        predictionConfidence: true,
        company: { select: { ticker: true, name: true } },
      },
    });
    if (!filing) return null;

    let analysis = null;
    if (filing.analysisData) {
      try {
        analysis = JSON.parse(filing.analysisData);
      } catch {
        /* leave null on malformed JSON */
      }
    }

    const items = buildFilingQA({
      ticker: filing.company.ticker,
      companyName: filing.company.name,
      filingType: filing.filingType,
      filingDate: filing.filingDate,
      // Don't feed refusal/error text into the grounded Q&A overview.
      aiSummary: safeSummary(filing.aiSummary),
      analysis,
      predicted30dAlpha: filing.predicted30dAlpha,
      predictionConfidence: filing.predictionConfidence,
    });
    // Analytical summary for the server-rendered lede (distinct from the client's
    // "Filing Summary" card, which uses filingContentSummary). Suppress it entirely
    // if both candidate sources are refusals/errors — a blank lede beats a broken one.
    const ledeCandidate = analysis?.summary || filing.aiSummary || null;
    const lede = isRefusal(ledeCandidate) ? null : ledeCandidate;
    return {
      items,
      lede,
      header: {
        companyName: filing.company.name,
        ticker: filing.company.ticker,
        filingType: filing.filingType,
        filingDate: filing.filingDate,
      },
    };
  } catch (error) {
    console.error('filing QA: db lookup failed', error);
    return null;
  }
}

export default async function Page({ params }: PageProps) {
  const [qa, filing] = await Promise.all([
    getFilingQAData(params.accession),
    getFiling(params.accession),
  ]);
  const qaItems = qa?.items;

  // Server-known filing identity, passed to the client so the (client-rendered)
  // signup gate can always show WHICH filing you're on — even on a direct/SEO landing
  // where the URL carries no ticker/company query params.
  const initialFiling = filing
    ? {
        ticker: filing.company?.ticker ?? '',
        companyName: filing.company?.name ?? '',
        filingType: filing.filingType ?? '',
        filingDate: filing.filingDate ? filing.filingDate.toISOString() : '',
      }
    : undefined;

  const edgarUrl = edgarFilingUrl(filing?.company?.cik, filing?.accessionNumber);

  const crumbs =
    qa?.header && filing?.accessionNumber
      ? [
          { name: 'Home', url: `${SITE}/` },
          {
            name: `${qa.header.companyName} (${qa.header.ticker})`,
            url: `${SITE}/company/${qa.header.ticker}`,
          },
          {
            name: `${qa.header.filingType} · ${new Date(qa.header.filingDate).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
            })}`,
            url: `${SITE}/filing/${filing.accessionNumber}`,
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
      {qa?.header && qa.lede && (
        <div className="bg-[#020617]">
          <FilingLede
            companyName={qa.header.companyName}
            ticker={qa.header.ticker}
            filingType={qa.header.filingType}
            filingDate={qa.header.filingDate}
            lede={qa.lede}
          />
        </div>
      )}
      {qaItems && qaItems.length > 0 && (
        <div className="bg-[#020617]">
          <QASection
            heading="Filing analysis — key questions"
            items={qaItems}
            note="Answers are generated from this SEC filing and StockHuntr's analysis. Not investment advice."
          />
        </div>
      )}
      {filing && (
        <div className="bg-[#020617]">
          <AnalysisProvenance
            asOf={filing.filingDate}
            edgarUrl={edgarUrl}
            edgarLabel={`View this ${filing.filingType} on SEC EDGAR`}
            extraSources={['Yahoo Finance (market data)']}
          />
        </div>
      )}
      <FilingClient initialFiling={initialFiling} />
    </>
  );
}
