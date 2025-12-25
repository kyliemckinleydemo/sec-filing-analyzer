/**
 * Claude AI Client for SEC Filing Analysis
 * Uses Anthropic's Claude Sonnet 4.5 with extended thinking mode
 */

import Anthropic from '@anthropic-ai/sdk';

export interface RiskAnalysis {
  overallTrend: 'INCREASING' | 'STABLE' | 'DECREASING';
  riskScore: number; // 0-10
  newRisks: RiskItem[];
  removedRisks: RiskItem[];
  severityChanges: RiskItem[];
  topChanges: string[];
}

export interface RiskItem {
  title: string;
  severity: number;
  impact: string;
  reasoning: string;
  location?: string;
}

export interface SentimentAnalysis {
  sentimentScore: number; // -1 to 1
  confidence: number; // 0 to 1
  tone: string;
  keyPhrases: string[];
  toneShift?: string;
}

export interface ConcernAssessment {
  concernLevel: number; // 0-10 scale (0=no concerns, 10=severe concerns)
  concernLabel: 'LOW' | 'MODERATE' | 'ELEVATED' | 'HIGH' | 'CRITICAL';
  netAssessment: 'BULLISH' | 'NEUTRAL' | 'CAUTIOUS' | 'BEARISH';
  concernFactors: string[]; // Negative signals
  positiveFactors: string[]; // Positive signals
  reasoning: string; // Plain English explanation
}

export interface FinancialMetrics {
  revenueGrowth?: string; // e.g., "+15% YoY"
  marginTrend?: string; // e.g., "Expanding" or "Contracting"
  guidanceDirection?: 'raised' | 'lowered' | 'maintained' | 'not_provided';
  guidanceDetails?: string;
  keyMetrics?: string[]; // Notable metrics mentioned
  surprises?: string[]; // Beats/misses vs expectations

  // NEW: Guidance comparison vs prior period
  guidanceComparison?: {
    change: 'raised' | 'lowered' | 'maintained' | 'new';
    details: string;
  };

  // Structured XBRL data from SEC API
  structuredData?: {
    revenue?: number;
    revenueYoY?: string;
    netIncome?: number;
    netIncomeYoY?: string;
    eps?: number;
    epsYoY?: string;
    grossMargin?: number;
    operatingMargin?: number;
    // Yahoo Finance data for prediction model
    peRatio?: number;
    marketCap?: number; // in billions
    sector?: string;
    industry?: string;
    consensusEPS?: number;
    consensusRevenue?: number;
    epsSurprise?: 'beat' | 'miss' | 'inline';
    epsSurpriseMagnitude?: number;
    revenueSurprise?: 'beat' | 'miss' | 'inline';
    revenueSurpriseMagnitude?: number;
  };
}

export interface FilingAnalysis {
  risks: RiskAnalysis;
  sentiment: SentimentAnalysis;
  concernAssessment: ConcernAssessment; // NEW: Replaces simple sentiment with multi-factor concern scoring
  summary: string;
  filingContentSummary?: string; // NEW: TLDR of what the filing actually contains
  guidance?: string;
  financialMetrics?: FinancialMetrics;
}

class ClaudeClient {
  private client: Anthropic;
  private model = 'claude-sonnet-4-5-20250929';
  private haikuModel = 'claude-3-5-haiku-20241022';

