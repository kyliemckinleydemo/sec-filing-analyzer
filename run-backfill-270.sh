#!/bin/bash

# Run backfill for last 270 days in chunks of 45 days
# This avoids the 50-day limit and timeout issues

BASE_URL="https://sec-filing-analyzer-indol.vercel.app/api/backfill"
CHUNK_SIZE=45
TOTAL_DAYS=270

echo "Starting backfill for last $TOTAL_DAYS days (in chunks of $CHUNK_SIZE days)"
echo ""

# Calculate number of chunks needed
NUM_CHUNKS=$(( ($TOTAL_DAYS + $CHUNK_SIZE - 1) / $CHUNK_SIZE ))

for i in $(seq 1 $NUM_CHUNKS); do
  # Calculate the days offset for this chunk
  # Chunk 1: days 1-45, Chunk 2: days 46-90, etc.
  START_OFFSET=$(( ($i - 1) * $CHUNK_SIZE + 1 ))
  END_OFFSET=$(( $i * $CHUNK_SIZE ))
  
  # Cap the end offset at TOTAL_DAYS
  if [ $END_OFFSET -gt $TOTAL_DAYS ]; then
    END_OFFSET=$TOTAL_DAYS
  fi
  
  # Calculate actual dates
  START_DATE=$(date -v-${END_OFFSET}d +%Y-%m-%d 2>/dev/null || date -d "-${END_OFFSET} days" +%Y-%m-%d)
  END_DATE=$(date -v-${START_OFFSET}d +%Y-%m-%d 2>/dev/null || date -d "-${START_OFFSET} days" +%Y-%m-%d)
  
  echo "=== Chunk $i/$NUM_CHUNKS ==="
  echo "Days $START_OFFSET to $END_OFFSET ago"
  echo "Date range: $START_DATE to $END_DATE"
  echo ""
  
  # Make the API call
  RESPONSE=$(curl -s -X GET "${BASE_URL}?startDate=${START_DATE}&endDate=${END_DATE}" --max-time 300)
  
  # Display the response (without jq since it's not installed)
  echo "$RESPONSE"
  echo ""
  
  # Extract key metrics using basic text processing
  SUCCESS=$(echo "$RESPONSE" | grep -o '"success":[^,]*' | head -1)
  MESSAGE=$(echo "$RESPONSE" | grep -o '"message":"[^"]*"' | head -1)
  
  echo "Status: $SUCCESS"
  echo "Message: $MESSAGE"
  echo ""
  echo "Waiting 5 seconds before next chunk..."
  sleep 5
  echo ""
done

echo "✅ Full backfill complete!"
