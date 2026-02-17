# Test Plan — SEC Filing Analyzer

## Running Tests

```bash
# Run all unit + integration tests (170 tests)
npm test

# Watch mode (re-runs on file changes)
npm run test:watch

# Unit tests only
npm run test:unit

# Integration tests only
npm run test:integration

# Coverage report
npm run test:coverage

# E2E tests (requires dev server or uses webServer config)
npm run test:e2e:install   # first time: install Chromium
npm run test:e2e           # run headless
npm run test:e2e:ui        # interactive Playwright UI
```

## Test Architecture

### Unit Tests (`__tests__/unit/`)

Fast, isolated tests for pure logic — no network, no database.

| File | Tests | What it tests |
|------|-------|---------------|
| `lib/alpha-model.test.ts` | ~20 | `predictAlpha()` scoring, signal classification, percentile thresholds, feature contributions; `extractAlphaFeatures()` ratio calculations and fallback behavior |
| `lib/auth.test.ts` | ~8 | JWT create/verify round-trip, tampered-token rejection, magic link token generation |
| `lib/rate-limit.test.ts` | ~7 | Fingerprint generation (SHA-256), 20-request unauth limit, 100-request auth quota |

### Integration Tests — Cron Jobs (`__tests__/integration/api/cron/`)

Test all 10 cron job API route handlers with mocked Prisma and external APIs. Every test file verifies auth (401 without CRON_SECRET), success paths, edge cases, and error handling.

| File | Tests | What it tests |
|------|-------|---------------|
| `daily-filings-rss.test.ts` | 16 | SEC RSS ingestion, Yahoo Finance company updates, snapshot creation, prediction cache flush, stuck job cleanup, supervisor health checks, catch-up mode, error handling |
| `update-analyst-data.test.ts` | 15 | Analyst consensus fetching, earnings data, 8-K filtering, per-company error handling, data merging into analysisData JSON |
| `update-stock-prices.test.ts` | 11 | Price/volume/PE updates, BigInt volume handling, per-ticker errors, 404 delisted ticker handling |
| `update-stock-prices-batch.test.ts` | 9 | 6-batch rotation based on UTC hour (`vi.setSystemTime`), correct batch slice selection, per-ticker errors |
| `watchlist-alerts.test.ts` | 18 | Email alerts for high-concern filings, price changes, analyst activity; concern color coding; action formatting; user grouping (one email per user); Resend API error handling |
| `watchlist-alerts-scheduler.test.ts` | 6 | Morning/evening routing based on UTC hour, fetch to watchlist-alerts endpoint with auth |
| `paper-trading-close-positions.test.ts` | 10 | PaperTradingEngine construction, position closure, portfolio metrics update, multi-portfolio processing, per-portfolio error isolation |
| `supervisor-route.test.ts` | 7 | Supervisor HTTP endpoint, `autoTriggerMissing=true` flag, healthy/alerts status, error handling |

### Integration Tests — Services (`__tests__/integration/lib/`)

| File | Tests | What it tests |
|------|-------|---------------|
| `supervisor.test.ts` | 18 | `runSupervisorChecks()`: healthy state, stuck job detection (>10min), missing daily filings (>30h), missing analyst data (>48h, weekday-only), high failure rate (>50%), auto-trigger missing jobs, email alerts via Resend, weekend analyst check skip, error handling |
| `paper-trading.test.ts` | ~10 | `PaperTradingEngine`: signal evaluation (confidence, existing positions, return threshold), LONG/SHORT P&L calculation, trade closure error cases |

### Integration Tests — API Routes (`__tests__/integration/api/`)

| File | Tests | What it tests |
|------|-------|---------------|
| `predict.test.ts` | ~12 | Predict API: 404 for missing filing, alpha model scoring, cached prediction path, accession normalization, DB writes, legacy fallback |
| `auth-send-magic-link.test.ts` | ~5 | Email validation, token creation, email normalization |

### E2E Tests (`__tests__/e2e/`)

Browser-based tests via Playwright against the running dev server (~45+ tests).

