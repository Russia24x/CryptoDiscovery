-- ========================================================================= --
--  Dune Query #2: Real Revenue vs Total Fees
--  Purpose: feed fetch_dune_real_revenue() in data/sources.py
--  Implements the Revenue ≠ Fees principle (PHASE 6 valuation).
--
--  HOW TO USE:
--  1. Log in to https://dune.com
--  2. Create a new query → paste this SQL
--  3. Add a parameter named "protocol" (Type: Text) — the protocol slug
--  4. Run, verify it returns 1 row, then Publish
--  5. Copy the numeric query ID from the URL
--  6. Set env var: DUNE_QUERY_REAL_REVENUE=<ID>
--
--  REQUIRED OUTPUT COLUMNS (consumed by sources.py):
--    total_fees_24h        FLOAT  -- all fees collected by protocol (24h)
--    revenue_24h           FLOAT  -- portion accruing to token holders/treasury
--    revenue_fee_ratio     FLOAT  -- revenue_24h / total_fees_24h (0-1)
--    annual_revenue        FLOAT  -- revenue_24h * 365
--    annual_fees           FLOAT  -- total_fees_24h * 365
-- ========================================================================= --

-- TEMPLATE: uses Dune's spellbook finance.fee_stats / revenue tables.
-- The exact table depends on the protocol. Below is a generic pattern
-- using dex_aggregator / protocol revenue spells.

WITH protocol_fees AS (
  SELECT
    date_trunc('day', block_time) AS day,
    SUM(fee_amount_usd) AS fees_24h
  FROM dex_aggregator_ethereum.fees  -- TODO: map protocol slug → table
  WHERE protocol = '{{protocol}}'
    AND block_time >= now() - interval '2' day
  GROUP BY 1
  ORDER BY day DESC
  LIMIT 1
),
protocol_revenue AS (
  SELECT
    date_trunc('day', block_time) AS day,
    SUM(revenue_to_holders_usd) AS revenue_24h
  FROM dex_aggregator_ethereum.revenue  -- TODO: map protocol slug → table
  WHERE protocol = '{{protocol}}'
    AND block_time >= now() - interval '2' day
  GROUP BY 1
  ORDER BY day DESC
  LIMIT 1
)
SELECT
  f.fees_24h AS total_fees_24h,
  COALESCE(r.revenue_24h, 0) AS revenue_24h,
  CASE
    WHEN f.fees_24h > 0 THEN COALESCE(r.revenue_24h, 0) / f.fees_24h
    ELSE 0
  END AS revenue_fee_ratio,
  COALESCE(r.revenue_24h, 0) * 365 AS annual_revenue,
  f.fees_24h * 365 AS annual_fees
FROM protocol_fees f
LEFT JOIN protocol_revenue r ON f.day = r.day
LIMIT 1
