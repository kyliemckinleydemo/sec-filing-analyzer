import { prisma } from '../lib/prisma';

/**
 * Flush Prediction Cache
 *
 * Clears all cached predictions so they regenerate with new model features.
 * Run this after deploying model changes to ensure all predictions use the latest version.
 */

async function flushCache() {
  console.log('=== Flushing Prediction Cache ===\n');

  // Count existing predictions
  const filingsWithPredictions = await prisma.filing.count({
    where: {
      predicted7dReturn: { not: null }
    }
  });

  console.log(`Found ${filingsWithPredictions} filings with cached predictions\n`);

  if (filingsWithPredictions === 0) {
    console.log('No cached predictions to flush.');
    return;
  }

  // Clear cached predictions from Filing table
  console.log('Clearing cached predictions from Filing table...');
  const updateResult = await prisma.filing.updateMany({
    where: {
      predicted7dReturn: { not: null }
    },
    data: {
      predicted7dReturn: null,
      predictionConfidence: null
    }
  });

  console.log(`✅ Cleared ${updateResult.count} cached predictions\n`);

  // Delete all Prediction records
  console.log('Deleting Prediction records...');
  const deleteResult = await prisma.prediction.deleteMany({});

  console.log(`✅ Deleted ${deleteResult.count} prediction records\n`);

  console.log('=== Cache Flush Complete ===');
  console.log('All predictions will regenerate with new model features on next access.');
}

flushCache()
  .then(() => {
    console.log('\n✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });
