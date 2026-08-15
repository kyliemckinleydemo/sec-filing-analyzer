/**
 * @module lib/pulse
 * @description Computes the "SEC Filing Pulse" — a recurring, cross-market report from
 * StockHuntr's analyzed-filing corpus: which sectors are running hot on concern, the
 * period's most significant filings, and the strongest directional signals. Original
 * aggregate data designed to be quotable/citable and journalist-pitchable.
 *
 * Uses an ADAPTIVE window: the smallest recent window with a substantive sample, so the
 * report is meaningful today (while the analysis backlog fills) and naturally tightens to
 * recent data as coverage improves. A templated narrative summarizes the computed stats
 * (deterministic, no LLM call).
 */
import Anthropic from '@anthropic-ai/sdk';
import { prisma } from '@/lib/prisma';
import { canonicalForRaw, CANONICAL_SECTORS } from '@/lib/sectors';

const WINDOWS = [30, 60, 90, 180, 365];
const MIN_SAMPLE = 150;

export interface PulseFiling {
  ticker: string;
  companyName: string;
  filingType: string;
  filingDate: string;
  accessionNumber: string;
  concernLevel: number | null;
  netAssessment: string | null;
}

export interface PulseSignal {
  ticker: string;
  companyName: string;
  filingType: string;
  filingDate: string;
  accessionNumber: string;
  predicted30dAlpha: number;
  confidence: number;
  direction: 'bullish' | 'bearish';
}

export interface Pulse {
  windowDays: number;
  analyzedCount: number;
  avgConcern: number | null;
  highConcernShare: number | null; // share with concern >= 7
  epsBeats: number;
  epsMisses: number;
  sectorHeat: Array<{ name: string; slug: string; avgConcern: number; n: number }>;
  significantFilings: PulseFiling[];
  topSignals: PulseSignal[];
  narrative: string;
}

