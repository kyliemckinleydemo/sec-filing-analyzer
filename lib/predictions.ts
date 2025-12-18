/**
 * Prediction Engine
 * Pattern-based prediction system for stock price movements post-filing
 */

export interface PredictionFeatures {
  // From AI Analysis
  riskScoreDelta: number;
  sentimentScore: number;
  riskCountNew: number;
  concernLevel?: number; // 0-10 multi-factor concern assessment (synthesizes risk + sentiment + financials)

  // From Filing Meta
  filingType: '10-K' | '10-Q' | '8-K';
  eventType?: '8-K-earnings-announcement' | '8-K-earnings-release' | '8-K-other';

  // Financial Metrics - ENHANCED WITH SURPRISES
  hasFinancialMetrics?: boolean;
  guidanceDirection?: 'raised' | 'lowered' | 'maintained';
  guidanceChange?: 'raised' | 'lowered' | 'maintained' | 'new'; // vs prior period

  // Earnings Surprises (research-backed: asymmetric impact)
  epsSurprise?: 'beat' | 'miss' | 'inline' | 'unknown';
  epsSurpriseMagnitude?: number; // % difference from consensus
  revenueSurprise?: 'beat' | 'miss' | 'inline' | 'unknown';
  revenueSurpriseMagnitude?: number;

  // Historical Pattern (company-specific)
  avgHistoricalReturn: number; // Average return for similar filings
  ticker?: string; // For company-specific patterns

  // Valuation Context (NEW - affects surprise sensitivity)
  peRatio?: number; // P/E ratio - high P/E = more sensitive to surprises
  marketCap?: number; // Market cap in billions

  // Market Context (NEW - overall market momentum)
  marketMomentum?: number; // SPY 30-day return prior to filing (%)
  marketRegime?: 'bull' | 'flat' | 'bear'; // Market regime classification
  marketVolatility?: number; // Annualized volatility %
  flightToQuality?: boolean; // High volatility environment
  sectorMomentum?: number; // Sector ETF 30-day return (%)

  // Macro Economic Context (NEW - dollar and GDP)
  dollarStrength?: 'weak' | 'neutral' | 'strong'; // Weak dollar = bullish for equities
  dollar30dChange?: number; // % change (negative = weakening)
  gdpProxyTrend?: 'weak' | 'neutral' | 'strong'; // GDP sentiment
  equityFlowBias?: 'bullish' | 'neutral' | 'bearish'; // Overall macro bias

  // Analyst Activity (NEW - sentiment and momentum from coverage)
  analystNetUpgrades?: number; // upgrades - downgrades in 30d before filing
  analystMajorUpgrades?: number; // Major firm upgrades
  analystMajorDowngrades?: number; // Major firm downgrades
  analystConsensus?: number; // 0-100 scale (100 = Strong Buy consensus)
  analystUpsidePotential?: number; // % upside to target price
}

export interface Prediction {
  predicted7dReturn: number;
  confidence: number;
  reasoning: string;
  features: PredictionFeatures;
}

