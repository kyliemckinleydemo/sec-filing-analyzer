/**
 * @module lib/qa-builders
 * @description Builds grounded Q&A pairs from stored SEC-filing analysis and company
 * data for server-rendered QASection blocks. Every answer is derived from real,
 * source-attributed data (SEC EDGAR filings + the app's analysis) — never templated
 * filler — so the pages carry genuine substance for AI extraction and search.
 */
import type { QAItem } from '@/app/components/QASection';
import type { SectorInsights } from '@/lib/sector-insights';

const NOT_ADVICE = 'This is model analysis for research, not investment advice.';

function fmtDate(d: Date): string {
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
}

function clip(s: string, n = 320): string {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n).replace(/\s+\S*$/, '') + '…' : t;
}

/** Loose shape of the parsed analysisData JSON (see lib/claude-client FilingAnalysis). */
interface ParsedAnalysis {
  summary?: string;
  filingContentSummary?: string;
  concernAssessment?: {
    concernLevel?: number;
    concernLabel?: string;
    netAssessment?: string;
    concernFactors?: string[];
    positiveFactors?: string[];
    reasoning?: string;
  };
  risks?: { overallTrend?: string; topChanges?: string[] };
  financialMetrics?: {
    surprises?: string[];
    guidanceDirection?: string;
    revenueGrowth?: string;
  };
}

export interface FilingQAInput {
  ticker: string;
  companyName: string;
  filingType: string;
  filingDate: Date;
  aiSummary: string | null;
  analysis: ParsedAnalysis | null;
  predicted30dAlpha: number | null;
  predictionConfidence: number | null;
}

export function buildFilingQA(f: FilingQAInput): QAItem[] {
  const items: QAItem[] = [];
  const dateStr = fmtDate(f.filingDate);
  const who = `${f.companyName} (${f.ticker})`;
  const a = f.analysis;

  // 1. What does the filing say?
  const overview = f.analysis?.filingContentSummary || f.analysis?.summary || f.aiSummary;
  if (overview) {
    items.push({
      question: `What does ${who}'s ${f.filingType} filed ${dateStr} say?`,
      answer: clip(overview, 400),
    });
  }

  // 2. Overall assessment (bullish/bearish/neutral)
  if (a?.concernAssessment?.netAssessment) {
    const net = a.concernAssessment.netAssessment;
    const reasoning = a.concernAssessment.reasoning ? ` ${clip(a.concernAssessment.reasoning, 260)}` : '';
    items.push({
      question: `Is ${f.ticker}'s ${f.filingType} bullish or bearish?`,
      answer: clip(`Our analysis rates this filing ${net}.${reasoning}`, 420),
    });
  }

  // 3. Concern level
  if (a?.concernAssessment?.concernLabel && typeof a.concernAssessment.concernLevel === 'number') {
    const factors = (a.concernAssessment.concernFactors || []).slice(0, 3).join('; ');
    items.push({
      question: `How concerning is ${f.ticker}'s latest ${f.filingType}?`,
      answer: clip(
        `Concern level: ${a.concernAssessment.concernLabel} (${a.concernAssessment.concernLevel.toFixed(1)}/10).` +
          (factors ? ` Key factors: ${factors}.` : ''),
        400
      ),
    });
  }

  // 4. Key risks
  const risks = (a?.risks?.topChanges || []).filter(Boolean).slice(0, 4);
  if (risks.length > 0) {
    items.push({
      question: `What are the main risks flagged in ${f.ticker}'s ${f.filingType}?`,
      answer: clip(`Notable risk changes: ${risks.join('; ')}.`, 420),
    });
  }

  // 5. Earnings beat/miss
  const surprises = (a?.financialMetrics?.surprises || []).filter(Boolean).slice(0, 3);
  if (surprises.length > 0) {
    items.push({
      question: `Did ${f.ticker} beat or miss expectations in this filing?`,
      answer: clip(surprises.join('; ') + '.', 400),
    });
  }

  // 6. 30-day prediction (always with disclaimer)
  if (typeof f.predicted30dAlpha === 'number') {
    const dir = f.predicted30dAlpha >= 0 ? 'outperform' : 'underperform';
    const conf =
      typeof f.predictionConfidence === 'number'
        ? ` (model confidence ${Math.round(f.predictionConfidence * 100)}%)`
        : '';
    items.push({
      question: `What is the 30-day stock outlook for ${f.ticker} after this filing?`,
      answer: clip(
        `The model predicts ${f.ticker} will ${dir} the S&P 500 by about ${Math.abs(
          f.predicted30dAlpha
        ).toFixed(1)}% over 30 days${conf}. ${NOT_ADVICE}`,
        400
      ),
    });
  }

  return items;
}

