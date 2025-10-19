import { createPaperPortfolio } from '../lib/paper-trading';

/**
 * Initialize paper trading portfolio
 *
 * Creates a new portfolio with $100,000 starting capital
 */
async function main() {
  console.log('Initializing paper trading portfolio...\n');

  const portfolioId = await createPaperPortfolio(
    'Main Portfolio',
    100000.00,
    {
      maxPositionSize: 0.10,      // Max 10% per position
      minConfidence: 0.60         // Only trade if model confidence > 60%
    }
  );

  console.log(`\n✅ Portfolio created successfully!`);
  console.log(`Portfolio ID: ${portfolioId}`);
  console.log(`\nSettings:`);
  console.log(`  - Starting Capital: $100,000`);
  console.log(`  - Max Position Size: 10% ($10,000)`);
  console.log(`  - Min Confidence: 60%`);
  console.log(`  - Hold Period: 7 days (auto-close)`);
  console.log(`\nTrading Rules:`);
  console.log(`  ✓ Only trade filings with model confidence > 60%`);
  console.log(`  ✓ Only trade if predicted return > 2%`);
  console.log(`  ✓ Position size based on Kelly Criterion (confidence × return)`);
  console.log(`  ✓ Maximum 10% of portfolio per position`);
  console.log(`  ✓ Automatically close all positions after 7 days`);
  console.log(`  ✓ $1 commission per trade (realistic fees)`);
  console.log(`\nNext Steps:`);
  console.log(`  1. Add PORTFOLIO_ID="${portfolioId}" to your .env file`);
  console.log(`  2. Deploy to Vercel (cron job will auto-close positions daily)`);
  console.log(`  3. Model will automatically trade on new SEC filings`);
  console.log(`\nView Portfolio:`);
  console.log(`  GET /api/paper-trading/portfolio/${portfolioId}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });
