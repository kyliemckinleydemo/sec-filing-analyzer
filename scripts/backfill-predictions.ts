/**
 * @module scripts/backfill-predictions
 * @description Batch-generates and persists 30-day alpha predictions for recent
 * analyzed filings that don't have one yet. Predictions are otherwise generated only
 * on-demand (when a user opens a filing page) and are sparse, which leaves Top Signals,
 * the Model Track Record tile, and the MCP get_top_signals tool near-empty.
 *
 * Everything needed is already in the database (company snapshot, macro indicators,
 * analyst activity, filing analysis) — no external API calls. Uses the same
 * extractAlphaFeatures() + predictAlpha() functions as /api/predict/[accession].
 *
 * Usage:
 *   npx tsx scripts/backfill-predictions.ts            # last 120 days, missing only
 *   npx tsx scripts/backfill-predictions.ts --days 180 # wider window
 *   npx tsx scripts/backfill-predictions.ts --force    # recompute even if present
 */
import { prisma } from '../lib/prisma';
import { predictAlpha, extractAlphaFeatures } from '../lib/alpha-model';

const MAJOR_FIRMS = ['Goldman Sachs', 'Morgan Stanley', 'JP Morgan', 'Bank of America',
                     'Citi', 'Wells Fargo', 'Barclays', 'UBS'];

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const DAYS = parseInt(arg('--days', '120'), 10);
const FORCE = process.argv.includes('--force');

async function macroForDate(filingDate: Date): Promise<{ spxReturn30d: number | null; vixClose: number | null } | null> {
  try {
    const from = new Date(filingDate.getTime() - 7 * 24 * 60 * 60 * 1000);
    const to = new Date(filingDate.getTime() + 7 * 24 * 60 * 60 * 1000);
    const rows: any[] = await (prisma as any).macroIndicators.findMany({
      where: { date: { gte: from, lte: to } },
      select: { date: true, spxReturn30d: true, vixClose: true },
      orderBy: { date: 'asc' },
    });
    if (rows.length === 0) return null;
    const t = filingDate.getTime();
    return rows.reduce((best, m) =>
      Math.abs(m.date.getTime() - t) < Math.abs(best.date.getTime() - t) ? m : best
    );
  } catch {
    return null;
  }
}

async function analystCounts(companyId: string, filingDate: Date) {
  try {
    const thirtyDaysAgo = new Date(filingDate);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const acts = await prisma.analystActivity.findMany({
      where: { companyId, activityDate: { gte: thirtyDaysAgo, lt: filingDate } },
      select: { actionType: true, firm: true },
    });
    return {
      upgradesLast30d: acts.filter(a => a.actionType === 'upgrade').length,
      majorDowngradesLast30d: acts.filter(a =>
        a.actionType === 'downgrade' && MAJOR_FIRMS.some(f => a.firm.includes(f))
      ).length,
    };
  } catch {
    return { upgradesLast30d: 0, majorDowngradesLast30d: 0 };
  }
}

async function main() {
  const since = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000);
  console.log(`[backfill-predictions] window: last ${DAYS} days | force=${FORCE}`);

  const filings = await prisma.filing.findMany({
    where: {
      filingDate: { gte: since },
      concernLevel: { not: null }, // only analyzed filings
      ...(FORCE ? {} : { predicted30dAlpha: null }),
    },
    include: {
      company: {
        select: {
          currentPrice: true, fiftyTwoWeekHigh: true, fiftyTwoWeekLow: true,
          marketCap: true, analystTargetPrice: true, sector: true, ticker: true,
        },
      },
    },
    orderBy: { filingDate: 'desc' },
  });

  console.log(`[backfill-predictions] ${filings.length} candidate filings`);

  let updated = 0, skipped = 0, failed = 0;

  for (const filing of filings) {
    const c = filing.company;
    const hasMinimumData =
      c.currentPrice && c.currentPrice > 0 && (c.fiftyTwoWeekLow || filing.concernLevel != null);
    if (!hasMinimumData) { skipped++; continue; }

    try {
      const [macro, analyst] = await Promise.all([
        macroForDate(filing.filingDate),
        analystCounts(filing.companyId, filing.filingDate),
      ]);

      const features = extractAlphaFeatures(
        {
          currentPrice: c.currentPrice || 0,
          fiftyTwoWeekHigh: c.fiftyTwoWeekHigh || 0,
          fiftyTwoWeekLow: c.fiftyTwoWeekLow || 0,
          marketCap: c.marketCap || 0,
          analystTargetPrice: c.analystTargetPrice,
        },
        {
          concernLevel: filing.concernLevel,
          sentimentScore: filing.sentimentScore,
          epsSurprise: (filing as any).epsSurprise ?? null,
          spxTrend30d: macro?.spxReturn30d ?? null,
          vixLevel: macro?.vixClose ?? null,
        },
        analyst,
      );

      const p = predictAlpha(features, c.sector);
      const confidenceNumeric = p.confidence === 'high' ? 0.85 : p.confidence === 'medium' ? 0.65 : 0.5;

      await prisma.filing.update({
        where: { id: filing.id },
        data: {
          predicted30dReturn: p.predicted30dReturn,
          predicted30dAlpha: p.expectedAlpha,
          predictionConfidence: confidenceNumeric,
          predicted7dReturn: p.predicted30dReturn * (7 / 30),
        },
      });

      await prisma.prediction.create({
        data: {
          filingId: filing.id,
          predictedReturn: p.predicted30dReturn,
          confidence: confidenceNumeric,
          features: JSON.stringify(p.featureContributions),
          modelVersion: 'alpha-v1.0',
        },
      });

      updated++;
      if (updated % 100 === 0) console.log(`[backfill-predictions] ${updated} updated...`);
    } catch (e: any) {
      failed++;
      console.error(`[backfill-predictions] ${filing.company.ticker} ${filing.accessionNumber}: ${e.message}`);
    }
  }

  console.log(`[backfill-predictions] done. updated=${updated} skipped(no data)=${skipped} failed=${failed}`);
}

main()
  .catch((e) => { console.error('[backfill-predictions] fatal:', e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
