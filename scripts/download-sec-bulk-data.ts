/**
 * Download SEC bulk submissions data
 *
 * This script downloads the submissions.zip file from SEC EDGAR which contains
 * all company filing history. Run this once per day to avoid rate limiting.
 *
 * Source: https://www.sec.gov/Archives/edgar/daily-index/bulkdata/submissions.zip
 *
 * Usage: npx tsx scripts/download-sec-bulk-data.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import { createGunzip } from 'zlib';

const BULK_DATA_DIR = path.join(process.cwd(), 'data', 'sec-bulk');
const SUBMISSIONS_ZIP_URL = 'https://www.sec.gov/Archives/edgar/daily-index/bulkdata/submissions.zip';
const OUTPUT_FILE = path.join(BULK_DATA_DIR, 'submissions.zip');
const EXTRACTED_DIR = path.join(BULK_DATA_DIR, 'submissions');

// Ensure directories exist
if (!fs.existsSync(BULK_DATA_DIR)) {
  fs.mkdirSync(BULK_DATA_DIR, { recursive: true });
}

if (!fs.existsSync(EXTRACTED_DIR)) {
  fs.mkdirSync(EXTRACTED_DIR, { recursive: true });
}

async function downloadFile(url: string, outputPath: string): Promise<void> {
  console.log(`Downloading ${url}...`);

  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        'User-Agent': 'SEC Filing Analyzer/1.0 (educational project)',
      }
    }, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        // Follow redirect
        const redirectUrl = response.headers.location;
        if (redirectUrl) {
          console.log(`Following redirect to ${redirectUrl}`);
          downloadFile(redirectUrl, outputPath).then(resolve).catch(reject);
          return;
        }
      }

      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download: ${response.statusCode} ${response.statusMessage}`));
        return;
      }

      const fileStream = createWriteStream(outputPath);
      const totalBytes = parseInt(response.headers['content-length'] || '0', 10);
      let downloadedBytes = 0;
      let lastProgress = 0;

      response.on('data', (chunk) => {
        downloadedBytes += chunk.length;
        const progress = Math.floor((downloadedBytes / totalBytes) * 100);
        if (progress % 10 === 0 && progress !== lastProgress) {
          console.log(`Progress: ${progress}% (${(downloadedBytes / 1024 / 1024).toFixed(1)}MB / ${(totalBytes / 1024 / 1024).toFixed(1)}MB)`);
          lastProgress = progress;
        }
      });

      response.pipe(fileStream);

      fileStream.on('finish', () => {
        fileStream.close();
        console.log(`✅ Download complete: ${outputPath}`);
        console.log(`File size: ${(fs.statSync(outputPath).size / 1024 / 1024).toFixed(1)}MB`);
        resolve();
      });

      fileStream.on('error', (err) => {
        fs.unlink(outputPath, () => {}); // Delete partial file
        reject(err);
      });
    }).on('error', reject);
  });
}

async function extractZip(zipPath: string, outputDir: string): Promise<void> {
  console.log(`Extracting ${zipPath} to ${outputDir}...`);

  // Use system unzip command
  const { exec } = require('child_process');
  const { promisify } = require('util');
  const execAsync = promisify(exec);

  try {
    await execAsync(`unzip -o "${zipPath}" -d "${outputDir}"`);
    console.log('✅ Extraction complete');

    // Count extracted files
    const files = fs.readdirSync(outputDir);
    console.log(`Extracted ${files.length} files`);

    // Show some sample files
    console.log('Sample files:', files.slice(0, 5));
  } catch (error: any) {
    console.error('Extraction failed:', error.message);
    throw error;
  }
}

async function createIndex(): Promise<void> {
  console.log('Creating index of submissions...');

  const files = fs.readdirSync(EXTRACTED_DIR).filter(f => f.startsWith('CIK') && f.endsWith('.json'));

  const index: Record<string, { cik: string; ticker?: string; name: string; filingCount: number }> = {};

  let processed = 0;
  for (const file of files) {
    try {
      const filePath = path.join(EXTRACTED_DIR, file);
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

      const cik = data.cik;
      const tickers = data.tickers || [];
      const name = data.name;
      const filingCount = data.filings?.recent?.accessionNumber?.length || 0;

      // Index by CIK
      index[cik] = {
        cik,
        ticker: tickers[0],
        name,
        filingCount,
      };

      // Index by ticker
      if (tickers.length > 0) {
        for (const ticker of tickers) {
          index[ticker.toUpperCase()] = index[cik];
        }
      }

      processed++;
      if (processed % 1000 === 0) {
        console.log(`Indexed ${processed} companies...`);
      }
    } catch (error) {
      console.warn(`Failed to process ${file}:`, error);
    }
  }

  // Save index
  const indexPath = path.join(BULK_DATA_DIR, 'submissions-index.json');
  fs.writeFileSync(indexPath, JSON.stringify({
    lastUpdated: new Date().toISOString(),
    companyCount: files.length,
    index,
  }, null, 2));

  console.log(`✅ Index created: ${indexPath}`);
  console.log(`Total companies indexed: ${files.length}`);
}

async function main() {
  console.log('SEC Bulk Data Download Script');
  console.log('==============================\n');

  try {
    // Step 1: Download submissions.zip
    await downloadFile(SUBMISSIONS_ZIP_URL, OUTPUT_FILE);

    // Step 2: Extract ZIP file
    await extractZip(OUTPUT_FILE, EXTRACTED_DIR);

    // Step 3: Create index for fast lookups
    await createIndex();

    console.log('\n✅ Bulk data download complete!');
    console.log(`Data location: ${EXTRACTED_DIR}`);
    console.log('You can now use this data instead of hitting SEC APIs.');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

main();