export async function getPulse(): Promise<Pulse | null> {
  try {
    // 1. Pick the smallest window with a substantive sample.
    let windowDays = WINDOWS[WINDOWS.length - 1];
    for (const d of WINDOWS) {
      const c = await prisma.filing.count({
        where: { filingDate: { gte: since(d) }, concernLevel: { not: null } },
      });
      if (c >= MIN_SAMPLE) {
        windowDays = d;
        break;
      }
    }

    const rows = await prisma.filing.findMany({
      where: { filingDate: { gte: since(windowDays) }, concernLevel: { not: null } },
      select: {
        accessionNumber: true,
        filingType: true,
        filingDate: true,
        concernLevel: true,
        epsSurprise: true,
        predicted30dAlpha: true,
        predictionConfidence: true,
        company: { select: { ticker: true, name: true, sector: true } },
      },
    });

    const n = rows.length;
    const concernVals = rows.map((r) => r.concernLevel as number);
    const avgConcern = n ? round1(concernVals.reduce((a, b) => a + b, 0) / n) : null;
    const highConcern = concernVals.filter((c) => c >= 7).length;
    const highConcernShare = n ? Math.round((highConcern / n) * 100) / 100 : null;

    const epsBeats = rows.filter((r) => (r.epsSurprise ?? 0) > 0).length;
    const epsMisses = rows.filter((r) => (r.epsSurprise ?? 0) < 0).length;

    // Sector heat: avg concern by canonical sector (min 10 filings to rank).
    const bySector = new Map<string, { name: string; slug: string; sum: number; n: number }>();
    for (const r of rows) {
      const c = canonicalForRaw(r.company.sector);
      if (!c) continue;
      const e = bySector.get(c.slug) ?? { name: c.name, slug: c.slug, sum: 0, n: 0 };
      e.sum += r.concernLevel as number;
      e.n += 1;
      bySector.set(c.slug, e);
    }
    const sectorHeat = [...bySector.values()]
      .filter((e) => e.n >= 10)
      .map((e) => ({ name: e.name, slug: e.slug, avgConcern: round1(e.sum / e.n), n: e.n }))
      .sort((a, b) => b.avgConcern - a.avgConcern);

    // Most significant filings: highest concern, most recent as tiebreaker.
    const sigSorted = [...rows]
      .sort(
        (a, b) =>
          (b.concernLevel as number) - (a.concernLevel as number) ||
          b.filingDate.getTime() - a.filingDate.getTime()
      )
      .slice(0, 8);

    // Fetch netAssessment only for the significant few.
    const sigWithNet = await prisma.filing.findMany({
      where: { accessionNumber: { in: sigSorted.map((f) => f.accessionNumber) } },
      select: { accessionNumber: true, analysisData: true },
    });
    const netMap = new Map<string, string | null>();
    for (const f of sigWithNet) {
      let net: string | null = null;
      if (f.analysisData) {
        try {
          net = JSON.parse(f.analysisData)?.concernAssessment?.netAssessment ?? null;
        } catch {
          /* ignore */
        }
      }
      netMap.set(f.accessionNumber, net);
    }
    const significantFilings: PulseFiling[] = sigSorted.map((f) => ({
      ticker: f.company.ticker,
      companyName: f.company.name,
      filingType: f.filingType,
      filingDate: f.filingDate.toISOString(),
      accessionNumber: f.accessionNumber,
      concernLevel: f.concernLevel,
      netAssessment: netMap.get(f.accessionNumber) ?? null,
    }));

    // Top signals: highest |alpha| * confidence, de-duped to one row per ticker.
    const scoreOf = (s: PulseSignal) => Math.abs(s.predicted30dAlpha) * s.confidence;
    const allSignals: PulseSignal[] = rows
      .filter((r) => r.predicted30dAlpha != null && r.predictionConfidence != null)
      .map((r) => ({
        ticker: r.company.ticker,
        companyName: r.company.name,
        filingType: r.filingType,
        filingDate: r.filingDate.toISOString(),
        accessionNumber: r.accessionNumber,
        predicted30dAlpha: r.predicted30dAlpha as number,
        confidence: r.predictionConfidence as number,
        direction: (r.predicted30dAlpha as number) >= 0 ? ('bullish' as const) : ('bearish' as const),
      }));
    // Keep only the single highest-scoring filing per ticker so rows are distinct.
    const bestByTicker = new Map<string, PulseSignal>();
    for (const s of allSignals) {
      const existing = bestByTicker.get(s.ticker);
      if (!existing || scoreOf(s) > scoreOf(existing)) bestByTicker.set(s.ticker, s);
    }
    const topSignals: PulseSignal[] = [...bestByTicker.values()]
      .sort((a, b) => scoreOf(b) - scoreOf(a))
      .slice(0, 8);

    const narrativeInput = {
      windowDays,
      n,
      avgConcern,
      highConcernShare,
      sectorHeat,
      significantFilings,
      epsBeats,
      epsMisses,
    };
    // Prefer an LLM-written editorial summary grounded in the computed stats; fall back
    // to the deterministic template if the model is unavailable or errors.
    const narrative = (await generateLlmNarrative(narrativeInput)) ?? buildNarrative(narrativeInput);

    return {
      windowDays,
      analyzedCount: n,
      avgConcern,
      highConcernShare,
      epsBeats,
      epsMisses,
      sectorHeat,
      significantFilings,
      topSignals,
      narrative,
    };
  } catch (error) {
    console.error('pulse: compute failed', error);
    return null;
  }
}

interface NarrativeInput {
  windowDays: number;
  n: number;
  avgConcern: number | null;
  highConcernShare: number | null;
  sectorHeat: Pulse['sectorHeat'];
  significantFilings: PulseFiling[];
  epsBeats: number;
  epsMisses: number;
}

/**
 * LLM-written editorial summary grounded strictly in the computed stats. Uses Haiku
 * (cheap), ~1 call per ISR revalidation. Returns null on any failure so the caller
 * falls back to the deterministic template. The model is told to use ONLY the provided
 * figures — no invented facts, no advice.
 */