export interface CompanyQAInput {
  ticker: string;
  name: string;
  sector: string | null;
  industry: string | null;
  currentPrice: number | null;
  marketCap: number | null;
  recentFilings: Array<{ filingType: string; filingDate: Date }>;
  latest: {
    filingType: string;
    filingDate: Date;
    concernLabel?: string | null;
    netAssessment?: string | null;
    predicted30dAlpha?: number | null;
  } | null;
}

export function buildCompanyQA(c: CompanyQAInput): QAItem[] {
  const items: QAItem[] = [];
  const who = `${c.name} (${c.ticker})`;

  // 1. What is the company?
  const classification = [c.industry, c.sector].filter(Boolean).join(', ');
  items.push({
    question: `What is ${who}?`,
    answer: clip(
      `${c.name} is a publicly traded company${classification ? ` in the ${classification} space` : ''}` +
        ` tracked on StockHuntr, which analyzes its SEC filings (10-K, 10-Q, 8-K) and generates 30-day stock predictions.`,
      400
    ),
  });

  // 2. Latest filings
  if (c.recentFilings.length > 0) {
    const list = c.recentFilings
      .slice(0, 5)
      .map((f) => `${f.filingType} (${fmtDate(f.filingDate)})`)
      .join(', ');
    items.push({
      question: `What are ${c.ticker}'s most recent SEC filings?`,
      answer: clip(`Recent filings: ${list}.`, 400),
    });
  }

  // 3. Latest analysis
  if (c.latest?.netAssessment || c.latest?.concernLabel) {
    const parts: string[] = [];
    if (c.latest.netAssessment) parts.push(`rated ${c.latest.netAssessment}`);
    if (c.latest.concernLabel) parts.push(`concern level ${c.latest.concernLabel}`);
    items.push({
      question: `What does ${c.ticker}'s latest filing analysis show?`,
      answer: clip(
        `${c.ticker}'s most recent ${c.latest.filingType} (${fmtDate(c.latest.filingDate)}) is ${parts.join(
          ', '
        )}.`,
        400
      ),
    });
  }

  // 4. 30-day outlook
  if (c.latest && typeof c.latest.predicted30dAlpha === 'number') {
    const dir = c.latest.predicted30dAlpha >= 0 ? 'outperform' : 'underperform';
    items.push({
      question: `What is the 30-day outlook for ${c.ticker}?`,
      answer: clip(
        `Based on ${c.ticker}'s latest filing, the model predicts it will ${dir} the S&P 500 by about ${Math.abs(
          c.latest.predicted30dAlpha
        ).toFixed(1)}% over 30 days. ${NOT_ADVICE}`,
        400
      ),
    });
  }

  return items;
}

export function buildSectorQA(s: SectorInsights): QAItem[] {
  const items: QAItem[] = [];

  items.push({
    question: `How many ${s.name} SEC filings has StockHuntr analyzed?`,
    answer: clip(
      `StockHuntr has analyzed ${s.analyzedFilings.toLocaleString()} SEC filings from ${s.companyCount} ${s.name} companies, scoring each for risk, sentiment, and 30-day stock impact.`,
      400
    ),
  });

  if (s.avgConcern != null) {
    const label =
      s.avgConcern <= 2.5 ? 'low' : s.avgConcern <= 5 ? 'moderate' : s.avgConcern <= 7.5 ? 'elevated' : 'high';
    items.push({
      question: `What is the average concern level for ${s.name} filings?`,
      answer: clip(
        `The average concern level across analyzed ${s.name} filings is ${s.avgConcern}/10 (${label}). ` +
          `Of these, ${s.concernDistribution.elevated + s.concernDistribution.high} filings scored elevated-to-high concern.`,
        400
      ),
    });
  }

  if (s.model.directionalAccuracy != null && s.model.pairs > 0) {
    items.push({
      question: `How accurate is StockHuntr's model in the ${s.name} sector?`,
      answer: clip(
        `On ${s.model.pairs} ${s.name} filings with a known 30-day outcome, the model's directional accuracy is ${Math.round(
          s.model.directionalAccuracy * 100
        )}%. This is research analysis, not investment advice.`,
        400
      ),
    });
  }

  if (s.eightKShare != null) {
    items.push({
      question: `What kinds of filings do ${s.name} companies submit most?`,
      answer: clip(
        `Of analyzed ${s.name} filings, ${Math.round(s.eightKShare * 100)}% are 8-Ks (current events), alongside ${s.filingTypeMix.tenK} annual reports (10-K) and ${s.filingTypeMix.tenQ} quarterly reports (10-Q).`,
        400
      ),
    });
  }

  return items;
}
