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

Browser-based smoke tests via Playwright against the running dev server.

| File | What it tests |
|------|---------------|
| `navigation.spec.ts` | All main routes load without "Application error" |
| `filing-analysis.spec.ts` | Homepage content, latest filings page, filing detail page |
| `authentication.spec.ts` | Sign-in modal, unauthenticated profile redirect |

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
