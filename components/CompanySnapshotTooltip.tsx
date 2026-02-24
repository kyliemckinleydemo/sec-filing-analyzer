/**
 * @module components/CompanySnapshotTooltip
 * @description Client-side tooltip component displaying comprehensive company financial snapshots with hover/touch interactions and responsive positioning
 *
 * PURPOSE:
 * - Renders interactive tooltip on hover or touch showing valuation metrics (price, market cap, P/E ratio, analyst target)
 * - Displays financial performance data (revenue, net income, margins) with YoY percentage changes color-coded green/red
 * - Formats large numbers into billions notation and handles null/undefined values gracefully with 'N/A' fallbacks
 * - Manages tooltip visibility with click-outside detection for mobile devices and prevents event propagation
 *
 * DEPENDENCIES:
 * - react - Provides useState for visibility toggle and useEffect for click-outside listener cleanup
 *
 * EXPORTS:
 * - CompanySnapshotTooltip (component) - Wrapper component accepting ticker, companyName, snapshot data object, and children to wrap with tooltip functionality
 *
 * PATTERNS:
 * - Wrap any element with <CompanySnapshotTooltip ticker='AAPL' companyName='Apple Inc.' snapshot={snapshotData}>{children}</CompanySnapshotTooltip>
 * - Pass snapshot object with optional fields: currentPrice, marketCap, peRatio, dividendYield, beta, revenue/income metrics, margins
 * - Tooltip auto-hides if snapshot is empty/null or contains only null values
 * - Use onMouseEnter/onMouseLeave for desktop hover; onClick/onTouchStart for mobile tap interaction
 *
 * CLAUDE NOTES:
 * - Click-outside listener only attaches when tooltip visible to avoid unnecessary event handlers
 * - Formats billions with /1e9 division showing 2 decimals; YoY percentages include + prefix for positive growth
 * - Tooltip positioned with absolute left-0 top-full mt-2 creating dropdown below trigger element with 8px gap
 * - Uses isFinite() checks throughout to filter out Infinity/-Infinity values before rendering
 * - Organized into three sections: Valuation, Financials (with optional quarter label), Risk & Income metrics
 */
'use client';

import { useState, useEffect } from 'react';

interface CompanySnapshot {
  currentPrice?: number | null;
  marketCap?: number | null;
  peRatio?: number | null;
  dividendYield?: number | null;
  beta?: number | null;
  latestRevenue?: number | null;
  latestRevenueYoY?: number | null;
  latestNetIncome?: number | null;
  latestNetIncomeYoY?: number | null;
  latestGrossMargin?: number | null;
  latestOperatingMargin?: number | null;
  latestQuarter?: string | null;
  analystTargetPrice?: number | null;
}

interface CompanySnapshotTooltipProps {
  ticker: string;
  companyName: string;
  snapshot: CompanySnapshot;
  children: React.ReactNode;
}

