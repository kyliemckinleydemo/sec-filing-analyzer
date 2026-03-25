# SEC Filing Analyzer (StockHuntr)

StockHuntr is an AI-powered financial intelligence platform that analyzes SEC filings to predict stock price movements and deliver actionable trading signals. The app ingests daily SEC filings via RSS, processes them through Anthropic's Claude AI to extract financial insights, generates 30-day alpha predictions, and manages user watchlists with automated alerts for significant filing events.

**Target Users:** Active traders, financial analysts, and investors seeking data-driven insights from SEC filings

**Core Flow:** Users authenticate via magic link → add companies to watchlist → receive automated alerts when watched companies file → view AI analysis with price predictions → execute paper trades or use signals for real trading

## Tech Stack

| Component | Technology | Notes |
|-----------|-----------|-------|
| Framework | Next.js 14 | App router with React 18.3.1 |
| Language | TypeScript 5.9 | Full type safety across codebase |
| Database | PostgreSQL | Via Prisma ORM 6.16.3 |
| ORM | Prisma | Schema includes Company, Filing, User, Watchlist models |
| AI | Anthropic Claude | @anthropic-ai/sdk for filing analysis |
| Authentication | Custom JWT + Magic Links | jsonwebtoken + Resend for email delivery |
| Email | Resend | Magic link authentication, filing alerts |
| State Management | React Query | @tanstack/react-query for server state |
| Styling | Tailwind CSS | With tailwindcss-animate and class-variance-authority |
| UI Components | Radix UI | Dialog, dropdown-menu, select components |
| Charts | Recharts | Stock price and prediction visualization |
| HTTP Client | Axios | External API calls (SEC EDGAR, Yahoo Finance) |
| Financial Data | yahoo-finance2 | Real-time stock prices, market data |
| RSS Parsing | rss-parser | Daily SEC filing ingestion |
| Testing | Vitest + Playwright | Unit/integration with Vitest, E2E with Playwright |
| Hosting | Vercel | Production deployment with custom domain |
| Schema Validation | Zod | Runtime type checking for API payloads |
| Animation | Framer Motion | UI transitions and interactions |

## Project Structure

```
sec-filing-analyzer/
├── app/
│   ├── api/                      # Next.js API routes
│   │   ├── auth/                 # Magic link auth endpoints
│   │   │   ├── send-magic-link/
│   │   │   ├── verify-magic-link/
│   │   │   ├── signout/
│   │   │   └── me/
│   │   ├── cron/                 # Scheduled job endpoints
│   │   │   ├── daily-filings-rss/ # RSS ingestion
│   │   │   ├── daily-filings/     # Filing processing
│   │   │   ├── watchlist-alerts/  # Alert generation
│   │   │   ├── update-stock-prices/
│   │   │   ├── update-analyst-data/
│   │   │   ├── paper-trading-close-positions/
│   │   │   └── supervisor/        # Job orchestration
│   │   ├── analyze/[accession]/   # Claude AI filing analysis
│   │   ├── predict/[accession]/   # Price prediction generation
│   │   ├── reanalyze/[accession]/ # Re-trigger analysis
│   │   ├── chat/                  # Natural language query
│   │   ├── query/                 # Structured data queries
│   │   ├── filings/latest/        # Recent filings endpoint
│   │   ├── stock-prices/          # Price data aggregation
│   │   ├── alerts/                # User alert management
│   │   ├── watchlist/             # Watchlist CRUD
│   │   ├── backtest/              # Strategy backtesting
│   │   ├── paper-trading/         # Simulated portfolio
│   │   └── company/[ticker]/snapshot/ # Company metrics
│   ├── components/               # Shared React components
│   │   └── Navigation.tsx        # Main nav with auth state
│   ├── filing/[accession]/       # Filing detail page
│   ├── latest-filings/           # Browse all filings
│   ├── chat/                     # Natural language interface
│   ├── query/                    # Advanced search
│   ├── alerts/                   # Alert management UI
│   ├── backtest/                 # Backtesting dashboard
│   ├── paper-trading/            # Portfolio simulation
│   ├── profile/                  # User settings
│   ├── faq/                      # Help documentation
│   ├── layout.tsx                # Root layout with Navigation
│   ├── page.tsx                  # Home dashboard
│   └── error.tsx                 # Error boundary
├── prisma/
│   └── schema.prisma             # Database schema
├── __tests__/                    # Test suites
├── scripts/
│   └── manual-cron-trigger.ts    # Dev cron testing
├── prefiling-volume-summary.json # Filing volume analysis
├── selected-companies-with-midcaps.json # Watchlist seed data
└── clean-filing-ids.json         # Filing metadata cache
```

## Key Types & Data Models

### User Model (Prisma)
```typescript
model User {
  id: string
  email: string
  name?: string
  tier: string // Subscription level
}
```
Represents authenticated users. Tier determines feature access (alerts, paper trading).

