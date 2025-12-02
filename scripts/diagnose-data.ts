/**
 * Diagnose Data Completeness Issues
 */

import { prisma } from '../lib/prisma';

async function main() {
  console.log('🔍 DIAGNOSING DATA COMPLETENESS\n');
  console.log('═'.repeat(80));

  // 1. Check filings
  const totalFilings = await prisma.filing.count({
    where: { filingType: { in: ['10-K', '10-Q'] } }
  });

  const filingsWithReturns = await prisma.filing.count({
    where: {
      filingType: { in: ['10-K', '10-Q'] },
      actual7dReturn: { not: null }
    }
  });

  const filingsWithAnalysis = await prisma.filing.count({
    where: {
      filingType: { in: ['10-K', '10-Q'] },
      riskScore: { not: null },
      sentimentScore: { not: null }
    }
  });

  console.log('\n📋 FILINGS (10-K/10-Q only):');
  console.log(`  Total: ${totalFilings}`);
  console.log(`  With 7-day returns: ${filingsWithReturns} (${(filingsWithReturns/totalFilings*100).toFixed(1)}%)`);
  console.log(`  With AI analysis: ${filingsWithAnalysis} (${(filingsWithAnalysis/totalFilings*100).toFixed(1)}%)`);

  // 2. Check snapshots
  const totalSnapshots = await prisma.companySnapshot.count();
  const snapshotsWithFilings = await prisma.companySnapshot.count({
    where: { filingId: { not: null } }
  });

  console.log('\n📸 COMPANY SNAPSHOTS:');
  console.log(`  Total: ${totalSnapshots}`);
  console.log(`  Linked to filings: ${snapshotsWithFilings}`);

  if (totalSnapshots === 0) {
    console.log('\n  ⚠️  NO SNAPSHOTS FOUND - This is the problem!');
  }

  // 3. Check companies with data
  const megaCapCompanies = await prisma.company.findMany({
    where: { marketCap: { gt: 500_000_000_000 } },
    include: {
      filings: {
        where: { filingType: { in: ['10-K', '10-Q'] } },
        take: 1
      },
      snapshots: { take: 1 }
    }
  });

  console.log('\n🏢 MEGA-CAP COMPANIES (>$500B):');
  console.log(`  Total: ${megaCapCompanies.length}`);

  const withFilings = megaCapCompanies.filter(c => c.filings.length > 0).length;
  const withSnapshots = megaCapCompanies.filter(c => c.snapshots.length > 0).length;

  console.log(`  With filings: ${withFilings}`);
  console.log(`  With snapshots: ${withSnapshots}`);

  // 4. Sample a filing to see what data it has
  const sampleFiling = await prisma.filing.findFirst({
    where: {
      filingType: { in: ['10-K', '10-Q'] },
      actual7dReturn: { not: null },
      riskScore: { not: null }
    },
    include: {
      company: true,
      snapshots: true
    }
  });

  if (sampleFiling) {
    console.log('\n📊 SAMPLE FILING WITH DATA:');
    console.log(`  Ticker: ${sampleFiling.company.ticker}`);
    console.log(`  Filing Type: ${sampleFiling.filingType}`);
    console.log(`  Filing Date: ${sampleFiling.filingDate.toISOString().split('T')[0]}`);
    console.log(`  Risk Score: ${sampleFiling.riskScore}`);
    console.log(`  Sentiment: ${sampleFiling.sentimentScore}`);
    console.log(`  Actual 7d Return: ${sampleFiling.actual7dReturn}%`);
    console.log(`  Snapshots linked: ${sampleFiling.snapshots.length}`);

    console.log('\n  Company data (current):');
    console.log(`    Market Cap: $${(sampleFiling.company.marketCap! / 1e9).toFixed(1)}B`);
    console.log(`    Current Price: $${sampleFiling.company.currentPrice}`);
    console.log(`    PE Ratio: ${sampleFiling.company.peRatio}`);
    console.log(`    Forward PE: ${sampleFiling.company.forwardPE}`);
  }

  // 5. Check why snapshots aren't being created
  console.log('\n\n🔎 CHECKING SNAPSHOT CREATION LOGIC...\n');

  const filingsNeedingSnapshots = await prisma.filing.findMany({
    where: {
      filingType: { in: ['10-K', '10-Q'] },
      actual7dReturn: { not: null },
      riskScore: { not: null }
    },
    include: {
      company: true,
      snapshots: true
    },
    take: 5
  });

  for (const filing of filingsNeedingSnapshots) {
    console.log(`${filing.company.ticker} (${filing.filingType} on ${filing.filingDate.toISOString().split('T')[0]}):`);
    console.log(`  Snapshots: ${filing.snapshots.length}`);
    console.log(`  Company has currentPrice: ${filing.company.currentPrice !== null}`);
    console.log(`  Company has marketCap: ${filing.company.marketCap !== null}`);
  }

  // 6. Complete data analysis
  const completeFilings = await prisma.filing.findMany({
    where: {
      filingType: { in: ['10-K', '10-Q'] },
      actual7dReturn: { not: null },
      riskScore: { not: null },
      sentimentScore: { not: null },
      company: {
        marketCap: { gt: 500_000_000_000 },
        currentPrice: { not: null },
        forwardPE: { not: null }
      }
    },
    include: {
      company: true
    }
  });

  console.log('\n\n✅ COMPLETE DATA (can be used for training):');
  console.log(`  Filings with ALL required data: ${completeFilings.length}`);

  if (completeFilings.length > 0) {
    const companies = new Set(completeFilings.map(f => f.company.ticker));
    console.log(`  Unique companies: ${companies.size}`);
    console.log(`  Companies: ${Array.from(companies).slice(0, 10).join(', ')}...`);
  }

  console.log('\n═'.repeat(80));
  console.log('\n💡 SOLUTION:');

  if (totalSnapshots === 0) {
    console.log('  CompanySnapshots are missing because they were never created.');
    console.log('  The Company table has current data, but no historical snapshots.');
    console.log('\n  Two options:');
    console.log('  1. Use Company table data directly (current snapshot)');
    console.log('  2. Create CompanySnapshots retroactively from Company data');
    console.log('\n  Recommendation: Use Company table data for now (option 1)');
  }

  await prisma.$disconnect();
}

main().catch(console.error);
