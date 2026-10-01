# StockHuntr — Developer's Guide

Practical guide for working in this repo. For product/feature overview see the root
[`README.md`](README.md); for the ML model see [`MODEL.md`](MODEL.md); for the MCP
server as a consumer see [`MCP-GUIDE.md`](MCP-GUIDE.md).

## Stack

Next.js 14 (App Router) · TypeScript · Prisma + PostgreSQL (Railway) · Anthropic Claude ·
yahoo-finance2 v3 · Vercel hosting. See `README.md` for the full table.

## Local setup

```bash
npm install                 # runs prisma generate via postinstall
# .env must contain DATABASE_URL (Railway), ANTHROPIC_API_KEY, RESEND_API_KEY, CRON_SECRET, FRED_API_KEY
npm run dev                 # http://localhost:3000
```

## Build / test / deploy

```bash
npm run build               # prisma generate + next build
npm test                    # Vitest unit/integration
npm run test:e2e            # Playwright E2E
npx vercel --prod           # deploy to production (auto-aliases www.stockhuntr.net)
```

- **Deploy is manual** via `npx vercel --prod` (GitHub auto-deploy may not be wired up).
- After a config/route change, verify against the **direct deployment URL** printed by
  Vercel before trusting `www` (the apex→www redirect can strip headers).
- **Local `next build` is unreliable on some machines** — the webpack compile worker can
  spin indefinitely (one core pegged, zero output, `.next` frozen) regardless of the
  `experimental.cpus`/`workerThreads` config. It is **environmental** (Vercel builds the
  identical code reliably every deploy). Don't fight it: **verify locally with
  `npx tsc --noEmit`** (fast, catches type errors — ignore the known pre-existing
  `__tests__/setup.ts` NODE_ENV error) and let **`npx vercel --prod` be the build gate**
  (Vercel compiles + reports failures loudly). If you must build locally and it spins,
  `pkill -f ".bin/next"`. Note: killing a build mid-op can leave a stale `.git/index.lock`
  — `rm -f .git/index.lock` if git then reports "Another git process seems to be running".

## Repo map (where things live)

| Area | Path |
|------|------|
| Pages (App Router) | `app/**/page.tsx` |
| API + cron routes | `app/api/**/route.ts` |
| MCP server | `app/api/mcp/route.ts` |
| Shared server components | `app/components/*` (Breadcrumbs, AnalysisProvenance, FilingLede, CompanyLede, RelatedCompanies, QASection) |
| Grounded Q&A builders | `lib/qa-builders.ts` |
| Curated content | `app/learn/explainers.ts`, `app/compare/comparisons.ts`, `lib/sectors.ts` |
| Prisma schema | `prisma/schema.prisma` |
| Sitemap / robots / llms | `app/sitemap.ts`, `app/robots.ts`, `public/llms.txt` |
| Discovery manifests | `public/.well-known/mcp.json`, `public/.well-known/ai-plugin.json` |

## The MCP server

`app/api/mcp/route.ts` mounts a remote MCP server via `mcp-handler` (Streamable HTTP,
exported as both `GET` and `POST`). It exposes **7 read-only tools** — all query the same
Prisma DB that powers the site.

### Adding a tool

Register inside the `createMcpHandler((server) => { ... })` callback:

```ts
server.registerTool(
  'tool_name',
  {
    title: 'Human title',
    description: 'What it does and when to use it. Be explicit about units.',
    inputSchema: z.object({           // Zod v4 object (NOT a raw shape)
      ticker: z.string().describe('e.g. "AAPL"'),
      limit: z.number().int().min(1).max(50).default(10),
    }),
  },
  async (args) => {
    const rows = await prisma.company.findMany({ /* ... */ });
    return json({ /* serializable */ });   // json() helper wraps as MCP text content
  }
);
```

Then keep these **in sync** (there is no single source of truth — update all):
- the tool count/list in `public/.well-known/mcp.json`
- the `TOOLS` array + count in `app/mcp/page.tsx`
- the "N read-only tools" line in `public/llms.txt`

### Publishing to the official MCP Registry

The server is published at `io.github.kyliemckinleydemo/sec-filing-analyzer` via the
`server.json` manifest in the repo root (a remote `streamable-http` entry → `/api/mcp`).
To (re)publish — e.g. after bumping the server version:

```bash
# bump "version" in server.json first — the registry REJECTS a duplicate version
mcp-publisher validate                                              # checks against the live registry
mcp-publisher login github -token "$(gh auth token --user kyliemckinleydemo)"   # namespace owner; no browser needed
mcp-publisher publish
# verify: curl "https://registry.modelcontextprotocol.io/v0/servers?search=io.github.kyliemckinleydemo/sec-filing-analyzer"
```

