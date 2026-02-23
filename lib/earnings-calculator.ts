/**
 * @module lib/earnings-calculator
 * @description Calculates earnings surprise metrics by comparing actual XBRL-reported EPS and revenue against analyst consensus estimates with percentage-based thresholds
 *
 * PURPOSE:
 * - Fetch analyst consensus estimates from Yahoo Finance API for a given ticker and filing date
 * - Extract actual EPS (diluted or basic) and revenue values from XBRL structured financial data
 * - Calculate percentage surprise magnitude for both EPS and revenue metrics
 * - Classify surprises as 'beat', 'miss', or 'inline' using ±2% threshold boundaries
 *
 * DEPENDENCIES:
 * - ./yahoo-finance - Provides financialDataClient.getAnalystEstimates() for fetching consensus EPS/revenue and analyst count
 *
 * EXPORTS:
 * - EarningsSurprise (interface) - Result object containing actual/consensus values, surprise classifications, magnitude percentages, and data availability flags
 * - EarningsCalculator (class) - Service class with calculateSurprises() method and private extractors for EPS/revenue from XBRL
 * - earningsCalculator (const) - Singleton instance of EarningsCalculator ready for immediate use
 *
 * PATTERNS:
 * - Call earningsCalculator.calculateSurprises(ticker, filingDate, xbrlData) which returns Promise<EarningsSurprise>
 * - Use classifySurpriseMagnitude(percentage) to convert numeric surprise into labels: 'massive' (≥20%), 'large' (≥10%), 'moderate' (≥5%), 'small' (≥2%), 'inline' (<2%)
 * - Check hasConsensusData and hasActualData flags before relying on surprise calculations
 * - Revenue values automatically converted from raw XBRL numbers to billions (divide by 1e9)
 *
 * CLAUDE NOTES:
 * - EPS extraction tries earningsPerShareDiluted first, falls back to earningsPerShareBasic, then searches financials array for labels containing 'earnings per share' or 'eps'
 * - Revenue extraction attempts xbrlData.revenue, xbrlData.revenues, then searches financials array - all results divided by 1 billion for consistent units
 * - Surprise classification uses ±2% as inline threshold: >2% is 'beat', <-2% is 'miss', between is 'inline'
 * - Returns partial results when consensus or actual data missing - check boolean flags to determine completeness
 */
/**
 * Earnings Surprise Calculator
 * Calculates EPS and Revenue surprises from actual vs analyst consensus
 */

import { financialDataClient } from './yahoo-finance';

export interface EarningsSurprise {
  // EPS
  actualEPS?: number;
  consensusEPS?: number;
  epsSurprise?: 'beat' | 'miss' | 'inline' | null;
  epsSurpriseMagnitude?: number; // % difference

  // Revenue
  actualRevenue?: number; // in billions
  consensusRevenue?: number; // in billions
  revenueSurprise?: 'beat' | 'miss' | 'inline' | null;
  revenueSurpriseMagnitude?: number; // % difference

  // Metadata
  hasConsensusData: boolean;
  hasActualData: boolean;
  analystCount?: number;
}

export class EarningsCalculator {
  /**
   * Calculate earnings surprises from XBRL actual data + Yahoo Finance consensus
   */
  async calculateSurprises(
    ticker: string,
    filingDate: Date,
    xbrlData: any
  ): Promise<EarningsSurprise> {
    // Fetch analyst consensus estimates
    const consensus = await financialDataClient.getAnalystEstimates(ticker, filingDate);

    // Extract actual EPS from XBRL
    const actualEPS = this.extractActualEPS(xbrlData);

    // Extract actual Revenue from XBRL
    const actualRevenue = this.extractActualRevenue(xbrlData);

    const result: EarningsSurprise = {
      hasConsensusData: !!consensus,
      hasActualData: !!(actualEPS || actualRevenue),
      analystCount: consensus?.analystCount
    };

    // Calculate EPS surprise
    if (actualEPS !== null && consensus?.consensusEPS) {
      result.actualEPS = actualEPS;
      result.consensusEPS = consensus.consensusEPS;

      const surprisePercent = ((actualEPS - consensus.consensusEPS) / Math.abs(consensus.consensusEPS)) * 100;
      result.epsSurpriseMagnitude = surprisePercent;

      // Classify: ±2% threshold for inline
      if (surprisePercent > 2) {
        result.epsSurprise = 'beat';
      } else if (surprisePercent < -2) {
        result.epsSurprise = 'miss';
      } else {
        result.epsSurprise = 'inline';
      }
    }

    // Calculate Revenue surprise
    if (actualRevenue !== null && consensus?.consensusRevenue) {
      result.actualRevenue = actualRevenue;
      result.consensusRevenue = consensus.consensusRevenue;

      const surprisePercent = ((actualRevenue - consensus.consensusRevenue) / Math.abs(consensus.consensusRevenue)) * 100;
      result.revenueSurpriseMagnitude = surprisePercent;

      // Classify: ±2% threshold for inline
      if (surprisePercent > 2) {
        result.revenueSurprise = 'beat';
      } else if (surprisePercent < -2) {
        result.revenueSurprise = 'miss';
      } else {
        result.revenueSurprise = 'inline';
      }
    }

    return result;
  }

  /**
   * Extract actual EPS from XBRL data
   * Looks for: EarningsPerShareDiluted, EarningsPerShareBasic
   */
  private extractActualEPS(xbrlData: any): number | null {
    if (!xbrlData) return null;

    // Try diluted EPS first (most common)
    if (xbrlData.earningsPerShareDiluted) {
      return xbrlData.earningsPerShareDiluted;
    }

    // Fallback to basic EPS
    if (xbrlData.earningsPerShareBasic) {
      return xbrlData.earningsPerShareBasic;
    }

    // Try extracting from structured financials
    if (xbrlData.financials) {
      const eps = xbrlData.financials.find((f: any) =>
        f.label?.toLowerCase().includes('earnings per share') ||
        f.label?.toLowerCase().includes('eps')
      );
      if (eps?.value) return parseFloat(eps.value);
    }

    return null;
  }

  /**
   * Extract actual Revenue from XBRL data
   * Looks for: Revenues, RevenueFromContractWithCustomerExcludingAssessedTax
   */
  private extractActualRevenue(xbrlData: any): number | null {
    if (!xbrlData) return null;

    // Try revenue fields
    if (xbrlData.revenue) {
      // Convert to billions
      return xbrlData.revenue / 1e9;
    }

    if (xbrlData.revenues) {
      return xbrlData.revenues / 1e9;
    }

    // Try extracting from structured financials
    if (xbrlData.financials) {
      const revenue = xbrlData.financials.find((f: any) =>
        f.label?.toLowerCase().includes('revenue') ||
        f.label?.toLowerCase().includes('total revenue')
      );
      if (revenue?.value) return parseFloat(revenue.value) / 1e9;
    }

    return null;
  }

  /**
   * Classify surprise magnitude into descriptive label
   */
  classifySurpriseMagnitude(magnitude: number): string {
    const abs = Math.abs(magnitude);
    if (abs >= 20) return 'massive';
    if (abs >= 10) return 'large';
    if (abs >= 5) return 'moderate';
    if (abs >= 2) return 'small';
    return 'inline';
  }
}

export const earningsCalculator = new EarningsCalculator();
