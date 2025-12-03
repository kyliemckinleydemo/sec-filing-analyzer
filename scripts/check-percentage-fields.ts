import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('=== Checking Percentage Field Formats ===\n');

  // Check a few companies with these fields
  const companies = await prisma.company.findMany({
    where: {
      OR: [
        { latestRevenueYoY: { not: null } },
        { latestOperatingMargin: { not: null } },
        { latestGrossMargin: { not: null } }
      ]
    },
    select: {
      ticker: true,
      latestRevenueYoY: true,
      latestNetIncomeYoY: true,
      latestEPSYoY: true,
      latestGrossMargin: true,
      latestOperatingMargin: true
    },
    take: 10
  });

  console.log('Sample companies with XBRL data:');
  console.log('─'.repeat(80));

  companies.forEach(c => {
    console.log(`\n${c.ticker}:`);
    console.log(`  Revenue YoY: ${c.latestRevenueYoY} (type: ${typeof c.latestRevenueYoY})`);
    console.log(`  Net Income YoY: ${c.latestNetIncomeYoY} (type: ${typeof c.latestNetIncomeYoY})`);
    console.log(`  EPS YoY: ${c.latestEPSYoY} (type: ${typeof c.latestEPSYoY})`);
    console.log(`  Gross Margin: ${c.latestGrossMargin} (type: ${typeof c.latestGrossMargin})`);
    console.log(`  Operating Margin: ${c.latestOperatingMargin} (type: ${typeof c.latestOperatingMargin})`);
  });

  // Check ranges to understand the format
  const marginStats = await prisma.company.aggregate({
    where: { latestOperatingMargin: { not: null } },
    _avg: { latestOperatingMargin: true },
    _max: { latestOperatingMargin: true },
    _min: { latestOperatingMargin: true },
    _count: true
  });

  console.log('\n\nOperating Margin Statistics:');
  console.log(`  Count: ${marginStats._count}`);
  console.log(`  Average: ${marginStats._avg.latestOperatingMargin?.toFixed(2)}`);
  console.log(`  Min: ${marginStats._min.latestOperatingMargin?.toFixed(2)}`);
  console.log(`  Max: ${marginStats._max.latestOperatingMargin?.toFixed(2)}`);

  const revenueYoYStats = await prisma.company.aggregate({
    where: { latestRevenueYoY: { not: null } },
    _avg: { latestRevenueYoY: true },
    _max: { latestRevenueYoY: true },
    _min: { latestRevenueYoY: true },
    _count: true
  });

  console.log('\n\nRevenue YoY Statistics:');
  console.log(`  Count: ${revenueYoYStats._count}`);
  console.log(`  Average: ${revenueYoYStats._avg.latestRevenueYoY?.toFixed(2)}`);
  console.log(`  Min: ${revenueYoYStats._min.latestRevenueYoY?.toFixed(2)}`);
  console.log(`  Max: ${revenueYoYStats._max.latestRevenueYoY?.toFixed(2)}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
