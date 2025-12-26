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
