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

    // Top signals: highest |alpha| * confidence.
    const topSignals: PulseSignal[] = rows
      .filter((r) => r.predicted30dAlpha != null && r.predictionConfidence != null)
      .map((r) => ({
        ticker: r.company.ticker,
        companyName: r.company.name,
        filingType: r.filingType,
        accessionNumber: r.accessionNumber,
        predicted30dAlpha: r.predicted30dAlpha as number,
        confidence: r.predictionConfidence as number,
        direction: (r.predicted30dAlpha as number) >= 0 ? ('bullish' as const) : ('bearish' as const),
      }))
      .sort(
        (a, b) =>
          Math.abs(b.predicted30dAlpha) * b.confidence - Math.abs(a.predicted30dAlpha) * a.confidence
      )
      .slice(0, 8);

    const narrative = buildNarrative({
      windowDays,
      n,
      avgConcern,
      highConcernShare,
      sectorHeat,
      significantFilings,
      epsBeats,
      epsMisses,
    });

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

function buildNarrative(d: {
  windowDays: number;
  n: number;
  avgConcern: number | null;
  highConcernShare: number | null;
  sectorHeat: Pulse['sectorHeat'];
  significantFilings: PulseFiling[];
  epsBeats: number;
  epsMisses: number;
}): string {
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
