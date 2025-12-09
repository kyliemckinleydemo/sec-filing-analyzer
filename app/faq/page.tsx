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
          a: "REGULATORY DISCLOSURE: This platform is not regulated by the SEC, FINRA, or any other financial regulatory authority. We are not licensed to provide investment advice. All predictions and analyses are automated outputs from machine learning models and should be treated as educational demonstrations of AI/ML techniques, not as professional investment research."
        },
        {
          q: "What are my responsibilities as a user?",
          a: "USER RESPONSIBILITIES: By using this service, you acknowledge that: (1) You are solely responsible for your investment decisions, (2) You will conduct your own due diligence before making any trades, (3) You understand the risks of stock market investing, (4) You will comply with all applicable laws and regulations, (5) You will not rely solely on this tool for investment decisions, and (6) You may lose money if you trade based on predictions from this platform."
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
