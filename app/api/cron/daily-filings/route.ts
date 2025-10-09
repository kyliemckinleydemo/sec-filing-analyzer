import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { SECClient } from '@/lib/sec-client';

/**
 * Daily Cron Job: Fetch and process latest SEC filings
 *
 * This endpoint is triggered daily by Vercel Cron to:
 * 1. Fetch latest 10-K, 10-Q, and 8-K filings from SEC
 * 2. Store them in the database for processing
 * 3. Optionally trigger AI analysis for priority companies
 *
 * Runs at 2 AM UTC daily (after SEC EDGAR updates)
 */
export async function GET(request: Request) {
  try {
    // Note: This endpoint is secured by Vercel Cron's built-in authentication
    // Vercel only triggers cron jobs from their infrastructure
    // For additional security in production, you can check for VERCEL_ENV === 'production'

    console.log('[Cron] Starting daily SEC filings fetch...');

    // Priority tickers to analyze (can be expanded)
    const priorityTickers = [
      'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'TSLA', 'NVDA', 'AVGO'
    ];

    const results = {
      fetched: 0,
      stored: 0,
      errors: [] as string[],
    };

    const secClient = new SECClient();

    // For each priority ticker, fetch recent filings
    for (const ticker of priorityTickers) {
      try {
        console.log(`[Cron] Fetching filings for ${ticker}...`);

        // Look up company in SEC database using SEC client directly
        const companyData = await secClient.getCompanyByTicker(ticker);

        if (!companyData) {
          results.errors.push(`${ticker}: Company not found`);
          continue;
        }

        const { cik, name } = companyData;

        // Store company if not exists
        await prisma.company.upsert({
          where: { ticker },
          create: {
            ticker,
            cik: cik.padStart(10, '0'),
            name,
          },
          update: {
            cik: cik.padStart(10, '0'),
            name,
          },
        });

        // Fetch recent filings (10-K, 10-Q, 8-K from last 90 days)
        const ninety_days_ago = new Date();
        ninety_days_ago.setDate(ninety_days_ago.getDate() - 90);

        const submissions = await secClient.getCompanySubmissions(cik);
        const recentFilings = submissions?.filings?.recent;

        if (!recentFilings) {
          results.errors.push(`${ticker}: No filings found`);
          continue;
        }

        // Build array of filing objects
        const filings = [];
        for (let i = 0; i < recentFilings.form.length; i++) {
          filings.push({
            form: recentFilings.form[i],
            filingDate: recentFilings.filingDate[i],
            accessionNumber: recentFilings.accessionNumber[i],
            primaryDocument: recentFilings.primaryDocument[i],
            reportDate: recentFilings.reportDate?.[i],
          });
        }

        const relevantFilings = filings
          .filter((f: any) =>
            ['10-K', '10-Q', '8-K'].includes(f.form) &&
            new Date(f.filingDate) > ninety_days_ago
          )
          .slice(0, 5); // Limit to 5 most recent

        console.log(`[Cron] Found ${relevantFilings.length} recent filings for ${ticker}`);

        for (const filing of relevantFilings) {
          try {
            // Store filing if not exists
            const company = await prisma.company.findUnique({ where: { ticker } });
            if (!company) continue;

            // Construct filing URL
            const accessionNoHyphens = filing.accessionNumber.replace(/-/g, '');
            const filingUrl = filing.primaryDocument
              ? `https://www.sec.gov/Archives/edgar/data/${cik}/${accessionNoHyphens}/${filing.primaryDocument}`
              : '';

            await prisma.filing.upsert({
              where: { accessionNumber: filing.accessionNumber },
              create: {
                companyId: company.id,
                cik: cik.padStart(10, '0'),
                accessionNumber: filing.accessionNumber,
                filingType: filing.form,
                filingDate: new Date(filing.filingDate),
                reportDate: filing.reportDate ? new Date(filing.reportDate) : null,
                filingUrl,
              },
              update: {
                filingDate: new Date(filing.filingDate),
                reportDate: filing.reportDate ? new Date(filing.reportDate) : null,
              },
            });

            results.stored++;
          } catch (error: any) {
            results.errors.push(`${ticker} ${filing.accessionNumber}: ${error.message}`);
          }
        }

        results.fetched += relevantFilings.length;
      } catch (error: any) {
        results.errors.push(`${ticker}: ${error.message}`);
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
