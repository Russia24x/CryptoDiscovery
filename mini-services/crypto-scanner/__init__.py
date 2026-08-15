"""
CryptoSieve — Crypto Market Discovery & Analysis Framework
==========================================================

A comprehensive Python-based framework for discovering, evaluating, and
ranking crypto projects based on verifiable evidence.

Framework Version: 3.0 (CryptoSieve)
Service Version: 1.0

Data Sources:
    - CoinGecko (public API, no key required)
    - DeFiLlama (public API, no key required)

Architecture:
    FastAPI service on port 3003
    Implements 8-phase analysis pipeline:
        PHASE 0: Settings (persona, market cap, sectors)
        PHASE 1: Discovery (5 lenses)
        PHASE 2: Screening (5 veto gates + 12 severe risks)
        PHASE 3: Evidence Collection (4 grades, freshness tracking)
        PHASE 4: Fundamental Evaluation (5 axes, 0-10 scoring)
        PHASE 5: Scoring & Ranking (weighted, weakest-link penalty)
        PHASE 6: Investment Analysis (P/R, P/F, P/T, cycle, catalysts)
        PHASE 7: Decision (6 action levels, risk adjustment)
        PHASE 8: Output (23-section report, 5 final questions)

Usage:
    Start service:  bash start.sh
    Health check:   curl http://localhost:3003/health
    Start scan:     curl -X POST http://localhost:3003/scan \\
                        -H "Content-Type: application/json" \\
                        -d '{"persona":"investor","max_projects":10}'
"""

__version__ = "1.0.0"
__framework_version__ = "3.0"
__author__ = "CryptoSieve Team"
__license__ = "MIT"
