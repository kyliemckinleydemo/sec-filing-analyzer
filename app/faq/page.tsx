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
          a: "This app uses AI to analyze SEC filings (10-K, 10-Q, and 8-K) and predict how they will impact stock prices over the next 7 business days. It combines natural language processing, financial data extraction, and machine learning to help investors understand what filings mean for stock performance."
        },
        {
          q: "Who is this app for?",
          a: "This tool is designed for retail investors, financial analysts, and anyone who wants to understand SEC filings without reading hundreds of pages of dense legal and financial text. It's particularly useful for tracking earnings announcements, quarterly reports, and annual filings."
        },
        {
          q: "How is this different from other tools?",
          a: "Most tools either show raw filings with no analysis (like SEC EDGAR) or provide generic summaries. Our app goes further by: (1) extracting specific financial metrics and comparing them to analyst expectations, (2) analyzing management sentiment and tone, (3) identifying new risks, and (4) predicting the actual stock price movement over the next week."
        }
      ]
    },
    {
      category: "The Model",
      questions: [
        {
          q: "How does the prediction model work?",
          a: "Our model combines multiple data sources: (1) Analyst opinion changes in the 30 days before the filing (most important feature - upgrades/downgrades from major firms), (2) AI-extracted sentiment scores from MD&A sections, (3) Risk analysis comparing new vs. prior filings, (4) Financial metrics from XBRL data, (5) Earnings surprises (actual vs. consensus EPS/revenue), (6) Market context (P/E ratio, market cap), and (7) Historical filing patterns. These features are weighted using a RandomForest machine learning model to predict 7-day forward returns."
        },
        {
          q: "What machine learning approach do you use?",
          a: "We use a RandomForest machine learning model trained on 40+ features extracted from filings and market data. The most important feature is analyst opinion changes (upgrades/downgrades) in the 30 days before filing. Rather than a black-box neural network, our model is interpretable - we can explain exactly why each prediction was made (e.g., '+3 net analyst upgrades', 'positive earnings surprise', 'decreased risk score', 'optimistic management tone'). The model achieves 80% directional accuracy and is continuously refined based on actual outcomes."
        },
        {
          q: "Why 7 business days?",
          a: "Research shows that market reactions to SEC filings typically occur within 3-10 trading days as investors digest the information. We chose 7 days as a balance between capturing immediate reactions and allowing time for institutional analysis. This timeframe also reduces noise from unrelated market movements."
        }
      ]
    },
    {
      category: "Variables & Features",
      questions: [
        {
          q: "What variables does the model use?",
          a: "Key variables include: Analyst Opinion Changes (upgrades/downgrades in 30 days before filing - most important feature), Sentiment Score (-1 to +1 from management discussion), Risk Score Delta (change vs. prior filing), EPS Surprise (actual vs. consensus earnings), Revenue Surprise, Guidance Changes, Financial Metrics (revenue growth, margin changes), Market Context (P/E ratio, market cap), Filing Type (10-K, 10-Q, 8-K), and Historical Returns (company-specific patterns)."
        },
        {
          q: "How do analyst opinion changes work as a predictive signal?",
          a: "We track all analyst upgrades and downgrades from major firms (Goldman Sachs, Morgan Stanley, JP Morgan, etc.) in the 30 days before each filing. This creates a 'street momentum' signal that captures institutional sentiment leading into the filing. Net upgrades (upgrades minus downgrades) is the single most important feature in our RandomForest ML model. When analysts are upgrading a stock right before earnings, it often predicts positive short-term price movement. This feature achieves 80% directional accuracy and is prominently displayed in each filing analysis."
        },
        {
          q: "How do you calculate sentiment?",
          a: "We use Claude AI (Anthropic's language model) to analyze the Management Discussion & Analysis (MD&A) section of filings. The AI identifies key phrases, tone shifts, and forward-looking statements to generate a sentiment score from -1 (very pessimistic) to +1 (very optimistic). This score is then adjusted based on actual earnings results when available."
        },
        {
          q: "What are 'earnings surprises' and why do they matter?",
          a: "An earnings surprise occurs when a company's actual EPS or revenue differs from analyst consensus estimates. Beats (actual > consensus) typically drive stock prices up, while misses drive them down. We fetch consensus estimates from Yahoo Finance and calculate the surprise magnitude, which is one of the strongest predictors in our model."
        },
        {
          q: "How do you handle risk factors?",
          a: "Our enhanced risk analysis goes beyond traditional 'Risk Factors' sections. We analyze the entire filing to detect material negative events including: data breaches, litigation and legal proceedings, executive departures or deaths, regulatory investigations, restructuring charges, covenant breaches, product recalls, and financial restatements. This is especially important for 8-K filings which don't have Risk Factors sections but often announce material events. We compare current vs. prior filings to identify new risks, removed risks, and severity changes."
        },
        {
          q: "What insights have you learned from analyzing thousands of filings?",
          a: "Key learnings: (1) Analyst upgrades/downgrades in the 30 days before a filing is the single most predictive feature - net upgrades correlate strongly with positive 7-day returns. (2) Mega-cap companies (>$500B market cap) show more muted price reactions to filings due to institutional ownership and liquidity - their stocks move ~30% less than mid-caps post-filing. (3) Earnings surprises are 3x more predictive than sentiment for 8-K filings. (4) Risk score increases in 10-Ks have delayed impact (peak effect at 10-14 days vs. 3-7 days). (5) Management tone shifts (optimistic → cautious) are more predictive than absolute sentiment levels. (6) Guidance changes in tech companies have 2x the impact compared to industrials. (7) 8-K filings filed after market hours show stronger next-day reactions than those filed during trading hours."
        }
      ]
    },
    {
      category: "Backtesting & Accuracy",
      questions: [
        {
          q: "How did you backtest the model?",
          a: "We collected historical filings from 430+ companies (S&P 500 and high-volume stocks) going back 2+ years. For each filing, we: (1) Extracted features as if analyzing in real-time, (2) Made predictions, (3) Waited 7 trading days, (4) Calculated actual returns from Yahoo Finance, and (5) Compared predicted vs. actual. This process was repeated for thousands of filings to measure accuracy."
        },
        {
          q: "What is the model's accuracy?",
          a: "The model demonstrates strong directional accuracy (correctly predicting whether the stock will go up or down). Specific accuracy metrics vary by filing type, market conditions, and company characteristics. Our research shows particularly strong performance for mid-cap companies ($10B-$100B market cap) and 8-K earnings announcements with clear earnings surprises. The model's predictions improve when multiple signals align (e.g., earnings beat + optimistic sentiment + reduced risk)."
        },
        {
          q: "What are the model's limitations?",
          a: "The model cannot predict: (1) External shocks (geopolitical events, market crashes), (2) Sector-wide movements unrelated to the specific filing, (3) Manipulation or fraud not disclosed in filings, (4) Intraday volatility (we predict 7-day returns, not short-term trading). Additionally, past performance doesn't guarantee future results."
        },
        {
          q: "How do you prevent overfitting?",
          a: "We use several techniques: (1) Feature selection based on financial theory (not just correlation mining), (2) Out-of-sample testing on recent filings not used for model development, (3) Cross-validation across different market conditions and sectors, (4) Regularization to prevent over-weighting any single feature. The model is designed to be interpretable and generalizable."
        }
      ]
    },
    {
      category: "Data & Coverage",
      questions: [
        {
          q: "What companies are covered?",
          a: "We track 430+ companies including all S&P 500 constituents and high-volume stocks across major sectors: Technology (AAPL, MSFT, GOOGL, NVDA, etc.), Finance (JPM, BAC, GS), Healthcare (UNH, JNJ, PFE), Consumer (AMZN, WMT, TSLA), Energy (XOM, CVX), and more. The list is continuously updated to include newly public companies and remove delisted ones."
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
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <div className="container mx-auto px-4 py-8">
        <Button
          variant="outline"
          onClick={() => router.push('/')}
          className="mb-4"
        >
          ← Back to Home
        </Button>
        <h1 className="text-4xl font-bold mb-2">Frequently Asked Questions</h1>
        <p className="text-slate-600 mb-8">
          Learn about how our SEC filing analysis and prediction model works
        </p>

        {/* FAQ Sections */}
        <div className="space-y-6">
          {faqs.map((section, idx) => (
            <Card key={idx}>
              <CardHeader>
                <CardTitle className="text-2xl">{section.category}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  {section.questions.map((item, qIdx) => (
                    <div key={qIdx} className="border-b border-slate-200 last:border-0 pb-4 last:pb-0">
                      <h3 className="font-bold text-lg text-slate-800 mb-2">{item.q}</h3>
                      <p className="text-slate-600 leading-relaxed">{item.a}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* CTA Section */}
        <Card className="mt-8 bg-gradient-to-r from-blue-50 to-purple-50 border-2 border-blue-200">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">Ready to analyze filings?</CardTitle>
            <CardDescription className="text-lg mt-2">
              Start exploring SEC filings with AI-powered insights
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center gap-4">
            <Button
              size="lg"
              onClick={() => router.push('/latest-filings')}
              className="bg-blue-600 hover:bg-blue-700"
            >
              View Latest Filings
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={() => router.push('/')}
            >
              Search by Ticker
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
