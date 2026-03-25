/**
 * @module app/faq/page
 * @description Next.js page component rendering an interactive FAQ about SEC filing analysis, covering the ML prediction model, data sources, accuracy metrics, and usage patterns
 *
 * PURPOSE:
 * - Display comprehensive FAQ covering model methodology, analyst opinion tracking, backtesting results, and data source limitations
 * - Organize questions into 5 categories: Purpose & Overview, The Model, Variables & Features, Backtesting & Accuracy, and Data & Coverage
 * - Provide detailed explanations of Ridge regression MoE model using 13 features with 77.5% high-confidence directional accuracy
 * - Document key findings including EPS surprise as strongest new feature, contrarian downgrade signals, and macro regime adjustment
 *
 * DEPENDENCIES:
 * - @/components/ui/button - Provides Button component for navigation actions in page header
 * - @/components/ui/card - Provides Card, CardContent, CardDescription, CardHeader, CardTitle for structuring FAQ content sections
 * - next/navigation - Provides useRouter hook for programmatic navigation between app pages
 *
 * EXPORTS:
 * - FAQPage (component) - Default export rendering FAQ page with 20+ questions across 5 categories explaining SEC filing analysis methodology
 *
 * PATTERNS:
 * - Access at /faq route to view comprehensive documentation of prediction model and methodology
 * - FAQ data structured as array of category objects, each containing questions array with q/a properties
 * - Use router.push() or router.back() for navigation (router hook initialized but navigation handlers not yet implemented)
 * - Card components wrap each category section with CardHeader for category title and CardContent for Q&A pairs
 *
 * CLAUDE NOTES:
 * - Reveals Ridge MoE model's architecture: 13 features, 44 experts (global + 11 sector + 4 cap-tier + 29 combined), strict 90-day walk-forward CV
 * - Documents critical data source limitations including SEC EDGAR XBRL tagging errors, Yahoo Finance delays, and no independent verification
 * - EPS surprise is strongest new feature (v2); major bank downgrades are contrarian bullish signal; macro regime prevents bull-market bias
 * - Model trained on 4,009 filings from 500+ companies with strict walk-forward validation preventing lookahead bias
 * - 30-day alpha target (stock return minus S&P 500) isolates filing-specific signal from broad market direction
 */
'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useRouter } from 'next/navigation';

