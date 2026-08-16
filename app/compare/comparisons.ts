/**
 * @module app/compare/comparisons
 * @description Curated, hand-authored comparison pages for the /compare section. Each entry
 * targets a real comparison-style search query ("X vs Y", "alternatives to X", "best/free
 * tools for …") in the AI-SEC-research space. Content leads with a direct, extractable answer
 * (the block AI answer engines quote) followed by an honest, non-disparaging comparison table
 * and a fair "who each is for" breakdown.
 *
 * Editorial rules baked into this content:
 *  - Honest and factual about StockHuntr; framed as a research/analysis tool, not hype.
 *  - Competitors represented fairly, with their genuine strengths acknowledged.
 *  - No fabricated competitor prices or features. "Paid"/"enterprise pricing"/"subscription"
 *    used where exact figures are unknown; the only stated price is Bloomberg's widely-known
 *    ~$2,000+/month.
 *  - Each page is meant to genuinely help the reader decide, not just funnel to StockHuntr.
 */

export interface ComparisonDimension {
  /** Row label in the comparison table (e.g., "Price", "SEC filing coverage"). */
  label: string;
  /** How StockHuntr fares on this dimension (plain text). */
  stockhuntr: string;
  /** How each named competitor fares, keyed by the competitor's display name. */
  others: Record<string, string>;
}

export interface Comparison {
  /** URL slug: /compare/{slug}. Kebab-case, stable, never reused. */
  slug: string;
  /** The H1 / page title, phrased as the actual search query. */
  title: string;
  /** A self-contained 40-60 word plain-text answer shown first (the direct-answer block). */
  directAnswer: string;
  /** Display names of the tools/products being compared against StockHuntr. */
  competitors: string[];
  /** Comparison-table rows. Each `others` map should key by names in `competitors`. */
  dimensions: ComparisonDimension[];
  /** Who StockHuntr is the right fit for. */
  whoForStockHuntr: string;
  /** Who the alternative(s) are the right fit for. */
  whoForOthers: string;
  /** ISO date the comparison was last reviewed/updated. */
  updated: string;
}

const UPDATED = '2026-08-15';