Notes: `description` must be ≤100 chars. `mcp-publisher init` embeds the git-remote
PAT into `repository.url` — scrub it before committing. The namespace requires auth as
`kyliemckinleydemo` (that account's token is in the local gh keyring). PulseMCP and
other downstreams auto-pull from the official registry; Glama auto-indexes the public
GitHub repo (hence the `mcp`/`model-context-protocol` repo topics).

### Conventions & gotchas
- **Units:** the DB stores `dividendYield`/`revenueGrowth`/margins as **ratios** (0.03 =
  3%). MCP inputs/outputs use **percent** — divide by 100 when filtering, multiply by 100
  in results (`dividendYieldPct`). Market cap is raw USD; screener/MCP inputs are billions.
- **Sorting:** Postgres sorts `NULL` **first** on `DESC`. Always use
  `orderBy: { field: { sort: 'desc', nulls: 'last' } }` so companies missing a metric
  (often delisted) don't dominate the top. See `screen_companies` and `app/screener/page.tsx`.
- **Accuracy claims are load-bearing (YMYL).** Model numbers live in several hardcoded
  places (`app/faq/page.tsx`, `app/api/mcp/route.ts`, `app/filing/[accession]/filing-client.tsx`,
  `public/llms.txt`). Lead with the **walk-forward backtest** (~74.7% high-conf, 53.5%
  overall, Sharpe ~1.97), NOT the stale live figure. Recompute with
  `npx tsx scripts/backtest-alpha-v2.ts` (read-only) before changing any of them.

## The daily news pipeline (`/news`)

A penalty-safe, AI-written daily news section. Flow:

1. **Generate** — `app/api/cron/generate-news/route.ts` (cron, daily 12:00 UTC). Selects the
   day's most significant *recently-analyzed* filings (concern ≥ 4, last 2 days), **hard-capped
   at 4/run** (never one-per-filing), skips any filing already written about (idempotent via
   the unique `NewsArticle.filingAccession`). For each, calls
   `claudeClient.generateNewsArticle()` and persists a `NewsArticle` row.
2. **Prompt** — `generateNewsArticle()` in `lib/claude-client.ts` uses a STRICT grounded prompt:
   facts-only, **never do arithmetic or derive figures** (the one hallucination caught in QA was
   a mis-computed number — state figures only as they appear, else describe qualitatively),
   don't cite internal model scores as facts, unique analysis not restatement, honest signal
   caveat, not-advice. Returns `{title, dek, body}`.
3. **Render** — `app/news/page.tsx` (index) + `app/news/[slug]/page.tsx` (article: `NewsArticle`
   JSON-LD, visible **AI-disclosure line** — required by Google's AI-content policy —
   `AnalysisProvenance` with a real EDGAR link via ticker→cik lookup, internal links).
   Per-article featured image: `app/news/[slug]/opengraph-image.tsx` (`next/og`).
4. **Surface** — `app/news-sitemap.xml/route.ts` (Google News sitemap, last-48h only,
   `<news:news>` tags; referenced from `robots.ts`). Also in the main sitemap, RSS `feed.xml`,
   nav, footer, llms.txt.
5. **Syndicate** — `app/api/cron/syndicate-news/route.ts` (cron, 12:30 UTC) → `lib/syndication.ts`
   posts new articles to Medium / X / LinkedIn. **Credential-gated**: each channel no-ops if its
   env vars are absent (never throws). Dedup via `NewsArticle.mediumUrl` / `xPostedAt` /
   `linkedinPostedAt`. Env to activate: `MEDIUM_INTEGRATION_TOKEN`; `X_API_KEY`/`X_API_SECRET`/
   `X_ACCESS_TOKEN`/`X_ACCESS_SECRET` (X posting = paid tier); `LINKEDIN_ACCESS_TOKEN` +
   `LINKEDIN_ORG_URN`. Owned accounts only — never third-party communities (Reddit/HN = spam/ban).

**Manual trigger (testing):** `curl <deploy-url>/api/cron/generate-news -H "Authorization: Bearer $CRON_SECRET"`
(use the direct Vercel deploy URL — the www alias strips auth headers). Same for `syndicate-news`.

**Maintenance:** AI generation isn't guaranteed — run a periodic adversarial QA of recent
articles (cross-check specific numbers against the linked EDGAR filing; confirm AI-disclosure +
not-advice present; watch for restatement-not-analysis). Delete a bad article's row to let the
generator re-create it under the current prompt.

## SEO / GEO patterns (penalty-safe)

This site's traffic strategy is **deepen canonical pages + a few genuinely-distinct pages**,
never mass-generated per-entity URLs (scaled-content abuse → Google penalty).

- **Server-render unique content** into initial HTML (no client-only main content) so
  programmatic pages are indexable without JS — see `FilingLede`/`CompanyLede`.
- **JSON-LD** is injected as an escaped `application/ld+json` script (escape `<` as
  `<` before injection) — the established pattern across QASection/layout/sectors/
  learn/compare/dataset. (A pre-commit/security hook may flag the inline-HTML prop
  intermittently; retry, or write the file without that line then Edit it in.)
- **New curated content** = add an entry to `app/learn/explainers.ts` or
  `app/compare/comparisons.ts` (auto-flows into sitemap + `/learn`|`/compare` index + footer).
  Must be unique, grounded, cited — never templated filler.
- **Canonicalize filtered/param views** to the base path (see `/screener`) to avoid
  query-param index bloat.
- New top-level pages: wire into `app/sitemap.ts`, `app/components/Navigation.tsx`,
  `app/components/Footer.tsx`, and (if agent/AI-relevant) `public/llms.txt`.

## Static assets & `.well-known`

Files in `public/` (including dotfolders like `public/.well-known/`) are served verbatim at
the site root on Vercel. Note: with `output: 'standalone'` (in `next.config.js`), a
self-hosted standalone binary needs `public/` copied alongside it — Vercel handles this
automatically.

## Config files

`next.config.js` is the **active** Next config (there was a `.mjs` that Next ignored — it
was removed). Security headers + the `/filing`→`/latest-filings` redirect live there. The
apex→www redirect is a **Vercel project-domain setting** (308), not middleware —
`middleware.ts` only handles ticker-case normalization now.
