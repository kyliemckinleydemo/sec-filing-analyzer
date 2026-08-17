/**
 * @module scripts/compare-consolidation
 * @description Measures the QUALITY impact of collapsing the 6-call analysis pipeline into ONE
 * consolidated call, holding the model constant (Haiku 4.5 — the production bulk model). For each
 * filing it runs both variants and compares:
 *   - structured agreement: riskScore / sentiment / concernLevel deltas + concernLabel/epsSurprise
 *   - blind summary quality: a judge ranks the two executive summaries anonymized
 *   - cost: real token usage for the 1-call variant; analytic estimate for the 6-call variant
 *     (the pipeline re-sends the text ~8× because fullText = currentRisks + mdaText and the caller
 *     passes the same sample for both).
 *
 * Usage: npx tsx scripts/compare-consolidation.ts [sampleSize]   (default 6)
 */
import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import { PrismaClient } from '@prisma/client';
import { fetchFilingText } from '../lib/pipeline';
import { claudeClient } from '../lib/claude-client';

const prisma = new PrismaClient();
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const SAMPLE_SIZE = parseInt(process.argv[2] || '6');

const HAIKU = 'claude-haiku-4-5-20251001';
const HAIKU_IN = 1.0, HAIKU_OUT = 5.0; // $/MTok
const SYSTEM = 'You are a senior equity analyst. Respond with ONLY a single JSON object, no prose, no markdown fences.';

function consolidatedPrompt(filingType: string, company: string, text: string): string {
  return `Analyze this SEC ${filingType} for ${company}. Return ONLY this JSON:
{
  "riskScore": <0-10, higher=riskier>,
  "sentiment": <-1.0 to 1.0>,
  "concernLevel": <0-10, 0=excellent 10=critical>,
  "concernLabel": "<LOW|MODERATE|ELEVATED|HIGH|CRITICAL>",
  "epsSurprise": "<beat|miss|inline|n/a>",
  "executiveSummary": "<3-4 sentence investor summary>"
}

FILING TEXT (truncated):
${text.slice(0, 45000)}`;
}

function parseJson(raw: string): any {
  let s = raw.trim();
  const f = s.match(/```(?:json)?\s*([\s\S]*?)```/); if (f) s = f[1].trim();
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a >= 0 && b > a) s = s.slice(a, b + 1);
  return JSON.parse(s);
}

async function callHaiku(prompt: string) {
  const r = await anthropic.messages.create({ model: HAIKU, max_tokens: 1024, system: SYSTEM, messages: [{ role: 'user', content: prompt }] });
  const text = r.content.map((c: any) => (c.type === 'text' ? c.text : '')).join('');
  return { text, inTok: r.usage.input_tokens, outTok: r.usage.output_tokens };
}

const num = (x: any) => (typeof x === 'number' ? x : null);
const absd = (a: any, b: any) => (num(a) != null && num(b) != null ? Math.abs(a - b) : null);
const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);

// EPS surprise from the 6-call pipeline's structured metrics -> beat/miss/inline/n-a
function epsFrom6(fm: any): string {
  const sd = fm?.structuredData;
  if (!sd || sd.epsSurprise == null) return 'n/a';
  return String(sd.epsSurprise);
}

async function judge(filingType: string, company: string, a: string, b: string) {
  if (!a || !b) return null;
  // randomize A/B labels by filing to avoid position bias handled by caller
  const prompt = `Two investor summaries of the same SEC ${filingType} for ${company}. Which is better (accuracy, specificity, usefulness)? Return ONLY JSON: {"winner":"A|B|tie","note":"<one line>"}.

[A]\n${a}\n\n[B]\n${b}`;
  try { return parseJson((await callHaiku(prompt)).text); } catch { return null; }
}

async function pickSample() {
  const all = await prisma.filing.findMany({
    where: { analysisData: { not: null } },
    include: { company: { select: { ticker: true, name: true } } },
    orderBy: { filingDate: 'desc' }, take: 300,
  });
  const rows = all.filter((r) => r.filingUrl);
  const byType: Record<string, any[]> = {};
  for (const r of rows) (byType[r.filingType] ||= []).push(r);
  const types = Object.keys(byType); const out: any[] = []; let i = 0;
  while (out.length < SAMPLE_SIZE && types.some((t) => byType[t].length)) { const t = types[i % types.length]; if (byType[t].length) out.push(byType[t].shift()); i++; }
  return out;
}

