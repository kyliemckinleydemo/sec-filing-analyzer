import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('\n=== Searching for AAPL 10-Q around October 2024/2025 ===\n');

  // Batch query for both years
  const filings = await prisma.filing.findMany({
    where: {
      company: {
        ticker: 'AAPL'
      },
      filingType: '10-Q',
      OR: [
        {
          reportDate: {
            gte: new Date('2024-09-15'),
            lt: new Date('2024-11-15')
          }
        },
        {
          reportDate: {
            gte: new Date('2025-09-15'),
            lt: new Date('2025-11-15')
          }
        }
      ]
    },
    orderBy: {
      filingDate: 'desc'
    }
  });

  // Group filings by year for display
  const filingsByYear = new Map<number, typeof filings>();
  for (const filing of filings) {
    const year = filing.reportDate?.getFullYear();
    if (year) {
      if (!filingsByYear.has(year)) {
        filingsByYear.set(year, []);
      }
      filingsByYear.get(year)!.push(filing);
    }
  }

  // Batch fetch all URLs first
  const urlCheckResults = new Map<string, { status: number; statusText: string; error?: string }>();
  
  for (const filing of filings) {
    try {
      const response = await fetch(filing.filingUrl, {
        method: 'HEAD',
        headers: {
          'User-Agent': 'SEC Filing Analyzer contact@bluecomet.ai'
        }
      });
      urlCheckResults.set(filing.filingUrl, {
        status: response.status,
        statusText: response.statusText
      });
    } catch (error) {
      urlCheckResults.set(filing.filingUrl, {
        status: 0,
        statusText: 'Error',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // Display results by year
  for (const year of [2024, 2025]) {
    console.log(`\n--- ${year} ---`);
    const yearFilings = filingsByYear.get(year) || [];

    if (yearFilings.length === 0) {
      console.log(`No 10-Q found with Oct ${year} report date`);
      continue;
    }

    for (const f of yearFilings) {
      console.log(`\nFiling Date: ${f.filingDate.toISOString().split('T')[0]}`);
      console.log(`Report Date: ${f.reportDate?.toISOString().split('T')[0] || 'N/A'}`);
      console.log(`Accession: ${f.accessionNumber}`);
      console.log(`URL: ${f.filingUrl}`);

      const result = urlCheckResults.get(f.filingUrl);
      if (result) {
        if (result.error) {
          console.log(`Status: ❌ Error - ${result.error}`);
        } else if (result.status === 403) {
          console.log(`Status: ❌ 403 Forbidden`);
        } else if (result.status === 429) {
          console.log(`Status: ❌ 429 Rate Limited`);
        } else if (result.status === 404) {
          console.log(`Status: ❌ 404 Not Found`);
        } else if (result.status >= 200 && result.status < 300) {
          console.log(`Status: ✅ ${result.status} OK`);
        } else {
          console.log(`Status: ⚠️  ${result.status} ${result.statusText}`);
        }
      }
    }
  }
}

main().finally(() => prisma.$disconnect());