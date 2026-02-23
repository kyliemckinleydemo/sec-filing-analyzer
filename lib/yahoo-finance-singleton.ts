/**
 * @module yahoo-finance-singleton
 * @description Provides a singleton instance of the yahoo-finance2 client with configured options.
 * 
 * PURPOSE:
 * - Creates and exports a single shared instance of the YahooFinance client
 * - Configures the client to suppress survey notices for cleaner console output
 * - Ensures consistent configuration across the application by centralizing instantiation
 * 
 * EXPORTS:
 * - yahooFinance: Pre-configured YahooFinance client instance (default export)
 * 
 * CLAUDE NOTES:
 * - The singleton pattern prevents multiple instances with different configurations
 * - Survey notices are suppressed to reduce noise in application logs
 * - This module should be imported wherever Yahoo Finance API access is needed
 * - No authentication is configured; relies on yahoo-finance2's default public API access
 */

import YahooFinance from 'yahoo-finance2';

const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

export default yahooFinance;
