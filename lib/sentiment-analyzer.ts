/**
 * Sentiment Analyzer for SEC Filings
 *
 * Analyzes MD&A (Management Discussion and Analysis) sections
 * to extract management sentiment signals that predict stock returns
 */

import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
});

export interface SentimentAnalysis {
  overall: 'positive' | 'neutral' | 'negative';
  confidence: number; // 0-100
  score: number; // -10 to +10
  signals: {
    outlookOptimistic: boolean;
    guidanceLanguage: 'strong' | 'cautious' | 'neutral';
    challenges Mentioned: boolean;
    growthEmphasis: boolean;
    uncertaintyLevel: 'low' | 'medium' | 'high';
  };
  reasoning: string;
}

/**
 * Extract MD&A section from SEC filing HTML
 */
export function extractMDA(filingHtml: string): string | null {
  // MD&A is typically in Item 2 (10-Q) or Item 7 (10-K)
  const mdaPatterns = [
    /ITEM\s+2\.?\s*MANAGEMENT'S DISCUSSION AND ANALYSIS[^]*?(?=ITEM\s+[3-9]|$)/i,
    /ITEM\s+7\.?\s*MANAGEMENT'S DISCUSSION AND ANALYSIS[^]*?(?=ITEM\s+[8-9]|$)/i,
    /<b>MANAGEMENT'S DISCUSSION[^]*?(?=<b>|$)/i,
  ];

  for (const pattern of mdaPatterns) {
    const match = filingHtml.match(pattern);
    if (match) {
      // Extract text, remove HTML tags
      let text = match[0]
        .replace(/<[^>]*>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&[a-z]+;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      // Limit to first 15,000 chars (manageable for Claude)
      return text.slice(0, 15000);
    }
  }

  return null;
}

/**
 * Analyze sentiment using Claude
 */
export async function analyzeSentiment(
  mdaText: string,
  ticker: string,
  filingType: string
): Promise<SentimentAnalysis> {
  const prompt = `You are a financial analyst analyzing SEC filing MD&A sections to predict stock price movements.

Analyze this ${filingType} MD&A excerpt from ${ticker} and determine management sentiment:

${mdaText}

Provide a sentiment analysis in the following JSON format:
{
  "overall": "positive" | "neutral" | "negative",
  "confidence": <0-100>,
  "score": <-10 to +10, where +10 is extremely bullish, -10 is extremely bearish>,
  "signals": {
    "outlookOptimistic": <boolean>,
    "guidanceLanguage": "strong" | "cautious" | "neutral",
    "challengesMentioned": <boolean>,
    "growthEmphasis": <boolean>,
    "uncertaintyLevel": "low" | "medium" | "high"
  },
  "reasoning": "<brief 1-2 sentence explanation>"
}

Focus on:
1. Forward-looking statements (optimism vs caution)
2. Language around challenges and risks
3. Growth emphasis vs cost-cutting
4. Uncertainty and hedging language
5. Overall tone (confident vs defensive)`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 1000,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type from Claude');
    }

    // Extract JSON from response
    const jsonMatch = content.text.match(/\{[^]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in Claude response');
    }

    const analysis = JSON.parse(jsonMatch[0]) as SentimentAnalysis;
    return analysis;
  } catch (error) {
    console.error('Sentiment analysis error:', error);
    // Return neutral sentiment on error
    return {
      overall: 'neutral',
      confidence: 0,
      score: 0,
      signals: {
        outlookOptimistic: false,
        guidanceLanguage: 'neutral',
        challengesMentioned: false,
        growthEmphasis: false,
        uncertaintyLevel: 'medium',
      },
      reasoning: 'Analysis failed, defaulted to neutral',
    };
  }
}

/**
 * Batch analyze sentiment for multiple filings
 */
export async function analyzeSentimentBatch(
  filings: Array<{
    ticker: string;
    filingType: string;
    mdaText: string;
  }>
): Promise<SentimentAnalysis[]> {
  const results: SentimentAnalysis[] = [];

  for (const filing of filings) {
    const analysis = await analyzeSentiment(
      filing.mdaText,
      filing.ticker,
      filing.filingType
    );
    results.push(analysis);

    // Rate limit: 1 request per second
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  return results;
}
