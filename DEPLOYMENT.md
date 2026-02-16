# Deployment Guide — StockHuntr

## Overview

StockHuntr is deployed to Vercel via CLI (not GitHub auto-deploy). The production site is at [stockhuntr.net](https://stockhuntr.net).

## Prerequisites

- Vercel account (https://vercel.com) with Pro plan ($20/month for cron jobs)
- Vercel CLI installed (`npm i -g vercel`)
- PostgreSQL database (Vercel Postgres, Supabase, or any provider)
- API keys: Anthropic, Resend

## Quick Deploy

```bash
# Production deploy with force (skip build cache) + set domain alias
npm run deploy

# Preview deployment (for testing)
npm run deploy:preview
```

The `deploy` script runs: `vercel --prod --force && vercel alias set stockhuntr.net`

## Environment Variables

Set these in Vercel dashboard (Settings > Environment Variables) or via CLI:

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `ANTHROPIC_API_KEY` | Yes | Anthropic API key for Claude AI analysis |
| `CRON_SECRET` | Yes | Authentication token for cron job endpoints |
| `RESEND_API_KEY` | Yes | Resend API key for email alerts |
| `ALERT_EMAIL` | Yes | Recipient for supervisor health alerts |
| `JWT_SECRET` | Yes | Secret for JWT token signing |
| `MAGIC_LINK_SECRET` | Yes | Secret for magic link authentication |
| `VERCEL_URL` | Auto | Set automatically by Vercel |

```bash
# Set via CLI
vercel env add DATABASE_URL production
vercel env add ANTHROPIC_API_KEY production
vercel env add CRON_SECRET production
vercel env add RESEND_API_KEY production
vercel env add ALERT_EMAIL production
vercel env add JWT_SECRET production
vercel env add MAGIC_LINK_SECRET production
```

## Database Setup

### Initial Setup

After first deploy, push the Prisma schema to production:

```bash
# Pull production env vars
vercel env pull .env.prod

# Push schema to production database
DATABASE_URL=$(grep DATABASE_URL .env.prod | cut -d= -f2-) npx prisma db push

# Clean up (don't keep production credentials locally)
rm .env.prod
```

### After Schema Changes

When `prisma/schema.prisma` is modified, sync production:

```bash
vercel env pull .env.prod
DATABASE_URL=$(grep DATABASE_URL .env.prod | cut -d= -f2-) npx prisma db push
rm .env.prod
npm run deploy
```

## Build Configuration

The build is configured in `package.json`:

```json
{
  "build": "prisma generate && next build"
}
```

**Important**: `next build` requires `ANTHROPIC_API_KEY` to be set at build time (used during page data collection). This works on Vercel where env vars are available. Local builds will fail at the collect-page-data phase — this is expected.

## Vercel Configuration

`vercel.json` configures function timeouts and cron schedules:

```json
{
  "framework": "nextjs",
  "regions": ["iad1"],
  "functions": {
    "app/api/analyze/**/*.ts": { "maxDuration": 300 },
    "app/api/cron/**/*.ts": { "maxDuration": 300 },
    "app/api/**/*.ts": { "maxDuration": 60 }
  },
  "crons": [...]
}
```

- **Region**: `iad1` (US East, close to SEC EDGAR servers)
- **Cron routes**: 300s max duration (5 minutes)
- **Analysis routes**: 300s max (Claude API can be slow)
- **Other API routes**: 60s max

## Cron Jobs

14 cron executions across 10 distinct jobs run daily. See [`CRON-JOBS-README.md`](CRON-JOBS-README.md) for the full schedule and details.

Cron jobs require Vercel Pro plan ($20/month). On the free/hobby plan, cron jobs will not execute.

## Deploy Process

### Standard Deploy

```bash
# 1. Ensure tests pass
npm test

# 2. Deploy
npm run deploy
```

### After Breaking Changes

If the deploy fails due to TypeScript errors:

```bash
# Check type errors locally
npx tsc --noEmit

# Fix errors, then deploy
npm run deploy
```

### Database Schema Changes

```bash
# 1. Modify prisma/schema.prisma
# 2. Generate client locally
npx prisma generate
# 3. Push schema to production
vercel env pull .env.prod
DATABASE_URL=$(grep DATABASE_URL .env.prod | cut -d= -f2-) npx prisma db push
rm .env.prod
# 4. Deploy new code
npm run deploy
```

## Verification

After deploying, verify these endpoints:

```bash
DOMAIN="https://stockhuntr.net"

# Public pages
curl -s -o /dev/null -w "%{http_code}" "$DOMAIN"                    # 200
curl -s -o /dev/null -w "%{http_code}" "$DOMAIN/latest-filings"     # 200

# API endpoints
curl -s -o /dev/null -w "%{http_code}" "$DOMAIN/api/filings/latest" # 200

# Cron endpoints (should return 401 without auth)
curl -s -o /dev/null -w "%{http_code}" "$DOMAIN/api/cron/daily-filings-rss"  # 401
```

## Troubleshooting

### Build Fails with TypeScript Error
- Run `npx tsc --noEmit` locally to identify errors
- Fix errors before deploying
- Common issue: Prisma schema changes that add fields used in page.tsx

### 500 Errors on API Routes
- Check Vercel function logs in the dashboard
- Common cause: database schema out of sync (run `prisma db push`)
- Check that all required env vars are set

### Cron Jobs Not Running
- Verify Vercel Pro plan is active
- Check `CRON_SECRET` is set in env vars
- View cron execution logs in Vercel dashboard > Deployments > Functions

### Stale Build Cache
- The `--force` flag in `npm run deploy` already skips cache
- If issues persist, try `vercel --prod --force --no-wait`

## Monitoring

- **Vercel Dashboard**: Function logs, deployment status, analytics
- **Supervisor Alerts**: Automatic email alerts for cron job failures (requires `RESEND_API_KEY` and `ALERT_EMAIL`)
- **Database**: Query `CronJobRun` table for job history
