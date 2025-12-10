import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkRecentChanges() {
  try {
    // Get companies updated in last hour with their analyst target prices
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const recentlyUpdated = await prisma.company.findMany({
      where: {
        yahooLastUpdated: {
          gte: oneHourAgo
        },
        analystTargetPrice: {
          not: null
        }
      },
      select: {
        ticker: true,
        name: true,
        currentPrice: true,
        analystTargetPrice: true,
        yahooLastUpdated: true
      },
      orderBy: {
        yahooLastUpdated: 'desc'
      },
      take: 20
    });

    console.log(`\n📊 Recently Updated Companies (past hour): ${recentlyUpdated.length}\n`);

    for (const company of recentlyUpdated) {
      const upside = company.analystTargetPrice && company.currentPrice
        ? ((company.analystTargetPrice - company.currentPrice) / company.currentPrice * 100).toFixed(1)
        : 'N/A';

      console.log(`${company.ticker} - ${company.name}`);
      console.log(`  Current: $${company.currentPrice?.toFixed(2)} | Target: $${company.analystTargetPrice?.toFixed(2)} | Upside: ${upside}%`);
      console.log(`  Updated: ${company.yahooLastUpdated?.toISOString()}\n`);
    }

    await prisma.$disconnect();
  } catch (error) {
    console.error('Error:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

checkRecentChanges();
