/**
 * @module lib/ml-prediction
 * @description Extracts 42 financial features from SEC filings and market data, then calls Python ML model to predict 7-day stock price returns with confidence scores
 *
 * PURPOSE:
 * - Fetches company fundamentals, analyst ratings, and historical price data from Prisma DB and Yahoo Finance API
 * - Calculates technical indicators (RSI, MACD, moving averages, volatility) and market context (SPX returns, VIX)
 * - Marshals features into JSON payload and executes Python prediction script via child_process
 * - Parses ML model output to return predicted 7-day return percentage and confidence score (0-1)
 *
 * DEPENDENCIES:
 * - child_process - Spawns Python ML prediction script as subprocess with feature JSON
 * - util - Promisifies exec for async/await Python script execution
 * - ./prisma - Queries companies and filings tables for concernLevel, analyst activity, and fundamental metrics
 * - yahoo-finance2 - Fetches real-time quotes, historical prices, analyst targets, and market indices (SPX, VIX)
 *
 * EXPORTS:
 * - MLPredictionInput (interface) - Shape with filingId, ticker, filingType, filingDate for prediction request
 * - MLPredictionResult (interface) - Shape with predicted7dReturn (percentage) and predictionConfidence (0-1 score)
 * - extractMLFeatures (function) - Computes 42 feature values including technicals, fundamentals, analyst data, and market context from DB and Yahoo Finance
 * - generateMLPrediction (function) - Orchestrates feature extraction, Python script execution, and result parsing to return ML prediction
 *
 * PATTERNS:
 * - Call await generateMLPrediction({ filingId, ticker, filingType, filingDate }) to get { predicted7dReturn, predictionConfidence }
 * - extractMLFeatures can be called independently to inspect feature values before prediction
 * - Python script must exist at scripts/predict_single_filing.py and accept JSON via command-line argument
 * - Wrap calls in try/catch as Yahoo Finance API failures throw errors (historical prices, VIX, SPX data)
 *
 * CLAUDE NOTES:
 * - Uses shell-escaped JSON string passed to Python script - vulnerable to command injection if input contains malicious strings
 * - Falls back to neutral defaults (RSI=50, riskScore=5, VIX=20) when Yahoo Finance API calls fail to prevent prediction crashes
 * - Calculates annualized volatility as sqrt(variance) * sqrt(252) * 100 assuming 252 trading days per year
 * - Analyst activity (upgrades/downgrades) parsed from filing.analysisData JSON field with extensive error handling for missing/malformed data
 * - Legacy riskScore and sentimentScore fixed at neutral values (5, 0) - code comment indicates concernLevel will replace them in future model versions
 * - Market cap categories (mega/large/mid/small) use thresholds: $200B, $10B, $2B for tier boundaries
 */
import { exec } from 'child_process';
import { promisify } from 'util';
import { prisma } from './prisma';
import yahooFinance from './yahoo-finance-singleton';

const execAsync = promisify(exec);

export interface MLPredictionInput {
  filingId: string;
  ticker: string;
  filingType: string;
  filingDate: Date;
}

export interface MLPredictionResult {
  predicted7dReturn: number;
  predictionConfidence: number;
}

/**
 * Extract all ML features for a filing
 * This matches the 42 features required by the trained model
 */
