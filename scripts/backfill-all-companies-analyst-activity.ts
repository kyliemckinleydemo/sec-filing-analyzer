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
        // Check existing entries first to avoid duplicates
        const existingActivities = await prisma.analystActivity.findMany({
          where: { companyId: company.id },
          select: {
            activityDate: true,
            firm: true,
            actionType: true
          }
        });

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
