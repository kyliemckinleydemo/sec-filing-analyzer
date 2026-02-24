/**
 * Select 200 Companies for Champion-Challenger Analysis
 *
 * Selection criteria:
 * - Top 10 by market cap
 * - Remaining 190 distributed across market cap spectrum
 * - Ensure diversity in sectors and company sizes
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

async function selectCompanies(): Promise<CompanySelection[]> {
  console.log('📊 Selecting 200 diverse companies for analysis...\n');

  // Get all companies with market cap data
  const allCompanies = await prisma.company.findMany({
    where: {
      marketCap: { not: null },
    },
    select: {
      id: true,
      ticker: true,
      name: true,
      marketCap: true,
      sector: true,
    },
    orderBy: {
      marketCap: 'desc',
    },
  });

  console.log(`Found ${allCompanies.length} companies with market cap data\n`);

  if (allCompanies.length < 200) {
    console.log(`⚠️  Only ${allCompanies.length} companies available. Using all of them.\n`);
    return allCompanies.map((c, i) => ({
      ...c,
      marketCap: c.marketCap!,
      rank: i + 1,
      category: i < 10 ? 'Top 10' : 'Other',
    }));
  }

  const selected: CompanySelection[] = [];

  // 1. Top 10 by market cap
  console.log('📈 Selecting Top 10 by market cap:');
  const top10 = allCompanies.slice(0, 10);
  top10.forEach((company, i) => {
    console.log(`  ${(i + 1).toString().padStart(2)}. ${company.ticker.padEnd(6)} ${company.name.padEnd(40)} $${(company.marketCap! / 1_000_000_000_000).toFixed(2)}T`);
    selected.push({
      ...company,
      marketCap: company.marketCap!,
      rank: i + 1,
      category: 'Top 10',
    });
  });
  console.log('');

  // 2. Remaining 190 distributed across market cap spectrum
  const remaining = allCompanies.slice(10);

  // Define market cap buckets (market cap is stored in dollars)
  const buckets = [
    { name: 'Ultra Mega Cap (>$1T)', min: 1_000_000_000_000, max: Infinity, target: 10 },
    { name: 'Mega Cap ($500B-$1T)', min: 500_000_000_000, max: 1_000_000_000_000, target: 20 },
    { name: 'Large Cap ($200B-$500B)', min: 200_000_000_000, max: 500_000_000_000, target: 40 },
    { name: 'Mid-Large Cap ($100B-$200B)', min: 100_000_000_000, max: 200_000_000_000, target: 30 },
    { name: 'Mid Cap ($50B-$100B)', min: 50_000_000_000, max: 100_000_000_000, target: 30 },
    { name: 'Small-Mid Cap ($20B-$50B)', min: 20_000_000_000, max: 50_000_000_000, target: 30 },
    { name: 'Small Cap ($10B-$20B)', min: 10_000_000_000, max: 20_000_000_000, target: 20 },
    { name: 'Micro Cap (<$10B)', min: 0, max: 10_000_000_000, target: 10 },
  ];

  console.log('📊 Selecting across market cap spectrum:');

  // Create a map of company IDs to their index for efficient lookup
  const companyIndexMap = new Map(allCompanies.map((c, i) => [c.id, i]));

  for (const bucket of buckets) {
    const companiesInBucket = remaining.filter(c =>
      c.marketCap! >= bucket.min && c.marketCap! < bucket.max
    );

    const toSelect = Math.min(bucket.target, companiesInBucket.length);

    if (toSelect === 0) {
      console.log(`  ${bucket.name.padEnd(35)} 0 companies available`);
      continue;
    }

    // Randomly sample from this bucket to get diversity
    const step = Math.floor(companiesInBucket.length / toSelect);
    const sampled = companiesInBucket.filter((_, i) => i % Math.max(1, step) === 0).slice(0, toSelect);

    sampled.forEach(company => {
      selected.push({
        ...company,
        marketCap: company.marketCap!,
        rank: (companyIndexMap.get(company.id) ?? 0) + 1,
        category: bucket.name,
      });
    });

    console.log(`  ${bucket.name.padEnd(35)} ${toSelect.toString().padStart(3)} companies (${companiesInBucket.length} available)`);
  }

  console.log('');
  console.log(`✅ Selected ${selected.length} total companies\n`);

  // Summary by category
  console.log('📋 Summary by Market Cap Category:');
  buckets.forEach(bucket => {
    const count = selected.filter(s => s.category === bucket.name).length;
    if (count > 0) {
      console.log(`  ${bucket.name.padEnd(35)} ${count.toString().padStart(3)} companies`);
    }
  });
  console.log(`  ${'Top 10'.padEnd(35)} ${selected.filter(s => s.category === 'Top 10').length.toString().padStart(3)} companies`);
  console.log('');

  // Summary by sector
  const sectors = new Map<string, number>();
  selected.forEach(s => {
    const sector = s.sector || 'Unknown';
    sectors.set(sector, (sectors.get(sector) || 0) + 1);
  });

  console.log('🏢 Summary by Sector:');
  Array.from(sectors.entries())
    .sort((a, b) => b[1] - a[1])
    .forEach(([sector, count]) => {
      console.log(`  ${sector.padEnd(35)} ${count.toString().padStart(3)} companies`);
    });
  console.log('');

  return selected.sort((a, b) => b.marketCap - a.marketCap);
}

async function main() {
  try {
    const selected = await selectCompanies();

    // Save to JSON file for reference
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

    const filename = 'selected-companies-200.json';
    fs.writeFileSync(filename, JSON.stringify(output, null, 2));
    console.log(`💾 Company list saved to: ${filename}\n`);

    // Return array of company IDs and tickers for next script
    const tickerList = selected.map(c => c.ticker).join(',');
    console.log('📋 Ticker list for analysis:');
    console.log(tickerList);
    console.log('');

    // Save ticker list for easy use in next step
    fs.writeFileSync('selected-tickers-200.txt', tickerList);
    console.log('💾 Ticker list saved to: selected-tickers-200.txt\n');

    await prisma.$disconnect();

  } catch (error) {
    console.error('❌ Error:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

main();