/**
 * @module scripts/compare-models
 * @description Model-quality/cost bake-off for SEC-filing analysis. Runs ONE consolidated analysis
 * prompt identically across several models (Anthropic tiers now; any OpenAI-compatible provider —
 * OpenRouter/OpenAI — when a key is present), on a diverse sample of real filings. Measures:
 *   - numeric agreement vs the Sonnet-4.5 baseline (risk / sentiment / concern deltas)
 *   - categorical agreement (concernLabel, epsSurprise, guidanceDirection)
 *   - blind summary quality (a judge model ranks the anonymized summaries)
 *   - real $ cost from token usage
 *
 * Isolating the single prompt across models makes it apples-to-apples (the production pipeline uses
 * 6 specialized calls; this is a level field to compare MODELS, not to reproduce the pipeline).
 *
 * Usage: npx tsx scripts/compare-models.ts [sampleSize]   (default 8)
 * Cross-provider: set OPENROUTER_API_KEY (recommended) or OPENAI_API_KEY in .env.
 */
import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import { PrismaClient } from '@prisma/client';
import { fetchFilingText } from '../lib/pipeline';

const prisma = new PrismaClient();
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SAMPLE_SIZE = parseInt(process.argv[2] || '8');

// $ per 1M tokens [input, output]. Cross-provider prices are list prices (approx via OpenRouter).
const PRICING: Record<string, [number, number]> = {
  'claude-sonnet-4-5-20250929': [3, 15],
  'claude-haiku-4-5-20251001': [1, 5],
  'claude-3-5-haiku-20241022': [0.8, 4],
  'openai/gpt-4o-mini': [0.15, 0.6],
  'google/gemini-2.0-flash-001': [0.1, 0.4],
  'deepseek/deepseek-chat': [0.28, 0.88],
  // Chinese models (live OpenRouter pricing, Aug 2026)
  'deepseek/deepseek-v4-flash': [0.083, 0.165],
  'z-ai/glm-5.2': [0.447, 3.31],
  'deepseek/deepseek-v3.2': [0.269, 0.4],
  'qwen/qwen3.6-flash': [0.188, 1.125],
  // OpenAI + Google — benchmark-chosen (AA Intelligence Index, Aug 2026); live OpenRouter pricing
  'google/gemini-3.7-flash': [0.375, 1.875], // Intelligence 56, #1 on AA-AnalystAgent doc-QA
  'openai/gpt-5.6-luna': [0.1, 0.6], // Intelligence 51, cheap-capable GPT-5.6 tier
};

type ModelSpec = { id: string; label: string; provider: 'anthropic' | 'openai-compat' };

// Anthropic tiers always run. OpenAI-compatible models only run if a key is configured.
const OPENAI_COMPAT_KEY = process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY;
const OPENAI_COMPAT_BASE = process.env.OPENROUTER_API_KEY
  ? 'https://openrouter.ai/api/v1'
  : 'https://api.openai.com/v1';

const MODELS: ModelSpec[] = [
  { id: 'claude-sonnet-4-5-20250929', label: 'Sonnet 4.5 (baseline)', provider: 'anthropic' },
  { id: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5 (current bar)', provider: 'anthropic' },
  ...(OPENAI_COMPAT_KEY
    ? ([
        { id: 'google/gemini-3.7-flash', label: 'Gemini 3.7 Flash', provider: 'openai-compat' },
        { id: 'openai/gpt-5.6-luna', label: 'GPT-5.6 Luna', provider: 'openai-compat' },
      ] as ModelSpec[])
    : []),
];

const BASELINE_ID = 'claude-sonnet-4-5-20250929';

const SYSTEM_PROMPT =
  'You are a senior equity analyst. Analyze the SEC filing and respond with ONLY a single JSON object, no prose, no markdown fences.';

function analysisPrompt(filingType: string, company: string, text: string): string {
  return `Analyze this SEC ${filingType} for ${company}. Return ONLY this JSON shape:
{
  "riskScore": <number 0-10, higher = riskier>,
  "sentiment": <number -1.0 to 1.0, management tone>,
  "concernLevel": <number 0-10, 0=excellent 10=critical>,
  "concernLabel": "<LOW|MODERATE|ELEVATED|HIGH|CRITICAL>",
  "epsSurprise": "<beat|miss|inline|n/a>",
  "guidanceDirection": "<raised|maintained|lowered|none>",
  "topRisks": [<up to 3 short strings>],
  "executiveSummary": "<3-4 sentence plain-English summary for an investor>"
}

FILING TEXT (truncated):
${text.slice(0, 45000)}`;
}

function parseJson(raw: string): any {
  let s = raw.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) s = fence[1].trim();
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start >= 0 && end > start) s = s.slice(start, end + 1);
  return JSON.parse(s);
}

