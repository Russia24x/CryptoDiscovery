#!/usr/bin/env bash
# =========================================================================== #
#  configure-dune.sh — set up Dune query IDs for CryptoSieve Grade A insights
#
#  This script helps configure the 3 Dune query IDs required for on-chain
#  Grade A evidence (token concentration, real revenue, active users).
#
#  PREREQUISITES:
#    1. A free Dune account (https://dune.com)
#    2. A Dune API key (https://dune.com/api-keys)
#    3. The 3 queries from dune-queries/*.sql published on Dune
#
#  USAGE:
#    ./configure-dune.sh
#    (prompts for API key + 3 query IDs, writes to .env)
# =========================================================================== #
set -e

cd "$(dirname "$0")"

ENV_FILE=".env"
BACKUP=".env.backup.$(date +%s)"

echo "============================================="
echo "  CryptoSieve Dune Configuration"
echo "============================================="
echo ""

# Load existing env if present
if [ -f "$ENV_FILE" ]; then
  cp "$ENV_FILE" "$BACKUP"
  echo "Backing up existing .env to $BACKUP"
fi

echo "This script will set 4 environment variables:"
echo "  DUNE_API_KEY"
echo "  DUNE_QUERY_TOKEN_CONCENTRATION"
echo "  DUNE_QUERY_REAL_REVENUE"
echo "  DUNE_QUERY_ACTIVE_USERS"
echo ""
echo "To get these values:"
echo "  1. API key:   https://dune.com/api-keys (free)"
echo "  2. Query IDs: follow instructions in dune-queries/*.sql"
echo "     After publishing each query on Dune, the query ID is"
echo "     the number in the URL: dune.com/queries/<QUERY_ID>"
echo ""
read -p "DUNE_API_KEY: " DUNE_API_KEY
read -p "DUNE_QUERY_TOKEN_CONCENTRATION (query ID): " DUNE_QUERY_TOKEN_CONCENTRATION
read -p "DUNE_QUERY_REAL_REVENUE (query ID): " DUNE_QUERY_REAL_REVENUE
read -p "DUNE_QUERY_ACTIVE_USERS (query ID): " DUNE_QUERY_ACTIVE_USERS
echo ""

# Remove any existing entries, then append fresh
if [ -f "$ENV_FILE" ]; then
  grep -v "^DUNE_API_KEY=\|^DUNE_QUERY_" "$ENV_FILE" > "$ENV_FILE.tmp" || true
  mv "$ENV_FILE.tmp" "$ENV_FILE"
fi

cat >> "$ENV_FILE" <<EOF
DUNE_API_KEY=$DUNE_API_KEY
DUNE_QUERY_TOKEN_CONCENTRATION=$DUNE_QUERY_TOKEN_CONCENTRATION
DUNE_QUERY_REAL_REVENUE=$DUNE_QUERY_REAL_REVENUE
DUNE_QUERY_ACTIVE_USERS=$DUNE_QUERY_ACTIVE_USERS
EOF

echo "============================================="
echo "  .env updated with Dune configuration"
echo "============================================="
echo ""
echo "To verify, restart the scanner service:"
echo "  bash start.sh"
echo ""
echo "Then check the sources endpoint:"
echo "  curl http://localhost:3003/sources | python -m json.tool | grep -A4 dune"
echo ""
echo "You should see has_token_concentration_query: true, etc."
