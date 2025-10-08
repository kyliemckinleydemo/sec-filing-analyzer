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

    // Fetch real filing content from SEC using XBRL/structured data APIs (no HTML scraping)
    let currentRisks: string;
    let currentMDA: string;
    let priorRisks: string | undefined;
    let priorMDA: string | undefined;
    let filingHtml: string = ''; // Keep for backward compatibility with XBRL parser
    let parsed: any = null; // Declare outside try block for stub filing detection

    try {
      // APPROACH 1: Use SEC Submissions API to get filing metadata
      // This API is more reliable and has better rate limits than HTML scraping
      console.log(`Fetching structured data from SEC Submissions API for CIK ${filing.cik}...`);

      // Get company facts (XBRL structured data) with timeout
      let companyFacts = null;
      try {
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('XBRL API timeout')), 8000)
        );
        companyFacts = await Promise.race([
          secClient.getCompanyFacts(filing.cik),
          timeoutPromise
        ]);
        console.log(`✅ XBRL data fetched successfully`);
      } catch (xbrlError: any) {
        console.log(`⚠️ XBRL API failed: ${xbrlError.message}`);
        // Continue without XBRL data
      }

      // Build filing context from structured data
      let structuredContext = '';
      if (companyFacts && companyFacts.facts) {
        const usGaap = companyFacts.facts['us-gaap'] || {};
        const dei = companyFacts.facts['dei'] || {};

        // Extract revenue data
        if (usGaap.Revenues || usGaap.RevenueFromContractWithCustomerExcludingAssessedTax) {
          const revenueData = usGaap.Revenues || usGaap.RevenueFromContractWithCustomerExcludingAssessedTax;
          structuredContext += '\n\nRevenue Data:\n';

          // Find filings close to our filing date
          const filingTime = filing.filingDate.getTime();
          const relevantUnits = revenueData.units?.USD || [];
          const recent = relevantUnits
            .filter((u: any) => {
              const unitTime = new Date(u.filed || u.end).getTime();
              return Math.abs(unitTime - filingTime) < 180 * 24 * 60 * 60 * 1000; // Within 180 days
            })
            .slice(-3); // Last 3 periods

          recent.forEach((u: any) => {
            structuredContext += `  ${u.end}: $${(u.val / 1e9).toFixed(2)}B\n`;
          });
        }

        // Extract net income
        if (usGaap.NetIncomeLoss) {
          const netIncomeData = usGaap.NetIncomeLoss;
          structuredContext += '\nNet Income Data:\n';

          const filingTime = filing.filingDate.getTime();
          const relevantUnits = netIncomeData.units?.USD || [];
          const recent = relevantUnits
            .filter((u: any) => {
              const unitTime = new Date(u.filed || u.end).getTime();
              return Math.abs(unitTime - filingTime) < 180 * 24 * 60 * 60 * 1000;
            })
            .slice(-3);

          recent.forEach((u: any) => {
            structuredContext += `  ${u.end}: $${(u.val / 1e9).toFixed(2)}B\n`;
          });
        }

        // Extract EPS
        if (usGaap.EarningsPerShareBasic || usGaap.EarningsPerShareDiluted) {
          const epsData = usGaap.EarningsPerShareDiluted || usGaap.EarningsPerShareBasic;
          structuredContext += '\nEPS Data:\n';

          const filingTime = filing.filingDate.getTime();
          const relevantUnits = epsData.units?.['USD/shares'] || [];
          const recent = relevantUnits
            .filter((u: any) => {
              const unitTime = new Date(u.filed || u.end).getTime();
              return Math.abs(unitTime - filingTime) < 180 * 24 * 60 * 60 * 1000;
            })
            .slice(-3);

          recent.forEach((u: any) => {
            structuredContext += `  ${u.end}: $${u.val.toFixed(2)}\n`;
          });
        }
      }

      // APPROACH 2: Try to get textual content from filing document
      // NOTE: SEC Archives may still rate limit, so this is best-effort only
      let filingText = '';
      let archivesBlocked = false;

      try {
        // Use the filing URL provided (e.g., https://www.sec.gov/Archives/edgar/data/320193/...)
        if (filing.filingUrl) {
          console.log(`Attempting to fetch filing from Archives: ${filing.filingUrl}`);

          // Rate limit before fetching (150ms minimum between requests)
          await new Promise(resolve => setTimeout(resolve, 150));

          // Add timeout for filing fetch (max 10 seconds)
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 10000);

          try {
            const txtResponse = await fetch(filing.filingUrl, {
              headers: {
                'User-Agent': 'SEC Filing Analyzer/1.0 (educational project)',
                'Accept': 'text/html,application/xhtml+xml',
              },
              signal: controller.signal,
            });
            clearTimeout(timeoutId);

            if (txtResponse.ok) {
              filingText = await txtResponse.text();
              filingHtml = filingText; // Set for XBRL parser compatibility
              console.log(`✅ Fetched filing text: ${filingText.length} characters`);

              // Parse with existing parser
              parsed = filingParser.parseFiling(filingText, filing.filingType);
              console.log(`Parsed filing: ${filingParser.getSummary(parsed)}`);
            } else if (txtResponse.status === 403 || txtResponse.status === 429) {
              console.log(`⚠️ SEC Archives rate limited (${txtResponse.status}), proceeding with XBRL data only`);
              archivesBlocked = true;
            } else {
              console.log(`Filing URL returned ${txtResponse.status}, will use structured data only`);
            }
          } catch (fetchError: any) {
            clearTimeout(timeoutId);
            if (fetchError.name === 'AbortError') {
              console.log(`⚠️ Filing fetch timed out after 10s, proceeding with XBRL data only`);
            } else {
              throw fetchError;
            }
          }
        } else {
          console.log(`No filing URL provided, skipping text fetch`);
        }
      } catch (txtError: any) {
        console.log(`Could not fetch filing text (${txtError.message}), using structured data only`);
      }

      // Build analysis context based on what we have
      if (parsed && parsed.riskFactors && parsed.riskFactors.length > 100) {
        // We successfully parsed the filing
        console.log('✅ Using parsed filing text (full Risk Factors and MD&A)');
        currentRisks = `${companyContext}\n\n${parsed.riskFactors}`;
        currentMDA = `${companyContext}\n\n${parsed.mdaText}`;
      } else if (structuredContext.length > 50) {
        // We have structured financial data but no text sections
        console.log('⚠️ Using structured XBRL data only (SEC rate limiting prevented full text access)');
        currentRisks = `${companyContext}\n\n[SEC Rate Limiting - Using Structured XBRL Financial Data]${structuredContext}

Note: SEC is currently rate limiting requests from this IP address. Full text Risk Factors are not available.
Based on the financial data above, provide a risk assessment for ${filing.company.name} focusing on:
1. Financial performance trends (revenue, profitability)
2. Quarter-over-quarter or year-over-year changes
3. Industry-typical risks for a company of this size and sector
4. Any notable patterns in the financial metrics`;

        currentMDA = `${companyContext}\n\n[SEC Rate Limiting - Using Structured XBRL Financial Data]${structuredContext}

Note: SEC is currently rate limiting requests. Full MD&A text is not available.
Based on the financial metrics above, provide management commentary analysis:
1. Assess financial performance (revenue trends, profitability, margins)
2. Identify quarter-over-quarter or YoY changes
3. Comment on business momentum and trajectory
4. Provide realistic sentiment assessment based on the numbers`;
      } else {
        // Fallback: minimal data available
        console.log('⚠️ Limited data - SEC is blocking both text and XBRL access');
        currentRisks = `${companyContext}

[SEC Rate Limiting Active - Limited Data Available]

The SEC is currently rate limiting API requests from this IP address, preventing access to:
- Filing text (Risk Factors, MD&A sections)
- XBRL structured financial data

For ${filing.company.name} ${filing.filingType} filed ${filing.filingDate.toISOString().split('T')[0]}:
Provide a general risk assessment based on:
1. Typical ${filing.filingType} risk factors for a large public company
2. Known industry risks for ${filing.company.name}'s sector
3. General market conditions at the time of filing`;

        currentMDA = `${companyContext}

[SEC Rate Limiting - Limited Data]

Provide a general management analysis for ${filing.company.name} based on:
1. Typical ${filing.filingType} financial disclosures
2. General company context and industry position
3. Note that specific financial data is unavailable due to SEC rate limiting`;
      }

      // If we have a prior filing, try to get its data too
      if (priorFiling) {
        try {
          console.log(`Fetching prior filing structured data for ${priorFiling.accessionNumber}...`);

          // Try to get structured prior filing data
          const priorCompanyFacts = await secClient.getCompanyFacts(priorFiling.cik);

          if (priorCompanyFacts && priorCompanyFacts.facts) {
            const usGaap = priorCompanyFacts.facts['us-gaap'] || {};
            let priorStructuredContext = '';

            // Extract prior period revenue
            if (usGaap.Revenues || usGaap.RevenueFromContractWithCustomerExcludingAssessedTax) {
              const revenueData = usGaap.Revenues || usGaap.RevenueFromContractWithCustomerExcludingAssessedTax;
              const priorFilingTime = priorFiling.filingDate.getTime();
              const relevantUnits = revenueData.units?.USD || [];
              const recent = relevantUnits
                .filter((u: any) => {
                  const unitTime = new Date(u.filed || u.end).getTime();
                  return Math.abs(unitTime - priorFilingTime) < 180 * 24 * 60 * 60 * 1000;
                })
                .slice(-2);

              if (recent.length > 0) {
                priorStructuredContext += '\n\nPrior Period Revenue:\n';
                recent.forEach((u: any) => {
                  priorStructuredContext += `  ${u.end}: $${(u.val / 1e9).toFixed(2)}B\n`;
                });
              }
            }

            if (priorStructuredContext.length > 50) {
              priorRisks = `Prior Filing Context:${priorStructuredContext}`;
              priorMDA = priorStructuredContext;
            }
          }
        } catch (priorError) {
          console.error('Error fetching prior filing data:', priorError);
          // Continue without prior filing comparison
        }
      }
    } catch (fetchError: any) {
      console.error('Error fetching filing content from SEC XBRL API:', fetchError);

      // Fallback to minimal context based on filing metadata
      currentRisks = `${companyContext}

[SEC XBRL API unavailable. Analysis based on filing metadata only.]

Filing Type: ${filing.filingType}
Company: ${filing.company.name} (${filing.company.ticker})
Filing Date: ${filing.filingDate.toISOString().split('T')[0]}

Note: Provide general analysis for this filing type based on typical ${filing.filingType} contents and company context.`;

      currentMDA = currentRisks;
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
      if (analysis.financialMetrics?.structuredData) {
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
