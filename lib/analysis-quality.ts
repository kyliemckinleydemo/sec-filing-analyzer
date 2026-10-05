/**
 * @module lib/analysis-quality
 * @description Single source of truth for detecting broken / refusal AI output in
 * stored filing analyses. When Claude is handed a filing whose section extraction
 * failed (e.g. a `[Risk analysis failed]` placeholder), it tends to respond with a
 * refusal preamble ("I apologize, but I cannot generate an executive summary…")
 * instead of real analysis. That refusal text was being persisted as `aiSummary`
 * and then rendered as the page lede + meta description — thin, low-quality content
 * that search engines penalize, especially on a finance site.
 *
 * Every surface that decides whether a filing is publishable (sitemap inclusion,
 * `robots` index directive, grounded Q&A, the deploy-time content guard, and the
 * regeneration script) imports {@link isRefusal} from here so the definition of
 * "broken" can never drift between them.
 */

/**
 * Lowercased substrings that only appear when the model refused or errored rather
 * than producing analysis. Deliberately restricted to first-person refusal tells —
 * phrasings that real analytical prose never uses — so legitimate summaries are NOT
 * flagged. Descriptive phrases like "no actual content", "without the actual", or
 * "appears to be blank" were intentionally EXCLUDED: an accurate analysis of a sparse
 * 8-K ("Item 8.01 listed but no actual content was provided") uses exactly that
 * language, so matching on it misclassifies good analysis as broken. Every genuine
 * refusal in the corpus also carries a first-person tell, so this loses no coverage.
 *
 * Verified against the production corpus (17,659 analyzed filings): this set catches
 * 5,149 broken 2024–2025 backlog summaries; the descriptive phrases added exactly one
 * additional match, and that one was a false positive (valid sparse-8-K analysis).
 */
export const REFUSAL_MARKERS: readonly string[] = [
  'i apologize',
  "i'm sorry",
  'i am sorry',
  'i cannot generate',
  'i cannot provide',
  'i cannot create',
  'i cannot produce',
  'i cannot write',
  'i cannot generate an executive summary',
  "i can't generate",
  "i can't provide",
  "i can't create",
  "i'm unable to",
  'i am unable to',
  'unable to analyze',
  'unable to generate',
  'unable to provide a',
  'unable to create',
  'as an ai',
] as const;

/**
 * Internal placeholder markers written by the analysis pipeline when a section
 * fails to parse. These live inside `analysisData` (and sometimes leak into
 * `aiSummary`). Their presence in rendered text means the page has nothing unique.
 */
export const PLACEHOLDER_MARKERS: readonly string[] = [
  'risk analysis failed',
  'unable to parse risk analysis',
  '[risk analysis failed]',
] as const;

/**
 * True when a piece of AI-authored prose is a refusal / error rather than real
 * analysis. Pass the `aiSummary` (or any summary/answer string) that would be
 * rendered to users or search engines.
 */
export function isRefusal(text: string | null | undefined): boolean {
  if (!text) return false;
  const h = text.toLowerCase();
  return (
    REFUSAL_MARKERS.some((m) => h.includes(m)) ||
    PLACEHOLDER_MARKERS.some((m) => h.includes(m))
  );
}

/**
 * Returns the summary if it is publishable, otherwise null. Convenience wrapper so
 * callers can do `safeSummary(f.aiSummary) ?? fallback` without repeating the guard.
 */
export function safeSummary(text: string | null | undefined): string | null {
  return isRefusal(text) ? null : (text ?? null);
}
