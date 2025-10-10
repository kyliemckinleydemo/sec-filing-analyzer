#!/bin/bash

# Run backfill in chunks to avoid timeouts
# This script will backfill 270 days in 6 chunks of 45 days each

TOTAL_DAYS=270
CHUNK_SIZE=45
BASE_URL="https://sec-filing-analyzer-indol.vercel.app/api/backfill"

echo "Starting full backfill for $TOTAL_DAYS days in chunks of $CHUNK_SIZE days..."
echo ""

# Calculate number of chunks
NUM_CHUNKS=$((($TOTAL_DAYS + $CHUNK_SIZE - 1) / $CHUNK_SIZE))

for i in $(seq 0 $(($NUM_CHUNKS - 1))); do
  # Calculate date range for this chunk
  END_DAYS=$(($i * $CHUNK_SIZE + 1))
  START_DAYS=$(($END_DAYS + $CHUNK_SIZE - 1))

  if [ $START_DAYS -gt $TOTAL_DAYS ]; then
    START_DAYS=$TOTAL_DAYS
  fi

  END_DATE=$(date -v-${END_DAYS}d +%Y-%m-%d 2>/dev/null || date -d "-${END_DAYS} days" +%Y-%m-%d)
  START_DATE=$(date -v-${START_DAYS}d +%Y-%m-%d 2>/dev/null || date -d "-${START_DAYS} days" +%Y-%m-%d)

  echo "=== Chunk $((i+1))/$NUM_CHUNKS ==="
  echo "Date range: $START_DATE to $END_DATE"
  echo ""

  curl -s -X GET "${BASE_URL}?startDate=${START_DATE}&endDate=${END_DATE}" \
    --max-time 300 | jq '.'

  echo ""
  echo "Waiting 5 seconds before next chunk..."
  sleep 5
  echo ""
done

echo "✅ Full backfill complete!"
