import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { claudeClient } from '@/lib/claude-client';
import { cache } from '@/lib/cache';
import { secClient } from '@/lib/sec-client';
import { filingParser } from '@/lib/filing-parser';
import { secDataAPI } from '@/lib/sec-data-api';
import { xbrlParser } from '@/lib/xbrl-parser';
import { financialDataClient } from '@/lib/yahoo-finance';
import { yahooFinancePythonClient } from '@/lib/yahoo-finance-python';

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

    // Normalize accession number (add dashes if missing)
    const normalizedAccession = accession.includes('-')
      ? accession
      : `${accession.slice(0, 10)}-${accession.slice(10, 12)}-${accession.slice(12)}`;

    // ALWAYS delete existing filing to ensure fresh analysis (no stale cache)
    const existingFiling = await prisma.filing.findUnique({
      where: { accessionNumber: normalizedAccession },
    });

    if (existingFiling) {
      console.log(`Deleting existing filing ${normalizedAccession} for fresh analysis...`);
      // Delete related predictions first (foreign key constraint)
      await prisma.prediction.deleteMany({
        where: { filingId: existingFiling.id },
      });
      // Delete the filing
      await prisma.filing.delete({
        where: { accessionNumber: normalizedAccession },
      });
    }

    // Create filing from URL params
    let filing = null;
    const { searchParams } = new URL(request.url);
    const ticker = searchParams.get('ticker');
    const cik = searchParams.get('cik');
    const filingType = searchParams.get('filingType');
    const filingDate = searchParams.get('filingDate');
    const filingUrl = searchParams.get('filingUrl');
    const companyName = searchParams.get('companyName');

    if (!ticker || !cik || !filingType || !filingDate || !filingUrl || !companyName) {
      return NextResponse.json(
        { error: 'Filing not found in database. Please provide: ticker, cik, filingType, filingDate, filingUrl, companyName as query parameters.' },
        { status: 404 }
      );
    }

    // Create company if it doesn't exist
    let company = await prisma.company.findUnique({
      where: { ticker },
    });

    if (!company) {
      company = await prisma.company.create({
        data: {
          ticker,
          name: companyName,
          cik,
        },
      });
    }

    // Create filing and reload with company relationship
    const createdFiling = await prisma.filing.create({
      data: {
        accessionNumber: normalizedAccession,
        cik: company.cik,
        filingType,
        filingDate: new Date(filingDate),
        filingUrl,
        companyId: company.id,
      },
    });

    // Reload with company relationship
    filing = await prisma.filing.findUnique({
      where: { accessionNumber: normalizedAccession },
      include: { company: true },
    });

    if (!filing) {
      return NextResponse.json(
        { error: 'Failed to create filing' },
        { status: 500 }
      );
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
    let priorMDA: string | undefined;
    let filingHtml: string = ''; // Declare outside try block for XBRL parsing
    let parsed: any = null; // Declare outside try block for stub filing detection

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

      filingHtml = await response.text();

      console.log(`Fetched filing HTML length: ${filingHtml.length} characters`);
      console.log(`First 500 chars: ${filingHtml.substring(0, 500)}`);

      // Parse the filing to extract sections
      parsed = filingParser.parseFiling(filingHtml, filing.filingType);
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
          if (priorParsed.mdaText && priorParsed.mdaText.length > 50) {
            priorMDA = priorParsed.mdaText;
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
        filing.company.name,
        priorMDA
      );
      console.log('Claude analysis completed successfully');

      // Extract inline XBRL financial data directly from the filing HTML
      let xbrlFinancials = null;
      try {
        console.log('Parsing inline XBRL financial data from filing...');
        xbrlFinancials = xbrlParser.parseInlineXBRL(filingHtml);
        if (xbrlFinancials) {
          try {
            console.log('XBRL extraction complete:', xbrlParser.getSummary(xbrlFinancials));
          } catch (summaryError) {
            console.error('Error getting XBRL summary (continuing):', summaryError);
            console.log('XBRL extraction complete (summary unavailable)');
          }
        }
      } catch (xbrlParseError) {
        console.error('Error parsing inline XBRL:', xbrlParseError);
        // Continue without inline XBRL data
      }

      // ENHANCEMENT: If this is a stub 10-Q (no MD&A), look for the corresponding 8-K earnings release
      // This helps us extract earnings surprises and guidance that may not be in the 10-Q
      if (
        filing.filingType === '10-Q' &&
        (!parsed.mdaText || parsed.mdaText.length < 500) &&
        xbrlFinancials &&
        (xbrlFinancials.revenue || xbrlFinancials.eps)
      ) {
        console.log('Detected stub 10-Q with minimal narrative. Searching for related 8-K earnings release...');
        try {
          // Look for 8-K filed within 5 days before the 10-Q
          const filingTimestamp = filing.filingDate.getTime();
          const fiveDaysBefore = filingTimestamp - (5 * 24 * 60 * 60 * 1000);

          const related8K = await prisma.filing.findFirst({
            where: {
              companyId: filing.companyId,
              filingType: '8-K',
              filingDate: {
                gte: new Date(fiveDaysBefore),
                lte: filing.filingDate,
              },
            },
            orderBy: {
              filingDate: 'desc',
            },
          });

          if (related8K && related8K.analysisData) {
            console.log(`Found related 8-K: ${related8K.accessionNumber}`);
            const eightKAnalysis = JSON.parse(related8K.analysisData);

            // Merge earnings surprises and guidance from 8-K
            if (eightKAnalysis.financialMetrics) {
              if (!analysis.financialMetrics) {
                analysis.financialMetrics = {};
              }

              // Copy surprises from 8-K if we don't have them
              if (
                eightKAnalysis.financialMetrics.surprises &&
                eightKAnalysis.financialMetrics.surprises.length > 0
              ) {
                analysis.financialMetrics.surprises = eightKAnalysis.financialMetrics.surprises;
                console.log('Merged earnings surprises from 8-K:', eightKAnalysis.financialMetrics.surprises);
              }

              // Copy guidance from 8-K if we don't have it
              if (eightKAnalysis.financialMetrics.guidanceDirection && eightKAnalysis.financialMetrics.guidanceDirection !== 'not_provided') {
                analysis.financialMetrics.guidanceDirection = eightKAnalysis.financialMetrics.guidanceDirection;
                analysis.financialMetrics.guidanceDetails = eightKAnalysis.financialMetrics.guidanceDetails;
                console.log('Merged guidance from 8-K');
              }

              // Copy guidance comparison if available
              if (eightKAnalysis.financialMetrics.guidanceComparison) {
                analysis.financialMetrics.guidanceComparison = eightKAnalysis.financialMetrics.guidanceComparison;
                console.log('Merged guidance comparison from 8-K');
              }
            }
          } else if (related8K && !related8K.analysisData) {
            console.log(`Found un-analyzed 8-K: ${related8K.accessionNumber}. Consider analyzing it first.`);
          } else {
            console.log('No related 8-K earnings release found within 5 days');
          }
        } catch (eightKError) {
          console.error('Error fetching related 8-K:', eightKError);
        }
      }

      // Always merge XBRL data if we have it (most reliable source)
      if (xbrlFinancials && (xbrlFinancials.revenue || xbrlFinancials.netIncome || xbrlFinancials.eps)) {
        if (!analysis.financialMetrics) {
          analysis.financialMetrics = {};
        }

        analysis.financialMetrics.structuredData = {
          revenue: xbrlFinancials.revenue,
          netIncome: xbrlFinancials.netIncome,
          eps: xbrlFinancials.eps,
          grossMargin: xbrlFinancials.grossProfit && xbrlFinancials.revenue
            ? (xbrlFinancials.grossProfit / xbrlFinancials.revenue) * 100
            : undefined,
          operatingMargin: xbrlFinancials.operatingIncome && xbrlFinancials.revenue
            ? (xbrlFinancials.operatingIncome / xbrlFinancials.revenue) * 100
            : undefined,
        };
        console.log('Merged inline XBRL data into financial metrics');

        // NEW: Fetch analyst consensus, P/E ratio, and market cap using Yahoo Finance (Python)
        if (filing.company.ticker && xbrlFinancials.eps && xbrlFinancials.revenue) {
          try {
            console.log(`[Yahoo Finance] Fetching consensus, P/E, and market cap for ${filing.company.ticker}...`);
            const yahooData = await yahooFinancePythonClient.fetchData(
              filing.company.ticker,
              filing.filingDate
            );

            if (yahooData) {
              console.log(`[Yahoo Finance] ✅ Data fetched: P/E=${yahooData.peRatio}, MarketCap=$${(yahooData.marketCapB || 0).toFixed(1)}B`);

              // Store P/E ratio and market cap for prediction model
              analysis.financialMetrics.structuredData.peRatio = yahooData.peRatio;
              analysis.financialMetrics.structuredData.marketCap = yahooData.marketCapB; // in billions
              analysis.financialMetrics.structuredData.sector = yahooData.sector;
              analysis.financialMetrics.structuredData.industry = yahooData.industry;

              // Calculate earnings surprises if we have consensus estimates
              if (yahooData.consensusEPS || yahooData.consensusRevenue) {
                console.log(`[Yahoo Finance] Found consensus: EPS ${yahooData.consensusEPS}, Revenue $${yahooData.consensusRevenue ? (yahooData.consensusRevenue / 1e9).toFixed(2) + 'B' : 'N/A'}`);

                const surpriseResult = yahooFinancePythonClient.calculateSurprises(
                  xbrlFinancials.eps,
                  xbrlFinancials.revenue,
                  yahooData.consensusEPS,
                  yahooData.consensusRevenue
                );

                if (surpriseResult.surprisesArray.length > 0) {
                  analysis.financialMetrics.surprises = surpriseResult.surprisesArray;
                  console.log(`[Yahoo Finance] Detected earnings surprises:`, surpriseResult.surprisesArray);
                }

                // Store consensus and surprise data
                analysis.financialMetrics.structuredData.consensusEPS = yahooData.consensusEPS;
                analysis.financialMetrics.structuredData.consensusRevenue = yahooData.consensusRevenue;
                analysis.financialMetrics.structuredData.epsSurprise = surpriseResult.epsSurprise;
                analysis.financialMetrics.structuredData.epsSurpriseMagnitude = surpriseResult.epsSurpriseMagnitude;
                analysis.financialMetrics.structuredData.revenueSurprise = surpriseResult.revenueSurprise;
                analysis.financialMetrics.structuredData.revenueSurpriseMagnitude = surpriseResult.revenueSurpriseMagnitude;
              } else {
                console.log(`[Yahoo Finance] No analyst estimates found for this period`);
              }
            } else {
              console.log(`[Yahoo Finance] Failed to fetch data for ${filing.company.ticker}`);
            }
          } catch (consensusError) {
            console.error('[Yahoo Finance] Error fetching data:', consensusError);
            // Continue without Yahoo Finance data
          }
        }
      } else {
        console.log('No inline XBRL financial data found, trying SEC Company Facts API...');

        // Fallback to SEC Data API if inline XBRL didn't work
        if (filing.company.cik) {
          try {
            console.log(`Fetching structured XBRL data for CIK ${filing.company.cik}, accession ${normalizedAccession}...`);
            const structuredFinancials = await secDataAPI.getFinancialSummary(
              filing.company.cik,
              normalizedAccession
            );
            if (structuredFinancials) {
              console.log('SEC API data fetched successfully');
              if (!analysis.financialMetrics) {
                analysis.financialMetrics = {};
              }
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
            } else {
              console.log('No SEC API data found for this filing');
            }
          } catch (xbrlError) {
            console.error('Error fetching SEC API data:', xbrlError);
          }
        }

        // NEW: For 8-K filings (earnings announcements), still try to get Yahoo Finance data
        // even without XBRL, since Claude may have extracted earnings from the press release
        if (filing.filingType === '8-K' && filing.company.ticker) {
          try {
            console.log(`[Yahoo Finance] Fetching data for 8-K filing ${filing.company.ticker}...`);
            const yahooData = await yahooFinancePythonClient.fetchData(
              filing.company.ticker,
              filing.filingDate
            );

            if (yahooData) {
              console.log(`[Yahoo Finance] ✅ Data fetched: P/E=${yahooData.peRatio}, MarketCap=$${(yahooData.marketCapB || 0).toFixed(1)}B`);

              // Initialize structuredData if it doesn't exist
              if (!analysis.financialMetrics) {
                analysis.financialMetrics = {};
              }
              if (!analysis.financialMetrics.structuredData) {
                analysis.financialMetrics.structuredData = {};
              }

              // Store P/E ratio and market cap
              analysis.financialMetrics.structuredData.peRatio = yahooData.peRatio;
              analysis.financialMetrics.structuredData.marketCap = yahooData.marketCapB;
              analysis.financialMetrics.structuredData.sector = yahooData.sector;
              analysis.financialMetrics.structuredData.industry = yahooData.industry;

              // Try to extract EPS/Revenue from Claude's analysis of the press release
              let extractedEPS = undefined;
              let extractedRevenue = undefined;

              // Check if Claude extracted earnings metrics from the filing text
              if (analysis.financialMetrics.keyMetrics) {
                for (const metric of analysis.financialMetrics.keyMetrics) {
                  if (metric.toLowerCase().includes('eps') || metric.toLowerCase().includes('earnings per share')) {
                    // Try to extract number from metric
                    const epsMatch = metric.match(/\$?(\d+\.?\d*)/);
                    if (epsMatch) {
                      extractedEPS = parseFloat(epsMatch[1]);
                    }
                  }
                  if (metric.toLowerCase().includes('revenue') || metric.toLowerCase().includes('sales')) {
                    const revenueMatch = metric.match(/\$?(\d+\.?\d*)([BMK])?/);
                    if (revenueMatch) {
                      let value = parseFloat(revenueMatch[1]);
                      const suffix = revenueMatch[2];
                      if (suffix === 'B') value *= 1e9;
                      else if (suffix === 'M') value *= 1e6;
                      else if (suffix === 'K') value *= 1e3;
                      extractedRevenue = value;
                    }
                  }
                }
              }

              // Calculate earnings surprises if we have consensus and extracted earnings
              if ((yahooData.consensusEPS || yahooData.consensusRevenue) && (extractedEPS !== undefined || extractedRevenue !== undefined)) {
                console.log(`[Yahoo Finance] Found consensus: EPS ${yahooData.consensusEPS}, Revenue $${yahooData.consensusRevenue ? (yahooData.consensusRevenue / 1e9).toFixed(2) + 'B' : 'N/A'}`);

                const surpriseResult = yahooFinancePythonClient.calculateSurprises(
                  extractedEPS || 0,
                  extractedRevenue || 0,
                  yahooData.consensusEPS,
                  yahooData.consensusRevenue
                );

                if (surpriseResult.surprisesArray.length > 0) {
                  analysis.financialMetrics.surprises = surpriseResult.surprisesArray;
                  console.log(`[Yahoo Finance] Detected earnings surprises from 8-K:`, surpriseResult.surprisesArray);
                }

                // Store consensus and surprise data
                analysis.financialMetrics.structuredData.consensusEPS = yahooData.consensusEPS;
                analysis.financialMetrics.structuredData.consensusRevenue = yahooData.consensusRevenue;
                analysis.financialMetrics.structuredData.epsSurprise = surpriseResult.epsSurprise;
                analysis.financialMetrics.structuredData.epsSurpriseMagnitude = surpriseResult.epsSurpriseMagnitude;
                analysis.financialMetrics.structuredData.revenueSurprise = surpriseResult.revenueSurprise;
                analysis.financialMetrics.structuredData.revenueSurpriseMagnitude = surpriseResult.revenueSurpriseMagnitude;
              } else {
                console.log(`[Yahoo Finance] No analyst estimates found for this period`);
              }
            } else {
              console.log(`[Yahoo Finance] Failed to fetch data for ${filing.company.ticker}`);
            }
          } catch (yahooError) {
            console.error('[Yahoo Finance] Error fetching data for 8-K:', yahooError);
            // Continue without Yahoo Finance data
          }
        }
      }

      // Adjust sentiment based on earnings surprises (beats are positive news)
      if (analysis.financialMetrics.structuredData) {
        const { epsSurprise, revenueSurprise, epsSurpriseMagnitude, revenueSurpriseMagnitude } = analysis.financialMetrics.structuredData;

        // If we have earnings surprises, adjust sentiment
        // IMPORTANT: Actual earnings performance massively overweights sentiment wording
        if (epsSurprise || revenueSurprise) {
          let sentimentAdjustment = 0;

          // Normalize magnitude to 0-1 range (epsSurpriseMagnitude is in % like -10.8 or +15.2)
          const normalizedEpsMag = Math.min(Math.abs(epsSurpriseMagnitude || 0) / 100, 1.0);
          const normalizedRevMag = Math.min(Math.abs(revenueSurpriseMagnitude || 0) / 100, 1.0);

          // EPS surprise has massive weight - overrides sentiment wording completely
          if (epsSurprise === 'beat') {
            sentimentAdjustment += 0.5 + normalizedEpsMag * 1.0; // Base +0.5, up to +1.5 for large beats
          } else if (epsSurprise === 'miss') {
            sentimentAdjustment -= 0.5 + normalizedEpsMag * 1.0; // Base -0.5, down to -1.5 for large misses
          }

          // Revenue surprise has less weight but still matters
          if (revenueSurprise === 'beat') {
            sentimentAdjustment += 0.3 + normalizedRevMag * 0.5; // Base +0.3, up to +0.8
          } else if (revenueSurprise === 'miss') {
            sentimentAdjustment -= 0.3 + normalizedRevMag * 0.5; // Base -0.3, down to -0.8
          }

          // Apply adjustment and clamp to [-1, 1]
          const originalSentiment = analysis.sentiment.sentimentScore;
          analysis.sentiment.sentimentScore = Math.max(-1, Math.min(1, originalSentiment + sentimentAdjustment));

          // Add note about adjustment and update tone
          if (sentimentAdjustment !== 0) {
            console.log(`[Sentiment] EPS: ${epsSurprise || 'N/A'}, Revenue: ${revenueSurprise || 'N/A'}, Adjustment: ${sentimentAdjustment.toFixed(2)}`);
            console.log(`[Sentiment] Adjusted from ${originalSentiment.toFixed(2)} to ${analysis.sentiment.sentimentScore.toFixed(2)} based on earnings surprises`);

            // Clear any existing earnings-related phrases to avoid contradictions
            analysis.sentiment.keyPhrases = (analysis.sentiment.keyPhrases || []).filter(
              phrase => !phrase.toLowerCase().includes('earnings') && !phrase.toLowerCase().includes('beat') && !phrase.toLowerCase().includes('miss')
            );

            if (sentimentAdjustment > 0) {
              analysis.sentiment.keyPhrases.unshift('Earnings beat expectations');
              // Update tone based on final sentiment score
              if (analysis.sentiment.sentimentScore > 0.5) {
                analysis.sentiment.tone = 'optimistic';
              } else if (analysis.sentiment.sentimentScore > 0) {
                analysis.sentiment.tone = 'cautiously optimistic';
              }
            } else {
              // For earnings misses, filter out overly positive phrases and add miss note at top
              analysis.sentiment.keyPhrases = (analysis.sentiment.keyPhrases || []).filter(
                phrase => {
                  const lower = phrase.toLowerCase();
                  return !lower.includes('strong') &&
                         !lower.includes('exceeded') &&
                         !lower.includes('positive') &&
                         !lower.includes('growth') &&
                         !lower.includes('improved');
                }
              );
              analysis.sentiment.keyPhrases.unshift('Earnings missed expectations');
              // Update tone based on final sentiment score
              if (analysis.sentiment.sentimentScore < -0.5) {
                analysis.sentiment.tone = 'pessimistic';
              } else if (analysis.sentiment.sentimentScore < 0) {
                analysis.sentiment.tone = 'cautious';
              } else {
                analysis.sentiment.tone = 'neutral';
              }
            }
          }
        }
      }

      // Store analysis in database
      await prisma.filing.update({
        where: { accessionNumber: normalizedAccession },
        data: {
          analysisData: JSON.stringify(analysis),
          aiSummary: analysis.summary,
          riskScore: analysis.risks.riskScore,
          sentimentScore: analysis.sentiment.sentimentScore,
        },
      });

      // Debug: Check if company relationship was loaded
      if (!filing.company) {
        console.error('ERROR: Company relationship not loaded!', {
          accession: filing.accessionNumber,
          companyId: filing.companyId,
        });
      }

      const result = {
        filing: {
          accessionNumber: filing.accessionNumber,
          filingType: filing.filingType,
          filingDate: filing.filingDate,
          company: filing.company ? {
            name: filing.company.name,
            ticker: filing.company.ticker,
          } : undefined,
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
