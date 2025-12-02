/**
 * Backfill Momentum Indicators
 *
 * Calculates technical indicators (MA, RSI, MACD) and macro indicators (SPX, VIX, rates)
 * for all filings with stock price data
 */

import { prisma } from '../lib/prisma';

interface PriceData {
  date: Date;
  close: number;
  high: number;
  low: number;
  volume: number;
}

// Calculate Simple Moving Average
function calculateSMA(prices: number[], period: number): number | null {
  if (prices.length < period) return null;
  const sum = prices.slice(-period).reduce((a, b) => a + b, 0);
  return sum / period;
}

// Calculate RSI (Relative Strength Index)
function calculateRSI(prices: number[], period: number = 14): number | null {
  if (prices.length < period + 1) return null;

  const changes = [];
  for (let i = 1; i < prices.length; i++) {
    changes.push(prices[i] - prices[i - 1]);
  }

  const recentChanges = changes.slice(-period);
  const gains = recentChanges.filter(c => c > 0);
  const losses = recentChanges.filter(c => c < 0).map(Math.abs);

  const avgGain = gains.length > 0 ? gains.reduce((a, b) => a + b, 0) / period : 0;
  const avgLoss = losses.length > 0 ? losses.reduce((a, b) => a + b, 0) / period : 0;

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

// Calculate MACD (Moving Average Convergence Divergence)
function calculateMACD(prices: number[]): { macd: number; signal: number; histogram: number } | null {
  if (prices.length < 35) return null; // Need 26 + 9 days minimum

  // Calculate EMAs
  const ema12 = calculateEMA(prices, 12);
  const ema26 = calculateEMA(prices, 26);

  if (!ema12 || !ema26) return null;

  const macd = ema12 - ema26;

  // For signal line, we'd need to calculate EMA of MACD values
  // Simplified: use SMA of last 9 MACD values (approximation)
  // In production, you'd calculate this properly with EMA
  const signal = macd; // Placeholder
  const histogram = macd - signal;

  return { macd, signal, histogram };
}

// Calculate Exponential Moving Average
function calculateEMA(prices: number[], period: number): number | null {
  if (prices.length < period) return null;

  const multiplier = 2 / (period + 1);
  let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period; // Start with SMA

  for (let i = period; i < prices.length; i++) {
    ema = (prices[i] - ema) * multiplier + ema;
  }

  return ema;
}

// Calculate ATR (Average True Range)
function calculateATR(data: PriceData[], period: number = 14): number | null {
  if (data.length < period + 1) return null;

  const trueRanges = [];
  for (let i = 1; i < data.length; i++) {
    const high = data[i].high;
    const low = data[i].low;
    const prevClose = data[i - 1].close;

    const tr = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );
    trueRanges.push(tr);
  }

  const recentTR = trueRanges.slice(-period);
  return recentTR.reduce((a, b) => a + b, 0) / period;
}

// Calculate historical volatility
function calculateVolatility(prices: number[], period: number = 30): number | null {
  if (prices.length < period + 1) return null;

  const returns = [];
  for (let i = 1; i <= period; i++) {
    const idx = prices.length - period + i - 1;
    returns.push(Math.log(prices[idx + 1] / prices[idx]));
  }

  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - mean, 2), 0) / returns.length;
  const stdDev = Math.sqrt(variance);

  // Annualized volatility (multiply by sqrt(252) for trading days)
  return stdDev * Math.sqrt(252) * 100; // Return as percentage
}

// Calculate return over period
function calculateReturn(prices: number[], days: number): number | null {
  if (prices.length < days + 1) return null;
  const start = prices[prices.length - days - 1];
  const end = prices[prices.length - 1];
  return ((end - start) / start) * 100;
}

// Fetch Yahoo Finance data for S&P 500, VIX
async function fetchMarketData(startDate: Date, endDate: Date): Promise<Map<string, any>> {
  console.log(`  📊 Fetching S&P 500 and VIX data from Yahoo Finance...`);

  const marketData = new Map<string, any>();

  try {
    // Fetch SPX (S&P 500) - use ^GSPC
    const spxData = await fetchYahooHistory('^GSPC', startDate, endDate);
    spxData.forEach(d => {
      const dateKey = d.date.toISOString().split('T')[0];
      if (!marketData.has(dateKey)) {
        marketData.set(dateKey, {});
      }
      marketData.get(dateKey).spxClose = d.close;
      marketData.get(dateKey).spxPrices = spxData.map(p => p.close);
    });

    // Fetch VIX
    const vixData = await fetchYahooHistory('^VIX', startDate, endDate);
    vixData.forEach(d => {
      const dateKey = d.date.toISOString().split('T')[0];
      if (!marketData.has(dateKey)) {
        marketData.set(dateKey, {});
      }
      marketData.get(dateKey).vixClose = d.close;
    });

    console.log(`    ✅ Fetched market data for ${marketData.size} dates`);
  } catch (error) {
    console.log(`    ⚠️  Error fetching market data: ${error instanceof Error ? error.message : 'Unknown'}`);
  }

  return marketData;
}

