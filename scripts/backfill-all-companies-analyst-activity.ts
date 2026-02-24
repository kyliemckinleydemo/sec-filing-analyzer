/**
 * @module backfill-all-companies-analyst-activity
 * @description Batch backfill script for populating analyst activity data across all companies in the database
 *
 * PURPOSE:
 * - Retrieves analyst activity data (ratings, upgrades, downgrades) from Yahoo Finance for all companies
 * - Performs bulk backfill operation with duplicate detection and rate limiting
 * - Provides progress tracking and error handling for large-scale data imports
 * - Optimizes database queries by pre-loading existing activities to avoid N+1 query problems
 *
 * EXPORTS:
 * - backfillAnalystActivity: Main async function that orchestrates the backfill process
 * - Executes immediately as a standalone script with process exit handling
 *
 * CLAUDE NOTES:
 * - Uses efficient batching strategy: pre-loads all existing activities into memory map for O(1) lookup
 * - Implements deduplication based on companyId, activityDate, firm, and actionType combination
 * - Rate limiting of 500ms between Yahoo Finance API requests to avoid throttling
 * - Progress reporting every 50 companies with success/error metrics
 * - Graceful error handling per company - failures don't stop the entire backfill
 * - Uses Prisma's createMany for bulk inserts to minimize database round trips
 * - Script is idempotent - safe to run multiple times without creating duplicates
 */

import { prisma } from '../lib/prisma';
import { yahooFinanceClient } from '../lib/yahoo-finance-client';

async function backfillAnalystActivity() {
  console.log('=== Backfilling Analyst Activity for All Companies ===\n');

  // Get all companies with tickers
  const companies = await prisma.company.findMany({
    select: {
      id: true,
      ticker: true,
      name: true
    },
    orderBy: { ticker: 'asc' }
  });

  console.log(`Found ${companies.length} companies to process\n`);

  // Batch load all existing analyst activities upfront to avoid N+1 query
  const allExistingActivities = await prisma.analystActivity.findMany({
    where: {
      companyId: {
        in: companies.map(c => c.id)
      }
    },
    select: {
      companyId: true,
      activityDate: true,
      firm: true,
      actionType: true
    }
  });

  // Group existing activities by companyId for quick lookup
  const existingActivitiesByCompany = new Map<string, Array<{
    activityDate: Date;
    firm: string;
    actionType: string;
  }>>();

  for (const activity of allExistingActivities) {
    if (!existingActivitiesByCompany.has(activity.companyId)) {
      existingActivitiesByCompany.set(activity.companyId, []);
    }
    existingActivitiesByCompany.get(activity.companyId)!.push({
      activityDate: activity.activityDate,
      firm: activity.firm,
      actionType: activity.actionType
    });
  }

  let processed = 0;
  let successCount = 0;
  let errorCount = 0;
  let totalActivities = 0;

  for (const company of companies) {
    if (!company.ticker) continue;

    try {
      console.log(`[${processed + 1}/${companies.length}] Processing ${company.ticker}...`);

      // Fetch analyst activity from Yahoo Finance
      const activities = await yahooFinanceClient.getAnalystActivity(company.ticker);

      if (activities.length > 0) {
        // Insert into database with deduplication
        // Get existing entries from the pre-loaded map
        const existingActivities = existingActivitiesByCompany.get(company.id) || [];

        // Filter out duplicates
        const newActivities = activities.filter(activity => {
          return !existingActivities.some(existing =>
            existing.activityDate.getTime() === activity.date.getTime() &&
            existing.firm === activity.firm &&
            existing.actionType === activity.actionType
          );
        });

        if (newActivities.length > 0) {
          await prisma.analystActivity.createMany({
            data: newActivities.map(activity => ({
              companyId: company.id,
              activityDate: activity.date,
              firm: activity.firm,
              actionType: activity.actionType,
              previousRating: activity.fromGrade,
              newRating: activity.toGrade,
              note: activity.action,
              source: 'yahoo'
            }))
          });

          totalActivities += newActivities.length;
          console.log(`  ✅ Inserted ${newActivities.length} new activities (${activities.length - newActivities.length} duplicates skipped)`);
          successCount++;
        } else {
          console.log(`  ℹ️  All ${activities.length} activities already exist`);
          successCount++;
        }
      } else {
        console.log(`  ℹ️  No analyst activity found`);
      }

      processed++;

      // Progress report every 50 companies
      if (processed % 50 === 0) {
        console.log(`\n--- Progress Report ---`);
        console.log(`Processed: ${processed}/${companies.length}`);
        console.log(`Success: ${successCount}, Errors: ${errorCount}`);
        console.log(`Total activities inserted: ${totalActivities}\n`);
      }

      // Rate limiting: wait 500ms between requests
      await new Promise(resolve => setTimeout(resolve, 500));

    } catch (error: any) {
      console.error(`  ❌ Error processing ${company.ticker}:`, error.message);
      errorCount++;
      processed++;
    }
  }

  console.log('\n=== Backfill Complete ===');
  console.log(`Total companies processed: ${processed}`);
  console.log(`Successful: ${successCount}`);
  console.log(`Errors: ${errorCount}`);
  console.log(`Total analyst activities inserted: ${totalActivities}`);
}

backfillAnalystActivity()
  .then(() => {
    console.log('\n✅ Backfill script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Backfill script failed:', error);
    process.exit(1);
  });