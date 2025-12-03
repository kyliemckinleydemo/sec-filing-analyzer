import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('\n=== Searching for AAPL 10-Q around October 2024/2025 ===\n');

  // Search across 2024 and 2025
  for (const year of [2024, 2025]) {
    console.log(`\n--- ${year} ---`);
    const filings = await prisma.filing.findMany({
      where: {
        company: {
          ticker: 'AAPL'
        },
        filingType: '10-Q',
        reportDate: {
          gte: new Date(`${year}-09-15`),
          lt: new Date(`${year}-11-15`)
        }
      },
      orderBy: {
        filingDate: 'desc'
      }
    });

    if (filings.length === 0) {
      console.log(`No 10-Q found with Oct ${year} report date`);
      continue;
    }

    for (const f of filings) {
      console.log(`\nFiling Date: ${f.filingDate.toISOString().split('T')[0]}`);
      console.log(`Report Date: ${f.reportDate?.toISOString().split('T')[0] || 'N/A'}`);
      console.log(`Accession: ${f.accessionNumber}`);
      console.log(`URL: ${f.filingUrl}`);

      // Test URL
      try {
        const response = await fetch(f.filingUrl, {
          method: 'HEAD',
          headers: {
            'User-Agent': 'SEC Filing Analyzer contact@bluecomet.ai'
          }
        });

        if (response.status === 403) {
          console.log(`Status: ❌ 403 Forbidden`);
        } else if (response.status === 429) {
          console.log(`Status: ❌ 429 Rate Limited`);
        } else if (response.status === 404) {
          console.log(`Status: ❌ 404 Not Found`);
        } else if (response.ok) {
          console.log(`Status: ✅ ${response.status} OK`);
        } else {
          console.log(`Status: ⚠️  ${response.status} ${response.statusText}`);
        }
      } catch (error) {
        console.log(`Status: ❌ Error -`, error instanceof Error ? error.message : 'Unknown error');
      }
    }
  }
}

main().finally(() => prisma.$disconnect());
