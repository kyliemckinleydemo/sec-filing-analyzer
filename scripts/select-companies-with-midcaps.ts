/**
 * Select Companies Including Mid-Caps
 *
 * Target: 200 companies with strong mid-cap representation
 * - Top 10 mega-caps (reference)
 * - 60 Large caps ($200B-$500B) - THE SWEET SPOT
 * - 80 Small-Mid caps ($50B-$200B)
 * - 30 Mid caps ($20B-$50B)
 * - 20 Small caps ($10B-$20B)
 */

import { prisma } from '../lib/prisma';
import * as fs from 'fs';

interface CompanySelection {
  id: string;
  ticker: string;
  name: string;
  marketCap: number;
  sector: string | null;
  rank: number;
  category: string;
}

async function selectCompaniesWithMidcaps(): Promise<CompanySelection[]> {
  console.log('📊 Selecting 200 Companies with Mid-Cap Focus\n');
  console.log('═'.repeat(80));

  const selected: CompanySelection[] = [];
  let globalRank = 0;

  // Get all companies with market cap, sorted
  const allCompanies = await prisma.company.findMany({
    where: { marketCap: { not: null } },
    select: {
      id: true,
      ticker: true,
      name: true,
      marketCap: true,
      sector: true,
    },
    orderBy: { marketCap: 'desc' },
  });

  console.log(`\nFound ${allCompanies.length} companies with market cap data\n`);

  // Categorize companies
  const megaCaps = allCompanies.filter(c => c.marketCap! >= 500_000_000_000);
  const largeCaps = allCompanies.filter(c => c.marketCap! >= 200_000_000_000 && c.marketCap! < 500_000_000_000);
  const smallMidCaps = allCompanies.filter(c => c.marketCap! >= 50_000_000_000 && c.marketCap! < 200_000_000_000);
  const midCaps = allCompanies.filter(c => c.marketCap! >= 20_000_000_000 && c.marketCap! < 50_000_000_000);
  const smallCaps = allCompanies.filter(c => c.marketCap! >= 10_000_000_000 && c.marketCap! < 20_000_000_000);

  console.log('Available by category:');
  console.log(`  Mega Caps (>$500B):       ${megaCaps.length}`);
  console.log(`  Large Caps ($200-500B):   ${largeCaps.length}`);
  console.log(`  Small-Mid ($50-200B):     ${smallMidCaps.length}`);
  console.log(`  Mid Caps ($20-50B):       ${midCaps.length}`);
  console.log(`  Small Caps ($10-20B):     ${smallCaps.length}`);
  console.log('');

  // 1. Top 10 Mega Caps (household names for reference)
  console.log('📈 Top 10 Mega Caps:');
  megaCaps.slice(0, 10).forEach((c, i) => {
    globalRank++;
    const capB = (c.marketCap! / 1_000_000_000).toFixed(0);
    console.log(`  ${(i + 1).toString().padStart(2)}. ${c.ticker.padEnd(6)} ${c.name.padEnd(40)} $${capB}B`);
    selected.push({
      ...c,
      marketCap: c.marketCap!,
      rank: globalRank,
      category: 'Mega Cap (>$500B)',
    });
  });
  console.log('');

  // 2. ALL Large Caps ($200-500B) - THE SWEET SPOT
  console.log('⭐ Large Caps ($200B-$500B) - THE SWEET SPOT:');
  const largeCapTarget = Math.min(60, largeCaps.length);
  const largeCapStep = Math.max(1, Math.floor(largeCaps.length / largeCapTarget));

  largeCaps.filter((_, i) => i % largeCapStep === 0).slice(0, largeCapTarget).forEach((c, i) => {
    globalRank++;
    const capB = (c.marketCap! / 1_000_000_000).toFixed(0);
    if (i < 10) console.log(`  ${c.ticker.padEnd(6)} ${c.name.padEnd(40)} $${capB}B`);
    selected.push({
      ...c,
      marketCap: c.marketCap!,
      rank: globalRank,
      category: 'Large Cap ($200-500B)',
    });
  });
  console.log(`  ... selected ${largeCapTarget} large caps total\n`);

  // 3. Small-Mid Caps ($50-200B)
  console.log('📊 Small-Mid Caps ($50B-$200B):');
  const smallMidTarget = 80;
  const smallMidStep = Math.max(1, Math.floor(smallMidCaps.length / smallMidTarget));

  smallMidCaps.filter((_, i) => i % smallMidStep === 0).slice(0, smallMidTarget).forEach((c, i) => {
    globalRank++;
    const capB = (c.marketCap! / 1_000_000_000).toFixed(0);
    if (i < 10) console.log(`  ${c.ticker.padEnd(6)} ${c.name.padEnd(40)} $${capB}B`);
    selected.push({
      ...c,
      marketCap: c.marketCap!,
      rank: globalRank,
      category: 'Small-Mid Cap ($50-200B)',
    });
  });
  console.log(`  ... selected ${Math.min(smallMidTarget, smallMidCaps.length)} small-mid caps total\n`);

  // 4. Mid Caps ($20-50B)
  console.log('📊 Mid Caps ($20B-$50B):');
  const midCapTarget = 30;
  const midCapStep = Math.max(1, Math.floor(midCaps.length / midCapTarget));

  midCaps.filter((_, i) => i % midCapStep === 0).slice(0, midCapTarget).forEach((c, i) => {
    globalRank++;
    const capB = (c.marketCap! / 1_000_000_000).toFixed(0);
    if (i < 10) console.log(`  ${c.ticker.padEnd(6)} ${c.name.padEnd(40)} $${capB}B`);
    selected.push({
      ...c,
      marketCap: c.marketCap!,
      rank: globalRank,
      category: 'Mid Cap ($20-50B)',
    });
  });
  console.log(`  ... selected ${Math.min(midCapTarget, midCaps.length)} mid caps total\n`);

  // 5. Small Caps ($10-20B)
  console.log('📊 Small Caps ($10B-$20B):');
  const smallCapTarget = 20;
  const smallCapStep = Math.max(1, Math.floor(smallCaps.length / smallCapTarget));

  smallCaps.filter((_, i) => i % smallCapStep === 0).slice(0, smallCapTarget).forEach((c, i) => {
    globalRank++;
    const capB = (c.marketCap! / 1_000_000_000).toFixed(0);
    if (i < 10) console.log(`  ${c.ticker.padEnd(6)} ${c.name.padEnd(40)} $${capB}B`);
    selected.push({
      ...c,
      marketCap: c.marketCap!,
      rank: globalRank,
      category: 'Small Cap ($10-20B)',
    });
  });
  console.log(`  ... selected ${Math.min(smallCapTarget, smallCaps.length)} small caps total\n`);

  console.log('═'.repeat(80));
  console.log(`✅ Selected ${selected.length} total companies\n`);

  // Summary
  console.log('📋 Distribution:');
  const distribution = new Map<string, number>();
  selected.forEach(s => {
    distribution.set(s.category, (distribution.get(s.category) || 0) + 1);
  });

  Array.from(distribution.entries()).forEach(([cat, count]) => {
    console.log(`  ${cat.padEnd(30)} ${count.toString().padStart(3)} companies`);
  });
  console.log('');

  return selected;
}

async function main() {
  try {
    const selected = await selectCompaniesWithMidcaps();

    // Save to JSON
    const output = {
      generatedAt: new Date().toISOString(),
      totalSelected: selected.length,
      companies: selected.map(c => ({
        ticker: c.ticker,
        name: c.name,
        marketCapB: (c.marketCap / 1_000_000_000).toFixed(1),
        sector: c.sector,
        rank: c.rank,
        category: c.category,
      })),
    };

    fs.writeFileSync('selected-companies-with-midcaps.json', JSON.stringify(output, null, 2));
    console.log('💾 Company list saved to: selected-companies-with-midcaps.json\n');

    // Save ticker list
    const tickerList = selected.map(c => c.ticker).join(',');
    fs.writeFileSync('selected-tickers-with-midcaps.txt', tickerList);
    console.log('💾 Ticker list saved to: selected-tickers-with-midcaps.txt\n');

    await prisma.$disconnect();

  } catch (error) {
    console.error('❌ Error:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

main();
