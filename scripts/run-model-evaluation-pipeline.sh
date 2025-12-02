#!/bin/bash

# Automated ML Model Evaluation Pipeline
# Waits for backfill to complete, then trains new model and runs champion-challenger test

echo "🚀 Starting ML Model Evaluation Pipeline"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Step 1: Wait for backfill to complete
echo "⏳ Waiting for concern score backfill to complete..."
echo "   Checking every 5 minutes..."
echo ""

while true; do
  # Check if backfill process is still running
  if pgrep -f "backfill-concern-scores.ts" > /dev/null; then
    # Get progress from log
    PROCESSED=$(grep -o "Progress: [0-9]*" concern-scores-backfill-v2.log | tail -1 | awk '{print $2}')
    SKIPPED=$(grep -o "([0-9]* skipped" concern-scores-backfill-v2.log | tail -1 | awk '{print $1}' | tr -d '(')
    FAILED=$(grep -o "[0-9]* failed)" concern-scores-backfill-v2.log | tail -1 | awk '{print $1}')

    echo "[$(date '+%H:%M:%S')] Backfill in progress: ${PROCESSED:-0} processed, ${SKIPPED:-0} skipped, ${FAILED:-0} failed"
    sleep 300  # Check every 5 minutes
  else
    echo ""
    echo "✅ Backfill complete! Proceeding with model evaluation..."
    echo ""
    break
  fi
done

# Step 2: Export dataset with concern levels
echo "📊 Step 1/3: Exporting ML dataset with concernLevel feature..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
npx tsx scripts/export-ml-dataset-with-concern.ts 2>&1 | tee ml-export-with-concern.log
echo ""

# Step 3: Train new champion model
echo "🤖 Step 2/3: Training new ML model with concernLevel..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
python3 scripts/train_champion_model.py 2>&1 | tee model-training-champion.log
echo ""

# Step 4: Run champion-challenger comparison
echo "⚔️  Step 3/3: Running champion vs challenger comparison..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
npx tsx scripts/champion-challenger-final.ts 2>&1 | tee champion-challenger-concern-test.log
echo ""

# Summary
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ ML Model Evaluation Pipeline Complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📊 Results Summary:"
echo ""
echo "1. Dataset Export: ml-export-with-concern.log"
echo "2. Model Training: model-training-champion.log"
echo "3. Champion-Challenger Test: champion-challenger-concern-test.log"
echo ""
echo "📈 Check champion-challenger-concern-test.log for accuracy comparison!"
echo ""