async function generateLlmNarrative(d: NarrativeInput): Promise<string | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key || key.includes('placeholder')) return null;
  if (d.n === 0) return null;

  const period = d.windowDays >= 365 ? 'the trailing 12 months' : `the last ${d.windowDays} days`;
  const facts = {
    period,
    filingsAnalyzed: d.n,
    avgConcern: d.avgConcern,
    highConcernPct: d.highConcernShare != null ? Math.round(d.highConcernShare * 100) : null,
    hottestSector: d.sectorHeat[0] ? { name: d.sectorHeat[0].name, concern: d.sectorHeat[0].avgConcern, filings: d.sectorHeat[0].n } : null,
    coolestSector: d.sectorHeat.length > 1 ? { name: d.sectorHeat[d.sectorHeat.length - 1].name, concern: d.sectorHeat[d.sectorHeat.length - 1].avgConcern } : null,
    epsBeats: d.epsBeats,
    epsMisses: d.epsMisses,
    mostConcerningFiling: d.significantFilings[0]
      ? { ticker: d.significantFilings[0].ticker, formType: d.significantFilings[0].filingType, concern: d.significantFilings[0].concernLevel }
      : null,
  };

  const prompt = `You are writing the opening summary of "SEC Filing Pulse," a data report by StockHuntr.
Write 2-3 tight, factual, journalistic sentences summarizing the market's SEC-filing activity.

STRICT RULES:
- Output ONLY the 2-3 summary sentences as plain prose. No title, no heading, no markdown, no bullet points.
- Use ONLY the numbers in the JSON below. Do not invent any figures, names, or events.
- Neutral, analytical tone. No hype, no investment advice, no recommendations.
- Refer to concern on a 0-10 scale where higher = more material risk.
- Do not add a disclaimer (one is shown separately).

DATA:
${JSON.stringify(facts, null, 2)}`;

  try {
    const client = new Anthropic({ apiKey: key });
    const resp = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 240,
      messages: [{ role: 'user', content: prompt }],
    });
    const block = resp.content.find((b) => b.type === 'text');
    const raw = block && block.type === 'text' ? block.text : '';
    // Defensive cleanup: drop any stray markdown heading/bold the model may add.
    const text = raw
      .split('\n')
      .filter((line) => !line.trim().startsWith('#'))
      .join(' ')
      .replace(/\*\*/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    return text.length > 0 ? text : null;
  } catch (error) {
    console.error('pulse: LLM narrative failed, using template', error);
    return null;
  }
}

function buildNarrative(d: NarrativeInput): string {
  const period = d.windowDays >= 365 ? 'the trailing 12 months' : `the last ${d.windowDays} days`;
  const parts: string[] = [];
  parts.push(
    `Over ${period}, StockHuntr analyzed ${d.n.toLocaleString()} SEC filings.` +
      (d.avgConcern != null ? ` Average concern registered ${d.avgConcern}/10` : '') +
      (d.highConcernShare != null
        ? `, with ${Math.round(d.highConcernShare * 100)}% of filings flagged high-concern (7+/10).`
        : '.')
  );
  if (d.sectorHeat.length >= 2) {
    const hot = d.sectorHeat[0];
    const cool = d.sectorHeat[d.sectorHeat.length - 1];
    parts.push(
      `The ${hot.name} sector ran hottest on concern (${hot.avgConcern}/10 across ${hot.n} filings), while ${cool.name} was coolest (${cool.avgConcern}/10).`
    );
  }
  if (d.epsBeats + d.epsMisses > 0) {
    parts.push(
      `Among filings with earnings data, ${d.epsBeats} beat consensus EPS and ${d.epsMisses} missed.`
    );
  }
  if (d.significantFilings[0]) {
    const s = d.significantFilings[0];
    parts.push(
      `The single most concerning filing was ${s.ticker}'s ${s.filingType} (concern ${(s.concernLevel ?? 0).toFixed(1)}/10).`
    );
  }
  parts.push('This is model analysis for research and education, not investment advice.');
  return parts.join(' ');
}

function since(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}
function round1(x: number): number {
  return Math.round(x * 10) / 10;
}
