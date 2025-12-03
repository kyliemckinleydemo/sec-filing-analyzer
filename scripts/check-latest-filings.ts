import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('=== Checking Latest Filings ===\n');

  // Get the most recent filings
  const latestFilings = await prisma.filing.findMany({
    orderBy: {
      filingDate: 'desc'
    },
    take: 10,
    include: {
      company: {
        select: {
          ticker: true,
          name: true
        }
      }
    }
  });

  console.log('Latest 10 filings:');
  console.log('─'.repeat(80));

  latestFilings.forEach((f, i) => {
    const daysAgo = Math.floor((Date.now() - f.filingDate.getTime()) / (1000 * 60 * 60 * 24));
    console.log(`${i + 1}. ${f.company.ticker} - ${f.filingType}`);
    console.log(`   Filed: ${f.filingDate.toISOString().split('T')[0]} (${daysAgo} days ago)`);
    console.log(`   Company: ${f.company.name}`);
    console.log();
  });

  // Check filing counts by recent periods
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [last24h, last3d, last7d] = await Promise.all([
    prisma.filing.count({ where: { filingDate: { gte: oneDayAgo } } }),
    prisma.filing.count({ where: { filingDate: { gte: threeDaysAgo } } }),
    prisma.filing.count({ where: { filingDate: { gte: sevenDaysAgo } } })
  ]);

  console.log('Filing counts by period:');
  console.log('─'.repeat(80));
  console.log(`Last 24 hours: ${last24h} filings`);
  console.log(`Last 3 days:   ${last3d} filings`);
  console.log(`Last 7 days:   ${last7d} filings`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
