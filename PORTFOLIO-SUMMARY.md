# SEC Filing Analyzer - Portfolio Summary

> **A quantitative trading system that predicts stock price movements from SEC filings using machine learning and multi-factor analysis**

## 🎯 Project Overview

Sophisticated fintech application that analyzes SEC 10-K/10-Q filings to predict 7-day stock returns. Demonstrates full-stack development, quantitative finance, machine learning, and production system design.

**Live Demo:** https://sec-filing-analyzer-indol.vercel.app

## 📊 Performance Metrics (Backtested)

Based on 418 real trades across 424 historical filings (2022-2025):

- **Total Return:** +2.63%
- **Win Rate:** 52.9% (221 wins, 197 losses)
- **Sharpe Ratio:** 0.93 (risk-adjusted return)
- **Max Drawdown:** 2.12% (excellent risk control)
- **Profit Factor:** 1.22 (wins larger than losses)
- **Average Win:** $65.67 vs **Average Loss:** $60.31

## 🏗️ Technical Architecture

### Backend
- **Next.js 14** API routes with TypeScript
- **Prisma ORM** with PostgreSQL database
- **Yahoo Finance API** for real-time market data
- **SEC EDGAR API** for filing ingestion
- **OpenAI GPT-4** for NLP analysis of filings

### Frontend
- **React** with Tailwind CSS
- **Real-time data visualization** (filing analysis, predictions)
- **Paper trading dashboard** with portfolio tracking

### Infrastructure
- **Vercel** deployment with cron jobs
- **Automated data pipelines** (daily filing ingestion at 2am UTC)
- **Paper trading engine** with Kelly Criterion position sizing
- **Market-open trade execution** (10am ET weekdays)

## 🧠 Prediction Model (12 Factors)

### Core Features
1. **Risk Score Delta** - Change in risk factors vs prior period
2. **Sentiment Analysis** - MD&A tone using NLP
3. **Earnings Surprises** - EPS/revenue beats/misses with magnitude
4. **Guidance Changes** - Forward guidance raised/lowered/maintained

### Market Context
5. **Market Regime** - Bull/bear/flat classification with dampening
6. **Flight to Quality** - Volatility-driven mega-cap preference
7. **Market Momentum** - SPY 30-day returns
8. **Market Cap Effects** - Non-linear size effects (optimal: $200-500B)

### Analyst & Macro
9. **Analyst Activity** - Upgrades/downgrades in 30d pre-filing
10. **Analyst Consensus** - Strong Buy/Sell sentiment score
11. **Dollar Strength** - DXY impacts on equity flows
12. **GDP Sentiment** - Economic optimism indicators

### Company-Specific
- Historical filing patterns by ticker
- Sector momentum
- P/E ratio sensitivity multipliers

## 🎨 Key Features

### 1. Automated Filing Analysis
- Fetches SEC filings via RSS feed (10-K, 10-Q, 8-K)
- Extracts XBRL financial data
- NLP sentiment analysis on MD&A section
- Risk factor identification and tracking
- Yahoo Finance enrichment (P/E, market cap, analyst data)

### 2. Prediction Engine
- Research-backed multi-factor model
- Confidence scoring (0-100%)
- Feature importance transparency
- Model versioning (v2.0-research-2025)

### 3. Paper Trading System
- Kelly Criterion position sizing
- Automatic trade execution at market open
- PENDING trade queue for after-hours filings
- 7-day hold period
- Commission modeling ($1/trade)
- Performance tracking (Sharpe, drawdown, win rate)

### 4. Risk Management
- Max 10% position size per trade
- Minimum 60% confidence threshold
- Minimum 1% predicted return threshold
- Mega-cap downside protection floors
- Market regime-based dampening

## 🔬 Research-Backed Methodology

### Academic Findings Implemented
- **2024 Q3 earnings data:** EPS beats +1.3%, misses -2.9% (asymmetric)
- **2025 research:** Risk factor tone predicts weekly returns
- **Guidance impact:** Changes have 3-5%+ stock impact
- **Market regime effects:** BTFD (buy the dip) in bulls, STFR (sell the rip) in bears
- **P/E sensitivity:** High P/E stocks (growth) react MORE to surprises
- **Analyst momentum:** Pre-filing upgrades predict short-term returns

### Empirical Dataset Analysis (278 filings)
- Mean return: +0.83% (positive bias in earnings filings)
- Optimal market cap: $200-500B (outperforms by +1.33%)
- Mega-caps (>$1T): Institutional protection floor at -1.5%
- Small caps (<$200B): Underperform by -0.69%

