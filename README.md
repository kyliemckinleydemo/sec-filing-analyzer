# SEC Filing Analyzer

An AI-powered platform for analyzing SEC filings and predicting stock price movements using Claude AI (Anthropic) and structured XBRL data from the SEC's official APIs.

![Next.js](https://img.shields.io/badge/Next.js-14-black)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)
![Claude AI](https://img.shields.io/badge/Claude-Sonnet%204.5-purple)
![Prisma](https://img.shields.io/badge/Prisma-ORM-2D3748)

## Features

### 🤖 AI-Powered Analysis
- **Risk Factor Analysis**: Claude AI analyzes risk factor changes between filings, identifying new risks, removed risks, and severity shifts
- **Sentiment Analysis**: Management tone detection from MD&A sections with confidence scoring
- **Executive Summaries**: Automatic generation of investor-focused bullet points
- **Filing Content Summaries**: TLDR of what each filing actually contains (especially useful for 8-K event classification)

### 📊 Structured Financial Data
- **SEC XBRL API Integration**: Direct access to structured financial metrics from SEC's Company Facts API
- **Automatic Calculations**: YoY/QoQ growth rates for revenue, net income, EPS
- **Financial Metrics Extraction**: Revenue growth, margin trends, forward guidance, earnings surprises
- **Real-time Stock Data**: Yahoo Finance integration for prediction accuracy tracking

### 📈 Stock Price Prediction
- **Pattern-Based Model**: Predicts 7-day stock returns based on filing analysis
- **8-K Event Classification**: Distinguishes between earnings announcements, earnings releases, and other material events
- **Historical Patterns**: Incorporates company-specific filing response patterns
- **Accuracy Tracking**: Compares predictions vs actual returns with visual performance charts

### 💼 Company & Filing Management
- **Multi-Company Support**: Track filings across multiple companies
- **Filing History**: Infinite scroll through historical filings with "Load More" functionality
- **Filing Type Support**: 10-K (annual), 10-Q (quarterly), 8-K (current events)
- **Prior Filing Comparison**: Automatically compares current filing vs previous period

## Tech Stack

### Core
- **Next.js 14** - React framework with App Router and Server Components
- **TypeScript** - Type-safe development
- **Tailwind CSS** - Utility-first styling
- **shadcn/ui** - Beautiful UI components

### AI & Data
- **Anthropic Claude Sonnet 4.5** - Advanced language model for filing analysis
- **SEC EDGAR API** - Real-time SEC filing data
- **SEC Company Facts API** - Structured XBRL financial data
- **Yahoo Finance API** - Historical stock prices

### Database & ORM
- **PostgreSQL** - Production database
- **Prisma** - Type-safe ORM with migrations
- **SQLite** - Development database option

### Visualization
- **Recharts** - React charting library for performance graphs

## Getting Started

### Prerequisites
- Node.js 18+ and npm
- PostgreSQL database (or use SQLite for development)
- Anthropic API key ([get one here](https://console.anthropic.com/))

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/yourusername/sec-filing-analyzer.git
cd sec-filing-analyzer
```

2. **Install dependencies**
```bash
npm install
```

3. **Set up environment variables**

Create a `.env.local` file in the root directory:

```bash
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/sec_analyzer"
# For SQLite (development):
# DATABASE_URL="file:./dev.db"

# Anthropic API Key (REQUIRED)
ANTHROPIC_API_KEY="sk-ant-api03-your-key-here"

# Alpha Vantage (optional, for stock data backup)
ALPHA_VANTAGE_API_KEY="your-key-here"
```

4. **Set up the database**
```bash
# Generate Prisma client
npx prisma generate

# Run migrations
npx prisma migrate dev
```

5. **Start the development server**
```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) to see the application.

## Usage

### Analyzing a Company's Filings

1. **Search for a company** by ticker symbol (e.g., AAPL, MSFT, TSLA)
2. **View filing history** - Browse through 10-K, 10-Q, and 8-K filings
3. **Click "Analyze"** to run AI-powered analysis
4. **Review insights**:
   - Executive summary with key takeaways
   - Risk factor changes with severity scoring
   - Management sentiment analysis
   - Financial metrics (when available)
   - Structured XBRL data from SEC API
   - Stock price prediction with confidence score

## Project Structure

```
sec-filing-analyzer/
├── app/                          # Next.js App Router pages
│   ├── api/                      # API routes
│   │   ├── analyze/[accession]/  # Filing analysis endpoint
│   │   ├── predict/[accession]/  # Stock prediction endpoint
│   │   └── sec/                  # SEC data fetching
│   ├── company/[ticker]/         # Company filing list page
│   ├── filing/[accession]/       # Filing detail page
│   └── page.tsx                  # Home page
├── lib/                          # Core business logic
│   ├── claude-client.ts          # Anthropic Claude integration
│   ├── sec-client.ts             # SEC EDGAR API client
│   ├── sec-data-api.ts           # SEC Company Facts API (XBRL)
│   ├── filing-parser.ts          # HTML/XBRL parsing utilities
│   ├── predictions.ts            # Prediction engine
│   ├── accuracy-tracker.ts       # Prediction accuracy tracking
│   ├── yahoo-finance-client.ts   # Stock price data
│   ├── prisma.ts                 # Prisma client singleton
│   └── cache.ts                  # In-memory caching
├── prisma/                       # Database schema and migrations
│   ├── schema.prisma             # Prisma schema definition
│   └── migrations/               # Database migrations
├── components/                   # Reusable UI components
│   └── ui/                       # shadcn/ui components
└── public/                       # Static assets
```

## Key Components

### Claude Client (`lib/claude-client.ts`)
Handles all interactions with Anthropic's Claude API:
- Risk factor analysis with prior period comparison
- Management sentiment detection
- Financial metrics extraction
- Filing content summarization
- Executive summary generation

### SEC Data API Client (`lib/sec-data-api.ts`)
Integrates with SEC's official Company Facts API:
- Fetches structured XBRL financial data
- Extracts metrics by accession number
- Calculates YoY/QoQ growth rates
- Supports all US GAAP concepts

### Prediction Engine (`lib/predictions.ts`)
Pattern-based prediction system:
- Risk score impact analysis
- Sentiment weighting
- 8-K event classification (earnings vs other)
- Guidance direction impact
- Historical pattern matching

### Filing Parser (`lib/filing-parser.ts`)
Parses SEC HTML/XBRL filings:
- Extracts Item 1A (Risk Factors)
- Extracts Item 7 (MD&A)
- Handles inline XBRL format
- Cleans HTML to plain text

## API Endpoints

### `GET /api/sec/company/{ticker}`
Fetch company information and recent filings from SEC EDGAR.

### `GET /api/analyze/{accession}`
Run AI analysis on a specific filing:
- Fetches filing HTML from SEC
- Extracts risk factors and MD&A
- Runs Claude analysis
- Fetches structured XBRL data
- Stores results in database

### `GET /api/predict/{accession}`
Generate stock price prediction for a filing:
- Parses filing analysis data
- Classifies 8-K events
- Calculates prediction features
- Returns predicted 7-day return
- Checks actual return if 7+ days have passed

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL or SQLite connection string |
| `ANTHROPIC_API_KEY` | Yes | Anthropic API key for Claude access |
| `ALPHA_VANTAGE_API_KEY` | No | Backup stock price API (Yahoo Finance is primary) |

## Development

### Database Management
```bash
# Create a new migration
npx prisma migrate dev --name description

# Reset database
npx prisma migrate reset

# Open Prisma Studio (database GUI)
npx prisma studio
```

### Building for Production
```bash
npm run build
npm start
```

## Deployment

### Vercel (Recommended)
1. Push to GitHub
2. Import project in Vercel
3. Add environment variables
4. Deploy

## Limitations & Future Improvements

### Current Limitations
- **Parsing accuracy**: Some inline XBRL filings may not extract perfectly
- **Historical data**: Limited to filings available in SEC EDGAR
- **Prediction model**: Uses pattern-based heuristics, not ML (yet)
- **Rate limits**: SEC API requests must include User-Agent header

### Planned Enhancements
- [ ] Machine learning prediction model trained on historical data
- [ ] Real-time filing alerts via webhooks
- [ ] PDF/exhibit analysis (earnings press releases)
- [ ] Multi-quarter trend analysis
- [ ] Portfolio tracking (multiple companies)
- [ ] Export to CSV/Excel
- [ ] Mobile responsive design improvements

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - see LICENSE file for details

## Acknowledgments

- **Anthropic** - Claude AI powers the intelligent analysis
- **SEC** - Free access to EDGAR and Company Facts APIs
- **Yahoo Finance** - Stock price data
- **Vercel** - Hosting and deployment platform

## Disclaimer

This tool is for educational and research purposes only. **Do not use this as financial advice.** Always consult with a qualified financial advisor before making investment decisions. Past performance does not guarantee future results.

---

Built with ❤️ using Next.js, TypeScript, and Claude AI
