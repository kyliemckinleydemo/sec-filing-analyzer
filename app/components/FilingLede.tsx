/**
 * @module app/components/FilingLede
 * @description Server-rendered article lede for a filing page: a unique <h1> and
 * substantial lead prose drawn from the STORED analysis (no Claude call, no client
 * fetch). This puts real, page-specific content into the initial HTML so search
 * engines and AI answer engines can index each filing page without executing JS —
 * addressing "Discovered – currently not indexed" on the programmatic filing URLs.
 *
 * Uses the analytical `summary` (falls back to aiSummary), which is distinct from
 * the "Filing Summary" card the client renders from `filingContentSummary`, so the
 * two don't duplicate on screen. Grounded, source-attributed prose only — no filler.
 */

/** Strip common markdown markers so stored AI prose renders as clean text. */
function stripMarkdown(s: string): string {
  return s
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^[-*]\s+/gm, '')
    .trim();
}

interface FilingLedeProps {
  companyName: string;
  ticker: string;
  filingType: string;
  filingDate: Date | string;
  /** Analytical summary prose (analysis.summary || aiSummary). */
  lede: string;
}

export default function FilingLede({ companyName, ticker, filingType, filingDate, lede }: FilingLedeProps) {
  const dateStr =
    (typeof filingDate === 'string' ? new Date(filingDate) : filingDate).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

  // Split into paragraphs, strip markdown, and cap total length so the lede stays a
  // lede (the full interactive analysis renders below). ~1000 chars ≈ 2–3 paragraphs.
  const paragraphs = stripMarkdown(lede)
    .split(/\n{2,}|\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  let used = 0;
  const shown: string[] = [];
  for (const p of paragraphs) {
    if (used >= 1000) break;
    shown.push(p);
    used += p.length;
  }
  if (shown.length === 0) return null;

  return (
    <header className="mx-auto max-w-4xl px-4 pt-10 pb-4">
      <h1 className="text-3xl md:text-4xl font-bold text-white">
        {companyName} ({ticker}): {filingType} filed {dateStr}
      </h1>
      <p className="mt-2 text-sm text-gray-400">
        AI analysis of the {filingType} that {companyName} filed with the U.S. SEC on {dateStr},
        grounded in the primary-source EDGAR filing.
      </p>
      <div className="mt-4 space-y-3 text-gray-300 leading-relaxed">
        {shown.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
    </header>
  );
}