## 💼 Business Value

### For Trading Firms
- Systematic approach to post-filing trading
- Quantifiable edge with backtested results
- Scalable infrastructure for institutional use

### For Portfolio Management
- Risk-aware position sizing
- Regime-based strategy adaptation
- Multi-factor diversification

### For Fintech Applications
- Full-stack demonstration of data pipeline → ML → execution
- Production-ready system with monitoring
- Demonstrates understanding of market microstructure

## 🚀 Technical Highlights

### System Design
- **Event-driven architecture** - Cron jobs → Analysis → Prediction → Trade
- **Graceful degradation** - Missing data handled, fallbacks in place
- **Idempotent operations** - Safe retries, no double-trades
- **Type safety** - Full TypeScript coverage

### Data Engineering
- **Multi-source integration** - SEC, Yahoo Finance, OpenAI
- **Time-series management** - Historical patterns, rolling windows
- **Backfilling logic** - Automated correction of missing data

### Production Reliability
- **Cron job monitoring** - Vercel-native scheduling
- **Error handling** - Comprehensive try-catch with logging
- **Rate limiting** - Yahoo Finance API throttling
- **Schema migrations** - Prisma-managed database evolution

## 📈 Sample Trades (Top Performers)

**Best Wins:**
1. **ORCL 10-Q** - P&L: $903 | Predicted: 3.5% | Actual: 26.97%
2. **LDOS 10-Q** - P&L: $334 | Predicted: 3.5% | Actual: 10.06%
3. **AVGO 10-Q** - P&L: $323 | Predicted: 4.85% | Actual: 6.93%

**Learning from Losses:**
- **VRTX 10-Q** - P&L: -$699 | Predicted: 3.5% | Actual: -20.71%
- **UNH 10-Q** - P&L: -$258 | Predicted: 1.25% | Actual: -21.07%
- **NVDA 10-Q** - P&L: -$193 | Predicted: 1.25% | Actual: -15.82%

## 🛠️ Tech Stack

**Languages:** TypeScript, Python
**Frontend:** React, Next.js 14, Tailwind CSS
**Backend:** Node.js, Prisma, PostgreSQL
**APIs:** Yahoo Finance, SEC EDGAR, OpenAI GPT-4
**Infrastructure:** Vercel, cron jobs
**Tools:** Git, npm, Vercel CLI

## 📊 Database Schema

Key tables:
- `Company` - Company profiles with Yahoo Finance data
- `Filing` - SEC filings with XBRL and AI analysis
- `StockPrice` - Historical price data
- `Prediction` - Model predictions with features
- `PaperTrade` - Simulated trades with P&L
- `PaperPortfolio` - Portfolio tracking
- `CompanySnapshot` - Time-series snapshots
- `MacroIndicators` - Market-wide indicators
- `TechnicalIndicators` - Stock-specific momentum

## 🎓 Skills Demonstrated

### Software Engineering
- Full-stack TypeScript/React development
- RESTful API design
- Database schema design
- Cron job automation
- Error handling & logging

### Quantitative Finance
- Multi-factor modeling
- Risk management (Kelly Criterion)
- Backtesting methodology
- Performance attribution
- Portfolio optimization

### Data Science
- Feature engineering (12 factors)
- NLP sentiment analysis
- Time-series analysis
- Statistical significance testing

### Production Systems
- CI/CD with Vercel
- Database migrations
- API rate limiting
- Graceful degradation
- Monitoring & alerts

## 🔮 Future Enhancements

1. **Machine Learning** - Train gradient boosting model on 424 samples
2. **Sector Analysis** - Sector-relative performance comparisons
3. **Options Strategies** - Volatility-based option recommendations
4. **Real-time Execution** - Sub-second trade execution
5. **Portfolio Optimizer** - Multi-asset position correlation limits

## 📝 Running the Project

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Add: DATABASE_URL, OPENAI_API_KEY, CRON_SECRET

# Run Prisma migrations
npx prisma migrate dev

# Start development server
npm run dev

# Run backtest
npx tsx scripts/backtest-strategy.ts
```

## 📧 Contact

**John McKinley**
- Portfolio Demo: https://sec-filing-analyzer-indol.vercel.app
- GitHub: [Your GitHub]
- LinkedIn: [Your LinkedIn]
- Email: [Your Email]

---

*Built to demonstrate full-stack fintech development, quantitative modeling, and production system design. Not for actual trading.*