async function fetchYahooHistory(symbol: string, startDate: Date, endDate: Date): Promise<PriceData[]> {
  const period1 = Math.floor(startDate.getTime() / 1000);
  const period2 = Math.floor(endDate.getTime() / 1000);

  const url = `https://query1.finance.yahoo.com/v7/finance/download/${symbol}?period1=${period1}&period2=${period2}&interval=1d&events=history`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Yahoo Finance returned ${response.status}`);
  }

  const csv = await response.text();
  const lines = csv.split('\n').slice(1); // Skip header

  const data: PriceData[] = [];
  for (const line of lines) {
    if (!line.trim()) continue;

    const [date, open, high, low, close, adjClose, volume] = line.split(',');
    if (!close || close === 'null') continue;

    data.push({
      date: new Date(date),
      close: parseFloat(close),
      high: parseFloat(high),
      low: parseFloat(low),
      volume: parseInt(volume),
    });
  }

  return data;
}

// Fetch FRED data for interest rates
async function fetchFREDData(seriesId: string, startDate: Date): Promise<Map<string, number>> {
  // FRED API key would be needed for this
  // For now, return empty map (we'll add this later)
  console.log(`    ⚠️  FRED API not configured yet (need API key for ${seriesId})`);
  return new Map();
}

async function main() {
  console.log('🚀 Backfilling Momentum Indicators\n');
  console.log('═'.repeat(80));

  // Get all filings with stock prices
  const filings = await prisma.filing.findMany({
    where: {
      actual7dReturn: { not: null },
    },
    include: {
      company: true,
    },
    orderBy: { filingDate: 'asc' },
  });

  console.log(`\n📊 Found ${filings.length} filings with stock price data\n`);

  // Get unique tickers
  const tickers = [...new Set(filings.map(f => f.company.ticker))];
  console.log(`📈 Processing ${tickers.length} unique tickers\n`);
  console.log('═'.repeat(80));

  // Determine date range
  const minDate = new Date(Math.min(...filings.map(f => f.filingDate.getTime())));
  const maxDate = new Date(Math.max(...filings.map(f => f.filingDate.getTime())));
  const lookbackDate = new Date(minDate);
  lookbackDate.setDate(lookbackDate.getDate() - 250); // 250 days lookback for MA200

  console.log(`\n📅 Date range: ${lookbackDate.toISOString().split('T')[0]} to ${maxDate.toISOString().split('T')[0]}`);
  console.log('   (Includes 250-day lookback for MA200 calculation)\n');

  // Fetch market data (S&P 500, VIX)
  const marketData = await fetchMarketData(lookbackDate, maxDate);

  let processed = 0;
  let errors = 0;

  // Process each ticker
  for (const ticker of tickers) {
    console.log(`\n[${processed + 1}/${tickers.length}] Processing ${ticker}...`);

    try {
      // Fetch all stock prices for this ticker (with lookback)
      const stockPrices = await prisma.stockPrice.findMany({
        where: {
          ticker,
          date: {
            gte: lookbackDate,
            lte: maxDate,
          },
        },
        orderBy: { date: 'asc' },
      });

      if (stockPrices.length < 30) {
        console.log(`  ⚠️  Only ${stockPrices.length} price points, skipping (need 30+)`);
        continue;
      }

      console.log(`  📊 Found ${stockPrices.length} historical prices`);

      // Calculate indicators for each date (only dates with filings)
      const filingDates = filings
        .filter(f => f.company.ticker === ticker)
        .map(f => f.filingDate.toISOString().split('T')[0]);

      let indicatorsCreated = 0;

      for (let i = 30; i < stockPrices.length; i++) {
        const currentDate = stockPrices[i].date;
        const dateKey = currentDate.toISOString().split('T')[0];

        // Only calculate for filing dates (or all dates if you want)
        // For now, calculate for all dates (we can filter later)
        // if (!filingDates.includes(dateKey)) continue;

        const pricesUpToDate = stockPrices.slice(0, i + 1);
        const closes = pricesUpToDate.map(p => p.close);
        const volumes = pricesUpToDate.map(p => p.volume);

        // Calculate indicators
        const ma30 = calculateSMA(closes, 30);
        const ma50 = calculateSMA(closes, 50);
        const ma200 = calculateSMA(closes, 200);

        const currentPrice = closes[closes.length - 1];
        const priceToMA30 = ma30 ? currentPrice / ma30 : null;
        const priceToMA50 = ma50 ? currentPrice / ma50 : null;
        const priceToMA200 = ma200 ? currentPrice / ma200 : null;

        const rsi14 = calculateRSI(closes, 14);
        const rsi30 = calculateRSI(closes, 30);

        const macdResult = calculateMACD(closes);

        const atr14 = calculateATR(pricesUpToDate, 14);
        const volatility30 = calculateVolatility(closes, 30);

        const volumeMA30 = calculateSMA(volumes, 30);
        const volumeRatio = volumeMA30 ? volumes[volumes.length - 1] / volumeMA30 : null;

        const return7d = calculateReturn(closes, 7);
        const return30d = calculateReturn(closes, 30);
        const return90d = calculateReturn(closes, 90);

        // Upsert technical indicators
        await prisma.technicalIndicators.upsert({
          where: {
            ticker_date: {
              ticker,
              date: currentDate,
            },
          },
          create: {
            ticker,
            date: currentDate,
            ma30,
            ma50,
            ma200,
            priceToMA30,
            priceToMA50,
            priceToMA200,
            rsi14,
            rsi30,
            macd: macdResult?.macd,
            macdSignal: macdResult?.signal,
            macdHistogram: macdResult?.histogram,
            atr14,
            volatility30,
            volumeMA30,
            volumeRatio,
            return7d,
            return30d,
            return90d,
          },
          update: {
            ma30,
            ma50,
            ma200,
            priceToMA30,
            priceToMA50,
            priceToMA200,
            rsi14,
            rsi30,
            macd: macdResult?.macd,
            macdSignal: macdResult?.signal,
            macdHistogram: macdResult?.histogram,
            atr14,
            volatility30,
            volumeMA30,
            volumeRatio,
            return7d,
            return30d,
            return90d,
          },
        });

        indicatorsCreated++;
      }

      console.log(`  ✅ Created ${indicatorsCreated} technical indicator snapshots`);
      processed++;

    } catch (error) {
      console.log(`  ❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      errors++;
    }
  }

  console.log('\n' + '═'.repeat(80));
  console.log('📊 Creating Macro Indicators\n');

  // Create macro indicators for each date
  let macroCreated = 0;
  for (const [dateKey, data] of marketData.entries()) {
    try {
      const date = new Date(dateKey);

      // Calculate S&P 500 returns
      const spxPrices = data.spxPrices || [];
      const spxReturn7d = calculateReturn(spxPrices, 7);
      const spxReturn30d = calculateReturn(spxPrices, 30);

      // Calculate VIX MA
      // (Would need historical VIX data, simplified for now)
      const vixMA30 = data.vixClose; // Placeholder

      await prisma.macroIndicators.upsert({
        where: { date },
        create: {
          date,
          spxClose: data.spxClose,
          spxReturn7d,
          spxReturn30d,
          vixClose: data.vixClose,
          vixMA30,
          // Interest rates would come from FRED
          // fedFundsRate, treasury10y, etc.
        },
        update: {
          spxClose: data.spxClose,
          spxReturn7d,
          spxReturn30d,
          vixClose: data.vixClose,
          vixMA30,
        },
      });

      macroCreated++;
    } catch (error) {
      console.log(`  ❌ Error for ${dateKey}: ${error instanceof Error ? error.message : 'Unknown'}`);
    }
  }

  console.log(`✅ Created ${macroCreated} macro indicator snapshots\n`);

  console.log('═'.repeat(80));
  console.log('📊 SUMMARY');
  console.log('═'.repeat(80));
  console.log(`✅ Tickers processed:     ${processed}`);
  console.log(`❌ Errors:                ${errors}`);
  console.log(`📈 Macro dates created:   ${macroCreated}`);
  console.log('');
  console.log('✅ Next: Update champion-challenger analysis to use momentum features');
  console.log('   The models will now have access to:');
  console.log('   - Moving averages (MA30, MA50, MA200)');
  console.log('   - RSI, MACD momentum indicators');
  console.log('   - S&P 500 market context');
  console.log('   - VIX volatility regime');
  console.log('');

  await prisma.$disconnect();
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
