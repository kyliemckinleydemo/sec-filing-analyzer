# Daily Data Update Jobs

> **This document is superseded by [`CRON-JOBS-README.md`](CRON-JOBS-README.md)** which covers all 10 cron jobs in the system.

## Summary

The production system runs **10 automated cron jobs** (14 daily executions) to keep data fresh:

| Job | Frequency | Data Updated |
|-----|-----------|-------------|
| `daily-filings-rss` | 3x daily | SEC filings, company fundamentals, snapshots |
| `update-analyst-data` | Daily | Analyst consensus, earnings, target prices |
| `update-stock-prices` | Daily | Full price refresh for all companies |
| `update-stock-prices-batch` | 6x daily | Batch rotation price updates |
| `update-macro-indicators` | Daily | S&P 500, VIX, Treasury, sector ETFs |
| `watchlist-alerts` | 2x daily | Email alerts to users |
| `paper-trading-close-positions` | As needed | Close expired paper trades |
| `supervisor` | After filings | Health monitoring, auto-recovery |

See [`CRON-JOBS-README.md`](CRON-JOBS-README.md) for the complete schedule, authentication, monitoring, and troubleshooting.
