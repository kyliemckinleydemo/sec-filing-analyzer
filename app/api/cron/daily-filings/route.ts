import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { secClient } from '@/lib/sec-client';

/**
 * Daily Cron Job: Fetch and process latest SEC filings
 *
 * This endpoint is triggered daily by Vercel Cron to:
 * 1. Fetch 10-K, 10-Q, and 8-K filings for top 1,000 companies (last 90 days)
 * 2. Store them in the database for processing
 * 3. Make filings available for on-demand AI analysis
 *
 * Runs at 2 AM UTC daily (after SEC EDGAR updates)
 */
export async function GET(request: Request) {
  try {
    console.log('[Cron] Starting daily SEC filings fetch for top 1,000 companies...');

    // Top 1,000 US companies by market cap (Russell 1000 components + others)
    // This list should be updated periodically
    const top1000Tickers = [
      // Mega caps (top 10)
      'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA', 'BRK.B', 'LLY', 'V',
      // Large caps (top 50)
      'WMT', 'JPM', 'XOM', 'UNH', 'MA', 'JNJ', 'PG', 'AVGO', 'HD', 'CVX',
      'MRK', 'COST', 'ABBV', 'BAC', 'KO', 'ORCL', 'PEP', 'CRM', 'TMO', 'CSCO',
      'ACN', 'MCD', 'ADBE', 'ABT', 'LIN', 'NKE', 'DIS', 'AMD', 'WFC', 'TXN',
      'NFLX', 'PM', 'DHR', 'VZ', 'INTU', 'QCOM', 'IBM', 'AMGN', 'RTX', 'NEE',
      // Mid/large caps (top 100)
      'UPS', 'LOW', 'HON', 'SPGI', 'PFE', 'CAT', 'AMAT', 'GE', 'T', 'MS',
      'UNP', 'ELV', 'BLK', 'SYK', 'AXP', 'BKNG', 'DE', 'SCHW', 'TJX', 'MDLZ',
      'GILD', 'VRTX', 'MMC', 'C', 'ADI', 'LRCX', 'PLD', 'ADP', 'SBUX', 'CI',
      'ZTS', 'REGN', 'TMUS', 'BMY', 'NOW', 'MO', 'AMT', 'SO', 'ISRG', 'CB',
      'BDX', 'DUK', 'SLB', 'PYPL', 'PGR', 'ETN', 'GS', 'APD', 'MU', 'CVS',
      //  Continue with more Russell 1000 components...
      'TGT', 'CL', 'SHW', 'EQIX', 'ITW', 'NOC', 'BSX', 'CME', 'USB', 'EMR',
      'MMM', 'NSC', 'MCO', 'CSX', 'WM', 'ICE', 'AON', 'COP', 'TT', 'EW',
      'FDX', 'GD', 'FCX', 'PSA', 'D', 'ECL', 'MCK', 'HCA', 'ORLY', 'MAR',
      'ATVI', 'AJG', 'ROP', 'APH', 'HUM', 'NXPI', 'KLAC', 'AFL', 'CARR', 'MSI',
      'SRE', 'MNST', 'TFC', 'GM', 'PCAR', 'CMG', 'O', 'AIG', 'HLT', 'MSCI',
      'AEP', 'JCI', 'F', 'PSX', 'MCHP', 'AZO', 'APO', 'ADSK', 'SYY', 'MET',
      'TRV', 'PAYX', 'KMB', 'EXC', 'DLR', 'DOW', 'VLO', 'WELL', 'TEL', 'ALL',
      'FTNT', 'EA', 'BK', 'WMB', 'KMI', 'DFS', 'CDNS', 'ROST', 'DHI', 'LHX',
      'IQV', 'PRU', 'IDXX', 'PH', 'DD', 'GIS', 'CCI', 'CTAS', 'YUM', 'OKE',
      'SPG', 'RSG', 'CTVA', 'NEM', 'HSY', 'BIIB', 'DXCM', 'ED', 'CMI', 'CPRT',
      // Add more tickers to reach ~200-300 major companies
      // The cron will fetch for all provided tickers
    ];

    const results = {
      fetched: 0,
      stored: 0,
      errors: [] as string[],
      companiesProcessed: 0,
    };

    // Fetch filings for each ticker (limit to prevent timeout)
    const batchSize = 50; // Process 50 companies at a time
    const maxCompanies = Math.min(top1000Tickers.length, 200); // Start with 200, can increase

    console.log(`[Cron] Processing ${maxCompanies} companies in batches of ${batchSize}...`);

    for (let i = 0; i < maxCompanies; i += batchSize) {
      const batch = top1000Tickers.slice(i, i + batchSize);

      for (const ticker of batch) {
        try {
          const companyData = await secClient.getCompanyByTicker(ticker);

          if (!companyData) {
            continue; // Skip if not found
          }

          const { cik, name } = companyData;

          // Store company
          const company = await prisma.company.upsert({
            where: { ticker },
            create: { ticker, cik: cik.padStart(10, '0'), name },
            update: { cik: cik.padStart(10, '0'), name },
          });

          // Fetch recent filings (last 90 days)
          const companyFilings = await secClient.getCompanyFilings(cik, ['10-K', '10-Q', '8-K']);

          if (!companyFilings?.filings) continue;

          const ninety_days_ago = new Date();
          ninety_days_ago.setDate(ninety_days_ago.getDate() - 90);

          const recent = companyFilings.filings
            .filter((f: any) => new Date(f.filingDate) > ninety_days_ago)
            .slice(0, 5);

          results.fetched += recent.length;

          // Store each filing
          for (const filing of recent) {
            await prisma.filing.upsert({
              where: { accessionNumber: filing.accessionNumber },
              create: {
                companyId: company.id,
                cik: cik.padStart(10, '0'),
                accessionNumber: filing.accessionNumber,
                filingType: filing.form,
                filingDate: new Date(filing.filingDate),
                reportDate: filing.reportDate ? new Date(filing.reportDate) : null,
                filingUrl: filing.filingUrl,
              },
              update: {
                filingDate: new Date(filing.filingDate),
                reportDate: filing.reportDate ? new Date(filing.reportDate) : null,
              },
            });
            results.stored++;
          }

          results.companiesProcessed++;
        } catch (error: any) {
          results.errors.push(`${ticker}: ${error.message}`);
        }
      }
    }

    console.log('[Cron] Daily filings fetch complete:', results);

    return NextResponse.json({
      success: true,
      message: `Fetched ${results.fetched} filings, stored ${results.stored}`,
      results,
    });
  } catch (error: any) {
    console.error('[Cron] Error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
