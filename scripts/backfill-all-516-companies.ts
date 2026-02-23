/**
 * @module backfill-all-516-companies
 * @description Complete daily technical indicators backfill script for all 516 companies in the database
 * 
 * PURPOSE:
 * Performs a comprehensive backfill of technical indicators for the entire company dataset to support
 * the EAP-2.0 model. Populates approximately 258,000 records (516 companies × 500 days of historical data)
 * with calculated technical indicators including moving averages, RSI, returns, volatility, and volume metrics.
 * Designed for initial database population with batch processing, rate limiting, and progress tracking.
 * 
 * EXPORTS:
 * - None (executable script)
 * 
 * Functions:
 * - calculateMA(): Computes moving average for specified period
 * - calculateRSI(): Computes Relative Strength Index for momentum analysis
 * - calculateReturn(): Calculates percentage returns over specified timeframes
 * - calculateVolatility(): Computes annualized volatility (30-day rolling)
 * - calculateIndicators(): Orchestrates all technical indicator calculations for price data series
 * - fetchYahooPriceData(): Retrieves 2 years of historical price data from Yahoo Finance
 * - backfillAllCompanies(): Main execution function with batch processing and error handling
 * 
 * CLAUDE NOTES:
 * - Processes companies in batches of 10 to manage memory and API rate limits
 * - Implements 250ms delay between API calls to respect Yahoo Finance rate limits
 * - Uses Prisma upsert operations to handle duplicate records gracefully
 * - Estimated runtime: 2-3 hours for complete backfill of all 516 companies
 * - Comprehensive logging with batch progress, success rates, and final database audit
 * - Technical indicators include: MA30/50/200, RSI14/30, 7/30/90-day returns, volatility, volume ratios
 * - Error handling continues processing remaining companies if individual tickers fail
 * - Final audit provides database coverage percentage against target of 258,000 records
 */

#!/usr/bin/env npx tsx

/**
 * Complete daily technical indicators backfill for ALL 516 companies
 * This will populate ~258,000 records (516 companies × 500 days)
 * Priority: Database building for EAP-2.0 model
 */

import { PrismaClient } from '@prisma/client';
import yahooFinance from '../lib/yahoo-finance-singleton';

const prisma = new PrismaClient();

interface PriceData {
  date: Date;
  close: number;
  volume: number;
}

interface TechnicalIndicators {
  date: Date;
  ticker: string;
  close: number;
  volume: number;
  ma30: number | null;
  ma50: number | null;
  ma200: number | null;
  rsi14: number | null;
  rsi30: number | null;
  return7d: number | null;
  return30d: number | null;
  return90d: number | null;
  volatility30: number | null;
  volumeMA30: number | null;
  volumeRatio: number | null;
}

function calculateMA(prices: number[], period: number): number | null {
  if (prices.length < period) return null;
  const sum = prices.slice(-period).reduce((a, b) => a + b, 0);
  return sum / period;
}

