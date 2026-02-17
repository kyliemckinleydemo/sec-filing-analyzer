# Cron Jobs — SEC Filing Analyzer

## Overview

The data pipeline runs **10 automated cron jobs** on Vercel to keep filing data, stock prices, analyst data, macro indicators, and user alerts fresh. All schedules are configured in `vercel.json`.

## Schedule

All times in UTC. See `vercel.json` for the canonical schedule.

| Time (UTC) | Job | Endpoint | Description |
|-----------|-----|----------|-------------|
| 00:00 | `update-stock-prices-batch` | GET `/api/cron/update-stock-prices-batch` | Batch 0 price update |
| 03:00 | `update-analyst-data` | GET `/api/cron/update-analyst-data` | Analyst consensus + earnings |
| 04:00 | `update-stock-prices-batch` | GET `/api/cron/update-stock-prices-batch` | Batch 1 price update |
| 06:00 | `daily-filings-rss` | GET `/api/cron/daily-filings-rss` | SEC filing fetch (morning) |
| 07:00 | `update-stock-prices` | GET `/api/cron/update-stock-prices` | Full stock price refresh |
| 08:00 | `update-stock-prices-batch` | GET `/api/cron/update-stock-prices-batch` | Batch 2 price update |
| 09:00 | `update-macro-indicators` | GET `/api/cron/update-macro-indicators` | Macro indicator update |
| 12:00 | `update-stock-prices-batch` | GET `/api/cron/update-stock-prices-batch` | Batch 3 price update |
| 13:00 | `watchlist-alerts` | GET `/api/cron/watchlist-alerts?time=morning` | Morning watchlist alerts |
| 14:00 | `daily-filings-rss` | GET `/api/cron/daily-filings-rss` | SEC filing fetch (midday) |
| 16:00 | `update-stock-prices-batch` | GET `/api/cron/update-stock-prices-batch` | Batch 4 price update |
| 20:00 | `update-stock-prices-batch` | GET `/api/cron/update-stock-prices-batch` | Batch 5 price update |
| 22:00 | `daily-filings-rss` | GET `/api/cron/daily-filings-rss` | SEC filing fetch (evening) |
| 23:00 | `watchlist-alerts` | GET `/api/cron/watchlist-alerts?time=evening` | Evening watchlist alerts |

**Total: 14 cron executions/day across 10 distinct jobs.**

The `supervisor` and `paper-trading-close-positions` jobs run as part of `daily-filings-rss` (triggered inline after filing ingestion).

## Authentication

All cron endpoints accept two auth methods:

1. **Bearer token**: `Authorization: Bearer <CRON_SECRET>`
2. **Vercel cron user-agent**: Vercel automatically sets `user-agent: vercel-cron/1.0` for scheduled invocations

```bash
# Manual trigger example
curl -H "Authorization: Bearer $CRON_SECRET" \
  https://stockhuntr.net/api/cron/daily-filings-rss
```

## Job Details

### 1. daily-filings-rss

**Schedule**: 3x daily (06:00, 14:00, 22:00 UTC)
**Route**: `app/api/cron/daily-filings-rss/route.ts`
**Duration**: 30-60 seconds

What it does:
1. Cleans up stuck cron job records (running >10 min)
2. Fetches new SEC filings via RSS feed (10-K, 10-Q, 8-K)
3. Activates catch-up mode if filings were missed (uses SEC daily index files)
4. Updates company data from Yahoo Finance (price, market cap, PE ratio, 52-week range, analyst target)
5. Creates CompanySnapshot records for historical tracking
6. Flushes prediction cache for reprocessing
7. Runs supervisor health checks (with auto-trigger for missing jobs)

### 2. update-analyst-data

**Schedule**: Daily at 03:00 UTC
**Route**: `app/api/cron/update-analyst-data/route.ts`
**Duration**: 60-90 seconds

What it does:
1. Finds companies with recent filings (last 30 days)
2. Fetches analyst consensus from Yahoo Finance (rating, target price, coverage count)
3. Fetches earnings data (EPS actual vs estimate, next earnings date)
4. Filters out 8-K filings (analyst data only relevant for 10-K/10-Q)
5. Merges analyst data into the filing's `analysisData` JSON field

### 3. update-stock-prices

**Schedule**: Daily at 07:00 UTC
**Route**: `app/api/cron/update-stock-prices/route.ts`
**Duration**: 60-120 seconds

What it does:
1. Fetches all companies from the database
2. Updates current price, price change %, PE ratio, volume for each
3. Handles BigInt volume values from Yahoo Finance
4. Removes delisted tickers (404 from Yahoo Finance) from tracking
5. Processes in sequence to respect rate limits

### 4. update-stock-prices-batch

**Schedule**: Every 4 hours (6x daily: 00:00, 04:00, 08:00, 12:00, 16:00, 20:00 UTC)
**Route**: `app/api/cron/update-stock-prices-batch/route.ts`
**Duration**: 30-60 seconds

