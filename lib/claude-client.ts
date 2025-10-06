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

export interface FinancialMetrics {
  revenueGrowth?: string; // e.g., "+15% YoY"
  marginTrend?: string; // e.g., "Expanding" or "Contracting"
  guidanceDirection?: 'raised' | 'lowered' | 'maintained' | 'not_provided';
  guidanceDetails?: string;
  keyMetrics?: string[]; // Notable metrics mentioned
  surprises?: string[]; // Beats/misses vs expectations

  // NEW: Structured XBRL data from SEC API
  structuredData?: {
    revenue?: number;
    revenueYoY?: string;
    netIncome?: number;
    netIncomeYoY?: string;
    eps?: number;
    epsYoY?: string;
    grossMargin?: number;
    operatingMargin?: number;
  };
}

export interface FilingAnalysis {
  risks: RiskAnalysis;
  sentiment: SentimentAnalysis;
  summary: string;
  filingContentSummary?: string; // NEW: TLDR of what the filing actually contains
  guidance?: string;
  financialMetrics?: FinancialMetrics;
}

class ClaudeClient {
  private client: Anthropic;
  private model = 'claude-sonnet-4-5-20250929';

  constructor() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey || apiKey === 'sk-ant-api03-placeholder') {
      throw new Error(
        'ANTHROPIC_API_KEY is required. Please set it in your .env.local file.'
      );
    }
    this.client = new Anthropic({ apiKey });
  }

  private readonly RISK_ANALYSIS_PROMPT = `You are a financial analyst AI specializing in SEC filing risk assessment.

TASK: Analyze risk factor changes and score severity.

CURRENT RISK FACTORS:
{currentRisks}

PRIOR RISK FACTORS (if available):
{priorRisks}

IMPORTANT CONTEXT:
- If prior filing is provided, this is a comparison between two filings from the same company
- If prior filing says "Not available", this is still a mature public company - assess risks in that context
- Never assume this is a first-time filing or IPO unless explicitly stated
- Focus on changes in language, tone, and emphasis between filings

ANALYSIS REQUIREMENTS:
1. Identify NEW risks (not in prior filing)
   - Score severity: 1-10 (10 = existential threat)
   - Explain business impact
   - Flag if unusual for industry

2. Identify REMOVED risks (if prior filing available)
   - Explain why removal matters

3. Detect SEVERITY CHANGES:
   - Language shifts: "may" → "will" (increased severity)
   - Quantification: "could impact" → "expect $X impact"
   - Position changes: moved to top = more important
   - Tone changes: defensive → confident or vice versa

4. Calculate overall risk trend: INCREASING/STABLE/DECREASING
   - If no prior filing provided, use STABLE as baseline
   - Only use INCREASING/DECREASING if you see clear changes

5. Extract 3 most material changes for investors
   - Focus on what matters for stock price
   - Be specific about the change, not just the risk

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

Look for:
- Optimistic language: "strong", "confident", "expect growth"
- Cautious language: "challenging", "uncertain", "headwinds"
- Hedging: "may", "could", "possibly" (indicates uncertainty)
- Commitment strength: "will" vs "expect" vs "hope"
- Balance: positive statements vs risk disclosures

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

  private readonly FINANCIAL_METRICS_PROMPT = `Extract key financial metrics and guidance from this SEC filing.

TEXT:
{filingText}

Extract the following if mentioned:
1. Revenue growth rates (YoY, QoQ)
2. Profit margin trends (expanding/contracting)
3. Forward guidance (raised/lowered/maintained)
4. Earnings surprises (beat/miss vs expectations)
5. Key business metrics (user growth, ARPU, etc.)
6. Management outlook statements

Return ONLY valid JSON:
{
  "revenueGrowth": "+12% YoY" or "Not disclosed",
  "marginTrend": "Expanding" or "Contracting" or "Stable",
  "guidanceDirection": "raised" | "lowered" | "maintained" | "not_provided",
  "guidanceDetails": "Raised Q4 guidance to $X-Y billion",
  "keyMetrics": ["iPhone revenue +15%", "Services revenue $24.2B"],
  "surprises": ["EPS beat by $0.05", "Revenue missed by $200M"]
}

Focus on quantitative data that impacts stock price. If information isn't found, use "Not disclosed".`;

  async analyzeRiskFactors(
    currentRisks: string,
    priorRisks?: string
  ): Promise<RiskAnalysis> {
    const prompt = this.RISK_ANALYSIS_PROMPT.replace(
      '{currentRisks}',
      currentRisks
    ).replace('{priorRisks}', priorRisks || 'Not available');

    try {
      const response = await this.client.messages.create({
        model: this.model,
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

  async analyzeSentiment(mdaText: string): Promise<SentimentAnalysis> {
    const prompt = this.SENTIMENT_PROMPT.replace('{mdaText}', mdaText);

    try {
      const response = await this.client.messages.create({
        model: this.model,
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

  async extractFinancialMetrics(filingText: string): Promise<FinancialMetrics> {
    const prompt = this.FINANCIAL_METRICS_PROMPT.replace('{filingText}', filingText.slice(0, 30000)); // Limit size

    try {
      const response = await this.client.messages.create({
        model: this.model,
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
    companyName: string
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
        model: this.model,
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
    sentimentAnalysis: SentimentAnalysis
  ): Promise<string> {
    const prompt = `Create a concise executive summary (3-5 bullet points) of this SEC filing.

Focus on:
- Most material changes from risk analysis
- Management sentiment and tone
- Key takeaways for investors

Risk Analysis:
${JSON.stringify(riskAnalysis.topChanges)}

Sentiment: ${sentimentAnalysis.tone} (${sentimentAnalysis.sentimentScore})

Return ONLY bullet points, no introduction.`;

    try {
      const response = await this.client.messages.create({
        model: this.model,
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
    companyName?: string
  ): Promise<FilingAnalysis> {
    try {
      const fullText = currentRisks + '\n\n' + mdaText;

      // Run all analysis in parallel for speed
      const [risks, sentiment, financialMetrics, filingContentSummary] = await Promise.all([
        this.analyzeRiskFactors(currentRisks, priorRisks),
        this.analyzeSentiment(mdaText),
        this.extractFinancialMetrics(fullText),
        filingType && companyName
          ? this.generateFilingContentSummary(fullText, filingType, companyName)
          : Promise.resolve(undefined),
      ]);

      // Generate summary
      const summary = await this.generateExecutiveSummary(
        fullText,
        risks,
        sentiment
      );

      return {
        risks,
        sentiment,
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
