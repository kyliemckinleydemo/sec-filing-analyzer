/**
 * @module clear-db
 * @description Database cleanup script that deletes all data from predictions, filings, and companies tables in sequential order
 *
 * PURPOSE:
 * - Delete all records from prediction table to remove forecast data
 * - Delete all records from filing table to clear regulatory submission history
 * - Delete all records from company table to remove organizational entities
 * - Execute deletions in dependency order to avoid foreign key constraint violations
 *
 * DEPENDENCIES:
 * - @prisma/client - Provides PrismaClient for database operations and connection management
 *
 * PATTERNS:
 * - Run directly via 'node clear-db.js' from command line for database reset
 * - Execute before seeding to ensure clean state without migration resets
 * - Deletion order matters: predictions → filings → companies respects foreign key relationships
 *
 * CLAUDE NOTES:
 * - Uses deleteMany({}) without where clause to truncate all records from each table
 * - Executes deletions sequentially (await) rather than parallel to maintain referential integrity
 * - Automatically disconnects Prisma client in finally block regardless of success or error
 * - No confirmation prompt - runs destructively immediately when executed
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Deleting all data...');

  await prisma.prediction.deleteMany({});
  console.log('✅ Deleted all predictions');

  await prisma.filing.deleteMany({});
  console.log('✅ Deleted all filings');

  await prisma.company.deleteMany({});
  console.log('✅ Deleted all companies');

  console.log('\n🎉 Database cleared!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
