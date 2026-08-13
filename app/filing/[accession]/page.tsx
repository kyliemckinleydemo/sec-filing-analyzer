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
        company: { select: { ticker: true, name: true } },
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
  const title = `${ticker} ${filing.filingType} — ${dateStr} | AI Analysis & 30-Day Prediction`;

  // Strip markdown (bold, bullets, headings) so the AI summary reads cleanly
  // as a plain-text search/AI snippet.
  const cleanSummary = filing.aiSummary
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
    openGraph: {
      title,
      description,
      url: canonical,
      type: 'article',
    },
    twitter: { card: 'summary', title, description },
  };
}

export default function Page() {
  return <FilingClient />;
}
