/**
 * Test script to demonstrate regime-based model behavior
 * Shows how predictions change across bull/flat/bear markets and with flight-to-quality
 */

interface TestScenario {
  name: string;
  baseFactors: {
    riskDelta: number;
    sentiment: number;
    epsSurprise: 'beat' | 'miss';
    epsMagnitude: number;
  };
  marketScenarios: Array<{
    regime: 'bull' | 'flat' | 'bear';
    momentum: number;
    volatility: number;
    flightToQuality: boolean;
  }>;
  company: {
    ticker: string;
    marketCap: number; // in billions
    peRatio: number;
  };
}

// Test scenarios
const scenarios: TestScenario[] = [
  {
    name: 'Mega Cap Tech - EPS Miss',
    baseFactors: {
      riskDelta: 5,
      sentiment: 0,
      epsSurprise: 'miss',
      epsMagnitude: -10,
    },
    company: {
      ticker: 'AAPL',
      marketCap: 3800, // Mega cap
      peRatio: 39,
    },
    marketScenarios: [
      { regime: 'bull', momentum: 6, volatility: 7, flightToQuality: false },
      { regime: 'bull', momentum: 6, volatility: 25, flightToQuality: true }, // High vol bull
      { regime: 'flat', momentum: 1, volatility: 12, flightToQuality: false },
      { regime: 'bear', momentum: -8, volatility: 30, flightToQuality: true }, // Panic
    ],
  },
  {
    name: 'Small Cap - EPS Miss',
    baseFactors: {
      riskDelta: 5,
      sentiment: 0,
      epsSurprise: 'miss',
      epsMagnitude: -10,
    },
    company: {
      ticker: 'SMOL',
      marketCap: 5, // Small cap
      peRatio: 20,
    },
    marketScenarios: [
      { regime: 'bull', momentum: 6, volatility: 7, flightToQuality: false },
      { regime: 'bull', momentum: 6, volatility: 25, flightToQuality: true }, // Flight from small caps
      { regime: 'flat', momentum: 1, volatility: 12, flightToQuality: false },
      { regime: 'bear', momentum: -8, volatility: 30, flightToQuality: true }, // Panic sell
    ],
  },
  {
    name: 'Mega Cap Tech - EPS Beat',
    baseFactors: {
      riskDelta: -2,
      sentiment: 0.3,
      epsSurprise: 'beat',
      epsMagnitude: 8,
    },
    company: {
      ticker: 'MSFT',
      marketCap: 3200,
      peRatio: 35,
    },
    marketScenarios: [
      { regime: 'bull', momentum: 6, volatility: 7, flightToQuality: false }, // Amplified upside
      { regime: 'flat', momentum: 1, volatility: 12, flightToQuality: false }, // Fundamentals matter
      { regime: 'bear', momentum: -8, volatility: 30, flightToQuality: true }, // Rally gets sold
    ],
  },
];