class PredictionEngine {
  /**
   * Research-backed prediction model (2024-2025 academic findings)
   *
   * Based on:
   * - 2024 Q3 earnings data: EPS beats +1.3%, misses -2.9% (asymmetric)
   * - 2025 research: Risk factor tone predicts weekly returns
   * - Guidance changes have 3-5%+ impact
   * - Revenue/cash flow surprises matter for low-quality earnings
   */
  async predict(
    features: Partial<PredictionFeatures>
  ): Promise<Prediction> {
    // BASELINE ADJUSTMENT: Recalibrated based on 741-sample backtest (2025-12-17)
    // Previous: +0.83% (too optimistic, 35.9% bullish over-prediction)
    // New: 0.0% (neutral baseline, let features drive predictions)
    // Actual mean return from backtest: +0.66%, but using 0% for conservative start
    let prediction = 0.0;
    const reasoningParts: string[] = ['Baseline: 0.0% (recalibrated neutral)'];

    // Factor 1: Risk Score Impact (Research: significant predictor)
    // RECALIBRATION 2025-12-17: Increased weight from 0.8 to 1.2 to counter bullish bias
    // Risk score deltas are strong signals but were underweighted
    const riskDelta = features.riskScoreDelta || 0;
    const riskImpact = -riskDelta * 1.2; // Lower risk = positive impact (was 0.8, now 1.2)
    prediction += riskImpact;

    if (Math.abs(riskDelta) > 1) {
      reasoningParts.push(
        `Risk ${riskDelta > 0 ? 'increased' : 'decreased'} by ${Math.abs(riskDelta).toFixed(1)} points (${riskImpact > 0 ? '+' : ''}${riskImpact.toFixed(2)}% impact)`
      );
    }

    // Factor 2: Sentiment Impact (MD&A tone analysis)
    // CONCERN-ADJUSTED: Sentiment is only valuable when aligned with fundamentals
    // High concern + positive sentiment = red flag (management overconfidence)
    // Low concern + positive sentiment = confirmation (justified confidence)
    const sentiment = features.sentimentScore || 0;
    const concernLevel = features.concernLevel ?? 5.0; // Get concern early for sentiment adjustment

    // Sentiment damping based on concern level
    // concernLevel 7+ (HIGH): Positive sentiment is suspect, gets inverted
    // concernLevel 5-7 (ELEVATED): Positive sentiment dampened to 50%
    // concernLevel <5 (LOW/MODERATE): Sentiment applied normally
    let sentimentMultiplier = 2.0; // Base weight reduced from 3
    if (concernLevel >= 7 && sentiment > 0) {
      // High concern + optimistic tone = management disconnected from reality (red flag)
      sentimentMultiplier = -1.0; // Invert positive sentiment to negative impact
      reasoningParts.push(
        `⚠️ Management tone misalignment: Optimistic sentiment (${sentiment.toFixed(2)}) contradicts HIGH concern level (${concernLevel.toFixed(1)}/10) (${(sentiment * sentimentMultiplier).toFixed(2)}% penalty)`
      );
    } else if (concernLevel >= 5 && concernLevel < 7 && sentiment > 0) {
      // Elevated concern: dampen optimistic sentiment by 50%
      sentimentMultiplier = 1.0;
    } else if (Math.abs(sentiment) > 0.2) {
      // Normal case: sentiment aligned with concern or concern is low
      reasoningParts.push(
        `${sentiment > 0 ? 'Positive' : 'Negative'} management sentiment (${(sentiment * sentimentMultiplier).toFixed(2)}% impact)`
      );
    }

    const sentimentImpact = sentiment * sentimentMultiplier;
    prediction += sentimentImpact;

    // Factor 2b: Concern Level Assessment (NEW - Claude AI multi-factor risk scoring)
    // Synthesizes risk factors, sentiment, financial metrics, legal issues into 0-10 scale
    // This replaces legacy hardcoded risk/sentiment with actual filing analysis
    // 0-2 (LOW/bullish), 3-4 (MODERATE/stable), 5-6 (ELEVATED/cautious), 7-8 (HIGH/bearish), 9-10 (CRITICAL)
    // Note: concernLevel already retrieved above for sentiment adjustment
    // RECALIBRATION 2025-12-17: Increased weight from 0.6 to 0.9 to counter bullish bias
    const concernImpact = -(concernLevel - 5.0) * 0.9; // Center at 5, invert (lower concern = positive)
    prediction += concernImpact;

    // Show concern assessment if it deviates meaningfully from neutral
    if (Math.abs(concernLevel - 5.0) > 0.5) {
      const concernLabel =
        concernLevel < 3 ? 'LOW' :
        concernLevel < 5 ? 'MODERATE' :
        concernLevel < 7 ? 'ELEVATED' :
        concernLevel < 9 ? 'HIGH' : 'CRITICAL';
      reasoningParts.push(
        `Concern level: ${concernLevel.toFixed(1)}/10 (${concernLabel}) (${concernImpact > 0 ? '+' : ''}${concernImpact.toFixed(2)}% impact)`
      );
    }

    // Factor 3: Earnings Surprises (Research: 2024 Q3 data shows asymmetric impact)
    // EPS beats: +1.3% avg, misses: -2.9% avg (market punishes misses 2x harder)
    // NEW: P/E multiplier - high P/E stocks react MORE to surprises
    // NEW: Market cap momentum - large caps get more buying pressure on beats
    // ADJUSTED: Reduced base weights by 20% after backtest showed oversensitivity
    const peMultiplier = this.calculatePEMultiplier(features.peRatio);
    const marketCapMultiplier = this.calculateMarketCapMultiplier(features.marketCap);
    const combinedMultiplier = peMultiplier * marketCapMultiplier;

    if (features.epsSurprise) {
      let epsSurpriseImpact = 0;

      if (features.epsSurprise === 'beat') {
        epsSurpriseImpact = 1.0 * combinedMultiplier; // Reduced from 1.3 to 1.0
        if (features.epsSurpriseMagnitude && features.epsSurpriseMagnitude > 5) {
          epsSurpriseImpact += 0.8 * combinedMultiplier; // Reduced from 1.0 to 0.8
          reasoningParts.push(`EPS beat by ${features.epsSurpriseMagnitude.toFixed(1)}% (+${epsSurpriseImpact.toFixed(1)}% impact${combinedMultiplier !== 1.0 ? `, ${combinedMultiplier.toFixed(1)}x adj` : ''})`);
        } else {
          reasoningParts.push(`EPS beat expectations (+${epsSurpriseImpact.toFixed(1)}% impact${combinedMultiplier !== 1.0 ? `, ${combinedMultiplier.toFixed(1)}x adj` : ''})`);
        }
      } else if (features.epsSurprise === 'miss') {
        // DATASET OPTIMIZATION: 278 filings show model was over-penalizing misses
        // 54.7% base positive rate means misses aren't as punitive as originally modeled
        epsSurpriseImpact = -1.0 * combinedMultiplier; // Optimized from -1.5 to -1.0
        if (features.epsSurpriseMagnitude && features.epsSurpriseMagnitude < -5) {
          epsSurpriseImpact -= 0.7 * combinedMultiplier; // Optimized from -1.0 to -0.7
          reasoningParts.push(`EPS missed by ${Math.abs(features.epsSurpriseMagnitude).toFixed(1)}% (${epsSurpriseImpact.toFixed(1)}% impact${combinedMultiplier !== 1.0 ? `, ${combinedMultiplier.toFixed(1)}x adj` : ''})`);
        } else {
          reasoningParts.push(`EPS missed expectations (${epsSurpriseImpact.toFixed(1)}% impact${combinedMultiplier !== 1.0 ? `, ${combinedMultiplier.toFixed(1)}x adj` : ''})`);
        }
      } else if (features.epsSurprise === 'inline') {
        // OPTIMIZATION: EPS inline has 75% accuracy in real data (highest!)
        // "No surprise" is the strongest predictor - market likes predictability
        // Inline results mean expectations were well-calibrated
        epsSurpriseImpact = 0.6 * combinedMultiplier; // Positive bias for inline
        reasoningParts.push(`EPS inline with expectations (+${epsSurpriseImpact.toFixed(1)}% impact - high predictability)`);
      }

      prediction += epsSurpriseImpact;
    }

    // Factor 4: Revenue Surprises (Research: important for low-quality earnings)
    if (features.revenueSurprise) {
      let revenueSurpriseImpact = 0;

      if (features.revenueSurprise === 'beat') {
        revenueSurpriseImpact = 0.8;
        reasoningParts.push(`Revenue beat expectations (+${revenueSurpriseImpact.toFixed(1)}% impact)`);
      } else if (features.revenueSurprise === 'miss') {
        revenueSurpriseImpact = -1.5;
        reasoningParts.push(`Revenue missed expectations (${revenueSurpriseImpact.toFixed(1)}% impact)`);
      }

      prediction += revenueSurpriseImpact;
    }

    // Factor 5: Guidance Changes (MAJOR DRIVER - research shows 3-5%+ impact)
    // Increased from 1.5% to research-backed levels
    if (features.guidanceChange) {
      let guidanceImpact = 0;

      if (features.guidanceChange === 'raised') {
        guidanceImpact = 3.5; // Major positive signal
        reasoningParts.push(`Raised forward guidance vs prior period (+${guidanceImpact.toFixed(1)}% impact)`);
      } else if (features.guidanceChange === 'lowered') {
        guidanceImpact = -4.0; // Major negative signal (asymmetric)
        reasoningParts.push(`Lowered forward guidance vs prior period (${guidanceImpact.toFixed(1)}% impact)`);
      } else if (features.guidanceChange === 'new') {
        guidanceImpact = 1.0; // New guidance is mildly positive
        reasoningParts.push(`Provided new forward guidance (+${guidanceImpact.toFixed(1)}% impact)`);
      }

      prediction += guidanceImpact;
    }

    // Factor 6: Filing Type Patterns
    let filingTypeImpact = 0;
    switch (features.filingType) {
      case '10-K':
        filingTypeImpact = 0.5; // Annual filings slightly positive
        reasoningParts.push('10-K annual filing');
        break;
      case '10-Q':
        filingTypeImpact = 0.3; // Quarterly filings neutral-positive
        reasoningParts.push('10-Q quarterly filing');
        break;
      case '8-K':
        // 8-K impact now primarily driven by surprises/guidance above
        if (features.eventType === '8-K-earnings-announcement') {
          filingTypeImpact = 0.1;
          reasoningParts.push('8-K earnings announcement');
        } else if (features.eventType === '8-K-earnings-release') {
          filingTypeImpact = 0.0; // Neutral base, surprises drive it
          reasoningParts.push('8-K earnings release');
        } else {
          filingTypeImpact = -0.5;
          reasoningParts.push('8-K material event');
        }
        break;
    }
    prediction += filingTypeImpact;

    // Factor 7: Market Regime & Flight-to-Quality (REGIME-BASED MODEL)
    // Research: Market conditions dramatically affect how news is interpreted
    // - Bull markets: Bad news gets bought (BTFD mentality), good news amplified
    // - Bear markets: Good news gets sold (STFR mentality), bad news amplified
    // - Flat markets: Fundamentals matter most (stock-picker's market)
    // - High volatility: Flight to quality (mega caps benefit, small/mid caps suffer)
    if (features.marketMomentum !== undefined && features.marketRegime) {
      // Direct impact: Market momentum baseline
      let momentumWeight = 0.15; // Base weight

      // Regime-specific weight adjustments
      if (features.marketRegime === 'bull') {
        momentumWeight = 0.20; // Bull markets have stronger momentum
      } else if (features.marketRegime === 'bear') {
        momentumWeight = 0.18; // Bear markets also have strong (negative) momentum
      } else {
        momentumWeight = 0.10; // Flat markets: fundamentals matter more
      }

      const directImpact = features.marketMomentum * momentumWeight;

      // Dampening/amplification based on regime
      let dampeningFactor = 0;

      if (features.marketRegime === 'bull') {
        // BULL MARKET BEHAVIOR
        if (prediction < 0) {
          // Bad news in bull market: "Buy the dip" mentality
          // DATASET OPTIMIZATION: 278 filings show 70% dampening more accurate
          dampeningFactor = prediction * 0.70; // Dampen by 70%
          reasoningParts.push(
            `Bull market: negative outlook dampened 70% (BTFD effect)`
          );
        } else if (prediction > 0) {
          // Good news in bull market: Amplified by momentum
          dampeningFactor = prediction * 0.15; // Amplify by 15%
          reasoningParts.push(
            `Bull market: positive outlook amplified 15% (momentum)`
          );
        }
      } else if (features.marketRegime === 'bear') {
        // BEAR MARKET BEHAVIOR
        if (prediction > 0) {
          // Good news in bear market: "Sell the rally" mentality
          dampeningFactor = -prediction * 0.50; // Dampen by 50%
          reasoningParts.push(
            `Bear market: positive outlook dampened 50% (STFR effect)`
          );
        } else if (prediction < 0) {
          // Bad news in bear market: Amplified by fear
          dampeningFactor = prediction * 0.20; // Amplify downside by 20%
          reasoningParts.push(
            `Bear market: negative outlook amplified 20% (fear)`
          );
        }
      }
      // Flat market: No dampening, fundamentals drive (stock-picker's market)

      // FLIGHT-TO-QUALITY ADJUSTMENT
      // High volatility = investors seek safety in mega caps (>$200B)
      let flightToQualityImpact = 0;
      if (features.flightToQuality && features.marketCap) {
        if (features.marketCap > 200) {
          // Mega cap: Benefits from flight to quality (+1% to +2%)
          flightToQualityImpact = 1.5;
          reasoningParts.push(
            `Flight-to-quality: mega cap benefits (+${flightToQualityImpact.toFixed(1)}%)`
          );
        } else if (features.marketCap < 50) {
          // Small/mid cap: Suffers from flight to quality (-1% to -2%)
          flightToQualityImpact = features.marketCap < 10 ? -2.0 : -1.0;
          reasoningParts.push(
            `Flight-to-quality: small/mid cap suffers (${flightToQualityImpact.toFixed(1)}%)`
          );
        }
      }

      // Apply all market factors
      prediction += directImpact + dampeningFactor + flightToQualityImpact;

      // Summary
      const totalImpact = directImpact + dampeningFactor + flightToQualityImpact;
      reasoningParts.push(
        `Market: ${features.marketRegime} regime, ${features.marketMomentum > 0 ? '+' : ''}${features.marketMomentum.toFixed(1)}% SPY${features.flightToQuality ? ', high-vol' : ''} (${totalImpact > 0 ? '+' : ''}${totalImpact.toFixed(2)}% total)`
      );
    }

    // Factor 8: Market Cap Effects (REGRESSION DISCOVERY)
    // Empirical analysis of 278 filings revealed NON-LINEAR market cap relationship:
    // - Small caps (<$200B): -0.69% mean, 40% positive → UNDERPERFORM
    // - Large caps ($200-500B): +1.33% mean, 57.6% positive → OUTPERFORM (key finding!)
    // - Mega caps ($500B-1T): +0.45% mean, 58.8% positive
    // - Ultra mega caps (>$1T): +0.85% mean, 54.2% positive
    //
    // Large caps ($200-500B) outperform due to:
    // - High institutional ownership without excessive expectations
    // - Strong liquidity for large orders
    // - "Goldilocks" size: big enough to be stable, small enough to grow
    //
    // Examples: HD (80% accuracy), JPM (75%), V (66.7%), MA (60%)
    let marketCapEffect = 0;
    if (features.marketCap) {
      if (features.marketCap < 200) {
        // Small caps: Underperform significantly
        marketCapEffect = -0.5;
        reasoningParts.push(`Small cap (<$200B): -0.5% penalty (high volatility, less institutional support)`);
      } else if (features.marketCap >= 200 && features.marketCap < 500) {
        // REGRESSION DISCOVERY: Large caps are the sweet spot!
        marketCapEffect = 1.0;
        reasoningParts.push(`Large cap ($200-500B): +1.0% premium (optimal size, strong institutions)`);

        // Bull market amplifies large cap effect
        if (features.marketRegime === 'bull') {
          marketCapEffect += 0.5;
          reasoningParts.push(`Large cap × bull market: +0.5% bonus`);
        }
      } else if (features.marketCap >= 500 && features.marketCap < 1000) {
        // Mega caps: Moderate performance
        marketCapEffect = 0.3;
        reasoningParts.push(`Mega cap ($500B-1T): +0.3% moderate premium`);
      } else {
        // Ultra mega caps (>$1T): Moderate performance
        marketCapEffect = 0.5;
        reasoningParts.push(`Ultra mega cap (>$1T): +0.5% premium`);
      }
    }
    prediction += marketCapEffect;

    // Factor 9: Mega-Cap Institutional Protection Floor
    // This is separate from market cap effect - it's a downside floor
    // Top 10 market cap companies (>$1T) have institutional support floor
    let megaCapProtection = 0;
    if (features.marketCap && features.marketCap > 1000 && prediction < 0) {
      // Top 10 mega caps (AAPL, MSFT, GOOGL, AMZN, NVDA, META, TSLA, BRK.B, etc.)

      // Set floor based on market regime
      let floor = -5.0; // Default floor in normal markets

      if (features.marketRegime === 'bull') {
        // DATASET OPTIMIZATION: 278 filings show mega caps hold -1.5% floor in bulls
        // Institutional buying is more aggressive than originally modeled
        floor = -1.5; // Stronger floor in bull markets (aggressive buying)
      } else if (features.marketRegime === 'bear') {
        floor = -7.0; // Wider downside in bear markets (less buying support)
      }

      if (prediction < floor) {
        megaCapProtection = floor - prediction;
        reasoningParts.push(
          `Mega-cap institutional floor: $${(features.marketCap / 1000).toFixed(1)}T cap → ${floor}% floor in ${features.marketRegime || 'normal'} market`
        );
      }
    }
    prediction += megaCapProtection;

    // Factor 10: Macro Economic Flows (Dollar & GDP)
    // Research: "Weak dollar forces capital into equities"
    // - Weak dollar = money flows OUT of USD assets INTO stocks (+bullish)
    // - Strong dollar = money flows INTO USD assets OUT OF stocks (-bearish)
    // - GDP strength = economic optimism = bullish for stocks
    let macroImpact = 0;
    if (features.dollarStrength || features.gdpProxyTrend) {
      // Dollar impact - DATASET OPTIMIZATION: Increased weights
      if (features.dollarStrength === 'weak') {
        macroImpact += 1.0; // Weak dollar pushes capital into equities
        reasoningParts.push(`Weak dollar drives equity inflows (+1.0%)`);
      } else if (features.dollarStrength === 'strong') {
        macroImpact -= 0.6; // Strong dollar pulls capital from equities
        reasoningParts.push(`Strong dollar pressures equities (-0.6%)`);
      }

      // GDP sentiment impact - DATASET OPTIMIZATION: Increased weights
      if (features.gdpProxyTrend === 'strong') {
        macroImpact += 0.7; // GDP optimism = bullish
        reasoningParts.push(`Strong GDP sentiment (+0.7%)`);
      } else if (features.gdpProxyTrend === 'weak') {
        macroImpact -= 0.5; // GDP pessimism = bearish
        reasoningParts.push(`Weak GDP sentiment (-0.5%)`);
      }

      // Combined macro bias
      if (macroImpact !== 0 && features.equityFlowBias) {
        reasoningParts.push(
          `Macro flow bias: ${features.equityFlowBias} (${macroImpact > 0 ? '+' : ''}${macroImpact.toFixed(2)}%)`
        );
      }
    }
    prediction += macroImpact;

    // Factor 11: Analyst Activity & Sentiment (NEW)
    // Research: Analyst upgrades/downgrades predict short-term momentum
    // - Upgrades in 30d before filing → positive momentum (+0.5% to +1.5%)
    // - Downgrades → negative momentum (-0.5% to -1.5%)
    // - Major firm activity carries 2x weight
    // - Consensus (Strong Buy) → bullish sentiment
    // - High upside potential → market undervalued
    let analystImpact = 0;

    // Net upgrades/downgrades impact
    if (features.analystNetUpgrades !== undefined && features.analystNetUpgrades !== 0) {
      // Base impact: 0.3% per net upgrade/downgrade
      let upgradeImpact = features.analystNetUpgrades * 0.3;

      // Major firm activity carries more weight
      if (features.analystMajorUpgrades && features.analystMajorUpgrades > 0) {
        upgradeImpact += features.analystMajorUpgrades * 0.5; // +0.5% per major upgrade
        reasoningParts.push(`${features.analystMajorUpgrades} major firm upgrade${features.analystMajorUpgrades > 1 ? 's' : ''} (+${(features.analystMajorUpgrades * 0.5).toFixed(1)}%)`);
      }

      if (features.analystMajorDowngrades && features.analystMajorDowngrades > 0) {
        upgradeImpact -= features.analystMajorDowngrades * 0.5; // -0.5% per major downgrade
        reasoningParts.push(`${features.analystMajorDowngrades} major firm downgrade${features.analystMajorDowngrades > 1 ? 's' : ''} (${(features.analystMajorDowngrades * -0.5).toFixed(1)}%)`);
      }

      // Cap analyst activity impact at ±2%
      upgradeImpact = Math.max(-2.0, Math.min(2.0, upgradeImpact));
      analystImpact += upgradeImpact;

      if (features.analystNetUpgrades > 0) {
        reasoningParts.push(`Analyst momentum: +${features.analystNetUpgrades} net upgrades (${upgradeImpact > 0 ? '+' : ''}${upgradeImpact.toFixed(2)}%)`);
      } else if (features.analystNetUpgrades < 0) {
        reasoningParts.push(`Analyst momentum: ${features.analystNetUpgrades} net downgrades (${upgradeImpact.toFixed(2)}%)`);
      }
    }

    // Analyst consensus impact (Strong Buy consensus is bullish)
    if (features.analystConsensus !== undefined) {
      // Scale: 0-100, where 100 = unanimous Strong Buy
      // Impact: 0.5% to 1.0% for very strong consensus (>80)
      if (features.analystConsensus > 80) {
        const consensusImpact = 0.8;
        analystImpact += consensusImpact;
        reasoningParts.push(`Strong analyst consensus (${features.analystConsensus}/100) (+${consensusImpact.toFixed(1)}%)`);
      } else if (features.analystConsensus < 40) {
        // Weak consensus (more sells) is bearish
        const consensusImpact = -0.5;
        analystImpact += consensusImpact;
        reasoningParts.push(`Weak analyst consensus (${features.analystConsensus}/100) (${consensusImpact.toFixed(1)}%)`);
      }
    }

    // Upside potential impact (market undervaluation)
    if (features.analystUpsidePotential !== undefined && Math.abs(features.analystUpsidePotential) > 10) {
      // Large upside (>10%) suggests market undervaluation → bullish
      // Large downside (<-10%) suggests overvaluation → bearish
      const upsideImpact = features.analystUpsidePotential > 0
        ? Math.min(1.0, features.analystUpsidePotential * 0.05) // Cap at +1%
        : Math.max(-1.0, features.analystUpsidePotential * 0.05); // Cap at -1%

      analystImpact += upsideImpact;
      reasoningParts.push(`Analyst target: ${features.analystUpsidePotential.toFixed(1)}% upside (${upsideImpact > 0 ? '+' : ''}${upsideImpact.toFixed(2)}%)`);
    }

    if (analystImpact !== 0) {
      prediction += analystImpact;
    }

    // Factor 12: Company-Specific Historical Patterns
    // Weight ticker-specific patterns more than generic ones
    const historical = features.avgHistoricalReturn || 0;
    if (historical !== 0) {
      const historicalWeight = features.ticker ? 0.4 : 0.2; // Higher weight for company-specific
      prediction += historical * historicalWeight;
      reasoningParts.push(
        `${features.ticker || 'Market'} historical pattern: ${historical > 0 ? '+' : ''}${historical.toFixed(2)}% avg`
      );
    }

    // RECALIBRATION 2025-12-17 (ROUND 2): Apply aggressive dampening factor
    // Backtest results after initial recalibration:
    // - 70.8% bullish predictions vs 32.2% actual bullish (38.6% over-prediction!)
    // - 51.5% of actual outcomes are FLAT but model only predicts 20.7% flat
    // - Directional accuracy: 30.6% (worse than random)
    //
    // Root cause: Model has too many additive positive biases:
    // - Filing type bonuses: +0.3-0.5%
    // - Market cap bonuses: +0.5-1.0%
    // - EPS inline bonus: +0.6%
    // - Macro factors: asymmetric positive (weak $ +1.0%, strong $ -0.6%)
    //
    // Solution: Apply 0.5x dampening factor to compress predictions toward zero
    // This will:
    // - Reduce bullish predictions from 70.8% toward 40-50%
    // - Increase neutral predictions from 20.7% toward 40-50% (matching reality)
    // - Better match reality where most filings result in minimal price movement
    const dampeningFactor = 0.5;
    prediction = prediction * dampeningFactor;
    reasoningParts.push(`Applied 0.5x dampening (model recalibration)`);

    // Calculate confidence based on feature availability
    let confidence = 0.4; // Base confidence (lowered from 0.5 to account for more factors)

    // High confidence indicators
    if (features.epsSurprise && features.epsSurprise !== 'unknown') confidence += 0.20;
    if (features.guidanceChange && features.guidanceChange !== 'maintained') confidence += 0.20;
    if (features.riskScoreDelta !== undefined) confidence += 0.10;
    if (features.sentimentScore !== undefined) confidence += 0.10;
    if (features.concernLevel !== undefined && features.concernLevel !== 5.0) confidence += 0.10; // Concern assessment available
    if (features.ticker && features.avgHistoricalReturn !== undefined) confidence += 0.15; // Company-specific
    if (features.analystNetUpgrades !== undefined || features.analystConsensus !== undefined) confidence += 0.10; // Analyst coverage

    confidence = Math.min(confidence, 0.95); // Cap at 95%

    // Cap prediction at realistic bounds (-10% to +10%)
    prediction = Math.max(-10, Math.min(10, prediction));

    return {
      predicted7dReturn: prediction,
      confidence,
      reasoning: reasoningParts.join('; '),
      features: features as PredictionFeatures,
    };
  }

