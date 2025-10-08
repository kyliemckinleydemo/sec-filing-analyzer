# SEC Bulk Data Setup

To avoid SEC API rate limiting, this application can use SEC's bulk data files instead of making real-time API requests.

## Overview

The SEC provides a daily bulk data file containing all company submissions:
- **URL:** `https://www.sec.gov/Archives/edgar/daily-index/bulkdata/submissions.zip`
- **Size:** ~1-2GB (compressed)
- **Update frequency:** Daily
- **Contents:** All company filing history in JSON format

## Setup Instructions

### 1. Download Bulk Data

**Important:** You must download from a non-rate-limited IP address. If you've been rate limited:
- Wait 30-60 minutes
- Use a different network/IP
- Use a VPN
- Download from a different machine and transfer the files

```bash
# Download and extract submissions data
npx tsx scripts/download-sec-bulk-data.ts
```

This will:
1. Download `submissions.zip` (~1-2GB)
2. Extract to `data/sec-bulk/submissions/`
3. Create an index file for fast lookups

### 2. Verify Setup

Check that the bulk data was downloaded:

```bash
ls -lh data/sec-bulk/submissions/ | head
```

You should see thousands of `CIK*.json` files.

### 3. Application Will Auto-Use Bulk Data

Once the bulk data is downloaded, the application will automatically:
- Use local files instead of SEC API calls
- Fall back to SEC API only if local data is missing
- Log `✅ Using local bulk data` when successful

## Daily Updates

To keep data fresh, re-run the download script daily:

```bash
# Add to crontab (run at 2 AM daily)
0 2 * * * cd /path/to/sec-filing-analyzer && npx tsx scripts/download-sec-bulk-data.ts
```

Or use Vercel Cron Jobs (add to `vercel.json`):

```json
{
  "crons": [{
    "path": "/api/cron/update-bulk-data",
    "schedule": "0 2 * * *"
  }]
}
```

## Troubleshooting

### Rate Limited (403 Forbidden)

If you get 403 errors when downloading:

1. **Wait 30-60 minutes** before trying again
2. **Use a VPN or different network**
3. **Download from a different machine:**
   ```bash
   # On another machine
   wget https://www.sec.gov/Archives/edgar/daily-index/bulkdata/submissions.zip

   # Transfer to your server
   scp submissions.zip yourserver:/path/to/sec-filing-analyzer/data/sec-bulk/
   ```

4. **Contact SEC** if persistently blocked (they may whitelist your IP for research purposes)

### File Not Found Errors

Make sure the directory structure is correct:
```
sec-filing-analyzer/
├── data/
│   └── sec-bulk/
│       ├── submissions.zip
│       ├── submissions/
│       │   ├── CIK0000320193.json  # Apple
│       │   ├── CIK0000789019.json  # Microsoft
│       │   └── ... (15,000+ files)
│       └── submissions-index.json
```

## Benefits of Bulk Data Approach

✅ **No rate limiting** - All data is local
✅ **Faster lookups** - No network latency
✅ **Offline capable** - Works without internet
✅ **Production ready** - Reliable and scalable
✅ **Cost effective** - No API quota limits

## Alternative: Use a Data Mirror

If you cannot download directly from SEC, consider using a mirror or data provider:
- **Databricks SEC Filings** (https://www.databricks.com/solutions/accelerators/sec-filings)
- **Quandl/Nasdaq Data Link**
- **Snowflake SEC Filings Dataset**

These services often provide the same data without SEC's strict rate limiting.