// Simulate prediction calculation
function simulatePrediction(
  baseFactors: TestScenario['baseFactors'],
  company: TestScenario['company'],
  market: TestScenario['marketScenarios'][0]
): { prediction: number; reasoning: string[] } {
  let prediction = 0;
  const reasoning: string[] = [];

  // Factor 1: Risk delta
  const riskImpact = baseFactors.riskDelta * -0.5;
  prediction += riskImpact;
  reasoning.push(`Risk: ${baseFactors.riskDelta > 0 ? '+' : ''}${baseFactors.riskDelta} points → ${riskImpact.toFixed(2)}%`);

  // Factor 2: Sentiment
  if (baseFactors.sentiment !== 0) {
    const sentimentImpact = baseFactors.sentiment * 4;
    prediction += sentimentImpact;
    reasoning.push(`Sentiment: ${baseFactors.sentiment} → ${sentimentImpact.toFixed(2)}%`);
  }

  // Factor 3: EPS Surprise (with P/E multiplier)
  const peMultiplier = company.peRatio > 40 ? 1.5 : company.peRatio > 25 ? 1.2 : 1.0;
  const capMultiplier = company.marketCap > 200 ? 1.3 : company.marketCap < 10 ? 0.9 : 1.0;
  const combinedMultiplier = peMultiplier * capMultiplier;

  let epsImpact = 0;
  if (baseFactors.epsSurprise === 'miss') {
    epsImpact = -2.3 * combinedMultiplier;
    if (baseFactors.epsMagnitude < -5) {
      epsImpact -= 1.6 * combinedMultiplier;
    }
  } else if (baseFactors.epsSurprise === 'beat') {
    epsImpact = 1.0 * combinedMultiplier;
    if (baseFactors.epsMagnitude > 5) {
      epsImpact += 0.8 * combinedMultiplier;
    }
  }
  prediction += epsImpact;
  reasoning.push(`EPS ${baseFactors.epsSurprise}: ${baseFactors.epsMagnitude}% → ${epsImpact.toFixed(2)}%`);

  // Factor 4: Filing type (10-Q)
  const filingImpact = -0.3;
  prediction += filingImpact;

  // REGIME-BASED MARKET FACTORS
  const momentumWeight = market.regime === 'bull' ? 0.20 : market.regime === 'bear' ? 0.18 : 0.10;
  const directImpact = market.momentum * momentumWeight;

  let dampeningFactor = 0;
  if (market.regime === 'bull') {
    if (prediction < 0) {
      dampeningFactor = prediction * 0.50; // BTFD: Dampen negative 50%
      reasoning.push(`Bull market: BTFD dampens negative by 50%`);
    } else {
      dampeningFactor = prediction * 0.15; // Amplify positive 15%
      reasoning.push(`Bull market: Momentum amplifies positive by 15%`);
    }
  } else if (market.regime === 'bear') {
    if (prediction > 0) {
      dampeningFactor = -prediction * 0.50; // STFR: Dampen positive 50%
      reasoning.push(`Bear market: STFR dampens positive by 50%`);
    } else {
      dampeningFactor = prediction * 0.20; // Amplify negative 20%
      reasoning.push(`Bear market: Fear amplifies negative by 20%`);
    }
  } else {
    reasoning.push(`Flat market: Fundamentals drive (no dampening)`);
  }

  // Flight-to-quality
  let flightImpact = 0;
  if (market.flightToQuality) {
    if (company.marketCap > 200) {
      flightImpact = 1.5;
      reasoning.push(`Flight-to-quality: Mega cap benefits +${flightImpact.toFixed(1)}%`);
    } else if (company.marketCap < 50) {
      flightImpact = company.marketCap < 10 ? -2.0 : -1.0;
      reasoning.push(`Flight-to-quality: Small/mid cap suffers ${flightImpact.toFixed(1)}%`);
    }
  }

  prediction += directImpact + dampeningFactor + flightImpact;
  reasoning.push(
    `Market: ${market.regime} (+${market.momentum.toFixed(1)}% SPY, ${market.volatility.toFixed(0)}% vol) → Total: ${(directImpact + dampeningFactor + flightImpact).toFixed(2)}%`
  );

  // Historical
  prediction += 0.3;

  // Cap at -10% to +10%
  const uncapped = prediction;
  prediction = Math.max(-10, Math.min(10, prediction));

  if (uncapped !== prediction) {
    reasoning.push(`⚠️ Capped: ${uncapped.toFixed(2)}% → ${prediction.toFixed(2)}%`);
  }

  return { prediction, reasoning };
}

// Run simulations
console.log('═══════════════════════════════════════════════════════════════');
console.log('REGIME-BASED MODEL SIMULATION');
console.log('Shows how same fundamentals produce different predictions');
console.log('across bull/flat/bear markets and with flight-to-quality');
console.log('═══════════════════════════════════════════════════════════════\n');

for (const scenario of scenarios) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`📊 ${scenario.name}`);
  console.log(`${'-'.repeat(70)}`);
  console.log(`Company: ${scenario.company.ticker} ($${scenario.company.marketCap}B market cap, ${scenario.company.peRatio} P/E)`);
  console.log(
    `Base: Risk ${scenario.baseFactors.riskDelta > 0 ? '+' : ''}${scenario.baseFactors.riskDelta}, ` +
    `EPS ${scenario.baseFactors.epsSurprise} ${scenario.baseFactors.epsMagnitude}%`
  );
  console.log('');

  for (const market of scenario.marketScenarios) {
    const result = simulatePrediction(scenario.baseFactors, scenario.company, market);

    console.log(`\n📈 ${market.regime.toUpperCase()} Market (SPY ${market.momentum > 0 ? '+' : ''}${market.momentum}%, vol ${market.volatility}%)${market.flightToQuality ? ' [HIGH VOL]' : ''}`);
    console.log(`   Prediction: ${result.prediction > 0 ? '+' : ''}${result.prediction.toFixed(2)}%`);
    console.log(`   Logic:`);
    result.reasoning.forEach((r) => console.log(`     • ${r}`));
  }
}

console.log('\n\n═══════════════════════════════════════════════════════════════');
console.log('KEY INSIGHTS:');
console.log('═══════════════════════════════════════════════════════════════');
console.log('1. BULL MARKETS: Bad news gets dampened (BTFD), good news amplified');
console.log('2. BEAR MARKETS: Good news gets dampened (STFR), bad news amplified');
console.log('3. FLAT MARKETS: Fundamentals matter most (stock-picker market)');
console.log('4. FLIGHT-TO-QUALITY: Mega caps benefit, small/mid caps suffer');
console.log('5. High P/E stocks react MORE to surprises (priced for perfection)');
console.log('═══════════════════════════════════════════════════════════════\n');