export function CompanySnapshotTooltip({ ticker, companyName, snapshot, children }: CompanySnapshotTooltipProps) {
  const [isVisible, setIsVisible] = useState(false);

  // Close tooltip when clicking outside (for mobile)
  useEffect(() => {
    const handleClickOutside = () => setIsVisible(false);
    if (isVisible) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [isVisible]);

  // Format large numbers (billions)
  const formatBillions = (value: number | null | undefined) => {
    if (!value || !isFinite(value)) return 'N/A';
    return `$${(value / 1e9).toFixed(2)}B`;
  };

  // Format percentage
  const formatPercent = (value: number | null | undefined) => {
    if (value === null || value === undefined || !isFinite(value)) return 'N/A';
    return `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
  };

  // Check if we have any data to show - handle undefined/null snapshot
  const hasData = snapshot && typeof snapshot === 'object' && Object.values(snapshot).some(val => val !== null && val !== undefined);

  if (!hasData) {
    return <>{children}</>;
  }

  const handleToggle = () => {
    setIsVisible(!isVisible);
  };

  return (
    <div
      className="relative inline-block"
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
      onClick={handleToggle}
      onTouchStart={(e) => {
        e.stopPropagation();
        setIsVisible(true);
      }}
    >
      {children}

      {isVisible && (
        <div
          className="absolute z-50 left-0 top-full mt-2 w-80 max-w-[90vw] bg-white border-2 border-blue-200 rounded-lg shadow-2xl p-4 animate-in fade-in duration-200"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="mb-3 pb-3 border-b border-slate-200">
            <div className="font-bold text-lg text-blue-600">{ticker}</div>
            <div className="text-sm text-slate-600 truncate">{companyName}</div>
          </div>

          {/* Snapshot Data */}
          <div className="space-y-2 text-sm">
            {/* Price & Valuation */}
            {(snapshot.currentPrice || snapshot.marketCap || snapshot.peRatio) && (
              <div className="space-y-1">
                <div className="text-xs font-semibold text-slate-500 uppercase">Valuation</div>
                {snapshot.currentPrice && isFinite(snapshot.currentPrice) && (
                  <div className="flex justify-between">
                    <span className="text-slate-600">Price (Last Close):</span>
                    <span className="font-semibold text-slate-900">${snapshot.currentPrice.toFixed(2)}</span>
                  </div>
                )}
                {snapshot.marketCap && isFinite(snapshot.marketCap) && (
                  <div className="flex justify-between">
                    <span className="text-slate-600">Market Cap:</span>
                    <span className="font-semibold text-slate-900">{formatBillions(snapshot.marketCap)}</span>
                  </div>
                )}
                {snapshot.peRatio && isFinite(snapshot.peRatio) && (
                  <div className="flex justify-between">
                    <span className="text-slate-600">P/E Ratio:</span>
                    <span className="font-semibold text-slate-900">{snapshot.peRatio.toFixed(2)}</span>
                  </div>
                )}
                {snapshot.analystTargetPrice && isFinite(snapshot.analystTargetPrice) && (
                  <div className="flex justify-between">
                    <span className="text-slate-600">Analyst Target:</span>
                    <span className="font-semibold text-blue-600">${snapshot.analystTargetPrice.toFixed(2)}</span>
                  </div>
                )}
              </div>
            )}

            {/* Financial Performance */}
            {(snapshot.latestRevenue || snapshot.latestNetIncome) && (
              <div className="space-y-1 pt-2">
                <div className="text-xs font-semibold text-slate-500 uppercase">
                  Financials {snapshot.latestQuarter && `(${snapshot.latestQuarter})`}
                </div>
                {snapshot.latestRevenue && (
                  <div className="flex justify-between">
                    <span className="text-slate-600">Revenue:</span>
                    <span className="font-semibold text-slate-900">
                      {formatBillions(snapshot.latestRevenue)}
                      {snapshot.latestRevenueYoY !== null && snapshot.latestRevenueYoY !== undefined && (
                        <span className={`ml-1 text-xs ${snapshot.latestRevenueYoY > 0 ? 'text-green-600' : 'text-red-600'}`}>
                          ({formatPercent(snapshot.latestRevenueYoY)})
                        </span>
                      )}
                    </span>
                  </div>
                )}
                {snapshot.latestNetIncome && (
                  <div className="flex justify-between">
                    <span className="text-slate-600">Net Income:</span>
                    <span className="font-semibold text-slate-900">
                      {formatBillions(snapshot.latestNetIncome)}
                      {snapshot.latestNetIncomeYoY !== null && snapshot.latestNetIncomeYoY !== undefined && (
                        <span className={`ml-1 text-xs ${snapshot.latestNetIncomeYoY > 0 ? 'text-green-600' : 'text-red-600'}`}>
                          ({formatPercent(snapshot.latestNetIncomeYoY)})
                        </span>
                      )}
                    </span>
                  </div>
                )}
                {snapshot.latestGrossMargin && isFinite(snapshot.latestGrossMargin) && (
                  <div className="flex justify-between">
                    <span className="text-slate-600">Gross Margin:</span>
                    <span className="font-semibold text-slate-900">{snapshot.latestGrossMargin.toFixed(1)}%</span>
                  </div>
                )}
                {snapshot.latestOperatingMargin && isFinite(snapshot.latestOperatingMargin) && (
                  <div className="flex justify-between">
                    <span className="text-slate-600">Operating Margin:</span>
                    <span className="font-semibold text-slate-900">{snapshot.latestOperatingMargin.toFixed(1)}%</span>
                  </div>
                )}
              </div>
            )}

            {/* Risk Metrics */}
            {(snapshot.beta || snapshot.dividendYield) && (
              <div className="space-y-1 pt-2">
                <div className="text-xs font-semibold text-slate-500 uppercase">Risk & Income</div>
                {snapshot.beta && isFinite(snapshot.beta) && (
                  <div className="flex justify-between">
                    <span className="text-slate-600">Beta:</span>
                    <span className="font-semibold text-slate-900">{snapshot.beta.toFixed(2)}</span>
                  </div>
                )}
                {snapshot.dividendYield && isFinite(snapshot.dividendYield) && (
                  <div className="flex justify-between">
                    <span className="text-slate-600">Dividend Yield:</span>
                    <span className="font-semibold text-slate-900">{snapshot.dividendYield.toFixed(2)}%</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Tooltip arrow */}
          <div className="absolute -top-2 left-4 w-4 h-4 bg-white border-t-2 border-l-2 border-blue-200 transform rotate-45"></div>
        </div>
      )}
    </div>
  );
}