  /**
   * Classify 8-K filing based on content summary
   */
  classify8KEvent(filingContentSummary?: string): '8-K-earnings-announcement' | '8-K-earnings-release' | '8-K-other' {
    if (!filingContentSummary) {
      return '8-K-other';
    }

    const lowerContent = filingContentSummary.toLowerCase();

    // Check if it's an earnings announcement (just announcing the call/date)
    if (
      lowerContent.includes('announcing') &&
      (lowerContent.includes('earnings call') || lowerContent.includes('earnings conference'))
    ) {
      return '8-K-earnings-announcement';
    }

    // Check if it's an actual earnings release
    if (
      (lowerContent.includes('item 2.02') || lowerContent.includes('results of operations')) &&
      (lowerContent.includes('financial results') ||
       lowerContent.includes('earnings') ||
       lowerContent.includes('press release') ||
       lowerContent.includes('quarterly results'))
    ) {
      return '8-K-earnings-release';
    }

    // Other events (leadership changes, M&A, etc)
    return '8-K-other';
  }

  /**
   * Calculate P/E multiplier for earnings surprise impact
   * Research shows high P/E stocks (growth stocks) react MORE to surprises
   *
   * Logic:
   * - Low P/E (< 15): 0.8x multiplier (value stocks, less reactive)
   * - Normal P/E (15-25): 1.0x multiplier (baseline)
   * - High P/E (25-40): 1.2x multiplier (growth stocks, more reactive)
   * - Very High P/E (> 40): 1.5x multiplier (priced for perfection)
   */
  calculatePEMultiplier(peRatio?: number): number {
    if (!peRatio || peRatio <= 0) {
      return 1.0; // No adjustment if P/E unavailable
    }

    if (peRatio < 15) {
      return 0.8; // Value stocks: less sensitive
    } else if (peRatio < 25) {
      return 1.0; // Normal valuation: baseline
    } else if (peRatio < 40) {
      return 1.2; // Growth stocks: more sensitive
    } else {
      return 1.5; // Very expensive: highly sensitive (priced for perfection)
    }
  }