| File | Tests | What it covers |
|------|-------|----------------|
| `homepage.spec.ts` | 8 | Hero section, CTAs, features section, How It Works, footer, navbar, search |
| `latest-filings.spec.ts` | 9 | Filing cards, search, filing type filter, Analyze navigation, SEC.gov links |
| `filing-analysis.spec.ts` | 5 | Filing detail page, company info, analysis progress/results, error handling |
| `query.spec.ts` | 9 | NLP query input, example queries, click-to-populate, search results |
| `chat.spec.ts` | 9 | Chat interface, ticker input, message submission, question categories |
| `company.spec.ts` | 5 | Company page, filing history, unknown ticker error handling |
| `paper-trading.spec.ts` | 6 | Portfolio dashboard, metrics, open positions, recent trades |
| `authentication.spec.ts` | 3 | Sign-in modal, unauthenticated redirect, FAQ page |

## Mocking Strategy

### Prisma Mock (`__tests__/mocks/prisma.ts`)
Centralized mock for all Prisma models. Every model method (`findMany`, `create`, `update`, `upsert`, `count`, `deleteMany`, etc.) is a `vi.fn()`. Imported via `vi.mock('@/lib/prisma')`. Includes models: `company`, `filing`, `prediction`, `analystActivity`, `cronJobRun`, `companySnapshot`, `macroIndicators`, `paperPortfolio`, `paperTrade`, `portfolioSnapshot`, `user`, `watchlistItem`, `alert`.

### External API Mocking
- **`yahoo-finance2`** — Module-level mock via `vi.mock('yahoo-finance2')`
- **`resend`** — Constructor mock using named `function` (not arrow function) to support `new Resend()`
- **`@/lib/sec-rss-client`** — Mock `secRSSClient.fetchFilings()`
- **`@/lib/yahoo-finance-client`** — Mock `yahooFinanceClient` methods
- **`@/lib/supervisor`** — Mock `runSupervisorChecks()`
- **`@/lib/paper-trading`** — Mock `PaperTradingEngine` class with `engineConstructorCalls` tracking array
- **`global.fetch`** — Mocked via `vi.fn()` for Resend API calls and auto-trigger endpoints

### Key Vitest Patterns

**vi.hoisted() for mock function references:**
```typescript
// vi.mock() factories are hoisted above const declarations
// Use vi.hoisted() for mock fns referenced inside vi.mock() factories
const { mockFn } = vi.hoisted(() => ({ mockFn: vi.fn() }));
vi.mock('module', () => ({ thing: mockFn }));
```

**Named function for constructor mocks:**
```typescript
// vi.fn().mockImplementation(() => ...) does NOT work as constructor
// Use a named function declaration instead
vi.mock('resend', () => {
  return { Resend: function () { return { emails: { send: mockSend } }; } };
});
```

**Constructor call tracking:**
```typescript
// Track constructor args with a manual array (not vi.fn())
const { mockMethod, constructorCalls } = vi.hoisted(() => ({
  mockMethod: vi.fn(),
  constructorCalls: [] as string[],
}));
vi.mock('@/lib/paper-trading', () => {
  function PaperTradingEngine(id: string) {
    constructorCalls.push(id);
    return { method: mockMethod };
  }
  return { PaperTradingEngine };
});
```

**Auth test pattern:**
```typescript
new NextRequest(url, { headers: { authorization: 'Bearer test-cron-secret' } })
```

## Fixtures (`__tests__/fixtures/`)

| File | Contents |
|------|----------|
| `cron-data.ts` | Mock cron job runs, RSS filings, companies (AAPL full), Yahoo Finance responses, analyst activities, paper portfolios, users with watchlists, macro indicators |
| `alpha-features.ts` | Alpha model feature sets for prediction testing |
| `company-data.ts` | Company records for API tests |
| `filing-data.ts` | Filing records with analysis data for prediction tests |

## Configuration Files

- `vitest.config.ts` — Vitest runner config with `vite-tsconfig-paths` for `@/*` alias resolution
- `playwright.config.ts` — Playwright config targeting `localhost:3000` with auto-start dev server
- `__tests__/setup.ts` — Global setup: mock env vars (`CRON_SECRET`, `ALERT_EMAIL`, `VERCEL_URL`, `ANTHROPIC_API_KEY`, `JWT_SECRET`, `MAGIC_LINK_SECRET`), `vi.clearAllMocks()` in `beforeEach`

## Coverage Summary

| Category | Files | Tests |
|----------|-------|-------|
| Unit | 3 | ~35 |
| Integration — Cron | 9 | ~110 |
| Integration — Services | 2 | ~28 |
| Integration — API | 2 | ~17 |
| **Vitest Total** | **15** | **~170** |
| E2E (Playwright) | 8 | ~45 |
| **Grand Total** | **23** | **~215** |
