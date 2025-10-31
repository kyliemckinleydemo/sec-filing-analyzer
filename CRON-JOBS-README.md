# Cron Jobs Setup & Monitoring

## Overview

The SEC Filing Analyzer runs 2 automated daily cron jobs on Vercel to keep data fresh and paper trading positions current.

## Schedule

| Time      | Job Name                | Description                                    |
|-----------|------------------------|------------------------------------------------|
| 2:00 AM   | `daily-filings-rss`    | Fetches latest SEC filings via RSS feed        |
| 2:30 AM   | `update-analyst-data`  | Updates analyst data + closes paper trades     |

All times are in UTC (Vercel's default timezone).

## Authentication

All cron endpoints require `CRON_SECRET` authentication for security.

### Setting CRON_SECRET

```bash
# In Vercel dashboard or CLI
vercel env add CRON_SECRET production
```

The secret must be passed in the Authorization header:
```
Authorization: Bearer <CRON_SECRET>
```

## Monitoring

### Check Health Status

Run the monitoring script to check if cron jobs are running correctly:

```bash
npx tsx scripts/monitor-cron-health.ts
```

This will show:
- Last successful run time
- Time since last run
- Recent failures
- Stuck runs (running > 10 min)

### Expected Output

```
🏥 CRON JOB HEALTH MONITOR

✅ daily-filings-rss
   Schedule: 2:00 AM daily
   Status: success
   Last successful run: 2025-10-31T02:00:15.234Z
   Time since last run: 18.5 hours

✅ update-analyst-data
   Schedule: 2:30 AM daily
   Status: success
   Last successful run: 2025-10-31T02:30:42.123Z
   Time since last run: 18.0 hours

📈 SUMMARY
   Healthy: 2/2
```

### Unhealthy Signs

⚠️ Alert if:
- No run in > 26 hours
- Multiple failed runs
- Stuck runs (running > 10 min)
- Error messages in logs

## Testing Locally

### Test Authentication

```bash
export CRON_SECRET=your-secret-here
npx tsx scripts/test-cron-endpoints.ts
```

### Manual Trigger (Production)

```bash
# Get CRON_SECRET from Vercel
vercel env pull .env.production

# Trigger manually
curl -H "Authorization: Bearer $CRON_SECRET" \
  https://your-app.vercel.app/api/cron/daily-filings-rss
```

## Troubleshooting

### Cron Jobs Not Running

1. **Check Vercel Dashboard**
   - Go to your project > Deployments > Latest > Functions
   - Look for cron execution logs

2. **Verify CRON_SECRET**
   ```bash
   vercel env ls | grep CRON_SECRET
   ```
   Ensure it's set for Production environment

3. **Check Build Configuration**
   ```bash
   vercel build --prod
   cat .vercel/output/config.json | grep -A 10 "crons"
   ```

4. **Verify vercel.json**
   Ensure cron paths match your route files exactly

5. **Check for Redirects**
   Cron jobs don't follow 3xx redirects. Ensure endpoints return 200.

### Common Issues

**❌ 401 Unauthorized**
- CRON_SECRET mismatch between Vercel env and endpoint
- Check for whitespace/newlines in secret

**❌ Timeout Errors**
- Job taking > 300 seconds (max duration)
- Consider splitting into smaller jobs
- Use pagination for large datasets

**❌ Out of Memory**
- Process too many items at once
- Reduce batch sizes
- Use streaming where possible

**❌ Rate Limiting**
- External APIs (SEC, Yahoo Finance) have limits
- Add delays between requests
- Implement exponential backoff

## Plan Limits

**Vercel Free/Hobby Plan**: 2 cron jobs maximum
- Current: 2/2 (both slots used)
- To add more jobs, upgrade to Pro plan or consolidate jobs

**Pro Plan**: 10 cron jobs
**Enterprise**: Unlimited

## Database Tracking

All cron runs are tracked in the `CronJobRun` table:

```sql
SELECT
  jobName,
  status,
  startedAt,
  completedAt,
  filingsFetched,
  filingsStored,
  companiesProcessed,
  errorMessage
FROM "CronJobRun"
WHERE startedAt > NOW() - INTERVAL '7 days'
ORDER BY startedAt DESC;
```

## Maintenance

### Weekly Checks
- Run `monitor-cron-health.ts` weekly
- Check for stuck jobs
- Review error patterns

### Monthly Reviews
- Analyze success rates
- Check execution duration trends
- Optimize if needed

### When Making Changes
1. Test locally first with `test-cron-endpoints.ts`
2. Deploy to production
3. Monitor first execution
4. Check logs for errors

## Contact

For issues or questions about cron jobs:
1. Check Vercel logs first
2. Run health monitor
3. Review this README
4. Check GitHub Issues
