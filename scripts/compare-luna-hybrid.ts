/**
 * @module scripts/compare-luna-hybrid
 * @description Tests the "Luna-for-everything-but-concern" hybrid. Luna's only weak spot in the
 * bake-off was concern classification; the concern call is also the one call that consumes only the
 * derived signals (risk/sentiment/eps), not the filing text — so re-routing it to Haiku is cheap.
 *
 * For each filing it compares concern three ways against the all-Haiku bar:
 *   - Luna's own concern (from its consolidated analysis)
 *   - HYBRID concern: Haiku assessing concern over LUNA's extracted signals
 *   - (bar) all-Haiku consolidated concern
 * If the hybrid agrees with the bar much better than Luna-own does, routing concern to Haiku fixes it.
 *
 * Usage: OPENROUTER_API_KEY=... npx tsx scripts/compare-luna-hybrid.ts [n]   (default 6)
 */
import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import { PrismaClient } from '@prisma/client';
import { fetchFilingText } from '../lib/pipeline';

const prisma = new PrismaClient();
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const N = parseInt(process.argv[2] || '6');
const OR_KEY = process.env.OPENROUTER_API_KEY;
const HAIKU = 'claude-haiku-4-5-20251001';
const LUNA = 'openai/gpt-5.6-luna';
const SYSTEM = 'You are a senior equity analyst. Respond with ONLY a single JSON object, no prose, no fences.';

const LABELS = ['LOW', 'MODERATE', 'ELEVATED', 'HIGH', 'CRITICAL'];

function analysisPrompt(t: string, co: string, text: string) {
  return `Analyze this SEC ${t} for ${co}. Return ONLY JSON:
{"riskScore":<0-10>,"sentiment":<-1..1>,"concernLevel":<0-10,0=excellent 10=critical>,"concernLabel":"<${LABELS.join('|')}>","epsSurprise":"<beat|miss|inline|n/a>"}

FILING TEXT (truncated):
${text.slice(0, 45000)}`;
}
// concern-only: reasons over derived signals, NO filing text (cheap) — mirrors generateConcernAssessment
function concernPrompt(t: string, r: any, s: any, eps: any) {
  return `Signals from an SEC ${t}: riskScore ${r}/10, management sentiment ${s} (-1..1), EPS surprise "${eps}". Assess overall INVESTOR CONCERN. Return ONLY JSON: {"concernLevel":<0-10, 0=excellent 10=critical>,"concernLabel":"<${LABELS.join('|')}>"}.`;
}

