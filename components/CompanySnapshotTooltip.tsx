'use client';

import { useState } from 'react';

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

  // Format large numbers (billions)
  const formatBillions = (value: number | null | undefined) => {
    if (!value) return 'N/A';
    return `$${(value / 1e9).toFixed(2)}B`;
  };

  // Format percentage
  const formatPercent = (value: number | null | undefined) => {
    if (value === null || value === undefined) return 'N/A';
    return `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
  };

  // Check if we have any data to show
  const hasData = Object.values(snapshot).some(val => val !== null && val !== undefined);

  if (!hasData) {
    return <>{children}</>;
  }

  return (
    <div
      className="relative inline-block"
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
    >
      {children}

      {isVisible && (
        <div className="absolute z-50 left-0 top-full mt-2 w-80 bg-white border-2 border-blue-200 rounded-lg shadow-2xl p-4 animate-in fade-in duration-200">
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
                {snapshot.currentPrice && (
                  <div className="flex justify-between">
                    <span className="text-slate-600">Price (Last Close):</span>
                    <span className="font-semibold">${snapshot.currentPrice.toFixed(2)}</span>
                  </div>
                )}
                {snapshot.marketCap && (
                  <div className="flex justify-between">
                    <span className="text-slate-600">Market Cap:</span>
                    <span className="font-semibold">{formatBillions(snapshot.marketCap)}</span>
                  </div>
                )}
                {snapshot.peRatio && (
                  <div className="flex justify-between">
                    <span className="text-slate-600">P/E Ratio:</span>
                    <span className="font-semibold">{snapshot.peRatio.toFixed(2)}</span>
                  </div>
                )}
                {snapshot.analystTargetPrice && (
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
                    <span className="font-semibold">
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
                    <span className="font-semibold">
                      {formatBillions(snapshot.latestNetIncome)}
                      {snapshot.latestNetIncomeYoY !== null && snapshot.latestNetIncomeYoY !== undefined && (
                        <span className={`ml-1 text-xs ${snapshot.latestNetIncomeYoY > 0 ? 'text-green-600' : 'text-red-600'}`}>
                          ({formatPercent(snapshot.latestNetIncomeYoY)})
                        </span>
                      )}
                    </span>
                  </div>
                )}
                {snapshot.latestGrossMargin && (
                  <div className="flex justify-between">
                    <span className="text-slate-600">Gross Margin:</span>
                    <span className="font-semibold">{snapshot.latestGrossMargin.toFixed(1)}%</span>
                  </div>
                )}
                {snapshot.latestOperatingMargin && (
                  <div className="flex justify-between">
                    <span className="text-slate-600">Operating Margin:</span>
                    <span className="font-semibold">{snapshot.latestOperatingMargin.toFixed(1)}%</span>
                  </div>
                )}
              </div>
            )}

            {/* Risk Metrics */}
            {(snapshot.beta || snapshot.dividendYield) && (
              <div className="space-y-1 pt-2">
                <div className="text-xs font-semibold text-slate-500 uppercase">Risk & Income</div>
                {snapshot.beta && (
                  <div className="flex justify-between">
                    <span className="text-slate-600">Beta:</span>
                    <span className="font-semibold">{snapshot.beta.toFixed(2)}</span>
                  </div>
                )}
                {snapshot.dividendYield && (
                  <div className="flex justify-between">
                    <span className="text-slate-600">Dividend Yield:</span>
                    <span className="font-semibold">{(snapshot.dividendYield * 100).toFixed(2)}%</span>
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