async function callAnthropic(model: string, prompt: string) {
  const r = await anthropic.messages.create({
    model,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: prompt }],
  });
  const text = r.content.map((c: any) => (c.type === 'text' ? c.text : '')).join('');
  return { text, inputTokens: r.usage.input_tokens, outputTokens: r.usage.output_tokens };
}

async function callOpenAICompat(model: string, prompt: string) {
  const res = await fetch(`${OPENAI_COMPAT_BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_COMPAT_KEY}` },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
    }),
  });
  if (!res.ok) throw new Error(`${model}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  const j = await res.json();
  return {
    text: j.choices?.[0]?.message?.content || '',
    inputTokens: j.usage?.prompt_tokens || 0,
    outputTokens: j.usage?.completion_tokens || 0,
  };
}

async function runModel(spec: ModelSpec, prompt: string) {
  const raw = spec.provider === 'anthropic' ? await callAnthropic(spec.id, prompt) : await callOpenAICompat(spec.id, prompt);
  const [pin, pout] = PRICING[spec.id] || [0, 0];
  const cost = (raw.inputTokens / 1e6) * pin + (raw.outputTokens / 1e6) * pout;
  let parsed: any = null;
  try {
    parsed = parseJson(raw.text);
  } catch {
    parsed = null;
  }
  return { parsed, cost, ...raw };
}

async function pickSample() {
  // Diverse-ish: newest analyzed filings spread across form types, with a fetchable URL.
  const all = await prisma.filing.findMany({
    where: { analysisData: { not: null } },
    include: { company: { select: { ticker: true, name: true, sector: true } } },
    orderBy: { filingDate: 'desc' },
    take: 400,
  });
  const rows = all.filter((r) => r.filingUrl);
  const byType: Record<string, any[]> = {};
  for (const r of rows) (byType[r.filingType] ||= []).push(r);
  const out: any[] = [];
  const types = Object.keys(byType);
  let i = 0;
  while (out.length < SAMPLE_SIZE && types.some((t) => byType[t].length)) {
    const t = types[i % types.length];
    if (byType[t].length) out.push(byType[t].shift());
    i++;
  }
  return out;
}

async function judge(filing: any, summaries: { label: string; text: string }[]) {
  const shuffled = [...summaries].filter((s) => s.text);
  if (shuffled.length < 2) return null;
  const prompt = `You are judging investor-facing summaries of the same SEC ${filing.filingType} for ${filing.company.name}. Rank them best-to-worst on accuracy, specificity, and usefulness. Return ONLY JSON: {"ranking": ["<label>", ...], "note": "<one line>"}.

${shuffled.map((s) => `[${s.label}]\n${s.text}`).join('\n\n')}`;
  try {
    const r = await callAnthropic(BASELINE_ID, prompt);
    return parseJson(r.text);
  } catch {
    return null;
  }
}

const absDelta = (a: any, b: any) => (typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) : null);
const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);

async function main() {
  console.log(`\nModel comparison — ${SAMPLE_SIZE} filings × ${MODELS.length} models`);
  console.log(`Models: ${MODELS.map((m) => m.label).join(', ')}`);
  if (!OPENAI_COMPAT_KEY) console.log('(cross-provider skipped — set OPENROUTER_API_KEY or OPENAI_API_KEY to include GPT/Gemini)');
  console.log('');

  const sample = await pickSample();
  console.log(`Sample: ${sample.map((f) => `${f.company.ticker}/${f.filingType}`).join(', ')}\n`);

  const agg: Record<string, any> = {};
  for (const m of MODELS) agg[m.id] = { risk: [], sent: [], concern: [], labelHit: 0, epsHit: 0, guidHit: 0, cost: 0, fails: 0, judgeWins: 0, judged: 0, n: 0 };

  for (const filing of sample) {
    const text = await fetchFilingText(filing.filingUrl);
    if (!text) { console.log(`  ${filing.company.ticker}: fetch failed, skip`); continue; }
    const prompt = analysisPrompt(filing.filingType, filing.company.name, text);

    const results: Record<string, any> = {};
    for (const m of MODELS) {
      try {
        results[m.id] = await runModel(m, prompt);
      } catch (e: any) {
        results[m.id] = { parsed: null, cost: 0, error: e.message };
      }
    }
    const base = results[BASELINE_ID]?.parsed;

    for (const m of MODELS) {
      const a = agg[m.id];
      const r = results[m.id];
      a.n++;
      a.cost += r.cost || 0;
      if (!r.parsed) { a.fails++; continue; }
      if (base && m.id !== BASELINE_ID) {
        const dr = absDelta(r.parsed.riskScore, base.riskScore); if (dr != null) a.risk.push(dr);
        const ds = absDelta(r.parsed.sentiment, base.sentiment); if (ds != null) a.sent.push(ds);
        const dc = absDelta(r.parsed.concernLevel, base.concernLevel); if (dc != null) a.concern.push(dc);
        if (r.parsed.concernLabel === base.concernLabel) a.labelHit++;
        if (r.parsed.epsSurprise === base.epsSurprise) a.epsHit++;
        if (r.parsed.guidanceDirection === base.guidanceDirection) a.guidHit++;
      }
    }

    // blind summary judging
    const summaries = MODELS.map((m) => ({ label: m.label, text: results[m.id]?.parsed?.executiveSummary || '' }));
    const verdict = await judge(filing, summaries);
    if (verdict?.ranking?.length) {
      const winner = verdict.ranking[0];
      for (const m of MODELS) { agg[m.id].judged++; if (m.label === winner) agg[m.id].judgeWins++; }
    }
    console.log(`  ${filing.company.ticker}/${filing.filingType}: done${verdict?.ranking ? ` (judge #1: ${verdict.ranking[0]})` : ''}`);
  }

  // ---- report ----
  const baseCost = agg[BASELINE_ID].cost || 1e-9;
  console.log('\n' + '='.repeat(110));
  console.log('RESULTS (deltas + categorical agreement are vs Sonnet 4.5 baseline; lower delta = closer)');
  console.log('='.repeat(110));
  console.log(
    ['model'.padEnd(24), 'riskΔ', 'sentΔ', 'concΔ', 'label%', 'eps%', 'guid%', 'judge#1', 'parseFail', '$/filing', 'vs base'].join('  ')
  );
  for (const m of MODELS) {
    const a = agg[m.id];
    const isBase = m.id === BASELINE_ID;
    const catN = Math.max(a.n - (isBase ? a.n : 0), 1);
    const row = [
      m.label.padEnd(24),
      isBase ? '  —  ' : avg(a.risk).toFixed(2).padStart(5),
      isBase ? '  —  ' : avg(a.sent).toFixed(2).padStart(5),
      isBase ? '  —  ' : avg(a.concern).toFixed(2).padStart(5),
      isBase ? '  — ' : `${Math.round((a.labelHit / catN) * 100)}%`.padStart(5),
      isBase ? '  — ' : `${Math.round((a.epsHit / catN) * 100)}%`.padStart(5),
      isBase ? '  — ' : `${Math.round((a.guidHit / catN) * 100)}%`.padStart(5),
      `${a.judged ? Math.round((a.judgeWins / a.judged) * 100) : 0}%`.padStart(6),
      `${a.fails}/${a.n}`.padStart(8),
      `$${(a.cost / Math.max(a.n, 1)).toFixed(4)}`.padStart(9),
      `${(a.cost / baseCost).toFixed(2)}x`.padStart(7),
    ];
    console.log(row.join('  '));
  }
  console.log('='.repeat(110));
  console.log('riskΔ/sentΔ/concΔ = mean abs difference from Sonnet on 0-10 / -1..1 / 0-10 scales.');
  console.log('judge#1 = share of filings where a blind judge ranked this model\'s summary best.\n');

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