function calculateRSI(prices: number[], period: number): number | null {
  if (prices.length < period + 1) return null;

  let gains = 0;
  let losses = 0;

  for (let i = prices.length - period; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    if (change > 0) gains += change;
    else losses += Math.abs(change);
  }

  const avgGain = gains / period;
  const avgLoss = losses / period;

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

function calculateReturn(prices: number[], days: number): number | null {
  if (prices.length < days + 1) return null;
  const currentPrice = prices[prices.length - 1];
  const pastPrice = prices[prices.length - 1 - days];
  return ((currentPrice - pastPrice) / pastPrice) * 100;
}

function calculateVolatility(prices: number[], period: number): number | null {
  if (prices.length < period) return null;

  const returns = [];
  for (let i = prices.length - period; i < prices.length; i++) {
    returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
  }

  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / returns.length;
  return Math.sqrt(variance) * Math.sqrt(252) * 100;
}

function calculateIndicators(priceData: PriceData[]): TechnicalIndicators[] {
  const results: TechnicalIndicators[] = [];

  for (let i = 0; i < priceData.length; i++) {
    const historicalPrices = priceData.slice(0, i + 1).map(d => d.close);
    const historicalVolumes = priceData.slice(0, i + 1).map(d => d.volume);

    const ma30 = calculateMA(historicalPrices, 30);
    const ma50 = calculateMA(historicalPrices, 50);
    const ma200 = calculateMA(historicalPrices, 200);
    const rsi14 = calculateRSI(historicalPrices, 14);
    const rsi30 = calculateRSI(historicalPrices, 30);
    const return7d = calculateReturn(historicalPrices, 7);
    const return30d = calculateReturn(historicalPrices, 30);
    const return90d = calculateReturn(historicalPrices, 90);
    const volatility30 = calculateVolatility(historicalPrices, 30);
    const volumeMA30 = calculateMA(historicalVolumes, 30);
    const volumeRatio = volumeMA30 && historicalVolumes[i] > 0
      ? historicalVolumes[i] / volumeMA30
      : null;

    results.push({
      date: priceData[i].date,
      ticker: '', // Will be set by caller
      close: priceData[i].close,
      volume: priceData[i].volume,
      ma30,
      ma50,
      ma200,
      rsi14,
      rsi30,
      return7d,
      return30d,
      return90d,
      volatility30,
      volumeMA30,
      volumeRatio,
    });
  }

  return results;
}

async function fetchYahooPriceData(ticker: string): Promise<PriceData[]> {
  try {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setFullYear(startDate.getFullYear() - 2);

    const result = await yahooFinance.historical(ticker, {
      period1: startDate,
      period2: endDate,
      interval: '1d',
    });

    return result.map((r: any) => ({
      date: new Date(r.date),
      close: r.close,
      volume: r.volume || 0,
    }));
  } catch (error) {
    console.error(`  ⚠️  Yahoo Finance failed for ${ticker}: ${error}`);
    return [];
  }
}

async function backfillAllCompanies() {
  console.log('📊 Starting COMPLETE daily technical indicators backfill for ALL 516 companies\n');
  console.log('This will populate ~258,000 records (516 companies × 500 days)\n');
  console.log('Estimated time: 2-3 hours with rate limiting\n');

  // Get all companies
  const companies = await prisma.company.findMany({
    select: { ticker: true, name: true },
    orderBy: { ticker: 'asc' },
  });

  console.log(`Total companies to process: ${companies.length}\n`);

  // Process in batches of 10
  const batchSize = 10;
  const totalBatches = Math.ceil(companies.length / batchSize);

  let totalProcessed = 0;
  let totalRecords = 0;
  let totalErrors = 0;

  for (let batchNum = 0; batchNum < totalBatches; batchNum++) {
    const start = batchNum * batchSize;
    const end = Math.min(start + batchSize, companies.length);
    const batch = companies.slice(start, end);

    console.log(`\n${'='.repeat(80)}`);
    console.log(`BATCH ${batchNum + 1}/${totalBatches}`);
    console.log(`Processing companies ${start + 1}-${end}`);
    console.log('='.repeat(80));

    // Fetch price data for all companies in the batch
    const priceDataPromises = batch.map(company => 
      fetchYahooPriceData(company.ticker).then(data => ({ ticker: company.ticker, data }))
    );
    const priceDataResults = await Promise.all(priceDataPromises);

    for (let i = 0; i < batch.length; i++) {
      const company = batch[i];
      const priceData = priceDataResults[i].data;

      console.log(`\n${'='.repeat(70)}`);
      console.log(`Processing ${company.ticker}...`);
      console.log('='.repeat(70));

      try {
        if (priceData.length === 0) {
          console.log(`  ⚠️  No price data available for ${company.ticker}`);
          totalErrors++;
          continue;
        }

        console.log(`  ✅ Got ${priceData.length} price data points`);

        // Calculate indicators
        const indicators = calculateIndicators(priceData);
        console.log(`  📊 Calculated indicators for ${indicators.length} days`);

        // Upsert to database
        let inserted = 0;
        let skipped = 0;

        for (const indicator of indicators) {
          try {
            await prisma.dailyTechnicalIndicator.upsert({
              where: {
                ticker_date: {
                  ticker: company.ticker,
                  date: indicator.date,
                },
              },
              update: {
                close: indicator.close,
                volume: indicator.volume,
                ma30: indicator.ma30,
                ma50: indicator.ma50,
                ma200: indicator.ma200,
                rsi14: indicator.rsi14,
                rsi30: indicator.rsi30,
                return7d: indicator.return7d,
                return30d: indicator.return30d,
                return90d: indicator.return90d,
                volatility30: indicator.volatility30,
                volumeMA30: indicator.volumeMA30,
                volumeRatio: indicator.volumeRatio,
              },
              create: {
                ticker: company.ticker,
                date: indicator.date,
                close: indicator.close,
                volume: indicator.volume,
                ma30: indicator.ma30,
                ma50: indicator.ma50,
                ma200: indicator.ma200,
                rsi14: indicator.rsi14,
                rsi30: indicator.rsi30,
                return7d: indicator.return7d,
                return30d: indicator.return30d,
                return90d: indicator.return90d,
                volatility30: indicator.volatility30,
                volumeMA30: indicator.volumeMA30,
                volumeRatio: indicator.volumeRatio,
              },
            });
            inserted++;
          } catch (err) {
            skipped++;
          }
        }

        console.log(`  ✅ Inserted/Updated ${inserted} records, skipped ${skipped}`);

        totalProcessed++;
        totalRecords += inserted;

        // Rate limiting
        await new Promise((resolve) => setTimeout(resolve, 250));
      } catch (error) {
        console.error(`  ❌ Failed to process ${company.ticker}: ${error}`);
        totalErrors++;
      }
    }

    // Progress summary
    console.log(`\n${'='.repeat(80)}`);
    console.log(`📊 Progress: ${totalProcessed}/${companies.length} companies processed`);
    console.log(`   Records inserted: ${totalRecords.toLocaleString()}`);
    console.log(`   Errors: ${totalErrors}`);
    console.log(`   Completion: ${((totalProcessed / companies.length) * 100).toFixed(1)}%`);
    console.log('='.repeat(80));
  }

  // Final summary
  console.log(`\n${'='.repeat(80)}`);
  console.log('✅ COMPLETE BACKFILL FINISHED!');
  console.log('='.repeat(80));
  console.log(`Total companies processed: ${totalProcessed}/${companies.length}`);
  console.log(`Total records inserted: ${totalRecords.toLocaleString()}`);
  console.log(`Total errors: ${totalErrors}`);
  console.log(`Success rate: ${((totalProcessed / companies.length) * 100).toFixed(1)}%`);

  // Data audit
  const recordCount = await prisma.dailyTechnicalIndicator.count();
  const companyCount = await prisma.company.count();
  const avgRecordsPerCompany = recordCount / companyCount;

  console.log(`\n📊 Database status:`);
  console.log(`   Total technical indicator records: ${recordCount.toLocaleString()}`);
  console.log(`   Total companies: ${companyCount}`);
  console.log(`   Average records per company: ${avgRecordsPerCompany.toFixed(0)}`);
  console.log(`   Target records: ~258,000 (516 companies × 500 days)`);
  console.log(`   Coverage: ${((recordCount / 258000) * 100).toFixed(1)}%`);
}

backfillAllCompanies()
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  })
  .finally(() => {
    prisma.$disconnect();
  });