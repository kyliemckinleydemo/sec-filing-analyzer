#!/bin/bash

# Get CRON_SECRET from .env.local
CRON_SECRET=$(grep CRON_SECRET .env.local | cut -d= -f2 | tr -d '"')

echo "Triggering RSS-based cron job..."
curl -X GET "https://sec-filing-analyzer-indol.vercel.app/api/cron/daily-filings-rss" \
  -H "Authorization: Bearer ${CRON_SECRET}" \
  --max-time 60 \
  -w "\n\nHTTP Status: %{http_code}\nTime: %{time_total}s\n"
