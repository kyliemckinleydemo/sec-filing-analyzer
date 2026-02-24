/**
 * @module check-high-dividend-yields
 * @description Diagnostic script to identify and analyze companies with suspicious or high dividend yields in the database
 * 
 * PURPOSE:
 * - Detects potential data format inconsistencies in dividend yield storage
 * - Identifies companies with yields between 1% and 100% that may be stored incorrectly
 * - Validates dividend yields in the normal high range (5-20%)
 * - Provides statistical overview of dividend yield distribution across all companies
 * - Helps diagnose whether yields are stored as decimals (0.05 for 5%) or percentages (5 for 5%)
 * 
 * EXPORTS:
 * - None (standalone script with self-executing main function)
 * 
 * CLAUDE NOTES:
 * - Script assumes dividend yields should be stored as decimals (e.g., 0.05 for 5%)
 * - Queries companies with yields >= 0.01 and <= 100 to catch format errors
 * - Outputs top 50 suspicious entries sorted by yield descending
 * - Includes aggregate statistics (count, average, min, max) for all dividend yields
 * - Automatically disconnects Prisma client on completion or error
 * - Formatting: ticker (6 chars), company name (42 chars), raw yield, and percentage display
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('=== Checking High Dividend Yields ===\n');

  // Get companies with dividend yield between 1% and 100%
  // These are likely in wrong format (stored as percentage instead of decimal)
  const companies = await prisma.company.findMany({
    where: {
      dividendYield: {
        gte: 0.01,  // 1% in decimal format
        lte: 100    // 100% (way too high, likely wrong format)
      }
    },
    select: {
      ticker: true,
      name: true,
      dividendYield: true,
      currentPrice: true
    },
    orderBy: {
      dividendYield: 'desc'
    },
    take: 50
  });

  console.log(`Found ${companies.length} companies with suspicious dividend yields:\n`);

  companies.forEach(c => {
    const yieldPercent = (c.dividendYield! * 100).toFixed(2);
    console.log(`${c.ticker.padEnd(6)} ${c.name.slice(0, 40).padEnd(42)} ${c.dividendYield!.toFixed(4)} (displays as ${yieldPercent}%)`);
  });

  // Check if there are any truly high dividend yields in decimal format (0.05 - 0.20 range)
  const normalHighYields = await prisma.company.findMany({
    where: {
      dividendYield: {
        gte: 0.05,  // 5%
        lte: 0.20   // 20%
      }
    },
    select: {
      ticker: true,
      dividendYield: true
    },
    take: 10
  });

  console.log(`\n\nCompanies with yields in normal high range (5-20%):`);
  normalHighYields.forEach(c => {
    console.log(`  ${c.ticker}: ${(c.dividendYield! * 100).toFixed(2)}%`);
  });

  // Summary stats
  const stats = await prisma.company.aggregate({
    where: { dividendYield: { not: null } },
    _avg: { dividendYield: true },
    _max: { dividendYield: true },
    _min: { dividendYield: true },
    _count: true
  });

  console.log('\n\nOverall Dividend Yield Statistics:');
  console.log(`  Count: ${stats._count}`);
  console.log(`  Average: ${(stats._avg.dividendYield! * 100).toFixed(2)}%`);
  console.log(`  Min: ${(stats._min.dividendYield! * 100).toFixed(2)}%`);
  console.log(`  Max: ${(stats._max.dividendYield! * 100).toFixed(2)}%`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());