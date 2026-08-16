/**
 * @module cost-tracker
 * @description Anthropic API cost tracking utility for bulk filing analysis operations
 *
 * PURPOSE:
 * Provides accurate cost estimation and tracking for bulk SEC filing analysis that uses
 * Claude Haiku API. Accounts for the multi-call nature of filing analysis where each
 * filing triggers approximately 6 separate Claude API calls (risk assessment, sentiment
 * analysis, financials extraction, content summary, concern detection, and executive
 * summary). Multiplies per-filing token usage by CALLS_PER_FILING to reflect true API
 * costs and prevent budget overruns.
 *
 * EXPORTS:
 * - costTracker: Object containing cost tracking methods
 *   - recordUsage(label, inputTokens, outputTokens): Records token usage for one filing
 *   - total(): Returns cumulative cost in USD
 *   - filingsRecorded(): Returns number of filings processed
 *   - reset(): Clears all tracking data
 *
 * CLAUDE NOTES:
 * - Uses Claude Haiku pricing tier ($1.00/MTok input, $5.00/MTok output as of implementation)
 * - CALLS_PER_FILING multiplier (6x) reflects fan-out pattern of bulk-analyze scripts
 * - Cost estimates intentionally err slightly high to prevent overspending against COST_LIMIT
 * - Update pricing constants if switching to different Claude model tier
 * - Each recordUsage() call represents a single filing's estimated total cost across all sub-calls
 */

/**
 * Minimal Anthropic cost tracker for the bulk-analyze scripts.
 *
 * `recordUsage()` is called once per filing with the SINGLE-pass input/output token estimate,
 * but a full-filing analysis fans out into ~6 Claude (Haiku) sub-calls (risk, sentiment,
 * financials, content summary, concern, executive summary), each sending the filing text. So we
 * multiply by CALLS_PER_FILING to reflect true spend — this keeps the COST_LIMIT cap honest
 * (erring slightly high, so runs stop a touch early rather than overspending).
 *
 * Prices are the Claude Haiku tier (USD per 1M tokens); adjust if the bulk model changes.
 */
const HAIKU_INPUT_PER_MTOK = 1.0;
const HAIKU_OUTPUT_PER_MTOK = 5.0;
const CALLS_PER_FILING = 6;

let totalCostUsd = 0;
let filings = 0;

export const costTracker = {
  /** Records one filing's usage and returns the running total cost (USD). */
  recordUsage(_label: string, inputTokens: number, outputTokens: number): number {
    const perCall =
      (inputTokens / 1_000_000) * HAIKU_INPUT_PER_MTOK +
      (outputTokens / 1_000_000) * HAIKU_OUTPUT_PER_MTOK;
    totalCostUsd += perCall * CALLS_PER_FILING;
    filings += 1;
    return totalCostUsd;
  },
  total(): number {
    return totalCostUsd;
  },
  filingsRecorded(): number {
    return filings;
  },
  reset() {
    totalCostUsd = 0;
    filings = 0;
  },
};
