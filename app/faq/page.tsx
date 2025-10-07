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
          a: "Our model combines multiple data sources: (1) AI-extracted sentiment scores from MD&A sections, (2) Risk analysis comparing new vs. prior filings, (3) Financial metrics from XBRL data, (4) Earnings surprises (actual vs. consensus EPS/revenue), (5) Market context (P/E ratio, market cap), and (6) Historical filing patterns. These features are weighted to predict 7-day forward returns."
        },
        {
          q: "What machine learning approach do you use?",
          a: "We use a combination of feature engineering and weighted scoring rather than a black-box neural network. This allows us to explain exactly why the model makes each prediction (e.g., 'positive earnings surprise', 'decreased risk score', 'optimistic management tone'). The model is continuously refined based on actual outcomes."
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
          a: "Key variables include: Sentiment Score (-1 to +1 from management discussion), Risk Score Delta (change vs. prior filing), EPS Surprise (actual vs. consensus earnings), Revenue Surprise, Guidance Changes, Financial Metrics (revenue growth, margin changes), Market Context (P/E ratio, market cap), Filing Type (10-K, 10-Q, 8-K), and Historical Returns (company-specific patterns)."
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
          a: "We compare Risk Factor sections between the current filing and the prior period filing (e.g., Q2 2024 vs. Q1 2024). New or significantly changed risks are extracted and scored for severity. A rising risk score suggests increased uncertainty and typically correlates with negative returns."
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
          a: "The model demonstrates strong directional accuracy (correctly predicting whether the stock will go up or down). Specific accuracy metrics vary by filing type and market conditions. You can view detailed backtest results for any ticker on the Backtest page, which shows prediction errors, direction accuracy, and performance distribution."
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
          a: "Filing data comes from the SEC EDGAR database (official government source). Financial metrics are extracted from inline XBRL tags embedded in filings. Consensus estimates come from Yahoo Finance (aggregated analyst forecasts). Stock prices for backtesting come from Yahoo Finance historical data. All sources are free and publicly available."
        },
        {
          q: "How frequently is data updated?",
          a: "The Latest Filings page shows filings from the last 90 days, updated in real-time as companies file with the SEC. When you analyze a filing, the app fetches the latest version directly from EDGAR and generates fresh predictions. Historical backtest data is updated weekly as new actual returns become available."
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
      {/* Navigation */}
      <nav className="container mx-auto px-4 py-4">
        <div className="flex justify-between items-center">
          <h2 className="text-2xl font-bold text-blue-600">SEC Analyzer</h2>
          <div className="flex gap-4">
            <Button variant="ghost" onClick={() => router.push('/')}>
              Home
            </Button>
            <Button variant="ghost" onClick={() => router.push('/latest-filings')}>
              Latest Filings
            </Button>
            <Button variant="default" onClick={() => router.push('/faq')}>
              FAQ
            </Button>
          </div>
        </div>
      </nav>

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
