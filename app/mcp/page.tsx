import type { Metadata } from 'next';
import Link from 'next/link';

/**
 * @module app/mcp/page
 * @description Public landing + documentation page for StockHuntr's remote MCP server.
 * Hand-written, unique content: what the server is, the endpoint, the full tool list,
 * and copy-paste connection configs for MCP-aware clients. Serves as the human-facing
 * home and a discovery/backlink target for the server documented at /.well-known/mcp.json.
 */

const ENDPOINT = 'https://www.stockhuntr.net/api/mcp';

export const metadata: Metadata = {
  title: 'MCP Server — Query SEC Filing Analysis from AI Agents',
  description:
    "StockHuntr's free remote MCP (Model Context Protocol) server lets Claude, ChatGPT, and any MCP-aware agent query AI-analyzed SEC filings, company fundamentals, stock screening, and 30-day prediction signals — grounded in primary-source SEC EDGAR data. Endpoint, tools, and connection configs.",
  alternates: { canonical: '/mcp' },
  openGraph: {
    title: 'StockHuntr MCP Server — SEC Filing Analysis for AI Agents',
    description:
      'Free remote MCP server: query AI-analyzed SEC filings, fundamentals, screening, and 30-day signals from any MCP-aware agent.',
    url: 'https://www.stockhuntr.net/mcp',
    type: 'website',
  },
};

const TOOLS: Array<[string, string]> = [
  ['get_latest_filings', 'Recent 10-K, 10-Q, and 8-K filings with AI analysis and 30-day predictions. Filter by ticker and/or form type.'],
  ['get_filing_analysis', 'Full AI analysis for a single filing by accession number: executive summary, concern level, sentiment, EPS surprise, and predicted 30-day alpha.'],
  ['get_company', 'Company snapshot: sector, fundamentals, and recent filings for a ticker.'],
  ['search_companies', 'Find tracked companies by ticker or name.'],
  ['screen_companies', 'Filter 800+ companies by sector, market cap, P/E, dividend yield, and revenue growth — the /screener, agent-accessible.'],
  ['get_top_signals', "The model's highest-conviction 30-day prediction signals from the last 90 days."],
  ['get_model_track_record', 'Model accuracy from strict 90-day walk-forward backtesting, plus a live count of filings with realized outcomes.'],
];

// Claude Desktop doesn't natively connect to a remote Streamable-HTTP server yet;
// the standard approach is the `mcp-remote` bridge. Clients that DO speak Streamable
// HTTP natively (Claude.ai, API-based agents) can use the raw URL directly.
const CLAUDE_CONFIG = `{
  "mcpServers": {
    "stockhuntr": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://www.stockhuntr.net/api/mcp"]
    }
  }
}`;

export default function McpPage() {
  return (
    <main className="min-h-screen bg-[#020617] text-gray-200">
      <div className="mx-auto max-w-4xl px-4 py-12">
        <h1 className="text-3xl md:text-4xl font-bold text-white">
          StockHuntr MCP Server
        </h1>
        <p className="mt-4 text-lg text-gray-300 leading-relaxed">
          StockHuntr runs a free, remote{' '}
          <a
            href="https://modelcontextprotocol.io"
            target="_blank"
            rel="noopener"
            className="text-blue-400 hover:text-blue-300 underline"
          >
            Model Context Protocol
          </a>{' '}
          (MCP) server so Claude, ChatGPT, and any MCP-aware agent can query AI-analyzed SEC
          filings, company fundamentals, fundamentals-based stock screening, and 30-day
          prediction signals — all read-only and grounded in primary-source SEC EDGAR data.
        </p>

        {/* Endpoint */}
        <h2 className="mt-10 text-2xl font-bold text-white">Endpoint</h2>
        <p className="mt-2 text-gray-300">Streamable HTTP transport. No authentication required.</p>
        <pre className="mt-3 rounded-lg border border-white/10 bg-black/40 px-4 py-3 text-sm text-gray-200 overflow-x-auto">
          {ENDPOINT}
        </pre>

        {/* Connect */}
        <h2 className="mt-10 text-2xl font-bold text-white">Connect</h2>
        <p className="mt-2 text-gray-300 leading-relaxed">
          Clients that speak Streamable HTTP natively (Claude.ai, API-based agents, and other
          MCP-aware tools) can point directly at the endpoint above. For Claude Desktop, which
          connects to remote servers through the{' '}
          <code className="text-blue-300">mcp-remote</code> bridge, add this to{' '}
          <code className="text-blue-300">claude_desktop_config.json</code>:
        </p>
        <pre className="mt-3 rounded-lg border border-white/10 bg-black/40 px-4 py-3 text-sm text-gray-200 overflow-x-auto whitespace-pre">
{CLAUDE_CONFIG}
        </pre>
        <p className="mt-3 text-gray-300 leading-relaxed">
          Discovery metadata is also published at{' '}
          <a href="/.well-known/mcp.json" className="text-blue-400 hover:text-blue-300 underline">
            /.well-known/mcp.json
          </a>
          .
        </p>

        {/* Tools */}
        <h2 className="mt-10 text-2xl font-bold text-white">Tools</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <tbody>
              {TOOLS.map(([name, desc]) => (
                <tr key={name} className="border-b border-white/10 align-top">
                  <td className="py-2 pr-4 font-mono text-blue-300 whitespace-nowrap">{name}</td>
                  <td className="py-2 text-gray-300">{desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Related */}
        <h2 className="mt-10 text-2xl font-bold text-white">Related</h2>
        <ul className="mt-2 space-y-1 text-gray-300">
          <li>
            <Link href="/dataset" className="text-blue-400 hover:text-blue-300 underline">
              Open dataset
            </Link>{' '}
            — the same corpus as a downloadable CC-BY-4.0 CSV/JSONL.
          </li>
          <li>
            <Link href="/screener" className="text-blue-400 hover:text-blue-300 underline">
              Stock screener
            </Link>{' '}
            — the web version of the <code className="text-blue-300">screen_companies</code> tool.
          </li>
          <li>
            <Link href="/faq" className="text-blue-400 hover:text-blue-300 underline">
              FAQ &amp; methodology
            </Link>{' '}
            — how the analysis and predictions are produced.
          </li>
        </ul>

        <p className="mt-10 text-xs text-gray-500">
          StockHuntr is an educational/research tool. Predictions are model outputs, not investment
          advice. Data is grounded in primary-source SEC EDGAR filings, with market data from Yahoo
          Finance.
        </p>
      </div>
    </main>
  );
}
