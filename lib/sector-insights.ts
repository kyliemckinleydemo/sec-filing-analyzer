/**
 * @module lib/sector-insights
 * @description Computes original, aggregate insights for a sector from StockHuntr's
 * analyzed-filing corpus: concern/sentiment levels, filing-type mix, the model's
 * directional accuracy in that sector, and notable recent filings. This is
 * differentiated original-data content (each sector genuinely differs) — the kind AI
 * answer engines and journalists cite. Provenance (sample sizes) is exposed on the page.
 */
import { prisma } from '@/lib/prisma';
import { CANONICAL_SECTORS, type CanonicalSector } from '@/lib/sectors';

export interface SectorInsights {
  slug: string;
  name: string;
  blurb: string;
  companyCount: number;
  analyzedFilings: number;
  avgConcern: number | null;
  concernDistribution: { low: number; moderate: number; elevated: number; high: number };
  avgSentiment: number | null;
  filingTypeMix: { tenK: number; tenQ: number; eightK: number };
  eightKShare: number | null;
  model: {
    pairs: number; // filings with both a prediction and realized outcome
    directionalAccuracy: number | null; // 0-1
    avgPredictedAlpha: number | null;
  };
  notableRecent: Array<{
    ticker: string;
    companyName: string;
    filingType: string;
    filingDate: string;
    accessionNumber: string;
    concernLevel: number | null;
    netAssessment: string | null;
  }>;
}

async function computeInsights(sector: CanonicalSector): Promise<SectorInsights> {
  const companyWhere = { sector: { in: sector.raw } };

  const [companyCount, filings] = await Promise.all([
    prisma.company.count({ where: companyWhere }),
    prisma.filing.findMany({
      where: { concernLevel: { not: null }, company: { is: companyWhere } },
      select: {
        concernLevel: true,
        sentimentScore: true,
        filingType: true,
        predicted30dAlpha: true,
        actual30dAlpha: true,
      },
    }),
  ]);

  const n = filings.length;
  const concernVals = filings.map((f) => f.concernLevel as number);
  const avgConcern = n ? concernVals.reduce((a, b) => a + b, 0) / n : null;

  const concernDistribution = { low: 0, moderate: 0, elevated: 0, high: 0 };
  for (const c of concernVals) {
    if (c <= 2.5) concernDistribution.low++;
    else if (c <= 5) concernDistribution.moderate++;
    else if (c <= 7.5) concernDistribution.elevated++;
    else concernDistribution.high++;
  }

  const sentVals = filings.map((f) => f.sentimentScore).filter((s): s is number => s != null);
  const avgSentiment = sentVals.length
    ? sentVals.reduce((a, b) => a + b, 0) / sentVals.length
    : null;

  const filingTypeMix = {
    tenK: filings.filter((f) => f.filingType === '10-K').length,
    tenQ: filings.filter((f) => f.filingType === '10-Q').length,
    eightK: filings.filter((f) => f.filingType === '8-K').length,
  };
  const eightKShare = n ? filingTypeMix.eightK / n : null;

  const pairsArr = filings.filter((f) => f.predicted30dAlpha != null && f.actual30dAlpha != null);
  const pairs = pairsArr.length;
  const correct = pairsArr.filter(
    (f) => Math.sign(f.predicted30dAlpha as number) === Math.sign(f.actual30dAlpha as number)
  ).length;
  const predVals = filings.map((f) => f.predicted30dAlpha).filter((p): p is number => p != null);

  // Notable recent filings: most recent analyzed, highest concern first among recent.
  const recent = await prisma.filing.findMany({
    where: { concernLevel: { not: null }, company: { is: companyWhere } },
    orderBy: { filingDate: 'desc' },
    take: 12,
    select: {
      accessionNumber: true,
      filingType: true,
      filingDate: true,
      concernLevel: true,
      analysisData: true,
      company: { select: { ticker: true, name: true } },
    },
  });
  const notableRecent = recent.slice(0, 6).map((f) => {
    let netAssessment: string | null = null;
    if (f.analysisData) {
      try {
        netAssessment = JSON.parse(f.analysisData)?.concernAssessment?.netAssessment ?? null;
      } catch {
        /* ignore */
      }
    }
    return {
      ticker: f.company.ticker,
      companyName: f.company.name,
      filingType: f.filingType,
      filingDate: f.filingDate.toISOString(),
      accessionNumber: f.accessionNumber,
      concernLevel: f.concernLevel,
      netAssessment,
    };
  });

  return {
    slug: sector.slug,
    name: sector.name,
    blurb: sector.blurb,
    companyCount,
    analyzedFilings: n,
    avgConcern: avgConcern != null ? Math.round(avgConcern * 10) / 10 : null,
    concernDistribution,
    avgSentiment: avgSentiment != null ? Math.round(avgSentiment * 100) / 100 : null,
    filingTypeMix,
    eightKShare: eightKShare != null ? Math.round(eightKShare * 100) / 100 : null,
    model: {
      pairs,
      directionalAccuracy: pairs ? Math.round((correct / pairs) * 100) / 100 : null,
      avgPredictedAlpha: predVals.length
        ? Math.round((predVals.reduce((a, b) => a + b, 0) / predVals.length) * 100) / 100
        : null,
    },
    notableRecent,
  };
}

export async function getSectorInsights(slug: string): Promise<SectorInsights | null> {
  const sector = CANONICAL_SECTORS.find((s) => s.slug === slug);
  if (!sector) return null;
  try {
    return await computeInsights(sector);
  } catch (error) {
    console.error(`sector-insights: failed for ${slug}`, error);
    return null;
  }
}

/** Lightweight per-sector summary for the /sectors index (one query total). */
export async function getAllSectorSummaries(): Promise<
  Array<{ slug: string; name: string; blurb: string; analyzedFilings: number; avgConcern: number | null; directionalAccuracy: number | null }>
> {
  try {
    const filings = await prisma.filing.findMany({
      where: { concernLevel: { not: null } },
      select: {
        concernLevel: true,
        predicted30dAlpha: true,
        actual30dAlpha: true,
        company: { select: { sector: true } },
      },
    });

    return CANONICAL_SECTORS.map((sector) => {
      const rows = filings.filter((f) => f.company.sector && sector.raw.includes(f.company.sector));
      const n = rows.length;
      const avgConcern = n
        ? Math.round((rows.reduce((a, b) => a + (b.concernLevel as number), 0) / n) * 10) / 10
        : null;
      const pairsArr = rows.filter((f) => f.predicted30dAlpha != null && f.actual30dAlpha != null);
      const correct = pairsArr.filter(
        (f) => Math.sign(f.predicted30dAlpha as number) === Math.sign(f.actual30dAlpha as number)
      ).length;
      return {
        slug: sector.slug,
        name: sector.name,
        blurb: sector.blurb,
        analyzedFilings: n,
        avgConcern,
        directionalAccuracy: pairsArr.length ? Math.round((correct / pairsArr.length) * 100) / 100 : null,
      };
    }).sort((a, b) => b.analyzedFilings - a.analyzedFilings);
  } catch (error) {
    console.error('sector-insights: summaries failed', error);
    return CANONICAL_SECTORS.map((s) => ({
      slug: s.slug,
      name: s.name,
      blurb: s.blurb,
      analyzedFilings: 0,
      avgConcern: null,
      directionalAccuracy: null,
    }));
  }
}