export const comparisons: Comparison[] = [
  {
    slug: 'fintool-vs-stockhuntr',
    title: 'Fintool vs StockHuntr',
    directAnswer:
      'Fintool is a paid AI financial-research assistant built for analysts who want an AI copilot across earnings and filings. StockHuntr is a free tool focused on SEC filings: you chat with a filing and get answers cited straight from the source, plus AI risk and concern scoring across 800+ US companies. Choose Fintool for a professional research workflow, StockHuntr for free, citation-first filing research.',
    competitors: ['Fintool'],
    dimensions: [
      {
        label: 'Price',
        stockhuntr: 'Free to use.',
        others: { Fintool: 'Paid subscription (professional research tool).' },
      },
      {
        label: 'Primary focus',
        stockhuntr: 'SEC filings — chat with a filing, get cited answers, AI risk/concern scoring.',
        others: { Fintool: 'AI financial-research assistant spanning filings, earnings, and analyst workflows.' },
      },
      {
        label: 'Answer citations',
        stockhuntr: 'Answers are cited straight from the filing text you are reading.',
        others: { Fintool: 'Provides sourced answers as part of its research assistant.' },
      },
      {
        label: 'Data source',
        stockhuntr: 'Primary-source SEC EDGAR filings.',
        others: { Fintool: 'SEC filings and other financial data sources.' },
      },
      {
        label: 'Coverage',
        stockhuntr: '800+ US companies.',
        others: { Fintool: 'Broad public-company coverage for professional research.' },
      },
      {
        label: 'Extra signals',
        stockhuntr: 'Also offers experimental 30-day alpha signals (secondary feature).',
        others: { Fintool: 'Focused on research productivity rather than trade signals.' },
      },
    ],
    whoForStockHuntr:
      'Individual investors, students, and analysts who want a free way to ask questions of a specific SEC filing and get answers cited from the source, plus a quick read on AI-assessed risk — without a subscription.',
    whoForOthers:
      'Professional analysts and teams who want a full AI research assistant integrated into a daily workflow across filings and earnings, and who are comfortable paying for that productivity.',
    updated: UPDATED,
  },
  {
    slug: 'alphasense-alternatives',
    title: 'AlphaSense alternatives',
    directAnswer:
      'AlphaSense is an enterprise market-intelligence platform with broad content well beyond SEC filings — including broker research, expert transcripts, and news — priced for organizations. If you mainly need to research SEC filings, alternatives include StockHuntr (free; chat with filings, cited answers, AI risk scoring across 800+ US companies) and free SEC EDGAR itself. Match the tool to whether you need enterprise breadth or focused filing research.',
    competitors: ['AlphaSense', 'SEC EDGAR (free)'],
    dimensions: [
      {
        label: 'Price',
        stockhuntr: 'Free to use.',
        others: {
          AlphaSense: 'Enterprise pricing (subscription for organizations).',
          'SEC EDGAR (free)': 'Free.',
        },
      },
      {
        label: 'Content breadth',
        stockhuntr: 'Focused on SEC filings.',
        others: {
          AlphaSense: 'Broad: filings plus broker research, expert calls, news, and more.',
          'SEC EDGAR (free)': 'SEC filings only (the primary source).',
        },
      },
      {
        label: 'AI analysis',
        stockhuntr: 'Chat with filings, cited answers, AI risk/concern scoring.',
        others: {
          AlphaSense: 'AI-assisted search and summarization across a large content library.',
          'SEC EDGAR (free)': 'None — raw filings only.',
        },
      },
      {
        label: 'Best for',
        stockhuntr: 'Focused, free SEC filing research.',
        others: {
          AlphaSense: 'Enterprise research teams needing wide market intelligence.',
          'SEC EDGAR (free)': 'Reading original filings directly.',
        },
      },
      {
        label: 'Coverage',
        stockhuntr: '800+ US companies.',
        others: {
          AlphaSense: 'Extensive global company and document coverage.',
          'SEC EDGAR (free)': 'All SEC filers.',
        },
      },
    ],
    whoForStockHuntr:
      'Individuals and small teams who mainly need to interrogate SEC filings, want cited answers and an AI risk read, and prefer a free tool over an enterprise contract.',
    whoForOthers:
      'AlphaSense fits enterprises that need breadth beyond filings — broker research, expert transcripts, and news — in one platform. Free SEC EDGAR fits anyone who just wants to read the original filings themselves.',
    updated: UPDATED,
  },
  {
    slug: 'fintool-alternatives',
    title: 'Fintool alternatives',
    directAnswer:
      'Fintool is a paid AI financial-research assistant for analysts. Alternatives depend on your need: StockHuntr is a free, filing-focused tool where you chat with SEC filings and get cited answers plus AI risk scoring across 800+ US companies; AlphaSense offers enterprise breadth beyond filings; and free SEC EDGAR provides the raw filings with no AI. Pick based on budget and whether you need filings only or broader research.',
    competitors: ['Fintool', 'AlphaSense', 'SEC EDGAR (free)'],
    dimensions: [
      {
        label: 'Price',
        stockhuntr: 'Free to use.',
        others: {
          Fintool: 'Paid subscription.',
          AlphaSense: 'Enterprise pricing.',
          'SEC EDGAR (free)': 'Free.',
        },
      },
      {
        label: 'Focus',
        stockhuntr: 'SEC filings — cited answers and AI risk/concern scoring.',
        others: {
          Fintool: 'AI research assistant across filings and earnings.',
          AlphaSense: 'Enterprise market intelligence beyond filings.',
          'SEC EDGAR (free)': 'The primary filings source, no analysis.',
        },
      },
      {
        label: 'AI features',
        stockhuntr: 'Chat with a filing; answers cited from the source.',
        others: {
          Fintool: 'AI copilot for financial research.',
          AlphaSense: 'AI search and summarization over a large library.',
          'SEC EDGAR (free)': 'None.',
        },
      },
      {
        label: 'Trade signals',
        stockhuntr: 'Experimental 30-day alpha signals (secondary).',
        others: {
          Fintool: 'Research-focused, not signal-focused.',
          AlphaSense: 'Research-focused, not signal-focused.',
          'SEC EDGAR (free)': 'None.',
        },
      },
      {
        label: 'Best for',
        stockhuntr: 'Free, focused filing research.',
        others: {
          Fintool: 'Analysts wanting a paid AI research copilot.',
          AlphaSense: 'Enterprise teams needing broad content.',
          'SEC EDGAR (free)': 'Reading original filings directly.',
        },
      },
    ],
    whoForStockHuntr:
      'People who want to research SEC filings for free, ask questions in plain language, and get answers cited from the filing — with an AI risk read and optional 30-day signals on top.',
    whoForOthers:
      'Fintool suits analysts who want a paid AI research assistant in their daily workflow. AlphaSense suits enterprises needing content beyond filings. Free SEC EDGAR suits anyone who just wants the raw source documents.',
    updated: UPDATED,
  },
  {
    slug: 'bloomberg-terminal-alternatives',
    title: 'Bloomberg Terminal alternatives for SEC filings',
    directAnswer:
      'The Bloomberg Terminal is a comprehensive professional platform costing roughly $2,000+ per month, covering far more than SEC filings. If your need is specifically reading and analyzing SEC filings, lighter alternatives include StockHuntr (free; chat with filings, cited answers, AI risk scoring across 800+ US companies) and free SEC EDGAR. The Terminal remains unmatched for breadth; focused tools win on cost for filing research.',
    competitors: ['Bloomberg Terminal', 'SEC EDGAR (free)'],
    dimensions: [
      {
        label: 'Price',
        stockhuntr: 'Free to use.',
        others: {
          'Bloomberg Terminal': 'Roughly $2,000+ per month per user.',
          'SEC EDGAR (free)': 'Free.',
        },
      },
      {
        label: 'Scope',
        stockhuntr: 'Focused on SEC filings.',
        others: {
          'Bloomberg Terminal': 'Comprehensive: real-time markets, news, analytics, messaging, and more.',
          'SEC EDGAR (free)': 'SEC filings only.',
        },
      },
      {
        label: 'AI filing analysis',
        stockhuntr: 'Chat with filings, cited answers, AI risk/concern scoring.',
        others: {
          'Bloomberg Terminal': 'Extensive analytics and tooling for professionals.',
          'SEC EDGAR (free)': 'None — raw filings only.',
        },
      },
      {
        label: 'Learning curve',
        stockhuntr: 'Lightweight; ask a question in plain language.',
        others: {
          'Bloomberg Terminal': 'Powerful but has a steeper professional learning curve.',
          'SEC EDGAR (free)': 'Simple to browse; manual to analyze.',
        },
      },
      {
        label: 'Best for',
        stockhuntr: 'Free, focused SEC filing research.',
        others: {
          'Bloomberg Terminal': 'Professionals needing an all-in-one market platform.',
          'SEC EDGAR (free)': 'Reading original filings directly.',
        },
      },
    ],
    whoForStockHuntr:
      'Investors and analysts who mainly need to understand SEC filings and want a free, plain-language tool with cited answers and an AI risk read — without a Terminal-scale budget.',
    whoForOthers:
      'The Bloomberg Terminal is the right choice for professionals who need comprehensive, real-time market data, analytics, news, and messaging in one place and can justify the cost. Free SEC EDGAR fits anyone wanting the raw filings.',
    updated: UPDATED,
  },
  {
    slug: 'free-sec-filing-ai-tools',
    title: 'Free AI tools for SEC filings',
    directAnswer:
      'Free options for SEC filings fall into two groups: primary-source access and AI analysis. SEC EDGAR is the free official source but offers raw filings with no AI. StockHuntr is a free tool that adds AI on top — you chat with a filing, get answers cited straight from the source, and see AI risk and concern scoring across 800+ US companies. Many advanced research platforms are paid.',
    competitors: ['SEC EDGAR (free)'],
    dimensions: [
      {
        label: 'Price',
        stockhuntr: 'Free to use.',
        others: { 'SEC EDGAR (free)': 'Free (official government source).' },
      },
      {
        label: 'AI analysis',
        stockhuntr: 'Chat with a filing; cited answers; AI risk/concern scoring.',
        others: { 'SEC EDGAR (free)': 'None — raw filings and search only.' },
      },
      {
        label: 'Citations',
        stockhuntr: 'Answers cited straight from the filing text.',
        others: { 'SEC EDGAR (free)': 'You read the source filing directly.' },
      },
      {
        label: 'Coverage',
        stockhuntr: '800+ US companies with structured data.',
        others: { 'SEC EDGAR (free)': 'All SEC filers.' },
      },
      {
        label: 'Extra signals',
        stockhuntr: 'Experimental 30-day alpha signals (secondary).',
        others: { 'SEC EDGAR (free)': 'None.' },
      },
    ],
    whoForStockHuntr:
      'Anyone who wants free AI help understanding a filing — asking questions in plain language and getting answers cited from the source, with a quick AI read on risk — rather than reading dense documents unaided.',
    whoForOthers:
      'SEC EDGAR is ideal when you want the authoritative original document and are comfortable analyzing it yourself, with no AI layer between you and the primary source.',
    updated: UPDATED,
  },
  {
    slug: 'best-ai-sec-filing-tools',
    title: 'Best AI SEC filing analysis tools',
    directAnswer:
      'The best AI SEC filing tool depends on your budget and needs. StockHuntr is a strong free choice for focused filing research: chat with a filing, get answers cited from the source, and see AI risk scoring across 800+ US companies. Fintool suits analysts wanting a paid AI research assistant; AlphaSense fits enterprises needing content beyond filings; free SEC EDGAR provides the raw source.',
    competitors: ['Fintool', 'AlphaSense', 'SEC EDGAR (free)'],
    dimensions: [
      {
        label: 'Price',
        stockhuntr: 'Free.',
        others: {
          Fintool: 'Paid subscription.',
          AlphaSense: 'Enterprise pricing.',
          'SEC EDGAR (free)': 'Free.',
        },
      },
      {
        label: 'Cited answers',
        stockhuntr: 'Answers cited straight from the filing.',
        others: {
          Fintool: 'Sourced answers in a research assistant.',
          AlphaSense: 'Sourced search across a broad library.',
          'SEC EDGAR (free)': 'You cite the filing yourself.',
        },
      },
      {
        label: 'AI risk scoring',
        stockhuntr: 'AI risk/concern scoring per filing.',
        others: {
          Fintool: 'Research-oriented analysis.',
          AlphaSense: 'Analytics across market intelligence content.',
          'SEC EDGAR (free)': 'None.',
        },
      },
      {
        label: 'Breadth vs focus',
        stockhuntr: 'Focused on SEC filings.',
        others: {
          Fintool: 'Filings plus earnings research.',
          AlphaSense: 'Broad content beyond filings.',
          'SEC EDGAR (free)': 'Filings only.',
        },
      },
      {
        label: 'Best for',
        stockhuntr: 'Free, focused, citation-first filing research.',
        others: {
          Fintool: 'Analysts wanting a paid AI copilot.',
          AlphaSense: 'Enterprise research teams.',
          'SEC EDGAR (free)': 'Reading original filings.',
        },
      },
    ],
    whoForStockHuntr:
      'Investors and analysts who want an accurate, free, citation-first way to research SEC filings, with AI risk scoring and optional 30-day signals — without committing to a subscription.',
    whoForOthers:
      'Fintool is best for analysts wanting a paid AI research assistant; AlphaSense for enterprises needing breadth beyond filings; and free SEC EDGAR for anyone who wants the authoritative original documents with no AI layer.',
    updated: UPDATED,
  },
];

/** Look up a single comparison by slug. */
export function getComparison(slug: string): Comparison | undefined {
  return comparisons.find((c) => c.slug === slug);
}

/** All slugs, useful for generateStaticParams and sitemap generation. */
export const comparisonSlugs: string[] = comparisons.map((c) => c.slug);
