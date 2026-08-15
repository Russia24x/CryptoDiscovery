-- ========================================================================= --
--  Dune Query #3: Active Users (bot-filtered)
--  Purpose: feed fetch_dune_active_users() in data/sources.py
--  Feeds Moat axis (Axis 3) + Invisible Utility axis (Axis 1).
--
--  HOW TO USE:
--  1. Log in to https://dune.com
--  2. Create a new query → paste this SQL
--  3. Add a parameter named "protocol" (Type: Text) — the protocol slug
--  4. Run, verify it returns 1 row, then Publish
--  5. Copy the numeric query ID from the URL
--  6. Set env var: DUNE_QUERY_ACTIVE_USERS=<ID>
--
--  REQUIRED OUTPUT COLUMNS (consumed by sources.py):
--    dau                   INT    -- daily active users (bot-filtered)
--    mau                   INT    -- monthly active users (bot-filtered)
--    dau_mau_ratio         FLOAT  -- dau / mau (stickiness)
--    new_users_24h         INT    -- first-time users in last 24h
--    retention_7d          FLOAT  -- % of users active 7d ago still active
-- ========================================================================= --

-- TEMPLATE: counts unique active addresses, filtering likely bots
-- (addresses with >1000 tx/day are almost certainly bots/sandwichers).

WITH daily_active AS (
  SELECT
    date_trunc('day', block_time) AS day,
    COUNT(DISTINCT user_address) AS dau_raw
  FROM dex_aggregator_ethereum.user_activity  -- TODO: map protocol → table
  WHERE protocol = '{{protocol}}'
    AND block_time >= now() - interval '2' day
  GROUP BY 1
),
-- Bot filter: addresses doing >1000 txs/day are bots
bot_addresses AS (
  SELECT user_address
  FROM dex_aggregator_ethereum.user_activity
  WHERE protocol = '{{protocol}}'
    AND block_time >= now() - interval '1' day
  GROUP BY user_address
  HAVING COUNT(*) > 1000
),
daily_active_filtered AS (
  SELECT
    a.day,
    COUNT(DISTINCT a.user_address) AS dau
  FROM dex_aggregator_ethereum.user_activity a
  LEFT JOIN bot_addresses b ON a.user_address = b.user_address
  WHERE a.protocol = '{{protocol}}'
    AND a.block_time >= now() - interval '2' day
    AND b.user_address IS NULL  -- exclude bots
  GROUP BY a.day
  ORDER BY a.day DESC
),
monthly_active AS (
  SELECT COUNT(DISTINCT user_address) AS mau
  FROM dex_aggregator_ethereum.user_activity
  WHERE protocol = '{{protocol}}'
    AND block_time >= now() - interval '30' day
    AND user_address NOT IN (SELECT user_address FROM bot_addresses)
),
new_users AS (
  SELECT COUNT(DISTINCT first_seen.user_address) AS new_users_24h
  FROM (
    SELECT user_address, MIN(block_time) AS first_seen
    FROM dex_aggregator_ethereum.user_activity
    WHERE protocol = '{{protocol}}'
    GROUP BY user_address
    HAVING MIN(block_time) >= now() - interval '1' day
  ) first_seen
),
retention AS (
  SELECT
    COUNT(DISTINCT CASE WHEN last_active >= now() - interval '1' day THEN user_address END) * 100.0
    / NULLIF(COUNT(DISTINCT user_address), 0) AS retention_7d
  FROM (
    SELECT user_address, MAX(block_time) AS last_active
    FROM dex_aggregator_ethereum.user_activity
    WHERE protocol = '{{protocol}}'
      AND block_time >= now() - interval '7' day
    GROUP BY user_address
  ) t
)
SELECT
  d.dau,
  m.mau,
  CASE WHEN m.mau > 0 THEN d.dau::FLOAT / m.mau ELSE 0 END AS dau_mau_ratio,
  n.new_users_24h,
  r.retention_7d
FROM daily_active_filtered d, monthly_active m, new_users n, retention r
LIMIT 1
