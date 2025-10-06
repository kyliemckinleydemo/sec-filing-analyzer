import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { claudeClient } from '@/lib/claude-client';
import { cache } from '@/lib/cache';
import { secClient } from '@/lib/sec-client';
import { filingParser } from '@/lib/filing-parser';
import { secDataAPI } from '@/lib/sec-data-api';

/**
 * Analyze a specific SEC filing using Claude AI
 *
 * This endpoint:
 * 1. Fetches filing from database
 * 2. Extracts risk factors and MD&A sections
 * 3. Runs Claude analysis (risk + sentiment)
 * 4. Stores results in database
 * 5. Returns analysis to frontend
 */

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ accession: string }> }
) {
  try {
    const { accession } = await params;

    if (!accession) {
      return NextResponse.json(
        { error: 'Accession number is required' },
        { status: 400 }
      );
    }

    // Disabled caching - always regenerate analysis for fresh results
    // const cacheKey = `analysis:${accession}`;
    // const cached = cache.get(cacheKey);
    // if (cached) {
    //   return NextResponse.json(cached);
    // }

    // Get filing from database
    const filing = await prisma.filing.findUnique({
      where: { accessionNumber: accession },
      include: { company: true },
    });

    if (!filing) {
      return NextResponse.json({ error: 'Filing not found' }, { status: 404 });
    }

    // Disabled returning cached analysis - always regenerate
    // if (filing.analysisData) {
    //   const result = {
    //     filing: {
    //       accessionNumber: filing.accessionNumber,
    //       filingType: filing.filingType,
    //       filingDate: filing.filingDate,
    //       company: {
    //         name: filing.company.name,
    //         ticker: filing.company.ticker,
    //       },
    //     },
    //     analysis: JSON.parse(filing.analysisData),
    //     summary: filing.aiSummary,
    //     riskScore: filing.riskScore,
    //     sentimentScore: filing.sentimentScore,
    //   };
    //   return NextResponse.json(result);
    // }

    // Fetch prior filing of the same type for comparison
    let priorFiling = null;
    try {
      const priorFilings = await prisma.filing.findMany({
        where: {
          companyId: filing.companyId,
          filingType: filing.filingType,
          filingDate: {
            lt: filing.filingDate,
          },
        },
        orderBy: {
          filingDate: 'desc',
        },
        take: 1,
      });

      if (priorFilings.length > 0) {
        priorFiling = priorFilings[0];
      }
    } catch (err) {
      console.log('No prior filing found for comparison');
    }

    const companyContext = `Company: ${filing.company.name} (${filing.company.ticker})
Filing Type: ${filing.filingType}
Filing Date: ${filing.filingDate.toISOString().split('T')[0]}
${priorFiling ? `Prior Filing Date: ${priorFiling.filingDate.toISOString().split('T')[0]}` : 'Note: This is a major public company with decades of filing history.'}`;

    console.log(`Fetching real filing content for ${accession}...`);

    // Fetch real filing content from SEC
    let currentRisks: string;
    let currentMDA: string;
    let priorRisks: string | undefined;

    try {
      // Fetch current filing HTML using the direct filing URL
      console.log(`Fetching from URL: ${filing.filingUrl}`);
      const response = await fetch(filing.filingUrl, {
        headers: {
          'User-Agent': 'SEC Filing Analyzer support@example.com',
        },
      });

      if (!response.ok) {
        throw new Error(`SEC returned ${response.status}`);
      }

      const filingHtml = await response.text();

      console.log(`Fetched filing HTML length: ${filingHtml.length} characters`);
      console.log(`First 500 chars: ${filingHtml.substring(0, 500)}`);

      // Parse the filing to extract sections
      const parsed = filingParser.parseFiling(filingHtml, filing.filingType);
      console.log(`Parsed filing: ${filingParser.getSummary(parsed)}`);

      // If parsing failed, send Claude the entire filing (truncated) and let it extract
      if (!parsed.riskFactors || parsed.riskFactors.length < 100) {
        console.log('Parser failed to extract risk factors, sending full filing to Claude');
        const cleanText = filingParser.cleanHtml(filingHtml);
        const maxChars = 60000; // ~15k tokens for Claude
        const truncated = cleanText.length > maxChars ? cleanText.slice(0, maxChars) + '\n\n[Content truncated]' : cleanText;
        currentRisks = `${companyContext}\n\n${truncated}`;
        currentMDA = `${companyContext}\n\nFull filing above - extract MD&A and financial discussion`;
      } else {
        currentRisks = `${companyContext}\n\n${parsed.riskFactors}`;
        currentMDA = `${companyContext}\n\n${parsed.mdaText}`;
      }

      // If we have a prior filing, fetch and parse it too
      if (priorFiling) {
        try {
          console.log(`Fetching prior filing ${priorFiling.accessionNumber} from ${priorFiling.filingUrl}...`);
          const priorResponse = await fetch(priorFiling.filingUrl, {
            headers: {
              'User-Agent': 'SEC Filing Analyzer support@example.com',
            },
          });

          if (!priorResponse.ok) {
            throw new Error(`SEC returned ${priorResponse.status} for prior filing`);
          }

          const priorHtml = await priorResponse.text();
          const priorParsed = filingParser.parseFiling(
            priorHtml,
            priorFiling.filingType
          );
          console.log(`Parsed prior filing: ${filingParser.getSummary(priorParsed)}`);

          if (priorParsed.riskFactors && priorParsed.riskFactors.length > 50) {
            priorRisks = priorParsed.riskFactors;
          }
        } catch (priorError) {
          console.error('Error fetching prior filing:', priorError);
          // Continue without prior filing comparison
        }
      }
    } catch (fetchError: any) {
      console.error('Error fetching filing content from SEC:', fetchError);

      // Fallback to mock data if SEC fetch fails
      currentRisks = `${companyContext}

[Unable to fetch real filing content from SEC. Using placeholder data.]

Risk Factors:

1. Market Competition: We face intense competition from established players and new entrants. Our market share could decline if we fail to innovate.

2. Supply Chain Dependencies: We rely on a limited number of suppliers for critical components. Disruptions could significantly impact production.

3. Regulatory Changes: New regulations in key markets could require costly compliance measures and impact profitability.

4. Cybersecurity Threats: We face ongoing threats from sophisticated cyber attacks. A breach could damage reputation and result in significant costs.

5. Economic Conditions: Economic downturns could reduce customer demand and impact our financial results.`;

      currentMDA = `${companyContext}

[Unable to fetch real filing content from SEC. Using placeholder data.]

Management's Discussion and Analysis:

Our financial performance was strong, with revenue growing year-over-year. We successfully launched several new products.

However, we faced headwinds from increased competition and rising costs. Looking ahead, we remain confident in our long-term strategy, though we expect near-term challenges from macroeconomic uncertainty.`;
    }

    try {
      console.log('Running Claude AI analysis...');
      // Run Claude analysis with real filing content
      const analysis = await claudeClient.analyzeFullFiling(
        currentRisks,
        currentMDA,
        priorRisks,
        filing.filingType,
        filing.company.name
      );
      console.log('Claude analysis completed successfully');

      // Fetch structured XBRL financial data from SEC Data API
      let structuredFinancials = null;
      if (filing.company.cik) {
        try {
          console.log(`Fetching structured XBRL data for CIK ${filing.company.cik}, accession ${accession}...`);
          structuredFinancials = await secDataAPI.getFinancialSummary(
            filing.company.cik,
            accession
          );
          if (structuredFinancials) {
            console.log('Structured XBRL data fetched successfully:', {
              revenue: structuredFinancials.revenue,
              revenueYoY: structuredFinancials.revenueYoY,
              netIncome: structuredFinancials.netIncome,
              eps: structuredFinancials.eps,
            });
          } else {
            console.log('No structured XBRL data found for this filing');
          }
        } catch (xbrlError) {
          console.error('Error fetching structured XBRL data:', xbrlError);
          // Continue without structured data - Claude's text extraction is still available
        }
      }

      // Merge structured XBRL data with Claude's text-based extraction
      if (structuredFinancials && analysis.financialMetrics) {
        analysis.financialMetrics.structuredData = {
          revenue: structuredFinancials.revenue,
          revenueYoY: structuredFinancials.revenueYoY,
          netIncome: structuredFinancials.netIncome,
          netIncomeYoY: structuredFinancials.netIncomeYoY,
          eps: structuredFinancials.eps,
          epsYoY: structuredFinancials.epsYoY,
          grossMargin: structuredFinancials.grossMargin,
          operatingMargin: structuredFinancials.operatingMargin,
        };
        console.log('Merged structured data into financial metrics');
      }

      // Store analysis in database
      await prisma.filing.update({
        where: { accessionNumber: accession },
        data: {
          analysisData: JSON.stringify(analysis),
          aiSummary: analysis.summary,
          riskScore: analysis.risks.riskScore,
          sentimentScore: analysis.sentiment.sentimentScore,
        },
      });

      const result = {
        filing: {
          accessionNumber: filing.accessionNumber,
          filingType: filing.filingType,
          filingDate: filing.filingDate,
          company: {
            name: filing.company.name,
            ticker: filing.company.ticker,
          },
        },
        analysis,
        summary: analysis.summary,
        riskScore: analysis.risks.riskScore,
        sentimentScore: analysis.sentiment.sentimentScore,
      };

      // Caching disabled for fresh analysis each time
      // cache.set(cacheKey, result, 86400000);
      return NextResponse.json(result);
    } catch (error: any) {
      // If Claude API fails, return a graceful error
      if (error.message.includes('ANTHROPIC_API_KEY')) {
        return NextResponse.json(
          {
            error: 'AI analysis unavailable. Please configure ANTHROPIC_API_KEY.',
            mockData: {
              filing: {
                accessionNumber: filing.accessionNumber,
                filingType: filing.filingType,
                filingDate: filing.filingDate,
                company: {
                  name: filing.company.name,
                  ticker: filing.company.ticker,
                },
              },
              analysis: {
                risks: {
                  overallTrend: 'STABLE',
                  riskScore: 6.0,
                  newRisks: [
                    {
                      title: 'Supply Chain Dependencies',
                      severity: 7,
                      impact: 'Limited supplier base increases risk',
                      reasoning: 'Concentration risk',
                    },
                  ],
                  removedRisks: [],
                  severityChanges: [],
                  topChanges: ['Supply chain risk increased', 'Competitive pressures noted'],
                },
                sentiment: {
                  sentimentScore: 0.3,
                  confidence: 0.7,
                  tone: 'cautiously optimistic',
                  keyPhrases: ['confident in long-term', 'near-term challenges'],
                },
                summary:
                  '• Strong revenue growth of 15% YoY\n• Increased competition and rising costs noted\n• Significant R&D investments for future growth',
              },
              note: 'This is mock data. Configure ANTHROPIC_API_KEY for real analysis.',
            },
          },
          { status: 503 }
        );
      }
      throw error;
    }
  } catch (error: any) {
    console.error('Error analyzing filing:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to analyze filing' },
      { status: 500 }
    );
  }
}
