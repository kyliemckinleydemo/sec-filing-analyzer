# StockHuntr — SEC Filing Analyzer

An AI-powered platform for analyzing SEC filings and predicting stock price movements. Uses Claude AI (Anthropic), Yahoo Finance data, and SEC EDGAR APIs to provide real-time filing analysis, earnings surprise predictions, paper trading, and watchlist alerts.

**Live at**: [stockhuntr.net](https://stockhuntr.net)

![Next.js](https://img.shields.io/badge/Next.js-14-black)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)
![Claude AI](https://img.shields.io/badge/Claude-Sonnet%204.5-purple)
![Prisma](https://img.shields.io/badge/Prisma-ORM-2D3748)
![Tests](https://img.shields.io/badge/Tests-170%20passing-brightgreen)

## Features

### AI-Powered Filing Analysis
- **Risk Factor Analysis** — Claude AI analyzes risk factor changes between filings, identifying new risks, removed risks, and severity shifts
- **Sentiment Analysis** — Management tone detection from MD&A sections (-1 to +1 scale)
- **Executive Summaries** — Investor-focused bullet points generated from filing content
- **8-K Event Classification** — Automated categorization of current event filings

### Stock Price Prediction
- **Earnings Surprise Model** — 60%+ directional accuracy using EPS surprise signals
- **Alpha Model** — Multi-feature scoring with percentile-based signal classification
- **Key Features**: EPS surprise magnitude/direction, beat/miss/inline classification, large surprise detection (>10%)
- **Paper Trading Validation** — Automated virtual portfolio tracks prediction accuracy

### Data Pipeline (10 Automated Cron Jobs)
- **SEC Filing Ingestion** — Fetches new 10-K, 10-Q, 8-K filings via RSS (3x daily)
- **Stock Price Updates** — Real-time prices from Yahoo Finance (batch rotation 6x daily)
- **Analyst Data** — Consensus ratings, target prices, upgrades/downgrades
- **Macro Indicators** — S&P 500, VIX, Treasury yields, sector ETFs
- **Paper Trading** — Automated position closure after 7-day hold period
- **Supervisor** — Health monitoring with auto-recovery and email alerts

### User Features
- **Watchlist Alerts** — Email notifications for high-concern filings, price moves, analyst activity
- **Company Search** — Search 500+ companies by ticker
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
| **Testing** | Vitest (170 tests), Playwright (45+ E2E tests) |
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
npm test           # Run all 170 tests
npm run test:e2e   # Run Playwright E2E tests
```

## Project Structure

```
sec-filing-analyzer/
├── app/                              # Next.js App Router
│   ├── api/
│   │   ├── analyze/[accession]/      # AI filing analysis
│   │   ├── predict/[accession]/      # Price prediction
│   │   ├── filings/latest/           # Latest filings feed
│   │   ├── cron/                     # 10 automated cron jobs
│   │   │   ├── daily-filings-rss/    # SEC RSS ingestion
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
│   ├── latest-filings/               # Filing feed page
│   ├── filing/[accession]/           # Filing detail page
│   ├── company/[ticker]/             # Company page
│   ├── paper-trading/                # Portfolio dashboard
│   ├── watchlist/                    # Watchlist page
│   └── page.tsx                      # Homepage
├── lib/                              # Core business logic
│   ├── alpha-model.ts                # Alpha prediction model
│   ├── paper-trading.ts              # PaperTradingEngine class
│   ├── supervisor.ts                 # Cron health monitoring
│   ├── claude-client.ts              # Anthropic API client
│   ├── sec-rss-client.ts             # SEC RSS feed client
│   ├── yahoo-finance-client.ts       # Yahoo Finance wrapper
│   ├── macro-indicators.ts           # Macro data fetching
│   ├── sentiment-analyzer.ts         # Claude sentiment extraction
│   ├── auth.ts                       # JWT + magic link auth
│   ├── rate-limit.ts                 # API rate limiting
│   └── prisma.ts                     # Prisma client singleton
├── __tests__/                        # Test suite (170 tests)
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

The system runs 10 automated jobs via Vercel Cron (see `vercel.json`):

| Job | Schedule (UTC) | Description |
|-----|---------------|-------------|
| `daily-filings-rss` | 06:00, 14:00, 22:00 | Fetch SEC filings via RSS, update company data |
| `update-analyst-data` | 03:00 | Analyst consensus, target prices, upgrades/downgrades |
| `update-stock-prices` | 07:00 | Full stock price refresh for all companies |
| `update-stock-prices-batch` | Every 4h (6x/day) | Batch rotation price updates |
| `update-macro-indicators` | 09:00 | S&P 500, VIX, Treasury, sector ETFs |
| `watchlist-alerts` | 13:00, 23:00 | Email alerts for watchlist events |
| `paper-trading-close-positions` | (via supervisor) | Close 7-day expired positions |
| `supervisor` | (via daily-filings) | Health checks, auto-recovery, email alerts |

All cron endpoints require `Authorization: Bearer <CRON_SECRET>` or `vercel-cron` user-agent.

See [`CRON-JOBS-README.md`](CRON-JOBS-README.md) for detailed documentation.

## Testing

```bash
npm test                    # All 170 Vitest tests
npm run test:unit           # Unit tests only
npm run test:integration    # Integration tests only
npm run test:coverage       # With coverage report
npm run test:e2e            # Playwright E2E (45+ tests)
```

### Test Coverage

| Category | Files | Tests | What's Covered |
|----------|-------|-------|----------------|
| **Unit** | 3 | ~35 | Alpha model, auth, rate limiting |
| **Integration — Cron** | 9 | ~110 | All cron jobs, supervisor, paper trading |
| **Integration — API** | 3 | ~25 | Predict, auth, paper trading engine |
| **E2E** | 8 | ~45 | All pages, navigation, user flows |
| **Total** | 23 | **~215** | |

See [`TEST-PLAN.md`](TEST-PLAN.md) for detailed test architecture.

## API Endpoints

### Public
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/filings/latest` | Latest filings feed (paginated, filterable) |
| GET | `/api/sec/company/{ticker}` | Company info + filings from SEC EDGAR |
| GET | `/api/companies/search` | Search companies by ticker/name |
| GET | `/api/stock/{ticker}` | Stock price data |

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
| [`PAPER-TRADING-SYSTEM.md`](PAPER-TRADING-SYSTEM.md) | Paper trading engine docs |
| [`CRON-SETUP.md`](CRON-SETUP.md) | Email alerts and supervisor setup |

## Disclaimer

This tool is for educational and research purposes only. **Do not use this as financial advice.** Always consult with a qualified financial advisor before making investment decisions. Past performance does not guarantee future results.

---

Built with Next.js, TypeScript, Claude AI, and Vitest
