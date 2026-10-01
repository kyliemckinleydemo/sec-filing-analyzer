# StockHuntr MCP Server — User Guide

StockHuntr runs a free, remote **Model Context Protocol (MCP)** server so AI agents
(Claude, ChatGPT, Copilot, and any MCP-aware client) can query AI-analyzed SEC filings,
company fundamentals, fundamentals-based stock screening, and 30-day prediction signals —
all read-only and grounded in primary-source SEC EDGAR data.

- **Public docs page:** https://www.stockhuntr.net/mcp
- **Endpoint:** `https://www.stockhuntr.net/api/mcp`
- **Transport:** Streamable HTTP (GET + POST)
- **Auth:** none
- **Discovery manifest:** https://www.stockhuntr.net/.well-known/mcp.json
- **Official MCP Registry:** listed as `io.github.kyliemckinleydemo/sec-filing-analyzer`
  — `curl "https://registry.modelcontextprotocol.io/v0/servers?search=io.github.kyliemckinleydemo/sec-filing-analyzer"`

> StockHuntr is an educational/research tool. Predictions are model outputs, not
> investment advice.

## Connecting

### Clients that speak Streamable HTTP natively
Claude.ai and API-based agents can point directly at the endpoint:

```
https://www.stockhuntr.net/api/mcp
```

### Claude Desktop (via `mcp-remote`)
Claude Desktop connects to remote servers through the `mcp-remote` bridge. Add this to
`claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "stockhuntr": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://www.stockhuntr.net/api/mcp"]
    }
  }
}
```

Restart Claude Desktop; the `stockhuntr` tools appear in the tools menu.

## Tools (7)

| Tool | What it does | Key inputs |
|------|--------------|-----------|
| `get_latest_filings` | Recent 10-K/10-Q/8-K with AI analysis + 30-day predictions | `ticker?`, `filing_type?`, `limit?` |
| `get_filing_analysis` | Full analysis for one filing | `accession_number` |
| `get_company` | Company snapshot: sector, fundamentals, recent filings | `ticker` |
| `search_companies` | Find tracked companies by ticker/name | `query`, `limit?` |
| `screen_companies` | Filter 800+ companies by fundamentals | `sector?`, `min_market_cap_billions?`, `max_pe?`, `min_dividend_yield_pct?`, `min_revenue_growth_pct?`, `sort?`, `limit?` |
| `get_top_signals` | Highest-conviction 30-day signals (last 90 days) | `limit?` |
| `get_model_track_record` | Backtested accuracy + live outcome counts | — |

### Units & conventions
- **Dividend yield / revenue growth** inputs and outputs are in **percent** (`3` = 3%).
  Results expose `dividendYieldPct` and `revenueGrowthPct`.
- **Market cap** input is in **USD billions** (`min_market_cap_billions: 10` = $10B).
- **Predicted / realized alpha** is **market-relative** (stock return minus S&P 500), in %.
- Every result includes a `companyUrl` / source link back to stockhuntr.net or SEC EDGAR.

### Example prompts (once connected)
- "Use stockhuntr to show the latest 8-K filings for NVDA."
- "Screen for large-cap dividend payers: min market cap 10B, min dividend yield 3%, sorted by yield."
- "Get the filing analysis for accession 0001104659-26-110624."
- "What's StockHuntr's model track record?"

## Related
- **Open dataset** (same corpus, downloadable CC-BY-4.0 CSV/JSONL): https://www.stockhuntr.net/dataset
- **Web screener** (browser version of `screen_companies`): https://www.stockhuntr.net/screener
- **Methodology / FAQ**: https://www.stockhuntr.net/faq
