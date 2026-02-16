# Test Plan — SEC Filing Analyzer

## Running Tests

```bash
# Run all unit + integration tests
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

| File | What it tests |
|------|---------------|
| `lib/alpha-model.test.ts` | `predictAlpha()` scoring, signal classification, percentile thresholds, feature contributions; `extractAlphaFeatures()` ratio calculations and fallback behavior |
| `lib/auth.test.ts` | JWT create/verify round-trip, tampered-token rejection, magic link token generation |
| `lib/rate-limit.test.ts` | Fingerprint generation (SHA-256), 20-request unauth limit, 100-request auth quota |

### Integration Tests (`__tests__/integration/`)

Test API route handlers and service-layer modules with mocked Prisma and external APIs.

| File | What it tests |
|------|---------------|
| `api/predict.test.ts` | Predict API: 404 for missing filing, alpha model scoring, cached prediction path, accession normalization, DB writes, legacy fallback |
| `api/auth-send-magic-link.test.ts` | Email validation, token creation, email normalization |
| `lib/paper-trading.test.ts` | Signal evaluation (confidence, existing positions, return threshold), LONG/SHORT P&L calculation, trade closure error cases |

### E2E Tests (`__tests__/e2e/`)

Comprehensive browser-based tests via Playwright against the running dev server (~45+ tests across 8 spec files).

| File | Tests | What it covers |
|------|-------|----------------|
| `homepage.spec.ts` | 8 | Hero section, CTAs (Start Free, View Live Filings Feed), features section, How It Works steps, footer nav, navbar, search |
| `latest-filings.spec.ts` | 9 | Filing cards with ticker/company/type/date, search input, filing type filter, Analyze button navigation, SEC.gov link, filing count, refresh |
| `filing-analysis.spec.ts` | 5 | Filing detail page load, company info/auth prompt, analysis progress/results, unknown accession error handling, navigation |
| `query.spec.ts` | 9 | NLP query input, Natural Language Query title, example queries, click-to-populate, search button state, loading/results, queryable data section |
| `chat.spec.ts` | 9 | Chat title, ticker input, message input/send button, question categories, available data, example click-to-populate, ticker URL auto-fill, message submission |
| `company.spec.ts` | 5 | Company page load (AAPL), company name/ticker display, filing history/sections, unknown ticker error handling, no Application error |
| `paper-trading.spec.ts` | 6 | Page load, portfolio title/subtitle, key metrics (Total Value, Win Rate, Cash Available), open positions, recent trades |
| `authentication.spec.ts` | 3 | Sign-in modal with email input, unauthenticated profile redirect, FAQ page with expandable sections |

## Mocking Strategy

- **Prisma**: Fully mocked via `__tests__/mocks/prisma.ts` — every model method is a `vi.fn()`. Imported via `vi.mock('@/lib/prisma')`. No test database needed.
- **External APIs**: `yahoo-finance2`, `resend` mocked at module level in integration tests.
- **Auth/Middleware**: Mocked in integration tests to bypass rate limiting and session checks.
- **Fixtures**: Shared test data in `__tests__/fixtures/` for consistent, reusable mock objects.

## How to Add New Tests

1. **Unit test**: Create `__tests__/unit/<path>/<module>.test.ts`. Import the module directly. No mocks needed for pure functions.

2. **Integration test**: Create `__tests__/integration/<path>/<module>.test.ts`. Import the prisma mock at top: `import { prismaMock } from '../../mocks/prisma';`. Add `vi.mock()` calls for any external dependencies before importing the module under test.

3. **E2E test**: Create `__tests__/e2e/<name>.spec.ts`. Use Playwright's `test` and `expect`. Tests run against `localhost:3000`.

## Coverage Targets

| Category | Target |
|----------|--------|
| Alpha model (`lib/alpha-model.ts`) | 95%+ |
| Auth (`lib/auth.ts`) | 80%+ |
| Rate limiting (`lib/rate-limit.ts`) | 80%+ |
| Predict API route | 70%+ |
| Overall | 60%+ |

## Configuration Files

- `vitest.config.ts` — Vitest runner config with `vite-tsconfig-paths` for `@/*` alias resolution
- `playwright.config.ts` — Playwright config targeting `localhost:3000` with auto-start dev server
- `__tests__/setup.ts` — Global setup: mock env vars, `vi.clearAllMocks()` in `beforeEach`