export default function FAQPage() {
  const router = useRouter();

  const faqs = [
    {
      category: "Purpose & Overview",
      questions: [
        {
          q: "What is the purpose of this app?",
          a: "This app uses AI to analyze SEC filings (10-K, 10-Q, and 8-K) and predict how they will impact stock prices over the next 30 calendar days relative to the S&P 500. It combines natural language processing, financial data extraction, EPS surprise analysis, macro regime data, and machine learning to help investors understand what filings mean for stock performance."
        },
        {
          q: "Who is this app for?",
          a: "This tool is designed for retail investors, financial analysts, and anyone who wants to understand SEC filings without reading hundreds of pages of dense legal and financial text. It's particularly useful for tracking earnings announcements, quarterly reports, and annual filings."
        },
        {
          q: "How is this different from other tools?",
          a: "Most tools either show raw filings with no analysis (like SEC EDGAR) or provide generic summaries. Our app goes further by: (1) extracting specific financial metrics and comparing them to analyst expectations, (2) analyzing management sentiment and tone changes vs prior filings, (3) identifying new risks, and (4) predicting 30-day market-relative alpha — how much the stock will outperform or underperform the S&P 500 following the filing."
        }
      ]
    },
    {
      category: "The Model",
      questions: [
        {
          q: "How does the prediction model work?",
          a: "Our model uses Ridge regression to predict 30-day market-relative alpha — the stock return minus S&P 500 return — isolating filing-specific signal from broad market direction. It combines 13 features: price momentum (52-week high/low ratios), analyst activity (contrarian major-bank downgrade signals), Claude AI concern and sentiment scores, EPS surprise, market cap, filing type, tone shift vs prior filing, and macro regime (S&P 500 trend and VIX at filing date). Rather than one global model, we deploy 44 Mixture-of-Experts (MoE) specialists — one per sector, one per market cap tier, and combined sector×cap-tier models — routing each prediction to the most relevant expert."
        },
        {
          q: "What machine learning approach do you use?",
          a: "We use Ridge regression (regularization λ=100) with forward stepwise feature selection. The model is trained on 4,009 SEC filings from 500+ companies across all sectors and market cap tiers. We use a strict 90-day walk-forward cross-validation — the test set is always at least 90 days after the training cutoff — to prevent any temporal leakage. High-confidence signals achieve 77.5% directional accuracy with an annualized Sharpe ratio of 2.22. The model is fully interpretable: every prediction shows which features drove it (e.g., 'strong price momentum: +2.1 score', 'EPS beat: +0.8 score')."
        },
        {
          q: "Why 30 calendar days?",
          a: "We predict 30-day market-relative alpha rather than short-term returns for two reasons. First, SEC filing reactions often take 2-4 weeks to fully price in as institutional investors complete their analysis and adjust positions. Second, targeting alpha (stock return minus S&P 500) removes the dominant noise source from raw returns — whether the overall market went up or down during the period — isolating the filing's company-specific impact."
        }
      ]
    },
    {
      category: "Variables & Features",
      questions: [
        {
          q: "What variables does the model use?",
          a: "The model uses 13 features in five categories: (1) Price momentum — ratio of current price to 52-week low (strongest feature), ratio to 52-week high; (2) Analyst activity — major-bank downgrade count as a contrarian signal, analyst upside potential as a value-trap indicator, upgrade count over 30 days; (3) AI-generated signals — Claude AI concern level (0-10) and sentiment score (-1 to +1); (4) Earnings & filing context — EPS surprise vs consensus (winsorized to ±50%), filing type factor (10-K/10-Q/8-K), and tone change delta vs prior filing; (5) Macro regime — S&P 500 30-day return and VIX level at the filing date."
        },
        {
          q: "How do analyst opinion changes work as a predictive signal?",
          a: "We track analyst upgrades and downgrades from major firms (Goldman Sachs, Morgan Stanley, JP Morgan, Bank of America, Citi, Wells Fargo, Barclays, UBS) in the 30 days before each filing. Major-bank downgrades are a contrarian bullish signal — top-tier firms tend to downgrade after prices have already fallen, and the market systematically overreacts. Conversely, high analyst price targets relative to current price ('analyst upside potential') is a bearish signal — these often indicate value traps. Analyst upgrades in the 30-day pre-filing window carry a slight negative weight — they tend to be lagging indicators that follow price strength."
        },
        {
          q: "How do you calculate sentiment?",
          a: "We use Claude AI (Anthropic's language model) to analyze the Management Discussion & Analysis (MD&A) section of filings, generating a sentiment score from -1 (very pessimistic) to +1 (very optimistic). We also compute a tone change delta — the difference between the current filing's sentiment and the same company's previous same-type filing. Tone shifts (e.g., from optimistic to cautious) are often more predictive than absolute sentiment levels."
        },
        {
          q: "What are EPS surprises and why do they matter?",
          a: "An EPS surprise is the difference between actual earnings per share and analyst consensus estimates, expressed as a percentage. We source consensus from Yahoo Finance's earningsHistory module. EPS surprise is the strongest new feature added in v2, with a positive weight — beats drive alpha and misses destroy it. Surprises are winsorized to ±50% to prevent outliers (e.g., a company missing by 1,000%) from distorting the model. Coverage is 58% of filings where historical earnings data is available."
        },
        {
          q: "How do macro regime features work?",
          a: "The model incorporates two macro features at the time of each filing: (1) S&P 500 30-day return — when the market is in a strong uptrend, filing-related alpha tends to be higher; (2) VIX level — when fear is elevated, dispersion is higher and the model's signals are more powerful but riskier. These come from our MacroIndicators table (daily data from 2022 to present, 100% coverage across the training set). Adding these prevents the model from being systematically wrong in bear markets — a key concern with models trained in multi-year bull periods."
        },
        {
          q: "How do you handle risk factors?",
          a: "Our AI risk analysis goes beyond traditional 'Risk Factors' sections. Claude analyzes the entire filing to detect material events including data breaches, litigation, executive departures, regulatory investigations, restructuring charges, covenant breaches, and financial restatements. Risk is scored on a 0-10 concern scale. A higher concern level is a bearish signal in the prediction model. We compare current vs. prior filings to identify new risks, removed risks, and severity changes — 8-Ks in particular often announce material events without a formal risk section."
        }
      ]
    },
    {
      category: "Backtesting & Accuracy",
      questions: [
        {
          q: "How did you backtest the model?",
          a: "We use strict walk-forward cross-validation: the model is trained on all data up to time T, then evaluated on filings from T+90 days onward (the 90-day gap prevents any boundary leakage). This was repeated across multiple splits. For price data, we use historical snapshots taken at the time of each filing (99% coverage) rather than today's stock price — this eliminates the most common source of backtest bias in financial models. Actual 30-day alpha outcomes come from Yahoo Finance historical prices. The dataset covers 4,009 filings from 500+ companies spanning 2022 to 2025."
        },
        {
          q: "What is the model's accuracy?",
          a: "Under strict 90-day walk-forward CV: 56.2% overall directional accuracy and 77.5% for high-confidence signals, with an annualized Sharpe ratio of 2.22 on the high-confidence signal portfolio. Temporal consistency is strong — older filings in the training data show similar accuracy (69.8% at 2+ years, 76.6% at 1-2 years, 82.2% in the last 12 months), indicating the model captures a real structural signal rather than overfitting to the recent bull market. The model's PRIMARY edge is identifying relative losers — SHORT signals have the highest directional accuracy."
        },
        {
          q: "What are the model's limitations?",
          a: "The model cannot predict: (1) External shocks (geopolitical events, sudden market crashes), (2) Sector-wide rotations unrelated to the specific company's filing, (3) Fraud or manipulation not disclosed in filings, (4) Short-term intraday volatility (we predict 30-day alpha, not day-trading signals). The model performs best when multiple signals agree (strong price momentum + EPS beat + improving tone + low concern). Single-feature signals are noisier. Additionally, past performance does not guarantee future results."
        },
        {
          q: "How do you prevent overfitting?",
          a: "Several layers of protection: (1) Ridge regularization (λ=100) penalizes large coefficients, preventing any single feature from dominating, (2) Forward stepwise selection — only features that survive out-of-sample improvement are included, (3) 90-day strict walk-forward CV — the test window is always 90+ days after training cutoff, eliminating boundary leakage, (4) Mixture-of-Experts routing — sector and cap-tier models only activate when that segment has enough training data (minimum 30 samples), (5) Feature winsorization (EPS surprise clipped to ±50%) prevents outlier filings from distorting weights. The simple CV accuracy gap between standard CV (59.5%) and strict 90-day CV (56.2%) of ~3pp is healthy — small enough to confirm real signal, large enough to confirm we're measuring it honestly."
        }
      ]
    },
    {
      category: "Data & Coverage",
      questions: [
        {
          q: "What companies are covered?",
          a: "We track 640+ companies including all S&P 500 constituents and high-volume stocks across major sectors: Technology (AAPL, MSFT, GOOGL, NVDA, etc.), Finance (JPM, BAC, GS), Healthcare (UNH, JNJ, PFE), Consumer (AMZN, WMT, TSLA), Energy (XOM, CVX), and more. The list is continuously updated to include newly public companies and remove delisted ones."
        },
        {
          q: "What types of filings do you analyze?",
          a: "We analyze three main filing types: (1) 10-K (Annual Reports) - comprehensive yearly financials and risks, (2) 10-Q (Quarterly Reports) - quarterly financials and updates, and (3) 8-K (Current Events) - major announcements like earnings releases, management changes, or material events. Each filing type has different characteristics that the model accounts for."
        },
        {
          q: "Where does the data come from?",
          a: "Filing data comes from the SEC EDGAR database (official government source). Financial metrics are extracted from inline XBRL tags embedded in filings. Analyst upgrades/downgrades and consensus estimates come from Yahoo Finance (aggregated analyst forecasts and recommendation history from major firms). Stock prices for model validation come from Yahoo Finance historical data. All sources are free and publicly available."
        },
        {
          q: "How frequently is data updated?",
          a: "The Latest Filings page shows filings from the last 90 days, updated in real-time as companies file with the SEC. When you analyze a filing, the app fetches the latest version directly from EDGAR and generates fresh predictions. The model is continuously refined as we analyze more filings and observe actual outcomes."
        },
        {
          q: "What are the limitations of your external data sources?",
          a: "IMPORTANT DATA DISCLAIMERS: We rely on external data sources (SEC EDGAR, Yahoo Finance) and cannot guarantee their accuracy, completeness, availability, or validity. Limitations include: (1) SEC EDGAR - Filings may contain errors, restatements, or be amended after initial submission. XBRL data may be tagged incorrectly by companies. (2) Yahoo Finance - Stock prices may be delayed (15-20 minutes), contain gaps, or have inaccuracies. Analyst data aggregation may be incomplete or outdated. Consensus estimates may not reflect all analysts. (3) Data Availability - External APIs may be temporarily unavailable, rate-limited, or discontinued without notice. (4) No Independent Verification - We do not independently verify the accuracy of data from external sources. Users should cross-reference important information with official company filings and licensed financial data providers. (5) Historical Data - Past data may be revised or restated, affecting model accuracy. We are not responsible for losses resulting from inaccurate, incomplete, or unavailable data from third-party sources."
        }
      ]
    },
    {
      category: "Technical Details",
      questions: [
        {
          q: "What technology powers this app?",
          a: "Built with: Next.js 14 (React framework), TypeScript (type-safe code), Prisma ORM (database), PostgreSQL (production database), Anthropic Claude AI (NLP analysis), Python yfinance (stock data), SEC EDGAR & XBRL APIs (filing data), Tailwind CSS & shadcn/ui (design), and Recharts (data visualization)."
        },
        {
          q: "How long does analysis take?",
          a: "Analysis typically takes 30-60 seconds per filing, depending on length and complexity. Steps include: (1) Fetching filing HTML from SEC (5-10s), (2) Parsing XBRL financial data (5-10s), (3) Fetching prior filing for comparison (5-10s), (4) AI analysis with Claude (15-30s), (5) Fetching market data from Yahoo Finance (5s), and (6) Generating prediction (instant)."
        },
        {
          q: "Can I use this for automated trading?",
          a: "This tool is designed for research and education, not automated trading. While the predictions are data-driven, they should be used as one input among many for investment decisions. We do not provide trading advice or guarantee returns. Always do your own due diligence and consider your risk tolerance."
        }
      ]
    },
    {
      category: "Terms of Service & Legal Disclaimers",
      questions: [
        {
          q: "What is the intended use of this platform?",
          a: "This platform is provided strictly for educational and research purposes. It is designed to help users learn about SEC filings, financial analysis techniques, and machine learning applications in finance. This tool should NOT be used as the sole basis for investment decisions."
        },
        {
          q: "Is this investment advice?",
          a: "NO. Nothing on this platform constitutes investment advice, financial advice, trading advice, or any other type of professional advice. All content, predictions, analyses, and information are provided for informational and educational purposes only. You should consult with a licensed financial advisor before making any investment decisions."
        },
        {
          q: "What are the risks of using predictions from this tool?",
          a: "IMPORTANT: All predictions and analyses are based on historical data and machine learning models, which have inherent limitations. Past performance does NOT guarantee future results. Stock markets are unpredictable and influenced by countless factors beyond what any model can capture. Using this tool's predictions for actual trading carries significant risk of financial loss. You could lose some or all of your invested capital."
        },
        {
          q: "What disclaimers apply to this service?",
          a: "DISCLAIMERS: (1) NO WARRANTY - This service is provided 'as is' without warranties of any kind, express or implied. (2) NO GUARANTEE OF ACCURACY - We make no guarantees about the accuracy, completeness, or reliability of any predictions, analyses, or data. (3) DATA DELAYS - Market data may be delayed or contain errors. (4) MODEL LIMITATIONS - Our machine learning models are experimental and may produce incorrect predictions. (5) TECHNICAL ISSUES - The service may be unavailable, slow, or contain bugs at any time."
        },
        {
          q: "What is your limitation of liability?",
          a: "LIMITATION OF LIABILITY: To the maximum extent permitted by law, we shall NOT be liable for any direct, indirect, incidental, special, consequential, or punitive damages arising from: (1) your use or inability to use this service, (2) any predictions or analyses provided, (3) investment losses based on information from this platform, (4) errors, bugs, or inaccuracies in the service, or (5) unauthorized access to your data. Your use of this service is entirely at your own risk."
        },
        {
          q: "Do you have a fiduciary duty to users?",
          a: "NO. We do not have any fiduciary duty to users of this platform. We are not registered as an investment adviser, broker-dealer, or any other type of financial services provider. We do not manage accounts, execute trades, or provide personalized investment recommendations."
        },
        {
          q: "What regulatory compliance applies?",
          a: "REGULATORY DISCLOSURE: This platform is not regulated by the SEC, FINRA, or any other financial regulatory authority. We are not licensed to provide investment advice. All predictions and analyses are automated outputs from statistical regression models and AI analysis and should be treated as educational demonstrations of quantitative finance techniques, not as professional investment research."
        },
        {
          q: "What are my responsibilities as a user?",
          a: "USER RESPONSIBILITIES: By using this service, you acknowledge that: (1) You are solely responsible for your investment decisions, (2) You will conduct your own due diligence before making any trades, (3) You understand the risks of stock market investing, (4) You will comply with all applicable laws and regulations, (5) You will not rely on this tool for investment decisions, and (6) You may lose some or all of your money if you trade based on predictions from this platform."
        },
        {
          q: "Can I sue if I lose money using this tool?",
          a: "ARBITRATION & DISPUTE RESOLUTION: By using this service, you agree that any disputes will be resolved through binding arbitration (not court proceedings) on an individual basis (not class action). You waive your right to a jury trial. To the fullest extent permitted by law, you agree not to bring any lawsuit or claim against us for losses incurred from using this service, including investment losses."
        },
        {
          q: "What about forward-looking statements?",
          a: "FORWARD-LOOKING STATEMENTS: Any predictions, forecasts, or forward-looking statements are inherently uncertain and based on assumptions that may prove incorrect. Actual results may differ materially from predictions. Factors that could cause actual results to differ include: market volatility, economic conditions, company-specific events, regulatory changes, geopolitical events, and limitations in our models."
        },
        {
          q: "What is your privacy policy?",
          a: "PRIVACY & DATA: We collect minimal personal data. We may collect: (1) usage analytics (pages viewed, features used), (2) technical data (IP address, browser type), and (3) any information you voluntarily provide. We do NOT sell your data to third parties. We use industry-standard security measures but cannot guarantee absolute security. By using this service, you consent to our data practices."
        },
        {
          q: "Can these terms change?",
          a: "CHANGES TO TERMS: We reserve the right to modify these terms, disclaimers, and the service at any time without prior notice. Continued use of the service after changes constitutes acceptance of the modified terms. We may also discontinue the service entirely at any time."
        },
        {
          q: "What law governs these terms?",
          a: "GOVERNING LAW: These terms are governed by the laws of the United States and the State of Delaware, without regard to conflict of law principles. Any disputes that are not subject to arbitration shall be brought exclusively in courts located in Delaware."
        },
        {
          q: "What if I don't agree to these terms?",
          a: "AGREEMENT TO TERMS: By accessing or using this platform, you acknowledge that you have read, understood, and agree to be bound by these terms and disclaimers. If you do not agree to these terms, you must immediately stop using this service and leave the website."
        }
      ]
    }
  ];

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#0f172a_0%,#020617_50%)] text-foreground">
      {/* Header */}
      <div className="container mx-auto px-4 py-8">
        <Button
          variant="outline"
          onClick={() => router.push('/')}
          className="mb-4 border-white/45"
        >
          ← Back to Home
        </Button>
        <h1 className="text-4xl font-bold mb-2 text-white">Frequently Asked Questions</h1>
        <p className="text-gray-300 mb-8">
          Learn about how our SEC filing analysis and prediction model works
        </p>

        {/* FAQ Sections */}
        <div className="space-y-6">
          {faqs.map((section, idx) => (
            <Card key={idx} className="bg-[rgba(15,23,42,0.96)] border-white/[0.18]">
              <CardHeader>
                <CardTitle className="text-2xl text-white">{section.category}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  {section.questions.map((item, qIdx) => (
                    <div key={qIdx} className="border-b border-white/10 last:border-0 pb-4 last:pb-0">
                      <h3 className="font-bold text-lg text-gray-100 mb-2">{item.q}</h3>
                      <p className="text-gray-300 leading-relaxed">{item.a}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* CTA Section */}
        <Card className="mt-8 bg-[radial-gradient(circle_at_left,rgba(34,197,94,0.16),rgba(15,23,42,0.98))] border-white/[0.18]">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl text-white">Ready to analyze filings?</CardTitle>
            <CardDescription className="text-lg mt-2 text-gray-300">
              Start exploring SEC filings with AI-powered insights
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center gap-4">
            <Button
              size="lg"
              onClick={() => router.push('/latest-filings')}
              className="bg-gradient-to-br from-primary to-secondary text-[#0b1120] font-semibold shadow-[0_14px_30px_rgba(34,197,94,0.36)] hover:brightness-110"
            >
              View Latest Filings
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={() => router.push('/')}
              className="border-white/45"
            >
              Search by Ticker
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
