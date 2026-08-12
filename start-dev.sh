#!/usr/bin/env bash
# Keep the Next.js dev server alive — restarts if it dies.
# NODE_OPTIONS caps V8 heap to avoid OOM kills in the sandbox.
set -e
cd /home/z/my-project

pkill -f "next dev" 2>/dev/null || true
pkill -f "next-server" 2>/dev/null || true
sleep 2

export NODE_OPTIONS="--max-old-space-size=512"

while true; do
  echo "[watchdog] starting next dev (webpack)..."
  /home/z/my-project/node_modules/.bin/next dev -p 3000 --webpack > /home/z/my-project/dev.log 2>&1 &
  NPID=$!
  echo "[watchdog] next dev pid=$NPID"
  wait $NPID 2>/dev/null
  echo "[watchdog] next dev exited (code $?), restarting in 3s..."
  sleep 3
done
