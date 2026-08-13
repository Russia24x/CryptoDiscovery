#!/usr/bin/env bash
# Start the crypto-scanner FastAPI service on port 3003.
# Optional: Set CMC_API_KEY environment variable for CoinMarketCap cross-verification.
set -e
cd "$(dirname "$0")"

PYTHON=/home/z/.venv/bin/python

# Kill any existing instance
pkill -f "uvicorn main:app" 2>/dev/null || true
sleep 1

# CoinMarketCap API key (optional — enables cross-verification)
# Set in .env file or export before running this script
if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
fi

# Start fully detached
nohup setsid "$PYTHON" -m uvicorn main:app \
    --host 0.0.0.0 \
    --port 3003 \
    --app-dir "$(pwd)" \
    --log-level info \
    < /dev/null > service.log 2>&1 &
disown

echo "crypto-scanner started on port 3003 (pid $!)"
if [ -n "$CMC_API_KEY" ]; then
    echo "CoinMarketCap API key detected — cross-verification enabled"
else
    echo "No CMC_API_KEY set — running with free APIs only (CoinGecko + DeFiLlama)"
fi
sleep 3
curl -s http://127.0.0.1:3003/health || echo "WARN: health check failed"
