/**
 * Populate database from SEC bulk submissions data
 *
 * Reads ~940K JSON files from data/sec-bulk/submissions/ and populates:
 * - Companies table with CIK, ticker, name
 * - Filings table with 10-K, 10-Q, 8-K filings from last 90 days
 *
 * Focused on top 1,000 companies from /lib/top1000-tickers.ts
 *
 * Usage: npx tsx scripts/populate-from-bulk-data.ts
 */

import { PrismaClient } from '@prisma/client';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { TOP_1000_TICKERS } from '../lib/top1000-tickers';

const prisma = new PrismaClient();

interface SECSubmissionFile {
  cik: string;
  name: string;
  tickers?: string[];
  filings: {
    recent: {
      accessionNumber: string[];
      filingDate: string[];
      reportDate: string[];
      form: string[];
      primaryDocument: string[];
    };
  };
}

async function populateFromBulkData() {
  console.log('🚀 Starting bulk data import for top 1,000 companies...\n');

  const dataDir = join(process.cwd(), 'data', 'sec-bulk', 'submissions');

  if (!existsSync(dataDir)) {
    console.error(`❌ Data directory not found: ${dataDir}`);
    console.error('   Please extract submissions.zip first');
    process.exit(1);
  }

  const stats = {
    companiesProcessed: 0,
    companiesCreated: 0,
    filingsStored: 0,
    errors: [] as string[],
  };

  // Calculate 90-day cutoff for initial baseline
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 90);

  console.log(`📅 Fetching filings from: ${cutoffDate.toISOString().split('T')[0]}`);
  console.log(`🏢 Processing ${TOP_1000_TICKERS.length} companies...\n`);

  // Step 1: Build ticker → file mapping (faster than repeated searches)
  console.log('📋 Building ticker → CIK mapping...');
  const tickerToFile = new Map<string, string>();
  const tickerSet = new Set(TOP_1000_TICKERS);

  const allFiles = readdirSync(dataDir).filter(f => f.startsWith('CIK') && f.endsWith('.json'));
  console.log(`   Found ${allFiles.length} CIK files to scan`);

  let scanned = 0;
  for (const file of allFiles) {
    try {
      const filePath = join(dataDir, file);
      const content = readFileSync(filePath, 'utf-8');
      const data: SECSubmissionFile = JSON.parse(content);

      if (data.tickers) {
        for (const ticker of data.tickers) {
          if (tickerSet.has(ticker)) {
            tickerToFile.set(ticker, file);
          }
        }
      }

      scanned++;
      if (scanned % 100000 === 0) {
        console.log(`   Scanned ${scanned}/${allFiles.length} files... (found ${tickerToFile.size} matches)`);
      }
    } catch (e) {
      // Skip corrupt files
      continue;
    }
  }

  console.log(`✅ Mapping complete: ${tickerToFile.size}/${TOP_1000_TICKERS.length} tickers found\n`);

  // Step 2: Process each ticker
  const batchSize = 100;
  for (let i = 0; i < TOP_1000_TICKERS.length; i += batchSize) {
    const batch = TOP_1000_TICKERS.slice(i, i + batchSize);

    await Promise.all(
      batch.map(async (ticker) => {
        try {
          const file = tickerToFile.get(ticker);
          if (!file) {
            stats.errors.push(`${ticker}: No CIK file found`);
            return;
          }

          const filePath = join(dataDir, file);
          const content = readFileSync(filePath, 'utf-8');
          const submissionFile: SECSubmissionFile = JSON.parse(content);

          const { cik, name, filings } = submissionFile;
          const paddedCik = cik.padStart(10, '0');

          // Store company
          const company = await prisma.company.upsert({
            where: { ticker },
            create: { ticker, cik: paddedCik, name },
            update: { cik: paddedCik, name },
          });
          stats.companiesCreated++;

          // Filter for 10-K, 10-Q, 8-K filings in last 90 days
          const targetForms = ['10-K', '10-Q', '8-K'];
          const recentFilings = filings.recent;

          for (let j = 0; j < recentFilings.accessionNumber.length; j++) {
            const form = recentFilings.form[j];
            const filingDate = new Date(recentFilings.filingDate[j]);

            if (!targetForms.includes(form)) continue;
            if (filingDate < cutoffDate) continue;

            const accessionNumber = recentFilings.accessionNumber[j];
            const reportDate = recentFilings.reportDate[j];
            const primaryDoc = recentFilings.primaryDocument[j];

            // Construct filing URL
            const accessionNoSlash = accessionNumber.replace(/-/g, '');
            const filingUrl = `https://www.sec.gov/Archives/edgar/data/${parseInt(cik)}/${accessionNoSlash}/${primaryDoc}`;

            // Store filing
            await prisma.filing.upsert({
              where: { accessionNumber },
              create: {
                companyId: company.id,
                cik: paddedCik,
                accessionNumber,
                filingType: form,
                filingDate,
                reportDate: reportDate ? new Date(reportDate) : null,
                filingUrl,
              },
              update: {
                filingDate,
                reportDate: reportDate ? new Date(reportDate) : null,
              },
            });

            stats.filingsStored++;
          }

          stats.companiesProcessed++;

          // Progress update every 50 companies
          if (stats.companiesProcessed % 50 === 0) {
            console.log(`✅ Processed ${stats.companiesProcessed}/${TOP_1000_TICKERS.length} companies (${stats.filingsStored} filings stored)`);
          }
        } catch (error: any) {
          stats.errors.push(`${ticker}: ${error.message}`);
        }
      })
    );
  }

  console.log('\n📊 Import complete!\n');
  console.log(`   Companies processed: ${stats.companiesProcessed}`);
  console.log(`   Companies created: ${stats.companiesCreated}`);
  console.log(`   Filings stored: ${stats.filingsStored}`);
  console.log(`   Errors: ${stats.errors.length}`);

  if (stats.errors.length > 0) {
    console.log('\n⚠️  First 10 errors:');
    stats.errors.slice(0, 10).forEach(err => console.log(`   ${err}`));
  }

  await prisma.$disconnect();
}

populateFromBulkData().catch((error) => {
  console.error('❌ Fatal error:', error);
  prisma.$disconnect();
  process.exit(1);
});