  constructor() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey || apiKey === 'sk-ant-api03-placeholder') {
      throw new Error(
        'ANTHROPIC_API_KEY is required. Please set it in your .env.local file.'
      );
    }
    this.client = new Anthropic({ apiKey });
  }

  /**
   * Get the appropriate model based on use case
   * @param useCase - 'bulk' for batch processing (cheaper, faster), 'user' for user-facing features (higher quality)
   */
  private getModel(useCase: 'bulk' | 'user' = 'user'): string {
    return useCase === 'bulk' ? this.haikuModel : this.model;
  }

  private readonly RISK_ANALYSIS_PROMPT = `You are a financial analyst AI specializing in SEC filing risk assessment.

TASK: Analyze material risks, negative events, and changes that could impact stock price.

CURRENT FILING CONTENT:
{currentRisks}

PRIOR FILING CONTENT (if available):
{priorRisks}

IMPORTANT CONTEXT:
- This may be a formal "Risk Factors" section OR the entire filing text
- For 8-K filings, analyze the ENTIRE content for material negative events
- Material events that don't use the word "risk" are still risks if they impact stock price

CRITICAL INSTRUCTION: NEVER mention data limitations, rate limiting, or data access issues in your analysis. Analyze based on available information without commenting on what data you received or didn't receive. Focus on substantive business analysis only.

CRITICAL - Look for these material events beyond formal "Risk Factors":
1. **Data Breaches / Cybersecurity Incidents**: "unauthorized access", "data breach", "ransomware", "cyber attack", "security incident"
2. **Litigation / Legal Issues**: "lawsuit", "litigation", "legal proceedings", "investigation", "settlement", "taking a reserve", "contingent liability"
3. **Executive Changes**: "CEO departure", "CFO resigned", "management transition", "death of executive", "sudden resignation"
4. **Regulatory Actions**: "SEC investigation", "DOJ inquiry", "regulatory enforcement", "consent decree", "fines", "penalties"
5. **Restructuring / Impairments**: "goodwill impairment", "asset write-down", "restructuring charges", "facility closures", "layoffs"
6. **Covenant Breaches / Liquidity Issues**: "covenant violation", "going concern", "insufficient liquidity", "default"
7. **Product Issues**: "product recall", "safety concerns", "FDA warning", "quality issues", "supply disruption"
8. **Financial Restatements**: "restatement", "accounting error", "material weakness", "control deficiency"

ANALYSIS REQUIREMENTS:
1. Identify NEW risks or material negative events (not in prior filing)
   - Score severity: 1-10 (10 = existential threat, 7+ = major concern, 4-6 = moderate, 1-3 = minor)
   - Explain business impact in plain English
   - Flag if unusual for industry

2. Identify REMOVED risks (if prior filing available)
   - Explain why removal matters

3. Detect SEVERITY CHANGES:
   - Language shifts: "may" → "will" (increased severity)
   - Quantification: "could impact" → "expect $X impact"
   - Position changes: moved to top = more important
   - New disclosures of material amounts (e.g., "taking a $50M reserve")

4. Calculate overall risk trend: INCREASING/STABLE/DECREASING
   - INCREASING: New material risks, negative events, or worsening language
   - DECREASING: Risks removed, issues resolved, positive developments
   - STABLE: No significant changes

5. Calculate overall riskScore (0-10 scale):
   CRITICAL: Higher score = MORE risk/concern (10 = maximum risk, 0 = minimal risk)
   - Consider both the number and severity of new risks
   - Factor in whether risks are increasing, stable, or decreasing
   - 8-10: Multiple high-severity risks (7+), trend INCREASING, major concerns
   - 5-7: Moderate risks or some high-severity risks, mixed trend
   - 2-4: Minor risks, stable or improving trend
   - 0-1: Minimal risks, trend DECREASING

6. Extract 3 most material changes for investors
   - Focus on what matters for stock price
   - Be specific about the change, not just the risk
   - For 8-Ks: Focus on the material event being disclosed

OUTPUT FORMAT (JSON):
{
  "overallTrend": "INCREASING",
  "riskScore": 7.2,
  "newRisks": [
    {
      "title": "Supply Chain Concentration",
      "severity": 8,
      "impact": "67% of GPU supply from single vendor",
      "reasoning": "High severity due to concentration risk"
    }
  ],
  "removedRisks": [],
  "severityChanges": [],
  "topChanges": [
    "Supply chain language intensified - 'could' changed to 'will likely'",
    "Regulatory risk upgraded from moderate to high concern",
    "Added specific China tariff risk not mentioned in prior quarter"
  ]
}

Focus on MATERIAL changes that move stock prices. Return ONLY valid JSON.`;

  private readonly SENTIMENT_PROMPT = `Analyze management tone in this MD&A section.

TEXT:
{mdaText}

Score sentiment on scale -1 (very negative) to +1 (very positive).

SCORING GUIDANCE:
- 0.7 to 1.0: Very optimistic, confident, bullish outlook
- 0.3 to 0.6: Moderately optimistic, generally positive
- -0.2 to 0.2: Neutral, balanced tone
- -0.6 to -0.3: Moderately cautious, some concerns
- -1.0 to -0.7: Very cautious, defensive, pessimistic

Look for:
- Optimistic language: "strong", "confident", "expect growth"
- Cautious language: "challenging", "uncertain", "headwinds"
- Hedging: "may", "could", "possibly" (indicates uncertainty)
- Commitment strength: "will" vs "expect" vs "hope"
- Balance: positive statements vs risk disclosures

CRITICAL INSTRUCTION: NEVER mention data limitations or data access issues in your analysis. Focus only on substantive business analysis.

IMPORTANT: Return ONLY valid JSON with proper syntax. No trailing commas.

Required JSON format:
{
  "sentimentScore": 0.65,
  "confidence": 0.85,
  "tone": "cautiously optimistic",
  "keyPhrases": ["confident in long-term strategy", "near-term headwinds expected"],
  "toneShift": "More optimistic than prior quarter"
}

Rules:
- sentimentScore: number between -1 and 1
- confidence: number between 0 and 1
- tone: string (e.g. "optimistic", "cautious", "neutral", "pessimistic")
- keyPhrases: array of 2-4 short strings (no commas inside phrases)
- toneShift: string describing change vs prior filing

Return ONLY valid JSON. No additional text.`;

  private readonly CONCERN_ASSESSMENT_PROMPT = `You are a financial analyst providing a comprehensive concern assessment of this SEC filing.

ANALYSIS INPUTS:

Risk Analysis:
{riskAnalysis}

Management Sentiment:
{sentimentAnalysis}

Financial Metrics:
{financialMetrics}

TASK: Generate a multi-factor concern assessment that synthesizes all available signals.

CRITICAL INSTRUCTION: NEVER mention data limitations, rate limiting, SEC API issues, or data access problems in your assessment. Focus purely on substantive business analysis based on the information provided. Do not comment on what data you received or didn't receive.

SCORING GUIDANCE:
- 0-2 (LOW): Strong positive developments, risks materially decreasing, beat expectations, very optimistic tone
- 3-4 (MODERATE): Balanced picture, stable conditions, normal business risks, meeting expectations
- 5-6 (ELEVATED): Some concerning developments, moderately increased risks, cautious tone, minor misses
- 7-8 (HIGH): Multiple significant red flags, material new risks, defensive tone, meaningful earnings miss
- 9-10 (CRITICAL): RARE - Existential threats (e.g., going concern warnings, major fraud, bankruptcy risk, regulatory shutdown)

IMPORTANT: CRITICAL (9-10) should be VERY RARE - reserved for companies facing potential failure or severe existential threats.
Most concerning but viable companies should score 6-8 (ELEVATED/HIGH), not 9-10.

CONCERN FACTORS TO CONSIDER:
1. New high-severity risks (severity 7+)
2. Risk trend (INCREASING is concerning)
3. Earnings misses or guidance cuts
   CRITICAL: "Earnings miss" means actual results BELOW analyst expectations (negative)
   CRITICAL: "Guidance cut/lowered" means company REDUCED future outlook (negative)
4. Defensive/cautious management tone (negative sentiment score)
5. Margin compression or revenue deceleration
   CRITICAL: Margin compression means earnings/net income growing SLOWER than revenue
   - If earnings grow 4% and revenue grows 6%, margins are COMPRESSING (bad)
   - If earnings grow 8% and revenue grows 5%, margins are EXPANDING (good)
   CRITICAL: Revenue deceleration means revenue growth rate SLOWING over time
   - If revenue grew 15% last quarter but only 8% this quarter, that's deceleration (concerning)
6. Legal/regulatory issues
7. Executive departures
8. Liquidity concerns

POSITIVE FACTORS TO CONSIDER:
1. Risks removed or decreasing (lower severity or eliminated)
2. Earnings beats
   CRITICAL: "Earnings beat" means actual results ABOVE analyst expectations (positive)
3. Guidance raised
   CRITICAL: "Guidance raised" means company INCREASED future outlook (positive)
4. Optimistic management tone (positive sentiment score)
5. Revenue/margin expansion
   CRITICAL: Margin expansion means earnings/net income growing FASTER than revenue
   - If earnings grow 8% and revenue grows 5%, margins are EXPANDING (positive signal)
   - If earnings grow 4% and revenue grows 6%, margins are COMPRESSING (negative signal)
   CRITICAL: Revenue acceleration means revenue growth rate INCREASING over time
   - If revenue grew 8% last quarter but 15% this quarter, that's acceleration (positive)
6. Market share gains
7. New product launches
8. Strategic wins

NET ASSESSMENT:
- BULLISH: Strong positives outweigh concerns (concern level 0-3)
- NEUTRAL: Balanced or stable picture (concern level 4-5)
- CAUTIOUS: Concerns outweigh positives (concern level 6-7)
- BEARISH: Significant concerns with few positives (concern level 8-10)

OUTPUT FORMAT (JSON):
{
  "concernLevel": 6.5,
  "concernLabel": "ELEVATED",
  "netAssessment": "CAUTIOUS",
  "concernFactors": [
    "3 new high-severity risks identified (avg severity 8/10)",
    "Revenue growth decelerated from 15% to 8% YoY",
    "Management tone shifted from confident to cautious"
  ],
  "positiveFactors": [
    "Strong cash position maintained at $2.1B",
    "Operating margins stable at 12%"
  ],
  "reasoning": "The elevated concern level (6.5/10) reflects multiple warning signs: significant new regulatory risks, slowing revenue growth, and a more defensive management tone. While the balance sheet remains solid, the trend is concerning for near-term stock performance."
}

CRITICAL CALIBRATION REQUIREMENTS:
1. Your concern level MUST match the narrative factors you identify
2. If you list multiple high-severity risks and negative signals, the concern level should be 6-8
3. If you list mostly positive factors, it should be 0-3
4. Reserve 9-10 ONLY for companies facing bankruptcy, fraud investigations, or regulatory shutdown
5. Most mega-cap blue chip companies should score 3-6 even with multiple concerns (they have resources to weather issues)
6. Think: "Would I avoid this stock entirely?" = 7-8. "Is the company at risk of failure?" = 9-10.

Return ONLY valid JSON.`;

  private readonly FINANCIAL_METRICS_PROMPT = `Extract key financial metrics and guidance from this SEC filing.

TEXT:
{filingText}

CRITICAL INSTRUCTION: NEVER mention data limitations, rate limiting, or data access issues in your analysis. Focus only on extracting substantive financial information.

========================================
PART 1: GUIDANCE EXTRACTION (HIGHEST PRIORITY)
========================================

**Guidance is THE MOST CRITICAL data point - it moves markets more than anything else.**

GUIDANCE DETECTION INSTRUCTIONS:
You MUST exhaustively search for ANY mention of forward-looking statements, outlook, or guidance. Do NOT default to "not_provided" unless you've thoroughly checked for these signals:

1. EXPLICIT GUIDANCE PHRASES:
   - "guidance", "outlook", "forecast", "expect", "anticipate", "estimate", "project"
   - "full-year", "FY", "Q1", "Q2", "Q3", "Q4", "next quarter", "remainder of", "going forward"
   - "revenue of $X to $Y", "EPS of $X to $Y", "margins of X% to Y%"

2. RAISED GUIDANCE SIGNALS (guidanceDirection = "raised"):
   - "raised guidance", "increased outlook", "raising forecast", "upgraded expectations"
   - "now expect higher", "improved outlook", "better than previously expected"
   - "revised upward", "increasing our guidance", "above prior guidance"
   - Specific number increases: "raised revenue guidance from $X to $Y"

3. LOWERED GUIDANCE SIGNALS (guidanceDirection = "lowered"):
   - "lowered guidance", "reduced outlook", "cutting forecast", "downgraded expectations"
   - "now expect lower", "revised downward", "below prior guidance"
   - "reduced guidance", "lowering our forecast", "decreased expectations"
   - **ESPECIALLY IMPORTANT**: "facing headwinds", "challenging environment", "uncertainty" + lower numbers
   - Specific number decreases: "lowered revenue guidance from $X to $Y"

4. MAINTAINED GUIDANCE SIGNALS (guidanceDirection = "maintained"):
   - "reaffirming guidance", "maintaining outlook", "confirmed expectations"
   - "consistent with prior guidance", "unchanged outlook", "on track"
   - "remains in line with", "no change to guidance"

5. IMPLICIT GUIDANCE (count as raised/lowered/maintained):
   - If management discusses "strong momentum" + gives specific forward numbers = likely raised
   - If management discusses "challenges" + gives specific forward numbers = likely lowered
   - If management gives forward numbers without comparison = mark as "maintained" (not "not_provided")

CRITICAL: A guidance MISS (lowered) is the MOST NEGATIVE signal for a stock. A guidance RAISE is the MOST POSITIVE signal. You MUST detect these if present.

========================================
PART 2: EARNINGS SURPRISE DETECTION (CRITICAL)
========================================

You MUST search for ANY mention of analyst expectations, consensus estimates, or Wall Street forecasts.

EARNINGS SURPRISE PHRASES:
1. BEATS: "exceeded expectations", "beat analyst estimates", "surpassed consensus", "above estimates", "better than expected", "topped forecasts", "outperformed expectations", "stronger than anticipated"
   CRITICAL: A "beat" means actual results ABOVE expectations (positive)

2. MISSES: "fell short", "missed estimates", "below expectations", "below consensus", "disappointed", "underperformed expectations", "weaker than expected", "came in under"
   CRITICAL: A "miss" means actual results BELOW expectations (negative)

3. EXPLICIT COMPARISONS:
   - "EPS of $X.XX vs estimate of $Y.YY" or "vs. Street estimate of $Y.YY"
   - "$X.X billion vs consensus $Y.Y billion" or "vs. analyst forecast of $Y.Y billion"
   - Look for tables showing "Actual", "Estimate", "Surprise"

4. IMPLIED BEATS:
   - "strong quarter" or "record results" + specific numbers = likely beat
   - "exceeded targets", "ahead of plan", "blew past expectations"

5. IMPLIED MISSES:
   - Defensive language: "despite challenges" + results = likely miss
   - "difficult quarter", "below our internal expectations"

========================================
PART 3: OTHER FINANCIAL METRICS
========================================

Extract the following:
1. Revenue growth rates (YoY, QoQ)
   CRITICAL: Higher positive growth % = better (e.g., +15% is better than +8%)
   CRITICAL: Negative growth = revenue declining (concerning)
   CRITICAL: Include both the current period and prior period if available for comparison

2. Profit margin trends (expanding/contracting)
   CRITICAL: "Expanding" means margins are INCREASING (earnings growing faster than revenue - positive)
   CRITICAL: "Contracting" means margins are DECREASING (earnings growing slower than revenue - negative)
   CRITICAL: "Stable" means margins roughly unchanged

3. Key business metrics (user growth, ARPU, etc.)
4. Management outlook statements

========================================
OUTPUT FORMAT (STRICT JSON)
========================================

Return ONLY valid JSON:
{
  "revenueGrowth": "+12% YoY" or "Not disclosed",
  "marginTrend": "Expanding" or "Contracting" or "Stable" or "Not disclosed",
  "guidanceDirection": "raised" | "lowered" | "maintained" | "not_provided",
  "guidanceDetails": "Raised Q4 revenue guidance to $X-Y billion from prior $A-B billion",
  "keyMetrics": ["iPhone revenue +15%", "Services revenue $24.2B"],
  "surprises": ["EPS beat consensus by 9.8%", "Revenue missed by $1.2B (2.5%)"],
  "guidanceComparison": {
    "change": "raised" | "lowered" | "maintained" | "new",
    "details": "Comparison of current vs prior guidance if available"
  }
}

CRITICAL: For "surprises" array, use this format:
- "EPS beat consensus by X%" or "EPS beat by $X.XX"
- "Revenue beat consensus by X%" or "Revenue beat by $XB"
- "EPS missed consensus by X%" or "EPS missed by $X.XX"
- "Revenue missed consensus by X%" or "Revenue missed by $XB"

REMEMBER:
- Only use "not_provided" for guidanceDirection if you truly cannot find ANY forward-looking statements
- Even vague guidance like "expect continued growth" should be marked as "maintained"
- Guidance changes (raised/lowered) are MAJOR market movers - DO NOT MISS THESE
- Earnings misses + guidance cuts = extremely bearish (stock will likely drop significantly)
- Earnings beats + guidance raises = extremely bullish (stock will likely rally)

Note: guidanceComparison will only be populated if prior period MD&A is provided for comparison.
Focus on quantitative data that impacts stock price.`;

  async analyzeRiskFactors(
    currentRisks: string,
    priorRisks?: string,
    useCase: 'bulk' | 'user' = 'user'
  ): Promise<RiskAnalysis> {
    const prompt = this.RISK_ANALYSIS_PROMPT.replace(
      '{currentRisks}',
      currentRisks
    ).replace('{priorRisks}', priorRisks || 'Not available');

    try {
      const response = await this.client.messages.create({
        model: this.getModel(useCase),
        max_tokens: 4096,
        temperature: 0.3, // Lower temperature for more consistent analysis
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      const content = response.content[0];
      if (content.type !== 'text') {
        throw new Error('Unexpected response type');
      }

      // Parse JSON from response
      const jsonMatch = content.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('Failed to parse JSON from Claude response');
      }

      try {
        return JSON.parse(jsonMatch[0]);
      } catch (parseError) {
        console.error('JSON parsing failed, attempting to fix common issues:', parseError);

        // Try to fix common JSON issues
        let fixedJson = jsonMatch[0]
          .replace(/,\s*]/g, ']')  // Remove trailing commas in arrays
          .replace(/,\s*}/g, '}')  // Remove trailing commas in objects
          .replace(/[\r\n]+/g, ' ')  // Remove newlines
          .replace(/\s+/g, ' ');  // Normalize whitespace

        try {
          return JSON.parse(fixedJson);
        } catch (secondError) {
          console.error('Failed to fix JSON, returning fallback risk analysis');
          // Return neutral risk analysis as fallback
          return {
            overallTrend: 'STABLE',
            riskScore: 5.0,
            newRisks: [],
            removedRisks: [],
            severityChanges: [],
            topChanges: ['Unable to parse risk analysis'],
          };
        }
      }
    } catch (error) {
      console.error('Error analyzing risk factors:', error);
      // Return neutral risk analysis as fallback
      return {
        overallTrend: 'STABLE',
        riskScore: 5.0,
        newRisks: [],
        removedRisks: [],
        severityChanges: [],
        topChanges: ['Risk analysis failed'],
      };
    }
  }

  async analyzeSentiment(mdaText: string, useCase: 'bulk' | 'user' = 'user'): Promise<SentimentAnalysis> {
    // Check if there's meaningful MD&A content
    if (!mdaText || mdaText.trim().length < 50 || mdaText.toLowerCase().includes('not available')) {
      return {
        sentimentScore: 0,
        confidence: 0,
        tone: 'neutral',
        keyPhrases: ['No MD&A content available'],
        toneShift: 'N/A',
      };
    }

    const prompt = this.SENTIMENT_PROMPT.replace('{mdaText}', mdaText);

    try {
      const response = await this.client.messages.create({
        model: this.getModel(useCase),
        max_tokens: 1024,
        temperature: 0.3,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      const content = response.content[0];
      if (content.type !== 'text') {
        throw new Error('Unexpected response type');
      }

      const jsonMatch = content.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('Failed to parse JSON from Claude response');
      }

      try {
        const result: SentimentAnalysis = JSON.parse(jsonMatch[0]);
        // Capitalize first letter of all key phrases for consistency
        if (result.keyPhrases && Array.isArray(result.keyPhrases)) {
          result.keyPhrases = result.keyPhrases.map(phrase =>
            phrase.charAt(0).toUpperCase() + phrase.slice(1)
          );
        }
        return result;
      } catch (parseError) {
        console.error('JSON parsing failed, attempting to fix common issues:', parseError);

        // Try to fix common JSON issues
        let fixedJson = jsonMatch[0]
          .replace(/,\s*]/g, ']')  // Remove trailing commas in arrays
          .replace(/,\s*}/g, '}')  // Remove trailing commas in objects
          .replace(/[\r\n]+/g, ' ')  // Remove newlines
          .replace(/\s+/g, ' ');  // Normalize whitespace

        try {
          const result: SentimentAnalysis = JSON.parse(fixedJson);
          // Capitalize first letter of all key phrases for consistency
          if (result.keyPhrases && Array.isArray(result.keyPhrases)) {
            result.keyPhrases = result.keyPhrases.map(phrase =>
              phrase.charAt(0).toUpperCase() + phrase.slice(1)
            );
          }
          return result;
        } catch (secondError) {
          console.error('Failed to fix JSON, returning fallback sentiment');
          // Return neutral sentiment as fallback
          return {
            sentimentScore: 0,
            confidence: 0.5,
            tone: 'neutral',
            keyPhrases: ['Unable to parse sentiment'],
            toneShift: 'Analysis unavailable',
          };
        }
      }
    } catch (error) {
      console.error('Error analyzing sentiment:', error);
      // Return neutral sentiment as fallback
      return {
        sentimentScore: 0,
        confidence: 0.5,
        tone: 'neutral',
        keyPhrases: ['Analysis failed'],
        toneShift: 'Error during analysis',
      };
    }
  }

  async generateConcernAssessment(
    risks: RiskAnalysis,
    sentiment: SentimentAnalysis,
    financialMetrics?: FinancialMetrics,
    useCase: 'bulk' | 'user' = 'user'
  ): Promise<ConcernAssessment> {
    const prompt = this.CONCERN_ASSESSMENT_PROMPT
      .replace('{riskAnalysis}', JSON.stringify(risks, null, 2))
      .replace('{sentimentAnalysis}', JSON.stringify(sentiment, null, 2))
      .replace('{financialMetrics}', JSON.stringify(financialMetrics || {}, null, 2));

    try {
      const response = await this.client.messages.create({
        model: this.getModel(useCase),
        max_tokens: 2048,
        temperature: 0.3,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      const content = response.content[0];
      if (content.type !== 'text') {
        throw new Error('Unexpected response type');
      }

      const jsonMatch = content.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('Failed to parse JSON from concern assessment');
      }

      try {
        const assessment = JSON.parse(jsonMatch[0]);

        // Validate concern level matches label
        if (assessment.concernLevel <= 2) assessment.concernLabel = 'LOW';
        else if (assessment.concernLevel <= 4) assessment.concernLabel = 'MODERATE';
        else if (assessment.concernLevel <= 6) assessment.concernLabel = 'ELEVATED';
        else if (assessment.concernLevel <= 8) assessment.concernLabel = 'HIGH';
        else assessment.concernLabel = 'CRITICAL';

        return assessment;
      } catch (parseError) {
        console.error('Failed to parse concern assessment JSON, using fallback');
        // Return neutral assessment
        return {
          concernLevel: 5.0,
          concernLabel: 'MODERATE',
          netAssessment: 'NEUTRAL',
          concernFactors: ['Analysis parsing failed'],
          positiveFactors: [],
          reasoning: 'Unable to generate comprehensive assessment due to parsing error'
        };
      }
    } catch (error) {
      console.error('Error generating concern assessment:', error);
      // Return neutral assessment as fallback
      return {
        concernLevel: 5.0,
        concernLabel: 'MODERATE',
        netAssessment: 'NEUTRAL',
        concernFactors: ['Analysis generation failed'],
        positiveFactors: [],
        reasoning: 'Unable to generate comprehensive assessment due to error'
      };
    }
  }

  async extractFinancialMetrics(filingText: string, priorMDA?: string, useCase: 'bulk' | 'user' = 'user'): Promise<FinancialMetrics> {
    let prompt = this.FINANCIAL_METRICS_PROMPT.replace('{filingText}', filingText.slice(0, 30000)); // Limit size

    // If prior MD&A is available, add guidance comparison instructions
    if (priorMDA) {
      prompt += `\n\nPRIOR PERIOD MD&A:\n${priorMDA.slice(0, 20000)}\n\nIMPORTANT: Compare current guidance vs. prior guidance and include in response:\n- "guidanceComparison": { "change": "raised" | "lowered" | "maintained" | "new", "details": "Specific comparison" }`;
    }

    try {
      const response = await this.client.messages.create({
        model: this.getModel(useCase),
        max_tokens: 1024,
        temperature: 0.1, // Very low temp for factual extraction
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      const content = response.content[0];
      if (content.type !== 'text') {
        throw new Error('Unexpected response type');
      }

      const jsonMatch = content.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return {}; // Return empty metrics if parsing fails
      }

      try {
        return JSON.parse(jsonMatch[0]);
      } catch (parseError) {
        console.error('Failed to parse financial metrics JSON');
        return {};
      }
    } catch (error) {
      console.error('Error extracting financial metrics:', error);
      return {};
    }
  }

  async generateFilingContentSummary(
    filingText: string,
    filingType: string,
    companyName: string,
    useCase: 'bulk' | 'user' = 'user'
  ): Promise<string> {
    const prompt = `Summarize what this ${filingType} filing from ${companyName} contains.

FILING CONTENT:
${filingText.slice(0, 20000)}

INSTRUCTIONS:
- Create 3-5 bullet points explaining WHAT this filing contains (not our analysis of it)
- For 10-K: Summarize key business segments, major risks disclosed, financial highlights
- For 10-Q: Summarize quarterly performance, any material changes, financial results
- For 8-K: Identify the specific Item(s) being reported (e.g., "Item 2.02: Earnings Release", "Item 5.02: Leadership Change")
- Be specific about the actual content and events described
- Focus on facts reported in the filing, not interpretation

Return ONLY bullet points, no introduction.`;

    try {
      const response = await this.client.messages.create({
        model: this.getModel(useCase),
        max_tokens: 512,
        temperature: 0.2,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      const content = response.content[0];
      if (content.type !== 'text') {
        throw new Error('Unexpected response type');
      }

      return content.text.trim();
    } catch (error) {
      console.error('Error generating filing content summary:', error);
      return '• Unable to generate filing summary';
    }
  }

  async generateExecutiveSummary(
    filingText: string,
    riskAnalysis: RiskAnalysis,
    sentimentAnalysis: SentimentAnalysis,
    useCase: 'bulk' | 'user' = 'user',
    hasFinancialData: boolean = true
  ): Promise<string> {
    const forecastGuidance = hasFinancialData
      ? ''
      : '\n\nIMPORTANT: This filing does NOT contain financial results. Do NOT make stock price forecasts, predictions, or trading recommendations. Focus only on the disclosed events and their qualitative implications.';

    const prompt = `Create a concise executive summary (3-5 bullet points) of this SEC filing.

Focus on:
- Most material changes from risk analysis
- Management sentiment and tone
- Key takeaways for investors

Risk Analysis:
${JSON.stringify(riskAnalysis.topChanges)}

Sentiment: ${sentimentAnalysis.tone} (${sentimentAnalysis.sentimentScore})${forecastGuidance}

Return ONLY bullet points, no introduction.`;

    try {
      const response = await this.client.messages.create({
        model: this.getModel(useCase),
        max_tokens: 512,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      const content = response.content[0];
      if (content.type !== 'text') {
        throw new Error('Unexpected response type');
      }

      return content.text.trim();
    } catch (error) {
      console.error('Error generating summary:', error);
      throw error;
    }
  }

  async *chatWithFiling(
    filingContext: string,
    question: string
  ): AsyncGenerator<string> {
    try {
      const stream = await this.client.messages.create({
        model: this.model,
        max_tokens: 2048,
        stream: true,
        messages: [
          {
            role: 'user',
            content: `Filing context:\n${filingContext}\n\nQuestion: ${question}`,
          },
        ],
      });

      for await (const event of stream) {
        if (
          event.type === 'content_block_delta' &&
          event.delta.type === 'text_delta'
        ) {
          yield event.delta.text;
        }
      }
    } catch (error) {
      console.error('Error in chat stream:', error);
      throw error;
    }
  }

  async analyzeFullFiling(
    currentRisks: string,
    mdaText: string,
    priorRisks?: string,
    filingType?: string,
    companyName?: string,
    priorMDA?: string,
    useCase: 'bulk' | 'user' = 'user',
    hasFinancialData: boolean = true
  ): Promise<FilingAnalysis> {
    try {
      const fullText = currentRisks + '\n\n' + mdaText;

      // Run all analysis in parallel for speed
      const [risks, sentiment, financialMetrics, filingContentSummary] = await Promise.all([
        this.analyzeRiskFactors(currentRisks, priorRisks, useCase),
        this.analyzeSentiment(mdaText, useCase),
        this.extractFinancialMetrics(fullText, priorMDA, useCase),
        filingType && companyName
          ? this.generateFilingContentSummary(fullText, filingType, companyName, useCase)
          : Promise.resolve(undefined),
      ]);

      // Generate concern assessment AFTER we have all other signals
      const concernAssessment = await this.generateConcernAssessment(
        risks,
        sentiment,
        financialMetrics,
        useCase
      );

      // Generate summary (with guidance on whether to make price forecasts)
      const summary = await this.generateExecutiveSummary(
        fullText,
        risks,
        sentiment,
        useCase,
        hasFinancialData
      );

      return {
        risks,
        sentiment,
        concernAssessment,
        summary,
        filingContentSummary,
        financialMetrics,
      };
    } catch (error) {
      console.error('Error in full filing analysis:', error);
      throw error;
    }
  }
}

// Export singleton
export const claudeClient = new ClaudeClient();