function parseJson(raw: string) {
  let s = raw.trim(); const f = s.match(/```(?:json)?\s*([\s\S]*?)```/); if (f) s = f[1].trim();
  const a = s.indexOf('{'), b = s.lastIndexOf('}'); if (a >= 0 && b > a) s = s.slice(a, b + 1); return JSON.parse(s);
}
async function callHaiku(prompt: string) {
  const r = await anthropic.messages.create({ model: HAIKU, max_tokens: 700, system: SYSTEM, messages: [{ role: 'user', content: prompt }] });
  return { text: r.content.map((c: any) => (c.type === 'text' ? c.text : '')).join(''), inTok: r.usage.input_tokens, outTok: r.usage.output_tokens };
}
async function callLuna(prompt: string) {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OR_KEY}` },
    body: JSON.stringify({ model: LUNA, max_tokens: 700, messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: prompt }] }),
  });
  if (!res.ok) throw new Error(`Luna HTTP ${res.status}`);
  const j = await res.json();
  return { text: j.choices?.[0]?.message?.content || '', inTok: j.usage?.prompt_tokens || 0, outTok: j.usage?.completion_tokens || 0 };
}
const absd = (a: any, b: any) => (typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) : null);
const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
// haiku pricing $1/$5, luna $0.10/$0.60 per MTok
const cost = (m: 'h' | 'l', i: number, o: number) => m === 'h' ? i / 1e6 + o * 5 / 1e6 : i * 0.1 / 1e6 + o * 0.6 / 1e6;

async function main() {
  if (!OR_KEY) { console.log('set OPENROUTER_API_KEY'); process.exit(1); }
  console.log(`\nLuna-except-concern hybrid test — ${N} filings\n`);
  const all = await prisma.filing.findMany({ where: { analysisData: { not: null } }, include: { company: { select: { ticker: true, name: true } } }, orderBy: { filingDate: 'desc' }, take: 200 });
  const rows = all.filter(r => r.filingUrl);
  const byType: Record<string, any[]> = {}; for (const r of rows) (byType[r.filingType] ||= []).push(r);
  const types = Object.keys(byType); const sample: any[] = []; let i = 0;
  while (sample.length < N && types.some(t => byType[t].length)) { const t = types[i % types.length]; if (byType[t].length) sample.push(byType[t].shift()); i++; }

  const d = { lunaConcΔ: [] as number[], hybridConcΔ: [] as number[], lunaLabel: 0, hybridLabel: 0, n: 0, costHaiku: 0, costHybrid: 0 };
  for (const f of sample) {
    const text = await fetchFilingText(f.filingUrl); if (!text) continue;
    const s = text.slice(0, 50000);
    let bar: any, luna: any, lunaRaw: any;
    try {
      const barRaw = await callHaiku(analysisPrompt(f.filingType, f.company.name, s)); bar = parseJson(barRaw.text);
      lunaRaw = await callLuna(analysisPrompt(f.filingType, f.company.name, s)); luna = parseJson(lunaRaw.text);
    } catch (e: any) { console.log(`  ${f.company.ticker}: ${e.message}`); continue; }
    // hybrid: Haiku concern over Luna's signals
    let hybrid: any;
    const hcRaw = await callHaiku(concernPrompt(f.filingType, luna.riskScore, luna.sentiment, luna.epsSurprise));
    try { hybrid = parseJson(hcRaw.text); } catch { continue; }

    d.n++;
    const dl = absd(luna.concernLevel, bar.concernLevel); if (dl != null) d.lunaConcΔ.push(dl);
    const dh = absd(hybrid.concernLevel, bar.concernLevel); if (dh != null) d.hybridConcΔ.push(dh);
    if (luna.concernLabel === bar.concernLabel) d.lunaLabel++;
    if (hybrid.concernLabel === bar.concernLabel) d.hybridLabel++;
    // cost: hybrid path = Luna consolidated (its full input/output) + small Haiku concern call
    d.costHybrid += cost('l', lunaRaw.inTok, lunaRaw.outTok) + cost('h', hcRaw.inTok, hcRaw.outTok);
    d.costHaiku += cost('h', 0, 0); // placeholder; all-Haiku ~$0.018 cited separately
    console.log(`  ${f.company.ticker}/${f.filingType}: bar_conc ${bar.concernLevel}(${bar.concernLabel}) | luna ${luna.concernLevel}(${luna.concernLabel}) | hybrid ${hybrid.concernLevel}(${hybrid.concernLabel})`);
  }

  console.log('\n' + '='.repeat(72));
  console.log('CONCERN fidelity vs all-Haiku bar (lower Δ / higher label% = closer)');
  console.log('='.repeat(72));
  console.log(`filings: ${d.n}`);
  console.log(`Luna-own    concern  Δ ${avg(d.lunaConcΔ).toFixed(2)}   label ${Math.round(d.lunaLabel / d.n * 100)}%`);
  console.log(`HYBRID(Haiku concern over Luna signals)  Δ ${avg(d.hybridConcΔ).toFixed(2)}   label ${Math.round(d.hybridLabel / d.n * 100)}%`);
  console.log(`hybrid cost/filing (Luna text calls + Haiku concern): ~$${(d.costHybrid / Math.max(d.n, 1)).toFixed(4)}  (all-Haiku ~$0.018)`);
  console.log('='.repeat(72) + '\n');
  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