  /**
   * Calculate market cap momentum multiplier
   * Research shows large-cap earnings beats get MORE momentum due to:
   * - Higher institutional ownership
   * - More index fund buying
   * - Better liquidity for large orders
   * - More analyst coverage and media attention
   *
   * Logic (market cap in billions):
   * - Micro cap (< $2B): 0.9x (illiquid, less attention)
   * - Small cap ($2-10B): 1.0x (baseline)
   * - Mid cap ($10-50B): 1.1x (good liquidity)
   * - Large cap ($50-200B): 1.2x (institutional momentum)
   * - Mega cap (> $200B): 1.3x (maximum institutional buying, index rebalancing)
   */
  calculateMarketCapMultiplier(marketCapBillions?: number): number {
    if (!marketCapBillions || marketCapBillions <= 0) {
      return 1.0; // No adjustment if market cap unavailable
    }

    if (marketCapBillions < 2) {
      return 0.9; // Micro cap: less liquid, less attention
    } else if (marketCapBillions < 10) {
      return 1.0; // Small cap: baseline
    } else if (marketCapBillions < 50) {
      return 1.1; // Mid cap: good liquidity, growing institutional interest
    } else if (marketCapBillions < 200) {
      return 1.2; // Large cap: strong institutional momentum
    } else {
      return 1.3; // Mega cap: maximum momentum (AAPL, MSFT, GOOGL, etc.)
    }
  }