What it does:
1. Determines batch number from UTC hour (0-5)
2. Selects companies in the current batch slice (total companies / 6)
3. Updates price, change %, volume for batch companies only
4. Ensures every company gets updated at least once per 24 hours

### 5. update-macro-indicators

**Schedule**: Daily at 09:00 UTC
**Route**: `app/api/cron/update-macro-indicators/route.ts`
**Duration**: 30-60 seconds

What it does:
1. Fetches macro indicator data (S&P 500, VIX, Treasury yields, sector ETFs)
2. Stores in MacroIndicators table
3. Used for market context display and legacy prediction features

### 6. watchlist-alerts

**Schedule**: 2x daily (13:00, 23:00 UTC)
**Route**: `app/api/cron/watchlist-alerts/route.ts`
**Method**: POST (also accepts GET with `?time=` query param)

What it does:
1. Finds users with active watchlist items
2. Checks for new high-concern filings (concern level from AI analysis)
3. Checks for significant price movements on watchlist tickers
4. Checks for new analyst activity (upgrades, downgrades)
5. Groups alerts by user (one email per user, not per alert)
6. Sends email via Resend with color-coded concern/action formatting
7. Deduplicates alerts already sent

### 7. watchlist-alerts-scheduler

**Route**: `app/api/cron/watchlist-alerts-scheduler/route.ts`
**Method**: POST

Routes alert checks to the correct time slot (morning vs evening) based on UTC hour. Calls the `watchlist-alerts` endpoint with proper auth.

### 8. paper-trading-close-positions

**Route**: `app/api/cron/paper-trading-close-positions/route.ts`

What it does:
1. Finds all active paper portfolios
2. Creates a PaperTradingEngine instance for each portfolio
3. Closes positions that have been open for 30+ days
4. Updates portfolio metrics (total value, win rate, etc.)
5. Continues processing remaining portfolios if one errors

### 9. supervisor

**Route**: `app/api/cron/supervisor/route.ts`
**Library**: `lib/supervisor.ts`

What it does:
1. Checks all cron job health (last run time, failure rate)
2. Detects stuck jobs (running >10 minutes) and marks them failed
3. Detects missing daily filings (>30 hour gap)
4. Detects missing analyst data (>48 hours, weekday only)
5. Detects high failure rate (>50% of last 10 runs)
6. Auto-triggers missing jobs when `autoTriggerMissing=true`
7. Sends email alert via Resend when issues are found

### 10. daily-filings (legacy)

**Route**: `app/api/cron/daily-filings/route.ts`

Legacy endpoint, superseded by `daily-filings-rss`. Still present in codebase but not scheduled in `vercel.json`.

## Monitoring

### Supervisor Health Checks

The supervisor runs automatically after each `daily-filings-rss` execution and monitors:

- **Stuck jobs**: Running >10 minutes (auto-fixed by marking as failed)
- **Missing daily filings**: No successful run in >30 hours
- **Missing analyst data**: No successful run in >48 hours (weekdays only)
- **High failure rate**: >50% of last 10 runs failed

When issues are detected, the supervisor:
1. Auto-triggers missing jobs
2. Sends email alert to `ALERT_EMAIL` via Resend

### Database Tracking

All cron runs are tracked in the `CronJobRun` table:

```sql
SELECT jobName, status, startedAt, completedAt, errorMessage
FROM "CronJobRun"
WHERE startedAt > NOW() - INTERVAL '7 days'
ORDER BY startedAt DESC;
```

### Manual Triggers

```bash
# Trigger any cron job manually
curl -H "Authorization: Bearer $CRON_SECRET" \
  https://stockhuntr.net/api/cron/daily-filings-rss

# Using the npm script
npm run trigger-cron
```

## Troubleshooting

### Jobs Not Running
1. Verify Vercel Pro plan (cron requires Pro, $20/month)
2. Check `CRON_SECRET` is set in Vercel environment variables
3. Check Vercel dashboard > Deployments > Functions for cron logs
4. Verify `vercel.json` cron paths match route files

### 401 Unauthorized
- `CRON_SECRET` mismatch between env var and endpoint
- Check for whitespace/newlines in the secret value

### Timeout Errors
- Max function duration is 300 seconds (configured in `vercel.json`)
- For batch processing, consider reducing batch sizes
- Check if Yahoo Finance API is responding slowly

### Stuck Jobs
- Supervisor auto-detects and fixes stuck jobs (>10 min)
- Manual cleanup: check CronJobRun table for `status = 'running'`

## Required Environment Variables

| Variable | Description |
|----------|-------------|
| `CRON_SECRET` | Auth token for cron endpoints |
| `RESEND_API_KEY` | For supervisor and watchlist email alerts |
| `ALERT_EMAIL` | Recipient for supervisor alert emails |
| `DATABASE_URL` | PostgreSQL connection for job tracking |
