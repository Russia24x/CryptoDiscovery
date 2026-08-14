# Dune Analytics Query Templates

These SQL templates configure the **Grade A (on-chain, primary-verified)**
insights for CryptoSieve. Without them, the cross-verification engine falls
back to `single-source` for TVL and Fees metrics.

## Prerequisites

1. **Dune account** (free): https://dune.com
2. **Dune API key** (free): https://dune.com/api-keys
3. **CMC API key** (optional, for cross-verification): already configured

## Setup

### Step 1: Create the 3 queries on Dune

For each `.sql` file in this directory:

1. Log in to https://dune.com
2. Click **New Query** → paste the SQL from the `.sql` file
3. Add the required parameter (Text type) — each file documents its parameter
4. Click **Run** to verify it returns 1 row with the expected columns
5. Click **Publish** to make the query public
6. Copy the **query ID** (numeric, from the URL: `dune.com/queries/<ID>`)

### Step 2: Configure environment variables

Either run the interactive helper:

```bash
cd mini-services/crypto-scanner
bash configure-dune.sh
```

Or manually edit `.env`:

```bash
DUNE_API_KEY=<your-api-key>
DUNE_QUERY_TOKEN_CONCENTRATION=<query-id-from-step-1>
DUNE_QUERY_REAL_REVENUE=<query-id-from-step-1>
DUNE_QUERY_ACTIVE_USERS=<query-id-from-step-1>
```

### Step 3: Restart and verify

```bash
bash start.sh
curl http://localhost:3003/sources | python -m json.tool | grep -A4 dune
```

Expected output:

```json
"dune_config": {
    "available": true,
    "has_token_concentration_query": true,
    "has_real_revenue_query": true,
    "has_active_users_query": true
}
```

## The 3 queries

| # | File | Parameter | Purpose | Feeds |
|---|------|-----------|---------|-------|
| 1 | `01_token_concentration.sql` | `token_symbol` | Holder concentration (top 10/100, whale count) | Governance axis, Moat axis |
| 2 | `02_real_revenue_vs_fees.sql` | `protocol` | Revenue ≠ Fees separation | Economic Engine axis, P/R valuation |
| 3 | `03_active_users_bot_filtered.sql` | `protocol` | DAU/MAU with bot detection | Invisible Utility axis, Moat axis |

## Required output columns

Each query MUST return exactly 1 row with specific column names (documented
in each `.sql` file's header). The Python parser in `data/sources.py` reads
these columns by name — if a column is missing, the insight returns `None`.

## Important notes

- **The SQL templates are Ethereum-focused examples.** For other chains
  (Solana, BSC, Arbitrum, etc.), adapt the `FROM` clause to use the
  appropriate Dune spellbook schema (e.g. `erc20_solana.evt_Transfer`).
- **Team wallet concentration** requires a manual list of known team/treasury
  addresses per protocol — the template returns `0.0` as a placeholder.
- **Dune free tier** allows 2,500 datapoints/month. The 5-minute cache in
  `sources.py` keeps usage well under this limit for typical workloads.

## Current status

Until the query IDs are configured, CryptoSieve operates in "free APIs only"
mode:
- CoinGecko + DeFiLlama + CMC Keyless (no key needed)
- TVL cross-verification: `single-source` (DeFiLlama only)
- Fees cross-verification: `single-source` (DeFiLlama only)

With Dune configured, these upgrade to `verified` (Grade A on-chain data).
