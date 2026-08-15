# Quick Start Guide — StockHuntr

## Get Started in 5 Minutes

### 1. Get API Keys

**Required:**

- **Anthropic Claude API Key** — for AI filing analysis
  - Visit: https://console.anthropic.com/
  - Sign up and get your API key (starts with `sk-ant-...`)

- **Resend API Key** — for email alerts and magic link auth
  - Visit: https://resend.com
  - Free tier: 100 emails/day
  - Get API key (starts with `re_...`)

### 2. Install & Configure

```bash
git clone https://github.com/kyliemckinleydemo/sec-filing-analyzer.git
cd sec-filing-analyzer
npm install
```

Create `.env.local`:

```bash
DATABASE_URL="postgresql://user:password@localhost:5432/sec_analyzer"
ANTHROPIC_API_KEY="sk-ant-your-key-here"
CRON_SECRET="any-random-secret-string"
RESEND_API_KEY="re_your-key-here"
ALERT_EMAIL="you@example.com"
JWT_SECRET="any-random-secret"
MAGIC_LINK_SECRET="any-random-secret"
```

### 3. Set Up Database

```bash
npx prisma generate
npx prisma db push
```

### 4. Start the Server

```bash
npm run dev
```

Open http://localhost:3000

## What Is StockHuntr?

StockHuntr lets you **chat with SEC filings and get cited answers**, plus AI **risk and concern scoring** — free. Ask about any 10-K, 10-Q, or 8-K in plain English and get a clear answer straight from the filing, grounded in primary-source SEC EDGAR data across 640+ US companies (all S&P 500 constituents). It also generates 30-day alpha signals as a secondary feature.

Compared to paid AI research tools (Fintool, AlphaSense) it's free with primary-source citations; compared to raw EDGAR it adds the AI answers and risk scoring that EDGAR has no way to give you. It's a research and educational tool — **not investment advice**.

The sticky site header (top of every page) links to the main sections: **Latest Filings · Pulse · Sectors · Ask the Market · Track Record · Watchlist · FAQ**.

## What You Can Do

### Ask the Market (chat with filings)
Visit `/query` ("Ask the Market") to ask questions in plain English and get **cited answers** drawn from the actual SEC filings — with accession numbers and EDGAR links. Try things like:
- "What were Apple's key risk factors in their latest 10-K?"
- "Did Tesla mention any new factory plans in their 8-K?"
- "Summarize Microsoft's revenue growth from their last 10-Q"

### Browse Latest Filings
Visit `/latest-filings` to see recent SEC filings (10-K, 10-Q, 8-K) with:
- Company name, ticker, filing date
- AI concern/risk badges and 30-day LONG/SHORT/NEUTRAL signals
- Links to the SEC EDGAR viewer
- Snapshot of company fundamentals (hover)

### Analyze a Filing (risk & concern scoring)
1. Search for a company by ticker (e.g., AAPL) or open a filing from the feed
2. Open any filing detail page
3. Review:
   - Executive summary with key takeaways
   - **AI concern score (0–10, LOW → CRITICAL)** with a factor breakdown
   - Risk factor changes with severity scoring
   - Management sentiment analysis (-1 to +1)
   - Grounded "key questions" Q&A about the filing
   - 30-day alpha prediction with confidence (secondary feature)
   - Earnings surprise data (EPS beat/miss/inline)

### Explore Sector Insights & the Pulse
- **`/sectors`** — Compare risk, concern, and model accuracy across market sectors; drill into any sector for the full breakdown.
- **`/pulse`** — The recurring "SEC Filing Pulse" report: which sectors are flashing the most concern, the period's most significant filings, and the strongest 30-day signals.
- **`/compare`** — Honest side-by-side comparisons (StockHuntr vs Fintool, AlphaSense alternatives, Bloomberg Terminal alternatives, free EDGAR).
- **`/learn`** — Plain-language explainers on how to read SEC filings.

### Set Up Watchlist Alerts
1. Sign in via magic link (email)
2. Add tickers to your watchlist at `/watchlist`
3. Receive morning & evening email digests for:
   - New high-concern filings
   - Significant price movements
   - Analyst upgrades/downgrades

### Paper Trading
Visit `/paper-trading` to view the automated paper portfolio:
- Virtual portfolio trades based on model predictions
- Positions auto-close after 30-day hold period
- Tracks win rate, P&L, model accuracy

### Track Record
Visit `/model-demo` ("Track Record") to see live model predictions compared against actual 30-day outcomes.

### For Developers: MCP Server
An MCP (Model Context Protocol) server is exposed at `/api/mcp`. MCP-aware clients (Claude, ChatGPT, agents) can call tools like `get_latest_filings`, `get_filing_analysis`, `get_company`, `search_companies`, `get_top_signals`, and `get_model_track_record`. There's also an open, CC-BY-4.0 dataset export (`npx tsx scripts/export-dataset.ts`).

## Running Tests

```bash
npm test              # 244 Vitest tests (unit + integration)
npm run test:e2e      # 108 Playwright browser tests
```

## Deploying to Vercel

```bash
npm run deploy        # vercel --prod --force + alias
```

See `DEPLOYMENT.md` for the full guide.

## Key Pages

| Page | URL | Description |
|------|-----|-------------|
| Home | `/` | Dashboard (signed in) / landing page (visitors) |
| Latest Filings | `/latest-filings` | Live filing feed with filters |
| Pulse | `/pulse` | Recurring SEC Filing Pulse report |
| Sectors | `/sectors` | Sector insight pages with aggregate stats |
| Ask the Market | `/query` | Chat with filings / natural-language querying |
| Track Record | `/model-demo` | Predictions vs actual 30-day outcomes |
| Compare | `/compare` | Tool comparisons (Fintool, AlphaSense, etc.) |
| Learn | `/learn` | Explainers on how to read SEC filings |
| Company | `/company/{ticker}` | Company filings, snapshot, and grounded Q&A |
| Filing Detail | `/filing/{accession}` | AI analysis, concern score + prediction |
| Paper Trading | `/paper-trading` | Virtual portfolio dashboard |
| Watchlist | `/watchlist` | Tracked tickers + alert config |
| FAQ | `/faq` | Methodology, model docs, legal disclaimers |
| MCP Server | `/api/mcp` | Remote MCP endpoint for AI clients / agents |

## Troubleshooting

### "Company not found"
- Check ticker spelling (must be uppercase)
- Try well-known tickers: AAPL, MSFT, GOOGL

### "AI analysis unavailable"
- Check `ANTHROPIC_API_KEY` in `.env.local`
- Ensure key starts with `sk-ant-`
- Restart dev server after changing `.env.local`

### Database errors
- Ensure PostgreSQL is running
- Check `DATABASE_URL` in `.env.local`
- Run `npx prisma db push` to sync schema

### Port 3000 in use
- Server auto-selects port 3001
- Check terminal output for correct port

## More Documentation

- **Full README**: [`README.md`](README.md)
- **Test Plan**: [`TEST-PLAN.md`](TEST-PLAN.md)
- **Cron Jobs**: [`CRON-JOBS-README.md`](CRON-JOBS-README.md)
- **Deployment**: [`DEPLOYMENT.md`](DEPLOYMENT.md)
- **Alpha Model**: [`MODEL.md`](MODEL.md)
- **Paper Trading**: [`PAPER-TRADING-SYSTEM.md`](PAPER-TRADING-SYSTEM.md)
- **Database Schema**: `prisma/schema.prisma`

## Disclaimer

This tool is for educational and research purposes only. Not financial advice. Always consult a qualified financial advisor before making investment decisions.