  /**
   * Get historical average for similar filings
   * In production, this would query actual historical data
   */
  async getHistoricalPattern(
    ticker: string,
    filingType: string
  ): Promise<number> {
    // Mock data - in production, query database
    const patterns: Record<string, number> = {
      '10-K': 0.8,
      '10-Q': 0.3,
      '8-K': -0.2,
    };

    return patterns[filingType] || 0;
  }

  /**
   * Baseline Model Prediction (Production v3.1)
   *
   * Uses the production baseline model trained on cleaned data.
   * Performance: 67.5% accuracy, +103.74% avg return
   *
   * Based on experimental research showing earnings-only model
   * outperforms complex multi-factor models.
   *
   * @param actualEPS - Actual earnings per share
   * @param estimatedEPS - Estimated/consensus earnings per share
   * @returns Prediction with confidence and recommendation
   */
  async predictBaseline(actualEPS: number, estimatedEPS: number): Promise<{
    predicted7dReturn: number;
    confidence: number;
    recommendation: {
      action: 'BUY' | 'SELL' | 'SHORT' | 'HOLD';
      size: 'FULL' | 'HALF' | 'SMALL';
      reason: string;
    };
    reasoning: string;
    features: {
      epsSurprise: number;
      surpriseMagnitude: number;
      epsBeat: number;
      epsMiss: number;
      largeBeat: number;
      largeMiss: number;
    };
  }> {
    const { extractBaselineFeatures, interpretFeatures } = await import('./baseline-features');
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    // Extract features
    const features = extractBaselineFeatures({ actualEPS, estimatedEPS });

    // Call Python prediction script
    const featuresJson = JSON.stringify(features);
    const command = `python3 scripts/predict_baseline.py '${featuresJson}'`;

    try {
      const { stdout } = await execAsync(command, { cwd: process.cwd() });
      const result = JSON.parse(stdout);

      // Map confidence to predicted return (model predicts probability of positive return)
      // Use confidence score to estimate magnitude
      // If confidence > 0.5: positive return scaled by confidence
      // If confidence < 0.5: negative return scaled by (1 - confidence)
      let predictedReturn;
      if (result.confidence > 0.5) {
        // Bullish: scale return by confidence above 50%
        // confidence 0.5 = 0%, 0.65 = +50%, 0.75 = +100%, 1.0 = +200%
        predictedReturn = (result.confidence - 0.5) * 400;
      } else {
        // Bearish: scale return by confidence below 50%
        // confidence 0.5 = 0%, 0.35 = -50%, 0.25 = -100%, 0.0 = -200%
        predictedReturn = (result.confidence - 0.5) * 400;
      }

      // Generate reasoning
      const interpretation = interpretFeatures(features);
      const reasoning = `Baseline Model (v3.1): ${interpretation}. ` +
        `Predicted ${result.prediction === 1 ? 'positive' : 'negative'} return with ${(result.confidence * 100).toFixed(0)}% confidence. ` +
        `Model is asymmetric: 2.6x better at avoiding disasters (large misses) than picking winners. ` +
        `Recommendation: ${result.recommendation.action} ${result.recommendation.size} position - ${result.recommendation.reason}`;

      return {
        predicted7dReturn: predictedReturn,
        confidence: result.confidence,
        recommendation: result.recommendation,
        reasoning,
        features
      };
    } catch (error: any) {
      console.error('Error calling baseline prediction:', error);

      // Fallback: simple heuristic based on features
      const interpretation = interpretFeatures(features);
      let predictedReturn = 0;
      let confidence = 0.5;

      if (features.largeMiss) {
        predictedReturn = -50; // Large misses are strong bearish
        confidence = 0.35;
      } else if (features.largeBeat) {
        predictedReturn = +30; // Large beats are moderate bullish
        confidence = 0.65;
      } else if (features.epsBeat) {
        predictedReturn = +10; // Small beats are slightly bullish
        confidence = 0.55;
      } else if (features.epsMiss) {
        predictedReturn = +5; // Small misses are slightly bullish (counterintuitive but data-driven)
        confidence = 0.52;
      }

      return {
        predicted7dReturn: predictedReturn,
        confidence,
        recommendation: {
          action: predictedReturn > 20 ? 'BUY' : predictedReturn < -20 ? 'SHORT' : 'HOLD',
          size: Math.abs(predictedReturn) > 40 ? 'FULL' : Math.abs(predictedReturn) > 20 ? 'HALF' : 'SMALL',
          reason: 'Fallback heuristic (model unavailable)'
        },
        reasoning: `Baseline Model (fallback): ${interpretation}. ${error.message}`,
        features
      };
    }
  }
}

export const predictionEngine = new PredictionEngine();