export async function extractMLFeatures(input: MLPredictionInput) {
  const { filingId, ticker, filingType, filingDate } = input;

  // Fetch company data
  const company = await prisma.company.findUnique({
    where: { ticker }
  });

  if (!company) {
    throw new Error(`Company not found: ${ticker}`);
  }

  // Fetch filing to get concernLevel and analyst activity data
  const filing = await prisma.filing.findUnique({
    where: { id: filingId },
    select: {
      concernLevel: true,
      analysisData: true
    }
  });

  // Extract analyst activity from analysisData JSON
  let upgradesLast30d = 0;
  let downgradesLast30d = 0;
  let netUpgrades = 0;
  let majorUpgrades = 0;
  let majorDowngrades = 0;

  if (filing?.analysisData) {
    try {
      const analysis = typeof filing.analysisData === 'string'
        ? JSON.parse(filing.analysisData)
        : filing.analysisData;

      if (analysis.analyst?.activity) {
        upgradesLast30d = analysis.analyst.activity.upgradesLast30d || 0;
        downgradesLast30d = analysis.analyst.activity.downgradesLast30d || 0;
        netUpgrades = analysis.analyst.activity.netUpgrades || 0;
        majorUpgrades = analysis.analyst.activity.majorUpgrades || 0;
        majorDowngrades = analysis.analyst.activity.majorDowngrades || 0;

        console.log(`[ML Features] Extracted analyst activity for ${ticker}:`, {
          upgradesLast30d,
          downgradesLast30d,
          netUpgrades,
          majorUpgrades,
          majorDowngrades
        });
      } else {
        console.warn(`[ML Features] No analyst activity data found in analysisData for ${ticker}`);
      }
    } catch (error) {
      console.error(`[ML Features] Error parsing analysisData for ${ticker}:`, error);
    }
  } else {
    console.warn(`[ML Features] No analysisData found for filing ${filingId}`);
  }

  // Fetch latest Yahoo Finance data
  let yahooData;
  try {
    yahooData = await yahooFinance.quoteSummary(ticker, {
      modules: ['summaryDetail', 'price', 'financialData', 'defaultKeyStatistics']
    });
  } catch (error) {
    console.warn(`Failed to fetch Yahoo data for ${ticker}:`, error);
    yahooData = null;
  }

  // Get current price and market cap
  const currentPrice = yahooData?.price?.regularMarketPrice || company.currentPrice || 0;
  const marketCap = yahooData?.price?.marketCap || company.marketCap || 0;

  // Calculate market cap category
  let marketCapCategory = 'small';
  if (marketCap >= 200_000_000_000) marketCapCategory = 'mega';
  else if (marketCap >= 10_000_000_000) marketCapCategory = 'large';
  else if (marketCap >= 2_000_000_000) marketCapCategory = 'mid';

  // Get analyst data from Yahoo Finance
  const analystTargetPrice = yahooData?.financialData?.targetMeanPrice || company.analystTargetPrice || 0;
  const analystCoverage = yahooData?.financialData?.numberOfAnalystOpinions || 0;

  // Calculate analyst upside potential
  const analystUpsidePotential = currentPrice > 0 && analystTargetPrice > 0
    ? ((analystTargetPrice - currentPrice) / currentPrice) * 100
    : 0;

  // Calculate analyst consensus score (-1 to +1 based on recommendation)
  // Yahoo: 1=Strong Buy, 2=Buy, 3=Hold, 4=Sell, 5=Strong Sell
  const recommendation = yahooData?.financialData?.recommendationMean || 3;
  const analystConsensusScore = (3 - recommendation) / 2; // Maps to -1 to +1

  // Fetch historical prices for momentum indicators
  const sixtyDaysAgo = new Date(filingDate);
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

  const thirtyDaysAgo = new Date(filingDate);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Batch all Yahoo Finance API calls together
  let historicalPrices;
  let spxData;
  let vixData;

  try {
    [historicalPrices, spxData, vixData] = await Promise.all([
      yahooFinance.chart(ticker, {
        period1: sixtyDaysAgo,
        period2: filingDate,
        interval: '1d'
      }).catch(error => {
        console.warn(`Failed to fetch historical prices for ${ticker}:`, error);
        return null;
      }),
      yahooFinance.chart('^GSPC', {
        period1: thirtyDaysAgo,
        period2: filingDate,
        interval: '1d'
      }).catch(error => {
        console.warn('Failed to fetch SPX data:', error);
        return null;
      }),
      yahooFinance.chart('^VIX', {
        period1: filingDate,
        period2: filingDate,
        interval: '1d'
      }).catch(error => {
        console.warn('Failed to fetch VIX data:', error);
        return null;
      })
    ]);
  } catch (error) {
    console.warn('Failed to fetch market data:', error);
    historicalPrices = null;
    spxData = null;
    vixData = null;
  }

  const quotes = historicalPrices?.quotes || [];
  const closes = quotes.map(q => q.close).filter(c => c != null) as number[];

  // Calculate technical indicators
  const ma30 = closes.length >= 30 ? closes.slice(-30).reduce((a, b) => a + b, 0) / 30 : currentPrice;
  const ma50 = closes.length >= 50 ? closes.slice(-50).reduce((a, b) => a + b, 0) / 50 : currentPrice;
  const ma200 = closes.length >= 200 ? closes.slice(-200).reduce((a, b) => a + b, 0) / 200 : currentPrice;

  const priceToMA30 = currentPrice > 0 ? (currentPrice / ma30 - 1) * 100 : 0;
  const priceToMA50 = currentPrice > 0 ? (currentPrice / ma50 - 1) * 100 : 0;

  // RSI calculation (14-day)
  let rsi14 = 50; // Neutral default
  if (closes.length >= 15) {
    const changes = closes.slice(-15).map((price, i, arr) => i > 0 ? price - arr[i - 1] : 0).slice(1);
    const gains = changes.filter(c => c > 0);
    const losses = changes.filter(c => c < 0).map(c => Math.abs(c));
    const avgGain = gains.length > 0 ? gains.reduce((a, b) => a + b, 0) / 14 : 0;
    const avgLoss = losses.length > 0 ? losses.reduce((a, b) => a + b, 0) / 14 : 0;
    if (avgLoss > 0) {
      const rs = avgGain / avgLoss;
      rsi14 = 100 - (100 / (1 + rs));
    }
  }

  // MACD (12-day EMA - 26-day EMA)
  let macd = 0;
  if (closes.length >= 26) {
    const ema12 = calculateEMA(closes.slice(-12), 12);
    const ema26 = calculateEMA(closes.slice(-26), 26);
    macd = ((ema12 - ema26) / ema26) * 100; // As percentage
  }

  // Volatility (30-day standard deviation of returns)
  let volatility30 = 0;
  if (closes.length >= 30) {
    const returns = closes.slice(-30).map((price, i, arr) =>
      i > 0 ? (price - arr[i - 1]) / arr[i - 1] : 0
    ).slice(1);
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
    volatility30 = Math.sqrt(variance) * Math.sqrt(252) * 100; // Annualized %
  }

  // 30-day return
  const return30d = closes.length >= 30 ? ((closes[closes.length - 1] - closes[closes.length - 30]) / closes[closes.length - 30]) * 100 : 0;

  const spxCloses = spxData?.quotes?.map(q => q.close).filter(c => c != null) as number[] || [];
  const spxReturn7d = spxCloses.length >= 7 ? ((spxCloses[spxCloses.length - 1] - spxCloses[spxCloses.length - 7]) / spxCloses[spxCloses.length - 7]) * 100 : 0;
  const spxReturn30d = spxCloses.length >= 30 ? ((spxCloses[spxCloses.length - 1] - spxCloses[spxCloses.length - 30]) / spxCloses[spxCloses.length - 30]) * 100 : 0;

  const vixClose = vixData?.quotes?.[0]?.close || 20; // Default to neutral VIX

  // Get valuation ratios
  const peRatio = yahooData?.summaryDetail?.trailingPE || company.peRatio || 0;
  const forwardPE = yahooData?.summaryDetail?.forwardPE || company.forwardPE || 0;

  // 52-week high/low
  const fiftyTwoWeekHigh = yahooData?.summaryDetail?.fiftyTwoWeekHigh || 0;
  const fiftyTwoWeekLow = yahooData?.summaryDetail?.fiftyTwoWeekLow || 0;

  const priceToHigh = fiftyTwoWeekHigh > 0 ? (currentPrice / fiftyTwoWeekHigh - 1) * 100 : 0;
  const priceToLow = fiftyTwoWeekLow > 0 ? (currentPrice / fiftyTwoWeekLow - 1) * 100 : 0;
  const priceToTarget = analystTargetPrice > 0 ? (currentPrice / analystTargetPrice - 1) * 100 : 0;

  // Risk score and sentiment (would come from Claude analysis, use neutral defaults)
  // NOTE: These are legacy features from the original model. New analyses use concernLevel
  // which synthesizes risk, sentiment, and financial metrics into a single 0-10 score.
  // For historical compatibility, we keep these defaults. Future model versions should
  // replace riskScore+sentimentScore with concernLevel as primary feature.
  const riskScore = 5; // Neutral (legacy feature)
  const sentimentScore = 0; // Neutral (legacy feature)
  const concernLevel = filing?.concernLevel ?? 5.0; // Use actual concernLevel from filing, default to moderate if not yet analyzed

  // Build feature object matching ML model expectations
  const features = {
    filingType,
    riskScore,
    sentimentScore,
    concernLevel, // NEW: Will be primary feature in future model versions
    marketCap,
    currentPrice,
    peRatio,
    forwardPE,
    fiftyTwoWeekHigh,
    fiftyTwoWeekLow,
    analystTargetPrice,
    priceToHigh,
    priceToLow,
    priceToTarget,
    ma30,
    ma50,
    ma200,
    priceToMA30,
    priceToMA50,
    rsi14,
    macd,
    volatility30,
    return30d,
    spxReturn7d,
    spxReturn30d,
    vixClose,
    analystUpsidePotential,
    analystConsensusScore,
    analystCoverage,
    upgradesLast30d,
    downgradesLast30d,
    netUpgrades,
    majorUpgrades,
    majorDowngrades,
    marketCapCategory
  };

  return features;
}

