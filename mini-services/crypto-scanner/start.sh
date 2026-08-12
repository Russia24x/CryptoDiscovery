#!/usr/bin/env bash
# Start the crypto-scanner FastAPI service on port 3003.
set -e
cd "$(dirname "$0")"

PYTHON=/home/z/.venv/bin/python

# Kill any existing instance
pkill -f "uvicorn main:app" 2>/dev/null || true
sleep 1

# Start fully detached
nohup setsid "$PYTHON" -m uvicorn main:app \
    --host 0.0.0.0 \
    --port 3003 \
    --app-dir "$(pwd)" \
    --log-level info \
    < /dev/null > service.log 2>&1 &
disown

echo "crypto-scanner started on port 3003 (pid $!)"
sleep 3
curl -s http://127.0.0.1:3003/health || echo "WARN: health check failed"
