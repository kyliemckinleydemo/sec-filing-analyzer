# 🚀 Quick Start Guide - SEC Filing Analyzer

## ⚡ Get Started in 5 Minutes

### 1. Get API Keys (2 minutes)

**Required:**

1. **Anthropic Claude API Key** (for AI analysis)
   - Visit: https://console.anthropic.com/
   - Sign up and get your API key
   - Starts with `sk-ant-...`

2. **Alpha Vantage API Key** (for stock prices)
   - Visit: https://www.alphavantage.co/support/#api-key
   - Free tier: 25 API calls/day
   - Get instant key by email

### 2. Configure Environment (1 minute)

Edit `.env.local`:

```env
ANTHROPIC_API_KEY="sk-ant-YOUR-ACTUAL-KEY-HERE"
ALPHA_VANTAGE_API_KEY="YOUR-ACTUAL-KEY-HERE"
```

### 3. Start the Server (1 minute)

```bash
npm run dev
```

Server will start at: http://localhost:3000 (or :3001 if 3000 is taken)

### 4. Try It Out (1 minute)

1. Open http://localhost:3001 in your browser
2. Type a ticker symbol: **AAPL**
3. Click "Analyze Filing"
4. View recent SEC filings
5. Click on any filing to see:
   - 🤖 AI analysis
   - 📈 Price prediction
   - ⚠️ Risk assessment
   - 💭 Sentiment analysis

---

## 🎯 What You Can Do

### Search Companies
- Type any US public company ticker: AAPL, TSLA, MSFT, GOOGL, AMZN, etc.
- View last 20 SEC filings (10-K, 10-Q, 8-K)

### Analyze Filings
- Click on any filing to run AI analysis
- Get risk factor scoring (0-10 scale)
- See sentiment analysis (-1 to +1)
- Read plain-English executive summary

### Get Predictions
- 7-day stock price return prediction
- Confidence score (0-100%)
- Buy/Hold/Sell signal
- Detailed reasoning

---

## 📖 How It Works

1. **You search:** Enter ticker like "AAPL"
2. **SEC data:** Fetches filings from SEC EDGAR API
3. **AI analyzes:** Claude reads risk factors and management discussion
4. **Predictions:** ML model predicts 7-day price movement
5. **Results:** Beautiful UI shows insights

---

## 🔧 Troubleshooting

### "Company not found"
- Check ticker spelling (must be uppercase)
- Try well-known tickers: AAPL, MSFT, GOOGL

### "API rate limit exceeded"
- Alpha Vantage free tier: 25 calls/day
- Wait or upgrade to premium ($50/month)

### "AI analysis unavailable"
- Check ANTHROPIC_API_KEY in .env.local
- Ensure key starts with `sk-ant-`
- Restart dev server after changing .env

### Port 3000 in use
- Server will auto-select port 3001
- Check terminal output for correct port

---

## 📊 Example Workflows

### Workflow 1: Analyze Recent Earnings
```
1. Search "AAPL"
2. Find latest 10-Q filing
3. Click to analyze
4. Review sentiment score
5. Check 7-day prediction
```

### Workflow 2: Compare Risk Trends
```
1. Search "TSLA"
2. Open most recent 10-K
3. Note risk score (e.g., 7.2/10)
4. Open prior year 10-K
5. Compare risk trends
```

### Workflow 3: Quick Sentiment Check
```
1. Search "MSFT"
2. Open latest filing
3. Scroll to sentiment section
4. Check tone: optimistic/cautious/negative
5. Read key phrases
```

---

## 💡 Pro Tips

1. **Bookmark filings:** Copy URL to save specific analyses
2. **Compare companies:** Open multiple tabs for side-by-side
3. **Focus on changes:** New risks matter more than existing ones
4. **Check confidence:** High confidence predictions are more reliable
5. **Read reasoning:** Understand why predictions were made

---

## 🎓 Understanding the Analysis

### Risk Score (0-10)
- **0-3:** Low risk, stable business
- **4-6:** Moderate risk, normal
- **7-8:** Elevated risk, watch carefully
- **9-10:** High risk, potential issues

### Sentiment Score (-1 to +1)
- **-1.0 to -0.5:** Very negative/pessimistic
- **-0.5 to 0:** Cautious/uncertain
- **0 to +0.5:** Cautiously optimistic
- **+0.5 to +1.0:** Very positive/bullish

### Confidence Score (0-100%)
- **90-100%:** Very high confidence
- **70-89%:** High confidence
- **50-69%:** Moderate confidence
- **Below 50%:** Low confidence (use caution)

### Prediction Signals
- **🟢 Strong Buy:** +1% or more predicted
- **🟢 Buy:** 0% to +1% predicted
- **🟡 Hold:** -1% to 0% predicted
- **🔴 Sell:** Below -1% predicted

---

## 🚀 Ready to Deploy?

See `README.md` for full deployment guide to Vercel.

---

## ⚠️ Important Disclaimer

**This tool is for educational and informational purposes only.**

- Not financial advice
- Past performance ≠ future results
- AI predictions are not guaranteed
- Always do your own research
- Consult financial advisor before investing

---

## 📚 More Resources

- **Full Documentation:** See README.md
- **Build Report:** See BUILD_REPORT.md
- **API Details:** See code comments in `/lib` folder
- **Database Schema:** See `prisma/schema.prisma`

---

**Ready? Let's analyze some filings!** 🎉

Open http://localhost:3001 and start exploring!
