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

## What You Can Do

### Browse Latest Filings
Visit `/latest-filings` to see recent SEC filings (10-K, 10-Q, 8-K) with:
- Company name, ticker, filing date
- XBRL financial data availability
- Links to SEC EDGAR viewer
- Snapshot of company fundamentals (hover)

### Analyze a Filing
1. Search for a company by ticker (e.g., AAPL)
2. Click on any filing
3. Click "Analyze" to run AI-powered analysis
4. Review:
   - Executive summary with key takeaways
   - Risk factor changes with severity scoring
   - Management sentiment analysis (-1 to +1)
   - Price prediction with alpha model scoring
   - Earnings surprise data (EPS beat/miss/inline)

### Set Up Watchlist Alerts
1. Sign in via magic link (email)
2. Add tickers to your watchlist at `/watchlist`
3. Receive email alerts for:
   - New high-concern filings
   - Significant price movements
   - Analyst upgrades/downgrades

### Paper Trading
Visit `/paper-trading` to view the automated paper portfolio:
- Virtual $100k portfolio trades based on model predictions
- Positions auto-close after 30-day hold period
- Tracks win rate, P&L, model accuracy

### AI Chat
Visit `/chat` to ask questions about filings and companies using natural language.

## Running Tests

```bash
npm test              # 170 Vitest tests (unit + integration)
npm run test:e2e      # 45+ Playwright browser tests
```

## Deploying to Vercel

```bash
npm run deploy        # vercel --prod --force + alias
```

See `DEPLOYMENT.md` for the full guide.

## Key Pages

| Page | URL | Description |
|------|-----|-------------|
| Home | `/` | Landing page with features overview |
| Latest Filings | `/latest-filings` | Live filing feed with filters |
| Company | `/company/{ticker}` | Company filings and data |
| Filing Detail | `/filing/{accession}` | AI analysis + prediction |
| Paper Trading | `/paper-trading` | Virtual portfolio dashboard |
| Watchlist | `/watchlist` | Tracked tickers + alert config |
| Chat | `/chat` | AI chat about filings |
| Query | `/query` | Natural language query interface |

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
