import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('=== Fixing Dividend Yield Values ===\n');

  // Get all companies with dividend yield
  const companies = await prisma.company.findMany({
    where: {
      dividendYield: { not: null }
    },
    select: {
      id: true,
      ticker: true,
      dividendYield: true
    }
  });

  console.log(`Found ${companies.length} companies with dividend yield data\n`);

  let updated = 0;
  let skipped = 0;

  for (const company of companies) {
    const currentYield = company.dividendYield!;

    // If yield is > 1.0 (100%), it's likely in wrong format
    // Reasonable max dividend yield is ~20% (0.20), so anything > 1.0 needs fixing
    if (currentYield > 1.0) {
      const correctedYield = currentYield / 100;

      await prisma.company.update({
        where: { id: company.id },
        data: { dividendYield: correctedYield }
      });

      console.log(`${company.ticker}: ${currentYield.toFixed(2)} → ${correctedYield.toFixed(4)} (${(correctedYield * 100).toFixed(2)}%)`);
      updated++;
    } else {
      // Already in correct format
      skipped++;
    }
  }

  console.log(`\n✅ Updated: ${updated} companies`);
  console.log(`⏭️  Skipped: ${skipped} companies (already correct)`);

  // Also fix CompanySnapshot records
  console.log('\n=== Fixing CompanySnapshot dividend yields ===\n');

  const snapshots = await prisma.companySnapshot.findMany({
    where: {
      dividendYield: {
        not: null,
        gt: 1.0  // Only fix values > 1.0 (likely wrong)
      }
    },
    select: {
      id: true,
      dividendYield: true
    }
  });

  console.log(`Found ${snapshots.length} snapshots to fix\n`);

  for (const snapshot of snapshots) {
    const correctedYield = snapshot.dividendYield! / 100;

    await prisma.companySnapshot.update({
      where: { id: snapshot.id },
      data: { dividendYield: correctedYield }
    });
  }

  console.log(`✅ Updated ${snapshots.length} snapshot records`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
