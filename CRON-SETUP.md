# Cron Job Setup & Email Alerts

## Overview

The SEC Filing Analyzer has 3 automated cron jobs:

1. **daily-filings-rss** - Runs daily at 2 AM UTC to fetch new SEC filings
2. **update-analyst-data** - Runs weekdays at 2 PM UTC to update analyst data
3. **supervisor** - Runs every 15 minutes to monitor job health and fix issues

## Email Alert Setup (Required for Supervisor)

### Step 1: Get Resend API Key

1. Go to https://resend.com and sign up (free tier: 100 emails/day)
2. Verify your email domain (or use resend.dev for testing)
3. Create an API key in the dashboard
4. Copy the API key (starts with `re_...`)

### Step 2: Add Environment Variables to Vercel

```bash
# Set Resend API key
vercel env add RESEND_API_KEY
# Paste your API key when prompted
# Select: Production, Preview, Development

# Set alert email address
vercel env add ALERT_EMAIL
# Enter: john@greatfallsventures.com
# Select: Production, Preview, Development
```

Or add via Vercel Dashboard:
1. Go to https://vercel.com/dashboard
2. Select your project → Settings → Environment Variables
3. Add:
   - `RESEND_API_KEY` = your Resend API key
   - `ALERT_EMAIL` = john@greatfallsventures.com

### Step 3: Redeploy

```bash
vercel deploy --prod
```

## Why Cron Jobs Weren't Running

### Issue: Vercel Cron Requires Pro Plan

**Vercel Cron is not available on the Hobby (free) plan.** To enable cron jobs:

1. **Upgrade to Pro Plan**:
   - Go to https://vercel.com/dashboard/settings/billing
   - Upgrade to Pro ($20/month)
   - Cron jobs will activate automatically

2. **Alternative: Use Vercel Deploy Hooks** (if staying on free plan):
   - Set up external cron service (GitHub Actions, Render Cron, etc.)
   - Call Vercel deploy hooks to trigger jobs

### Verifying Cron Jobs Are Running

1. **Check Vercel Dashboard**:
   - Go to Deployments → Functions
   - Look for cron executions

2. **Check Database**:
   ```bash
   npx tsx scripts/check-cron-status.ts
   ```

3. **Manual Trigger** (for testing):
   ```bash
   # With CRON_SECRET env var
   curl -X GET https://your-domain.vercel.app/api/cron/daily-filings-rss \
     -H "Authorization: Bearer $CRON_SECRET"
   ```

## Supervisor Alerts

The supervisor will email you when:
- ✅ A cron job gets stuck (running > 10 min) - **Auto-fixed**
- ⚠️ daily-filings-rss hasn't run in 24 hours - **Manual action needed**
- ⚠️ update-analyst-data hasn't run in 48 hours (weekdays only) - **Manual action needed**
- ⚠️ High failure rate (>50% of last 10 jobs failed) - **Manual action needed**

## Monitoring

### Check Health Status

```bash
# Check supervisor endpoint
curl https://your-domain.vercel.app/api/cron/supervisor

# Check recent cron runs
npx tsx scripts/check-cron-status.ts

# Cleanup stuck jobs manually
npx tsx scripts/cleanup-stuck-cron-jobs.ts
```

### Email Alert Example

```
Subject: [SEC Filing Analyzer] Cron Job Health Alert (2 issues)

=== Cron Job Health Report ===

⚠️ daily-filings-rss has not run successfully in last 24 hours
⚠️ update-analyst-data has not run successfully in last 48 hours

=== Actions Taken ===
Fixed 3 stuck jobs

=== Recommendations ===
Check Vercel cron job logs:
https://vercel.com/dashboard

Review database cron job history:
Run: npx tsx scripts/check-cron-status.ts
```

## Troubleshooting

### Jobs Not Running

1. **Check Vercel Plan**: Cron requires Pro plan ($20/mo)
2. **Check Environment**: Ensure `CRON_SECRET` is set
3. **Check Logs**: View function logs in Vercel dashboard
4. **Manually Trigger**: Use the curl command above to test

### No Email Alerts

1. **Check API Key**: Verify `RESEND_API_KEY` is set correctly
2. **Check Email**: Verify `ALERT_EMAIL` is set
3. **Check Resend Dashboard**: Look for failed sends
4. **Test Manually**: Trigger supervisor endpoint

### High Failure Rate

1. Review error messages in database: `npx tsx scripts/check-cron-status.ts`
2. Check rate limiting (SEC, Yahoo Finance)
3. Verify API keys and secrets are up to date
4. Check database connection

## Manual Operations

If cron jobs aren't working, run manually:

```bash
# Fetch daily SEC filings
npx tsx scripts/fetch-daily-filings.ts

# Update analyst target prices (batch 1)
npx tsx scripts/backfill-analyst-targets.ts 0 50

# Check and fix stuck jobs
npx tsx scripts/cleanup-stuck-cron-jobs.ts
```