### Company Model (Prisma)
```typescript
model Company {
  id: string
  ticker: string // Stock symbol (unique)
  cik: string // SEC Central Index Key (not unique - allows GOOG/GOOGL)
  name: string
  sector?: string
  industry?: string
  
  // Yahoo Finance snapshot
  marketCap?: number
  peRatio?: number
  currentPrice?: number
  fiftyTwoWeekHigh?: number
  fiftyTwoWeekLow?: number
  analystTargetPrice?: number
  dividendYield?: number
  beta?: number
  volume?: bigint
  
  // Latest fundamentals from XBRL
  latestRevenue?: number
  latestRevenueYoY?: number // Year-over-year growth %
  latestNetIncome?: number
  latestNetIncomeYoY?: number
  latestEPS?: number
  latestGrossMargin?: number
  latestOperatingMargin?: number
  latestQuarter?: string // "Q1 2024"
  
  yahooFinanceData?: string // JSON blob
  yahooLastUpdated?: DateTime
  
  filings: Filing[]
  snapshots: CompanySnapshot[]
  analystActivities: AnalystActivity[]
}
```
Core entity for companies tracked in the system. Combines SEC EDGAR data with Yahoo Finance market metrics.

### Filing Model (Inferred from routes)
```typescript
interface Filing {
  id: string
  ticker: string
  companyName: string
  formType: string // "10-Q", "10-K", "8-K"
  filedAt: string // ISO datetime
  accessionNumber: string // SEC unique identifier (e.g., "0001234567-24-000001")
  
  // AI Analysis results
  predicted30dAlpha?: number // Expected 30-day return %
  predictionConfidence?: number // 0-100 confidence score
  concernLevel?: number // Risk indicator
}
```

### WatchlistItem (Frontend)
```typescript
interface WatchlistItem {
  id: string
  ticker: string
  companyName: string
  addedAt: string
  company?: CompanySnapshot // Nested current metrics
}
```

### RecentFiling (Frontend)
```typescript
interface RecentFiling {
  id: string
  ticker: string
  companyName: string
  formType: string
  filedAt: string
  filingDate?: string
  accessionNumber: string
  companySnapshot?: CompanySnapshot
  predicted30dAlpha?: number | null
  predictionConfidence?: number | null
  concernLevel?: number | null
}
```
Enriched filing data shown on home dashboard with AI predictions.

### CompanySnapshot (Frontend)
```typescript
interface CompanySnapshot {
  currentPrice?: number | null
  marketCap?: number | null
  peRatio?: number | null
  dividendYield?: number | null
  beta?: number | null
  latestRevenue?: number | null
  latestRevenueYoY?: number | null
  latestNetIncome?: number | null
  latestNetIncomeYoY?: number | null
  latestGrossMargin?: number | null
  latestOperatingMargin?: number | null
  latestQuarter?: string | null
  analystTargetPrice?: number | null
}
```
Current financial metrics for a company, updated by cron jobs.

### TopSignal (Frontend)
```typescript
interface TopSignal {
  ticker: string
  companyName: string
  formType: string
  filingDate: string
  accessionNumber: string
  predicted30dAlpha: number
  predictionConfidence: number
}
```
Highest-conviction trading signals displayed on dashboard.

## Commands

```bash
# Development
npm run dev                    # Start Next.js dev server
npm run build                  # Build for production (runs prisma generate)
npm start                      # Start production server
npm run lint                   # ESLint checks

# Database
npm run postinstall            # Generate Prisma client (auto after install)

# Testing
npm test                       # Run all Vitest tests
npm run test:watch             # Watch mode
npm run test:unit              # Unit tests only
npm run test:integration       # Integration tests
npm run test:coverage          # Coverage report
npm run test:e2e               # Playwright E2E tests
npm run test:e2e:ui            # Playwright UI mode
npm run test:e2e:install       # Install Playwright browsers

# Deployment
npm run deploy                 # Deploy to Vercel production + set alias
npm run deploy:preview         # Deploy preview build
npm run set-alias              # Alias to stockhuntr.net

# Utilities
npm run trigger-cron           # Manually trigger cron jobs (dev)
```

## Module Documentation Format

This is a TypeScript/Next.js project. Use JSDoc comments for functions and TSDoc for complex types:

```typescript
/**
 * @module app/api/analyze/[accession]/route
 * @description Analyzes SEC filing using Claude AI and generates trading signal
 */

/**
 * Analyzes an SEC filing and generates alpha prediction
 * 
 * @param accessionNumber - SEC filing accession number (format: 0000000000-00-000000)
 * @returns Promise<AnalysisResult> - Predicted alpha, confidence, concern level
 * @throws {Error} If filing not found or Claude API fails
 */
async function analyzeFilingWithClaude(accessionNumber: string): Promise<AnalysisResult> {
  // implementation
}
```

## Code Patterns

