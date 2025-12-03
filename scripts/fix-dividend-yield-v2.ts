import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('=== Fixing Remaining Dividend Yield Values ===\n');

  // Get all companies with dividend yield > 0.10 (10%)
  // Anything above 10% is almost certainly in wrong format (stored as percentage instead of decimal)
  // Real high dividend yields are typically 5-8%, rarely exceeding 10%
  const companies = await prisma.company.findMany({
    where: {
      dividendYield: { gt: 0.10 }  // > 10%
    },
    select: {
      id: true,
      ticker: true,
      dividendYield: true
    }
  });

  console.log(`Found ${companies.length} companies with dividend yield > 10%\n`);

  let updated = 0;

  for (const company of companies) {
    const currentYield = company.dividendYield!;
    const correctedYield = currentYield / 100;

    await prisma.company.update({
      where: { id: company.id },
      data: { dividendYield: correctedYield }
    });

    console.log(`${company.ticker}: ${currentYield.toFixed(4)} → ${correctedYield.toFixed(4)} (${(correctedYield * 100).toFixed(2)}%)`);
    updated++;
  }

  console.log(`\n✅ Updated: ${updated} companies`);

  // Also fix CompanySnapshot records
  console.log('\n=== Fixing CompanySnapshot dividend yields ===\n');

  const snapshots = await prisma.companySnapshot.findMany({
    where: {
      dividendYield: { gt: 0.10 }
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

  // Show final statistics
  const stats = await prisma.company.aggregate({
    where: { dividendYield: { not: null } },
    _avg: { dividendYield: true },
    _max: { dividendYield: true },
    _min: { dividendYield: true },
    _count: true
  });

  console.log('\n\nFinal Dividend Yield Statistics:');
  console.log(`  Count: ${stats._count}`);
  console.log(`  Average: ${(stats._avg.dividendYield! * 100).toFixed(2)}%`);
  console.log(`  Min: ${(stats._min.dividendYield! * 100).toFixed(2)}%`);
  console.log(`  Max: ${(stats._max.dividendYield! * 100).toFixed(2)}%`);

  // Show top 10 dividend payers
  const topDividend = await prisma.company.findMany({
    where: { dividendYield: { not: null } },
    select: {
      ticker: true,
      name: true,
      dividendYield: true
    },
    orderBy: { dividendYield: 'desc' },
    take: 10
  });

  console.log('\n\nTop 10 Dividend Yielders:');
  topDividend.forEach((c, i) => {
    console.log(`  ${i + 1}. ${c.ticker.padEnd(6)} ${(c.dividendYield! * 100).toFixed(2)}% - ${c.name.slice(0, 40)}`);
  });
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
