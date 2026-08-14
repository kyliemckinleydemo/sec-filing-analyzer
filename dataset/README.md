---
license: cc-by-4.0
language:
  - en
tags:
  - finance
  - sec-filings
  - stock-prediction
  - edgar
pretty_name: StockHuntr AI-Analyzed SEC Filings
---

# StockHuntr: AI-Analyzed SEC Filings with Realized 30-Day Outcomes

This dataset contains SEC filings (10-K, 10-Q, 8-K) analyzed by [StockHuntr](https://www.stockhuntr.net).
Each row carries AI-generated features — a **concern score**, a **management-sentiment
score**, and (where available) an **EPS surprise** — extracted from the filing. For the
subset where the 30-day window following the filing has elapsed, the row also includes the
**realized 30-day market-relative alpha** (stock return minus S&P 500). That combination —
AI-derived features on one side, a realized market label on the other — makes this a ready
supervised-learning dataset for studying how filing content relates to subsequent returns.

Note on the prediction columns: StockHuntr generates its live 30-day alpha *prediction* on
demand and does not persist it for every historical filing, so `predicted_30d_alpha` is
populated only for a small recent subset. The durable signal in this dataset is the pairing
of AI features with the **realized** outcome.

## At a glance

| Metric | Value |
|--------|-------|
| Total analyzed filings | 15402 |
| With AI concern/sentiment features | 15402 |
| With a realized 30-day outcome (label) | 4009 |
| With a persisted live prediction | 8 |
| Distinct companies | 527 |
| Filing date range | 2023-12-13 to 2026-08-13 |

### Filings by form type

| Form | Count |
|------|-------|
| 8-K | 11387 |
| 10-Q | 2962 |
| 10-K | 1052 |
| 10 | 1 |

## Files

- `stockhuntr-filings.csv` — one row per filing, columns below.
- `stockhuntr-filings.jsonl` — same data, one JSON object per line.

## Columns

| Column | Description |
|--------|-------------|
| `accession_number` | SEC EDGAR accession number (unique filing id) |
| `ticker` | Stock ticker |
| `company_name` | Company name |
| `sector`, `industry` | GICS-style classification (may be null) |
| `form_type` | 10-K, 10-Q, or 8-K |
| `filing_date` | Date filed with the SEC (YYYY-MM-DD) |
| `report_date` | Period end date, if applicable |
| `filing_url` | Direct link to the filing on SEC EDGAR |
| `predicted_30d_alpha` | Model's predicted 30-day return minus S&P 500 (%) |
| `predicted_30d_return` | Model's predicted 30-day raw return (%) |
| `prediction_confidence` | Model confidence, 0–1 |
| `concern_level` | AI multi-factor concern score, 0–10 (higher = more concerning) |
| `sentiment_score` | AI sentiment of management discussion, -1 to +1 |
| `eps_surprise_pct` | Reported EPS vs consensus (%), where available |
| `revenue_surprise_pct` | Reported revenue vs consensus (%), where available |
| `actual_30d_alpha` | **Realized** 30-day return minus S&P 500 (%), if the window has elapsed |
| `actual_30d_return` | **Realized** 30-day raw return (%), if the window has elapsed |
| `outcome_known` | 1 if the realized outcome is present, else 0 |

## Methodology

Predictions come from a Ridge-regression mixture-of-experts model (13 features:
price momentum, analyst activity, AI concern/sentiment, EPS surprise, filing type,
tone shift vs. prior filing, and macro regime). Full methodology, backtesting approach,
and accuracy figures: https://www.stockhuntr.net/faq

## Sources

- **Filings:** SEC EDGAR (public domain U.S. government data).
- **Market data:** Yahoo Finance.
- **Macro data:** FRED (Federal Reserve Bank of St. Louis).

## Intended use & limitations

For research and education. **Not investment advice.** Predictions are model outputs
with known error; realized outcomes are provided precisely so the model can be evaluated
honestly. Past performance does not guarantee future results. External data sources may
contain errors, delays, or restatements.

## Citation

```
StockHuntr (2026-08-13). AI-Analyzed SEC Filings with 30-Day
Predictions & Outcomes. https://www.stockhuntr.net
```
