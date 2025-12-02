import { prisma } from '../lib/prisma';

async function checkQueryData() {
  console.log('🔍 Checking available query data...\n');

  // Check dividend yield
  const dividendStats = await prisma.company.aggregate({
    where: { dividendYield: { not: null } },
    _count: true,
    _avg: { dividendYield: true },
    _max: { dividendYield: true },
    _min: { dividendYield: true }
  });

  console.log('📊 Dividend Yield:');
  console.log(`   Companies with data: ${dividendStats._count}`);
  console.log(`   Average: ${(dividendStats._avg.dividendYield! * 100).toFixed(2)}%`);
  console.log(`   Min: ${(dividendStats._min.dividendYield! * 100).toFixed(2)}%`);
  console.log(`   Max: ${(dividendStats._max.dividendYield! * 100).toFixed(2)}%`);

  const highDividend = await prisma.company.count({
    where: { dividendYield: { gte: 0.03 } }
  });
  console.log(`   Companies with yield > 3%: ${highDividend}\n`);

  // Check beta
  const betaStats = await prisma.company.aggregate({
    where: { beta: { not: null } },
    _count: true,
    _avg: { beta: true },
    _max: { beta: true },
    _min: { beta: true }
  });

  console.log('📊 Beta:');
  console.log(`   Companies with data: ${betaStats._count}`);
  console.log(`   Average: ${betaStats._avg.beta?.toFixed(2)}`);
  console.log(`   Min: ${betaStats._min.beta?.toFixed(2)}`);
  console.log(`   Max: ${betaStats._max.beta?.toFixed(2)}`);

  const lowBeta = await prisma.company.count({
    where: { beta: { lte: 0.9, gte: 0 } }
  });
  console.log(`   Companies with beta < 0.9: ${lowBeta}\n`);

  // Check revenue growth
  const revenueGrowthStats = await prisma.company.aggregate({
    where: { latestRevenueYoY: { not: null } },
    _count: true,
    _avg: { latestRevenueYoY: true },
    _max: { latestRevenueYoY: true },
    _min: { latestRevenueYoY: true }
  });

  console.log('📊 Revenue Growth:');
  console.log(`   Companies with data: ${revenueGrowthStats._count}`);
  if (revenueGrowthStats._count > 0) {
    console.log(`   Average: ${revenueGrowthStats._avg.latestRevenueYoY?.toFixed(2)}%`);
    console.log(`   Min: ${revenueGrowthStats._min.latestRevenueYoY?.toFixed(2)}%`);
    console.log(`   Max: ${revenueGrowthStats._max.latestRevenueYoY?.toFixed(2)}%`);

    const highGrowth = await prisma.company.count({
      where: { latestRevenueYoY: { gte: 20 } }
    });
    console.log(`   Companies with growth > 20%: ${highGrowth}\n`);
  } else {
    console.log('   No revenue growth data available\n');
  }

  // Sample some companies with all data
  console.log('📋 Sample companies with complete data:');
  const sampleCompanies = await prisma.company.findMany({
    where: {
      dividendYield: { not: null },
      beta: { not: null }
    },
    select: {
      ticker: true,
      name: true,
      dividendYield: true,
      beta: true,
      latestRevenueYoY: true
    },
    take: 10
  });

  sampleCompanies.forEach(c => {
    console.log(`   ${c.ticker}: dividend=${(c.dividendYield! * 100).toFixed(2)}%, beta=${c.beta?.toFixed(2)}, revenue growth=${c.latestRevenueYoY?.toFixed(2) || 'N/A'}%`);
  });
}

checkQueryData()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });
