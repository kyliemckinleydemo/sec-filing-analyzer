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
- **Build hang gotcha:** `next build` has occasionally hung (0-byte output, process alive
  at ~0 CPU, `.next` frozen). If a build sits with no output for minutes, `pkill -f
  ".bin/next"` and rerun. Always confirm the route-manifest table printed before trusting
  `exit 0` from a captured background build.

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
