# Cron Job Setup & Email Alerts

## Overview

The SEC Filing Analyzer has 10 automated cron jobs and a supervisor/monitoring system. See [`CRON-JOBS-README.md`](CRON-JOBS-README.md) for the full job schedule and details.

## Email Alert Setup

### Step 1: Get Resend API Key

1. Go to https://resend.com and sign up (free tier: 100 emails/day)
2. Verify your email domain (or use resend.dev for testing)
3. Create an API key (starts with `re_...`)

### Step 2: Add Environment Variables to Vercel

```bash
vercel env add RESEND_API_KEY production
vercel env add ALERT_EMAIL production
vercel env add CRON_SECRET production
```

Or via Vercel Dashboard: Project > Settings > Environment Variables.

### Step 3: Redeploy

```bash
npm run deploy
```

## Supervisor Alerts

The supervisor runs after each `daily-filings-rss` execution and emails you when:

- A cron job gets stuck (running >10 min) — **auto-fixed**
- `daily-filings-rss` hasn't run in 24+ hours — **manual action needed**
- `update-analyst-data` hasn't run in 48+ hours (weekdays only) — **manual action needed**
- High failure rate (>50% of last 10 jobs failed) — **manual action needed**

The supervisor also auto-triggers missing jobs when possible.

## Watchlist Alerts

Users with watchlist items receive email alerts for:
- New filings with high AI concern levels
- Significant price movements on tracked tickers
- Analyst upgrades/downgrades

Alerts run at 13:00 UTC (morning) and 23:00 UTC (evening).

## Vercel Cron Requirements

Vercel Cron requires the **Pro plan** ($20/month). On the free/hobby plan, cron jobs will not execute.

Alternatives for the free plan:
- Use GitHub Actions to trigger endpoints on a schedule
- Use an external cron service (cron-job.org, Render Cron, etc.)

## Monitoring

```bash
# Check supervisor endpoint
curl -H "Authorization: Bearer $CRON_SECRET" \
  https://stockhuntr.net/api/cron/supervisor

# Manual trigger of any cron job
curl -H "Authorization: Bearer $CRON_SECRET" \
  https://stockhuntr.net/api/cron/daily-filings-rss

# Using npm script
npm run trigger-cron
```

## Troubleshooting

### Jobs Not Running
1. Check Vercel plan (Pro required for cron)
2. Verify `CRON_SECRET` is set in environment variables
3. Check function logs in Vercel dashboard

### No Email Alerts
1. Verify `RESEND_API_KEY` is set correctly
2. Verify `ALERT_EMAIL` is set
3. Check Resend dashboard for failed sends
4. Test by triggering supervisor endpoint manually

### High Failure Rate
1. Review CronJobRun table for error messages
2. Check external API availability (SEC EDGAR, Yahoo Finance)
3. Verify API keys and secrets are current
4. Check database connection
