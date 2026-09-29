/**
 * @module app/components/CompanyLede
 * @description Server-rendered article lede for a company page: a unique <h1> plus
 * a factual identity line and (when available) a page-specific paragraph synthesized
 * from the company's most recent filing assessment — all from STORED data, no client
 * fetch. Company pages previously had NO server-rendered <h1> (the client renders it
 * after JS), leaving thin HTML for crawlers. This puts real, per-company content in
 * the initial response so each of the ~800 company URLs is indexable without JS.
 *
 * Only the identity line + latest-filing prose are rendered; no templated filler is
 * repeated across companies, so this adds unique content without scaled-content risk.
 */

/** Strip common markdown markers so stored AI prose renders as clean text. */
function stripMarkdown(s: string): string {
  return s
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .trim();
}

interface CompanyLedeLatest {
  filingType: string;
  filingDate: Date | string;
  concernLabel?: string | null;
  netAssessment?: string | null;
}

interface CompanyLedeProps {
  name: string;
  ticker: string;
  sector?: string | null;
  industry?: string | null;
  latest?: CompanyLedeLatest | null;
}

export default function CompanyLede({ name, ticker, sector, industry, latest }: CompanyLedeProps) {
  const identity = [industry, sector].filter(Boolean).join(' · ');

  let latestLine: string | null = null;
  if (latest?.netAssessment) {
    const dateStr = (typeof latest.filingDate === 'string' ? new Date(latest.filingDate) : latest.filingDate)
      .toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const concern = latest.concernLabel ? ` Concern level: ${latest.concernLabel}.` : '';
    latestLine = `Most recent filing — ${latest.filingType} filed ${dateStr}: ${stripMarkdown(
      latest.netAssessment
    )}${concern}`;
    if (latestLine.length > 900) latestLine = latestLine.slice(0, 897).trimEnd() + '…';
  }

  return (
    <header className="mx-auto max-w-4xl px-4 pt-10 pb-4">
      <h1 className="text-3xl md:text-4xl font-bold text-white">
        {name} ({ticker}): SEC Filings &amp; AI Analysis
      </h1>
      <p className="mt-2 text-sm text-gray-400">
        {identity ? `${identity}. ` : ''}Latest 10-K, 10-Q, and 8-K filings for {name} ({ticker}) with
        AI risk scoring and cited answers, grounded in primary-source SEC EDGAR data.
      </p>
      {latestLine && <p className="mt-4 text-gray-300 leading-relaxed">{latestLine}</p>}
    </header>
  );
}
