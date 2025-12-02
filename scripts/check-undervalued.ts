import { prisma } from '../lib/prisma';

async function checkUndervaluedStocks() {
  // First, check how many companies have both price and target price
  const companiesWithBoth = await prisma.company.count({
    where: {
      currentPrice: { not: null },
      analystTargetPrice: { not: null }
    }
  });

  console.log(`Companies with both currentPrice and analystTargetPrice: ${companiesWithBoth}`);

  // Get all companies with both fields
  const allCompanies = await prisma.company.findMany({
    where: {
      currentPrice: { not: null },
      analystTargetPrice: { not: null }
    },
    select: {
      ticker: true,
      name: true,
      currentPrice: true,
      analystTargetPrice: true,
      marketCap: true
    }
  });

  console.log(`\nTotal companies with both prices: ${allCompanies.length}`);

  if (allCompanies.length > 0) {
    console.log('\nSample of 10 companies:');
    allCompanies.slice(0, 10).forEach(c => {
      if (c.currentPrice && c.analystTargetPrice) {
        const upside = ((c.analystTargetPrice - c.currentPrice) / c.currentPrice * 100).toFixed(1);
        const status = c.currentPrice < c.analystTargetPrice ? 'UNDERVALUED' : 'OVERVALUED';
        console.log(`${c.ticker}: $${c.currentPrice} vs $${c.analystTargetPrice} (${upside}% upside) - ${status}`);
      }
    });

    // Check for undervalued
    const undervalued = allCompanies.filter(c => c.currentPrice && c.analystTargetPrice && c.currentPrice < c.analystTargetPrice);
    console.log(`\n=== UNDERVALUED COMPANIES ===`);
    console.log(`Total: ${undervalued.length} out of ${allCompanies.length} (${(undervalued.length / allCompanies.length * 100).toFixed(1)}%)`);

    if (undervalued.length > 0) {
      console.log('\nTop 10 by upside potential:');
      undervalued
        .map(c => ({
          ...c,
          upside: ((c.analystTargetPrice! - c.currentPrice!) / c.currentPrice! * 100)
        }))
        .sort((a, b) => b.upside - a.upside)
        .slice(0, 10)
        .forEach(c => {
          console.log(`${c.ticker}: $${c.currentPrice} → $${c.analystTargetPrice} (+${c.upside.toFixed(1)}% upside)`);
        });
    } else {
      console.log('\n⚠️ NO UNDERVALUED COMPANIES FOUND');
      console.log('All companies are trading at or above their analyst target prices!');
    }
  } else {
    console.log('\n⚠️ NO COMPANIES have both currentPrice and analystTargetPrice populated');
  }
}

checkUndervaluedStocks()
  .then(() => process.exit(0))
  .catch(e => {
    console.error(e);
    process.exit(1);
  });