### Authentication
- **Magic Link Flow**: Users enter email → `send-magic-link` generates JWT token → Resend emails link → `verify-magic-link` validates token and sets session
- **JWT Storage**: Client-side storage mechanism for auth tokens (inferred from `/me` endpoint existence)
- **Auth Middleware**: `/api/auth/me` endpoint checks current session status
- **Protected Routes**: Pages check user state via `useState<User | null>` and redirect if null

### Data Fetching
- **React Query**: Used for server state management with `@tanstack/react-query`
- **Client-Side Fetching**: `useEffect` + `fetch` pattern on page components (seen in `page.tsx`)
- **Loading States**: `loading` boolean state with skeleton UIs
- **Error Boundaries**: `error.tsx` for route-level error handling

### API Route Structure
- **Next.js 14 Route Handlers**: `route.ts` files export `GET`, `POST`, `PUT`, `DELETE` functions
- **Dynamic Routes**: `[accession]`, `[ticker]` for parameterized endpoints
- **Cron Jobs**: `/api/cron/*` routes called by Vercel cron scheduler
- **Response Pattern**: Return `NextResponse.json()` with typed payloads

### Component Patterns
- **Functional Components**: React 18 with hooks (no class components)
- **Client Components**: `'use client'` directive for interactive pages
- **Compound Components**: `Card`, `CardHeader`, `CardContent` pattern from Radix UI
- **Utility Functions**: `safeFormatPrice`, `safeFormatPercent` for null-safe formatting

### State Management
- **Local State**: `useState` for component-level state
- **Server State**: React Query for API data caching
- **No Global State**: User state fetched per-page (could be refactored to Context)

### Styling
- **Tailwind Utility Classes**: All styling via `className="..."`
- **Radix UI Primitives**: Accessible components with Tailwind styling
- **CVA**: `class-variance-authority` for component variants
- **Responsive**: Mobile-first design with Tailwind breakpoints

### Type Safety
- **Prisma Generated Types**: Database models generate TypeScript types
- **Interface Definitions**: Frontend defines response shapes separate from Prisma
- **Zod Validation**: Runtime schema validation for API inputs (imported in package.json)
- **Null Safety**: Extensive use of optional chaining (`?.`) and nullish coalescing (`??`)

## Key Integrations

### Anthropic Claude AI
- **SDK**: `@anthropic-ai/sdk` version 0.65.0
- **Usage**: `/api/analyze/[accession]` sends SEC filing text to Claude for financial analysis
- **Outputs**: Structured JSON with `predicted30dAlpha`, `predictionConfidence`, `concernLevel`
- **Prompts**: System prompts guide Claude to extract sentiment, risks, opportunities from filings

### Yahoo Finance
- **Library**: `yahoo-finance2` version 2.13.3
- **Purpose**: Real-time stock prices, market cap, P/E ratios, analyst ratings
- **Update Pattern**: Cron job `/api/cron/update-stock-prices` fetches daily
- **Stored Fields**: Updated on `Company` model (`currentPrice`, `marketCap`, etc.)

### SEC EDGAR
- **RSS Feed**: `/api/cron/daily-filings-rss` parses SEC RSS for new filings
- **Direct Access**: Fetches filing text via accession number for Claude analysis
- **Filing Types**: Tracks 10-K, 10-Q, 8-K forms
- **XBRL Parsing**: Extracts structured financial data from XBRL tags

### Resend Email
- **Package**: `resend` version 6.5.2
- **Magic Link Auth**: Sends authentication emails with JWT tokens
- **Filing Alerts**: Notifies users when watchlist companies file
- **Configuration**: API key stored in environment variables

### Vercel
- **Hosting**: Production deployment with custom domain (stockhuntr.net)
- **Cron Jobs**: Vercel cron scheduler triggers `/api/cron/*` endpoints
- **Environment**: `DATABASE_URL`, `RESEND_API_KEY`, `ANTHROPIC_API_KEY` in Vercel settings
- **Alias Command**: `npm run set-alias` updates DNS pointer

### PostgreSQL (via Prisma)
- **Connection**: `DATABASE_URL` environment variable
- **Migrations**: Prisma manages schema evolution
- **Models**: Company, Filing, User, Watchlist, CompanySnapshot, AnalystActivity
- **Relations**: One-to-many (Company → Filings), many-to-many (User ↔ Company via Watchlist)

## Architectural Decisions

### 1. **Next.js App Router with API Routes for Backend**
The project uses Next.js 14's app router (`app/` directory) with co-located API routes (`app/api/`). This eliminates the need for a separate backend service—all server logic lives in `route.ts` files. The `/api/analyze/[accession]/route.ts` pattern shows dynamic route parameters for filing analysis. This reduces deployment complexity (single Vercel deployment) but couples frontend and backend tightly.

**Why**: Simplifies stack, leverages Vercel's edge network, shares TypeScript types between client/server.

### 2. **Prisma ORM with PostgreSQL for Relational Data**
The schema (`schema.prisma`) defines complex relationships between Companies, Filings, Users, and Watchlists. The `Company` model stores both SEC metadata (CI