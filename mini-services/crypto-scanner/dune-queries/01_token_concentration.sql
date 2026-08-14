-- ========================================================================= --
--  Dune Query #1: Token Holder Concentration
--  Purpose: feed fetch_dune_token_concentration() in data/sources.py
--
--  HOW TO USE:
--  1. Log in to https://dune.com
--  2. Create a new query → paste this SQL
--  3. Add a parameter named "token_symbol" (Type: Text)
--  4. Run, verify it returns 1 row, then Publish
--  5. Copy the numeric query ID from the URL (dune.com/queries/<ID>)
--  6. Set env var: DUNE_QUERY_TOKEN_CONCENTRATION=<ID>
--
--  REQUIRED OUTPUT COLUMNS (consumed by sources.py):
--    top_10_pct            FLOAT  -- % of supply held by top 10 wallets
--    top_100_pct           FLOAT  -- % of supply held by top 100 wallets
--    whale_count           INT    -- number of whale wallets (>0.1% supply)
--    team_concentration    FLOAT  -- % of supply in known team/treasury wallets
-- ========================================================================= --

-- This is a TEMPLATE. The actual implementation depends on the chain.
-- Below is an Ethereum-based example using Dune's spellbook dex.trades /
-- erc20 transfers. Adapt the contract address filter for each token.

WITH token_transfers AS (
  SELECT
    "from" AS sender,
    "to"   AS recipient,
    value / 1e18 AS amount
  FROM erc20_ethereum.evt_Transfer
  WHERE contract_address = 0x{{token_contract_address}} -- TODO: map symbol→address
    AND evt_block_time >= now() - interval '90' day
),
holder_balances AS (
  SELECT
    recipient AS holder,
    SUM(amount) AS balance
  FROM token_transfers
  GROUP BY recipient
  HAVING SUM(amount) > 0
),
ranked AS (
  SELECT
    holder,
    balance,
    SUM(balance) OVER (ORDER BY balance DESC) AS running_total,
    ROW_NUMBER() OVER (ORDER BY balance DESC) AS rk
  FROM holder_balances
),
total_supply AS (
  SELECT SUM(balance) AS total FROM holder_balances
)
SELECT
  -- Top 10 holder concentration %
  (SELECT MAX(CASE WHEN rk = 10 THEN running_total END) FROM ranked, total_supply)
    / (SELECT total FROM total_supply) * 100 AS top_10_pct,

  -- Top 100 holder concentration %
  (SELECT MAX(CASE WHEN rk = 100 THEN running_total END) FROM ranked, total_supply)
    / (SELECT total FROM total_supply) * 100 AS top_100_pct,

  -- Whale wallet count (>0.1% of supply)
  (SELECT COUNT(*) FROM ranked, total_supply WHERE balance / total > 0.001) AS whale_count,

  -- Team concentration (placeholder — requires manual team wallet list)
  0.0 AS team_concentration
FROM total_supply
LIMIT 1
