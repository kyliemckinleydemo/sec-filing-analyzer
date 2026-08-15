# StockHuntr — SEC Filing Analyzer

**Chat with SEC filings. Get cited answers and risk scores — free.**

StockHuntr is a free AI tool for reading and analyzing SEC filings. Ask about any 10-K, 10-Q, or 8-K in plain English and get clear, **cited answers** straight from the filing, plus AI **risk and concern scoring** across 640+ US companies (all S&P 500 constituents). Everything is grounded in primary-source SEC EDGAR data. It also generates 30-day alpha signals as a secondary feature.

It competes with paid AI research tools (Fintool, AlphaSense) and free raw EDGAR — cited AI answers and risk scoring on primary-source filings, at no cost. Research and educational only; not investment advice.

**Live at**: [stockhuntr.net](https://stockhuntr.net)

![Next.js](https://img.shields.io/badge/Next.js-14-black)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)
![Claude AI](https://img.shields.io/badge/Claude-Sonnet%204.5-purple)
![Prisma](https://img.shields.io/badge/Prisma-ORM-2D3748)
![Tests](https://img.shields.io/badge/Tests-352%20passing-brightgreen)

## Features

### Chat With Filings (Ask the Market)
- **Cited answers** — Ask questions in plain English about any 10-K, 10-Q, or 8-K and get answers grounded in the actual filing, with accession numbers and EDGAR links cited
- **Grounded Q&A blocks** — Company and filing pages carry server-rendered "key questions" derived from real analysis data, with FAQPage structured data (`lib/qa-builders.ts`)
- **Natural-language querying** — Screen and query the filing corpus at `/query`

### AI-Powered Filing Analysis
- **AI Risk & Concern Scoring** — 0–10 concern score (LOW → CRITICAL) with factor breakdown; detects data breaches, litigation, executive departures, restatements, covenant breaches, and more
- **Risk Factor Analysis** — Claude AI analyzes risk factor changes between filings, identifying new risks, removed risks, and severity shifts
- **Sentiment Analysis** — Management tone detection from MD&A sections (-1 to +1 scale)
- **Executive Summaries** — Investor-focused bullet points generated from filing content
- **8-K Event Classification** — Automated categorization of current event filings

### 30-Day Alpha Prediction (Alpha Model v2 — secondary feature)
- **Stepwise+Ridge regression** predicting 30-day market-relative alpha (stock return minus S&P 500)
- **13 features** across **44 Mixture-of-Experts (MoE) models** — global + 11 sector experts + 4 cap-tier experts + 29 sector×cap-tier combined experts
- **4,009 training samples** from 500+ companies (10x expansion from v1's 340 samples)
- **Historical price snapshots** at filing date (99% coverage) — eliminates stale-price bias from prior model
- **Macro regime features** — S&P 500 30-day trend and VIX level at filing date for bull/bear market adjustment
- **EPS surprise** — strongest new feature (actual vs. consensus EPS), winsorized to [-50%, +50%]
- **Backtested accuracy**: 56.2% directional (77.5% high-confidence), Sharpe ratio 2.22 (90-day strict walk-forward CV)
- **Paper Trading** — Automated virtual portfolio validates live performance (30-day hold period)
- See [`MODEL.md`](MODEL.md) for full model documentation

### Content & Discovery (server-rendered for SEO / AI crawlers)
- **`/learn`** — Explainer library: plain-language answers about SEC forms and items (10-K vs 10-Q, 8-K items, going concern, EPS surprises, XBRL, Form 4)
- **`/sectors` & `/sectors/[slug]`** — Sector insight pages with aggregate stats (filings analyzed, avg concern, model accuracy) computed from the corpus
- **`/pulse`** — Recurring "SEC Filing Pulse" report: sector concern heat, most significant filings, strongest 30-day signals (ISR-refreshed, Article JSON-LD)
- **`/compare` & `/compare/[slug]`** — Comparison landing pages (e.g. Fintool vs StockHuntr, AlphaSense alternatives, Bloomberg Terminal alternatives)
- **MCP server** (`/api/mcp`) — Remote Model Context Protocol server (Streamable HTTP) exposing filings, analysis, company data, top signals, and track record to MCP clients (Claude, ChatGPT, agents)
- **Open dataset** (`scripts/export-dataset.ts`) — CC-BY-4.0 export of the analyzed-filing corpus (CSV + JSONL + dataset card) for publication on Hugging Face / Kaggle
- **SEO/GEO infra** — Dynamic `sitemap.ts` & `robots.ts`, `public/llms.txt`, JSON-LD (Organization / WebSite / SoftwareApplication / FAQPage / Article / Dataset), Microsoft Clarity analytics, and IndexNow submission

### Data Pipeline (Automated Cron Jobs)
- **SEC Filing Ingestion** — Fetches new 10-K, 10-Q, 8-K filings via RSS (3x daily), matched to companies **by CIK** (not ticker) for reliability, with daily-index catch-up
- **AI Analysis** — Automated `analyze-filings` cron keeps recent filings analyzed in bounded, cost-guarded batches
- **Prediction Backfill** — `backfill-predictions` cron persists 30-day alpha predictions so Top Signals / Track Record / MCP stay populated
- **Ticker Audit** — Weekly `ticker-audit` cron surfaces ticker-universe drift (delistings, duplicates, missing companies)
- **Stock Price Updates** — Real-time prices from Yahoo Finance (batch rotation 6x daily)
- **Analyst Data** — Consensus ratings, target prices, upgrades/downgrades
- **Macro Indicators** — S&P 500, VIX, Treasury yields, sector ETFs
- **Paper Trading** — Automated position closure after 30-day hold period
- **Supervisor** — Health monitoring with auto-recovery and email alerts, including analysis-coverage and stock-price-freshness data checks

### User Features
- **Watchlist Alerts** — Email notifications for high-concern filings, price moves, analyst activity
- **Company Search** — Search 640+ companies by ticker
- **Filing History** — Browse 10-K, 10-Q, 8-K with infinite scroll
- **Paper Trading Dashboard** — Track virtual portfolio performance
- **Magic Link Auth** — Passwordless email authentication

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Framework** | Next.js 14 (App Router, Server Components) |
| **Language** | TypeScript |
| **Database** | PostgreSQL + Prisma ORM |
| **AI** | Anthropic Claude Sonnet 4.5 |
| **Data** | SEC EDGAR API, Yahoo Finance (`yahoo-finance2`), SEC RSS |
| **Email** | Resend |
| **UI** | Tailwind CSS, shadcn/ui, Recharts, Framer Motion |
| **AI Interop** | Remote MCP server via `mcp-handler` at `/api/mcp` |
| **Testing** | Vitest (244 tests), Playwright (108 E2E tests) |
| **Deployment** | Vercel (CLI deploy, not GitHub-integrated) |

## Getting Started

### Prerequisites
- Node.js 18+
- PostgreSQL database
- Anthropic API key ([get one here](https://console.anthropic.com/))

### Installation

```bash
git clone https://github.com/kyliemckinleydemo/sec-filing-analyzer.git
cd sec-filing-analyzer
npm install
```

### Environment Variables

Create `.env.local`:

```bash
# Required
DATABASE_URL="postgresql://user:password@localhost:5432/sec_analyzer"
ANTHROPIC_API_KEY="sk-ant-api03-your-key-here"

# Cron job authentication
CRON_SECRET="your-cron-secret"

# Email alerts (Resend)
RESEND_API_KEY="re_your-key-here"
ALERT_EMAIL="you@example.com"

# Auth
JWT_SECRET="your-jwt-secret"
MAGIC_LINK_SECRET="your-magic-link-secret"
```

### Database Setup

```bash
npx prisma generate
npx prisma db push
```

### Run

```bash
npm run dev        # Development server at localhost:3000
npm test           # Run all 244 Vitest tests
npm run test:e2e   # Run Playwright E2E tests (108)
```

## Project Structure

```
sec-filing-analyzer/
├── app/                              # Next.js App Router
│   ├── api/
│   │   ├── analyze/[accession]/      # AI filing analysis
│   │   ├── predict/[accession]/      # Price prediction
│   │   ├── filings/latest/           # Latest filings feed
│   │   ├── mcp/                      # Remote MCP server (Streamable HTTP)
│   │   ├── cron/                     # Automated cron jobs
│   │   │   ├── daily-filings-rss/    # SEC RSS ingestion (CIK-matched) + IndexNow
│   │   │   ├── analyze-filings/      # Automated AI analysis (bounded batches)
│   │   │   ├── backfill-predictions/ # Persist 30-day predictions
│   │   │   ├── ticker-audit/         # Weekly ticker-universe drift audit
│   │   │   ├── update-analyst-data/  # Analyst consensus
│   │   │   ├── update-stock-prices/  # Full price refresh
│   │   │   ├── update-stock-prices-batch/  # Batch rotation
│   │   │   ├── update-macro-indicators/    # Macro data
│   │   │   ├── watchlist-alerts/     # User email alerts
│   │   │   ├── watchlist-alerts-scheduler/ # Alert routing
│   │   │   ├── paper-trading-close-positions/ # Position mgmt
│   │   │   └── supervisor/           # Health monitoring
│   │   ├── auth/                     # Magic link auth
│   │   ├── paper-trading/            # Trade execution
│   │   ├── watchlist/                # Watchlist CRUD
│   │   └── chat/                     # AI chat
│   ├── components/                   # Shared components
│   │   ├── Navigation.tsx            # Sticky site header/nav
│   │   ├── Footer.tsx                # Site-wide footer
│   │   └── QASection.tsx             # Grounded Q&A block (FAQPage JSON-LD)
│   ├── learn/                        # Explainer library (+ [slug])
│   ├── sectors/                      # Sector insight pages (+ [sector])
│   ├── pulse/                        # SEC Filing Pulse report
│   ├── compare/                      # Comparison landing pages (+ [slug])
│   ├── latest-filings/               # Filing feed page
│   ├── filing/[accession]/           # Filing detail page
│   ├── company/[ticker]/             # Company page
│   ├── paper-trading/                # Portfolio dashboard
│   ├── watchlist/                    # Watchlist page
│   ├── sitemap.ts                    # Dynamic sitemap.xml
│   ├── robots.ts                     # robots.txt (allows AI crawlers)
│   ├── layout.tsx                    # Root layout: nav, JSON-LD, Clarity
│   └── page.tsx                      # Homepage (SSR initial data)
├── lib/                              # Core business logic
│   ├── alpha-model.ts                # Alpha prediction model
│   ├── qa-builders.ts                # Grounded Q&A pair builders
│   ├── filings-server.ts            # Server-side latest-filings query
│   ├── sector-insights.ts            # Sector aggregate stats
│   ├── pulse.ts                      # Pulse report computation
│   ├── indexnow.ts                   # IndexNow URL submission
│   ├── paper-trading.ts              # PaperTradingEngine class
│   ├── supervisor.ts                 # Cron health monitoring
│   ├── claude-client.ts              # Anthropic API client
│   ├── sec-rss-client.ts             # SEC RSS feed client (CIK matching)
│   ├── macro-indicators.ts           # Macro data fetching
│   ├── auth.ts                       # JWT + magic link auth
│   ├── rate-limit.ts                 # API rate limiting
│   └── prisma.ts                     # Prisma client singleton
├── public/
│   └── llms.txt                      # LLM/AI-crawler site summary
├── scripts/
│   └── export-dataset.ts             # Open dataset export (CSV/JSONL)
├── __tests__/                        # Test suite (244 Vitest + 108 E2E)
│   ├── unit/                         # Pure logic tests
│   ├── integration/                  # API route + service tests
│   │   ├── api/cron/                 # All cron job tests
│   │   └── lib/                      # Service layer tests
│   ├── e2e/                          # Playwright browser tests
│   ├── fixtures/                     # Shared test data
│   └── mocks/                        # Prisma + module mocks
├── prisma/
│   └── schema.prisma                 # Database schema
├── scripts/                          # Data pipeline scripts
└── vercel.json                       # Cron schedules + config
```

## Cron Jobs

The system runs automated jobs via Vercel Cron (see `vercel.json`):

| Job | Schedule (UTC) | Description |
|-----|---------------|-------------|
| `daily-filings-rss` | 06:00, 14:00, 22:00 | Fetch SEC filings via RSS (CIK-matched), update company data, run supervisor + IndexNow |
| `analyze-filings` | 07:00, 15:00, 21:00 | Analyze recent unanalyzed filings with Claude in bounded, cost-guarded batches |
| `backfill-predictions` | 08:00 | Persist 30-day alpha predictions for analyzed filings that lack one |
| `ticker-audit` | Mon 06:00 | Weekly audit surfacing ticker-universe drift (delistings, duplicates, gaps) |
| `update-macro-indicators` | 01:00 | S&P 500, VIX, Treasury, sector ETFs |
| `update-analyst-data` | 03:00 | Analyst consensus, target prices, upgrades/downgrades |
| `update-stock-prices-batch` | Every 4h (6x/day) | Batch rotation price updates |
| `watchlist-alerts` | 13:00 (morning), 23:00 (evening) | Email digests for watchlist events |
| `paper-trading-close-positions` | (via supervisor) | Close 30-day expired positions |
| `supervisor` | (via daily-filings) | Health checks, auto-recovery, analysis-coverage & price-freshness checks, email alerts |

All cron endpoints require `Authorization: Bearer <CRON_SECRET>` or `vercel-cron` user-agent.
The `analyze-filings` job only spends on the Anthropic API when `ANALYSIS_ENABLED=true` (dry-run otherwise).

See [`CRON-JOBS-README.md`](CRON-JOBS-README.md) for detailed documentation.

## Testing

```bash
npm test                    # All 244 Vitest tests
npm run test:unit           # Unit tests only
npm run test:integration    # Integration tests only
npm run test:coverage       # With coverage report
npm run test:e2e            # Playwright E2E (108 tests)
npm run test:count          # Count tests across suites (static)
```

### Test Coverage

| Category | Files | Tests | What's Covered |
|----------|-------|-------|----------------|
| **Vitest — Unit** | 4 | ~53 | Alpha model, auth, rate limiting, builders |
| **Vitest — Integration** | 15 | ~191 | Cron jobs, supervisor, paper trading, API routes |
| **Playwright — E2E** | 14 | ~108 | All pages incl. learn/sectors/pulse/compare, nav, Q&A blocks |
| **Total** | 33 | **~352** | |

See [`TEST-PLAN.md`](TEST-PLAN.md) for detailed test architecture.

## API Endpoints

### Public
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/filings/latest` | Latest filings feed (paginated, filterable) |
| GET | `/api/sec/company/{ticker}` | Company info + filings from SEC EDGAR |
| GET | `/api/companies/search` | Search companies by ticker/name |
| GET | `/api/stock/{ticker}` | Stock price data |
| GET/POST | `/api/mcp` | Remote MCP server (filings, analysis, company, top signals, track record) |

### Analysis (requires auth)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/analyze/{accession}` | Run AI analysis on a filing |
| GET | `/api/predict/{accession}` | Generate price prediction |
| POST | `/api/chat` | AI chat about filings |
| POST | `/api/query` | Natural language query |

### Cron (requires CRON_SECRET)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/cron/daily-filings-rss` | Fetch new SEC filings |
| GET | `/api/cron/update-analyst-data` | Update analyst data |
| GET | `/api/cron/update-stock-prices` | Refresh stock prices |
| GET | `/api/cron/update-stock-prices-batch` | Batch price rotation |
| GET | `/api/cron/update-macro-indicators` | Macro indicator update |
| POST | `/api/cron/watchlist-alerts` | Send watchlist alerts |
| POST | `/api/cron/watchlist-alerts-scheduler` | Route alert checks |
| GET | `/api/cron/paper-trading-close-positions` | Close expired trades |
| GET | `/api/cron/supervisor` | Health monitoring |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `ANTHROPIC_API_KEY` | Yes | Anthropic API key for Claude |
| `CRON_SECRET` | Yes | Authentication for cron endpoints |
| `RESEND_API_KEY` | Yes | Resend API key for email alerts |
| `ALERT_EMAIL` | Yes | Email for supervisor alerts |
| `JWT_SECRET` | Yes | Secret for JWT token signing |
| `MAGIC_LINK_SECRET` | Yes | Secret for magic link tokens |

## Deployment

Deployed via Vercel CLI (not GitHub auto-deploy):

```bash
npm run deploy              # Production deploy with --force
npm run deploy:preview      # Preview deployment
```

This runs `vercel --prod --force` and sets the `stockhuntr.net` alias.

### Database Sync

After schema changes, sync production DB:

```bash
vercel env pull .env.prod
DATABASE_URL=$(grep DATABASE_URL .env.prod | cut -d= -f2-) npx prisma db push
rm .env.prod
```

See [`DEPLOYMENT.md`](DEPLOYMENT.md) for the full deployment guide.

## Documentation

| Document | Description |
|----------|-------------|
| [`README.md`](README.md) | This file — project overview |
| [`QUICKSTART.md`](QUICKSTART.md) | Quick start guide for new users |
| [`TEST-PLAN.md`](TEST-PLAN.md) | Test architecture and coverage |
| [`CRON-JOBS-README.md`](CRON-JOBS-README.md) | Cron job system documentation |
| [`DEPLOYMENT.md`](DEPLOYMENT.md) | Vercel deployment guide |
| [`MODEL.md`](MODEL.md) | Alpha Model v1.0 architecture and performance |
| [`PAPER-TRADING-SYSTEM.md`](PAPER-TRADING-SYSTEM.md) | Paper trading engine docs |
| [`CRON-SETUP.md`](CRON-SETUP.md) | Email alerts and supervisor setup |

## Disclaimer

This tool is for educational and research purposes only. **Do not use this as financial advice.** Always consult with a qualified financial advisor before making investment decisions. Past performance does not guarantee future results.

---

Built with Next.js, TypeScript, Claude AI, and Vitest
