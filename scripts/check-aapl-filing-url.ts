import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Find AAPL's October 2025 10-Q
  const filing = await prisma.filing.findFirst({
    where: {
      company: {
        ticker: 'AAPL'
      },
      filingType: '10-Q',
      filingDate: {
        gte: new Date('2025-10-01'),
        lt: new Date('2025-11-01')
      }
    },
    include: {
      company: true
    }
  });

  if (filing) {
    console.log('\n=== Filing Details ===');
    console.log('Accession:', filing.accessionNumber);
    console.log('Filing Date:', filing.filingDate.toISOString().split('T')[0]);
    console.log('Report Date:', filing.reportDate?.toISOString().split('T')[0]);
    console.log('Filing URL:', filing.filingUrl);
    console.log('\nTesting URL access...');

    try {
      const response = await fetch(filing.filingUrl, {
        method: 'HEAD',
        headers: {
          'User-Agent': 'SEC Filing Analyzer contact@bluecomet.ai'
        }
      });
      console.log('HTTP Status:', response.status, response.statusText);

      if (response.status === 403) {
        console.log('❌ ISSUE: 403 Forbidden - IP may be blocked or wrong User-Agent');
      } else if (response.status === 429) {
        console.log('❌ ISSUE: 429 Too Many Requests - Rate limited');
      } else if (response.status === 404) {
        console.log('❌ ISSUE: 404 Not Found - URL is incorrect or filing moved');
        console.log('\nLet me check the correct URL from SEC...');

        // Try to find the correct URL
        const cik = filing.cik.padStart(10, '0');
        const accession = filing.accessionNumber.replace(/-/g, '');
        const secIndexUrl = `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}&type=10-Q&dateb=&owner=exclude&count=10`;
        console.log('SEC EDGAR search:', secIndexUrl);
      } else if (response.ok) {
        console.log('✅ URL is accessible - NOT a rate limiting issue');
      }
    } catch (error) {
      if (error instanceof Error) {
        console.log('❌ Error:', error.message);
      }
    }
  } else {
    console.log('No AAPL 10-Q found for October 2025');

    // List all AAPL 10-Q filings
    const allFilings = await prisma.filing.findMany({
      where: {
        company: {
          ticker: 'AAPL'
        },
        filingType: '10-Q'
      },
      orderBy: {
        filingDate: 'desc'
      },
      take: 5
    });

    console.log('\nRecent AAPL 10-Q filings:');
    allFilings.forEach(f => {
      console.log(`- ${f.filingDate.toISOString().split('T')[0]}: ${f.accessionNumber}`);
    });
  }
}

main().finally(() => prisma.$disconnect());