/**
 * Calculate Exponential Moving Average
 */
function calculateEMA(prices: number[], period: number): number {
  if (prices.length === 0) return 0;

  const k = 2 / (period + 1);
  let ema = prices[0];

  for (let i = 1; i < prices.length; i++) {
    ema = prices[i] * k + ema * (1 - k);
  }

  return ema;
}

/**
 * Generate ML prediction for a filing
 */
export async function generateMLPrediction(input: MLPredictionInput): Promise<MLPredictionResult> {
  try {
    // Extract all features
    const features = await extractMLFeatures(input);

    // Call Python ML model
    const featuresJSON = JSON.stringify({
      ...input,
      ...features
    });

    const { stdout, stderr } = await execAsync(
      `python3 scripts/predict_single_filing.py '${featuresJSON.replace(/'/g, "'\\''")}'`
    );

    if (stderr) {
      console.warn('Python script stderr:', stderr);
    }

    // Parse result
    const result = JSON.parse(stdout);

    if (result.error) {
      throw new Error(`ML prediction error: ${result.error}`);
    }

    return {
      predicted7dReturn: result.predicted7dReturn,
      predictionConfidence: result.predictionConfidence
    };

  } catch (error: any) {
    console.error('Failed to generate ML prediction:', error);
    throw new Error(`ML prediction failed: ${error.message}`);
  }
}