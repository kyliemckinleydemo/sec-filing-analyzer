/**
 * @module lib/format-utils
 * @description Defensive number formatting utilities preventing runtime crashes from invalid numeric values (NaN, Infinity, null, undefined) by returning 'N/A' fallbacks
 *
 * PURPOSE:
 * - Format prices, percentages, and market cap values with automatic 'N/A' handling for invalid inputs
 * - Provide scale-aware formatting converting billions/millions/thousands to abbreviated units (T/B/M/K)
 * - Validate numeric values using isFinite() checks before applying formatters
 * - Enable custom formatting logic with safe wrapper handling null/undefined/Infinity edge cases
 *
 * EXPORTS:
 * - safeToFixed (function) - Formats number to fixed decimals or returns 'N/A' for null/undefined/non-finite values
 * - safeFormatPrice (function) - Formats number as $X.XX price with configurable decimals, returning 'N/A' for invalid values
 * - safeFormatPercent (function) - Formats number as percentage with optional +/- sign prefix, returning 'N/A' for invalid values
 * - safeFormatMarketCap (function) - Formats large numbers with T/B/M/K suffixes for trillion/billion/million/thousand values
 * - safeFormatLargeNumber (function) - Formats dollar amounts with B/M/K suffixes and configurable decimal precision
 * - isValidNumber (function) - Returns boolean checking if value is non-null, non-undefined, and finite
 * - safeFormat (function) - Higher-order formatter accepting custom formatter function and optional fallback string
 *
 * PATTERNS:
 * - Import specific formatters: `import { safeFormatPrice, safeFormatPercent } from '@/lib/format-utils'`
 * - Use for API data: `safeFormatPrice(data?.price, 2)` handles missing fields without crashes
 * - Apply to volatile calculations: `safeFormatPercent(change24h, 2, true)` adds +/- sign for positive values
 * - Custom formatting: `safeFormat(value, (v) => v.toFixed(4), '--')` uses '--' instead of default 'N/A'
 *
 * CLAUDE NOTES:
 * - All formatters use isFinite() which rejects NaN and ±Infinity, preventing display of 'NaN%' or '$Infinity'
 * - Market cap formatter uses exact thresholds (1e12, 1e9, 1e6, 1e3) matching financial notation standards
 * - Percentage formatter's includeSign parameter adds '+' only for positive values, not zero or negative
 * - safeFormat enables composition with custom formatters while maintaining defensive null/undefined handling
 */
/**
 * Safe number formatting utilities
 * Prevents crashes from NaN, Infinity, null, or undefined values
 */

/**
 * Safely format a number to fixed decimal places
 * Returns 'N/A' for invalid values instead of throwing errors
 */
export function safeToFixed(value: number | null | undefined, decimals: number = 2): string {
  if (value === null || value === undefined || !isFinite(value)) {
    return 'N/A';
  }
  return value.toFixed(decimals);
}

/**
 * Safely format a price with $ prefix
 */
export function safeFormatPrice(value: number | null | undefined, decimals: number = 2): string {
  if (value === null || value === undefined || !isFinite(value)) {
    return 'N/A';
  }
  return `$${value.toFixed(decimals)}`;
}

/**
 * Safely format a percentage
 */
export function safeFormatPercent(value: number | null | undefined, decimals: number = 2, includeSign: boolean = false): string {
  if (value === null || value === undefined || !isFinite(value)) {
    return 'N/A';
  }
  const sign = includeSign && value > 0 ? '+' : '';
  return `${sign}${value.toFixed(decimals)}%`;
}

/**
 * Safely format market cap (billions)
 */
export function safeFormatMarketCap(value: number | null | undefined): string {
  if (value === null || value === undefined || !isFinite(value)) {
    return 'N/A';
  }
  if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(2)}K`;
  return `$${value.toFixed(0)}`;
}

/**
 * Safely format large dollar amounts
 */
export function safeFormatLargeNumber(value: number | null | undefined, decimals: number = 2): string {
  if (value === null || value === undefined || !isFinite(value)) {
    return 'N/A';
  }
  if (value >= 1e9) return `$${(value / 1e9).toFixed(decimals)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(decimals)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(decimals)}K`;
  return `$${value.toFixed(decimals)}`;
}

/**
 * Safely check if a value is valid for display
 */
export function isValidNumber(value: any): boolean {
  return value !== null && value !== undefined && isFinite(value);
}

/**
 * Safely format with optional fallback
 */
export function safeFormat(
  value: number | null | undefined,
  formatter: (v: number) => string,
  fallback: string = 'N/A'
): string {
  if (!isValidNumber(value)) {
    return fallback;
  }
  return formatter(value as number);
}