async function main() {
  console.log(`\nConsolidation test — 6-call pipeline vs 1-call (both Haiku 4.5), ${SAMPLE_SIZE} filings\n`);
  const sample = await pickSample();

  const d = { risk: [] as number[], sent: [] as number[], conc: [] as number[], labelHit: 0, epsHit: 0, n: 0,
    winSix: 0, winOne: 0, tie: 0, judged: 0, cost6: 0, cost1: 0 };

  for (const f of sample) {
    const text = await fetchFilingText(f.filingUrl);
    if (!text) { console.log(`  ${f.company.ticker}: fetch failed`); continue; }
    const sample50 = text.slice(0, 50000);

    // 6-call production pipeline (bulk = Haiku 4.5)
    let six: any = null;
    try {
      six = await claudeClient.analyzeFullFiling(sample50, sample50, undefined, f.filingType, f.company.name, undefined, 'bulk');
    } catch (e: any) { console.log(`  ${f.company.ticker}: 6-call failed ${e.message}`); continue; }

    // 1-call consolidated
    let one: any = null, oneRaw: any = null;
    try { oneRaw = await callHaiku(consolidatedPrompt(f.filingType, f.company.name, sample50)); one = parseJson(oneRaw.text); }
    catch (e: any) { console.log(`  ${f.company.ticker}: 1-call failed ${e.message}`); continue; }

    d.n++;
    // structured deltas
    const dr = absd(one.riskScore, six.risks?.riskScore); if (dr != null) d.risk.push(dr);
    const ds = absd(one.sentiment, six.sentiment?.sentimentScore); if (ds != null) d.sent.push(ds);
    const dc = absd(one.concernLevel, six.concernAssessment?.concernLevel); if (dc != null) d.conc.push(dc);
    if (one.concernLabel && six.concernAssessment?.concernLabel && one.concernLabel === six.concernAssessment.concernLabel) d.labelHit++;
    if (one.epsSurprise === epsFrom6(six.financialMetrics)) d.epsHit++;

    // cost: 1-call real; 6-call analytic (text re-sent ~8x: risk 1x + sentiment 1x + financials/content/exec 2x each = ~8x + concern small)
    d.cost1 += (oneRaw.inTok / 1e6) * HAIKU_IN + (oneRaw.outTok / 1e6) * HAIKU_OUT;
    const textTok = sample50.length / 4;
    const est6In = textTok * 8 + 3000; const est6Out = 3600;
    d.cost6 += (est6In / 1e6) * HAIKU_IN + (est6Out / 1e6) * HAIKU_OUT;

    // blind judge (alternate A/B assignment to cancel position bias)
    const sixFirst = d.n % 2 === 0;
    const v = await judge(f.filingType, f.company.name, sixFirst ? six.summary : one.executiveSummary, sixFirst ? one.executiveSummary : six.summary);
    if (v?.winner) {
      d.judged++;
      const sixWon = (v.winner === 'A' && sixFirst) || (v.winner === 'B' && !sixFirst);
      const oneWon = (v.winner === 'A' && !sixFirst) || (v.winner === 'B' && sixFirst);
      if (v.winner === 'tie') d.tie++; else if (sixWon) d.winSix++; else if (oneWon) d.winOne++;
    }
    console.log(`  ${f.company.ticker}/${f.filingType}: riskΔ${dr?.toFixed(1)} concΔ${dc?.toFixed(1)} label${one.concernLabel===six.concernAssessment?.concernLabel?'=':'≠'} judge:${v?.winner||'?'}`);
  }

  console.log('\n' + '='.repeat(78));
  console.log('CONSOLIDATION: 1-call vs 6-call pipeline (both Haiku 4.5) — agreement & cost');
  console.log('='.repeat(78));
  console.log(`filings compared:        ${d.n}`);
  console.log(`riskScore  mean |Δ|:     ${avg(d.risk).toFixed(2)}  (0-10 scale)`);
  console.log(`sentiment  mean |Δ|:     ${avg(d.sent).toFixed(2)}  (-1..1 scale)`);
  console.log(`concernLvl mean |Δ|:     ${avg(d.conc).toFixed(2)}  (0-10 scale)`);
  console.log(`concernLabel agreement:  ${d.n ? Math.round((d.labelHit / d.n) * 100) : 0}%`);
  console.log(`epsSurprise agreement:   ${d.n ? Math.round((d.epsHit / d.n) * 100) : 0}%`);
  console.log(`summary judge (blind):   6-call ${d.winSix} | 1-call ${d.winOne} | tie ${d.tie}  (of ${d.judged})`);
  console.log('-'.repeat(78));
  console.log(`est cost/filing 6-call:  $${(d.cost6 / Math.max(d.n, 1)).toFixed(4)}  (analytic)`);
  console.log(`real cost/filing 1-call: $${(d.cost1 / Math.max(d.n, 1)).toFixed(4)}  (measured)`);
  console.log(`consolidation savings:   ${(d.cost6 / Math.max(d.cost1, 1e-9)).toFixed(1)}x cheaper`);
  console.log('='.repeat(78) + '\n');
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
