"""
Crypto Market Discovery & Analysis Framework — FastAPI service.

Endpoints:
  GET  /health
  POST /scan                 → start a market scan (returns scan_id)
  GET  /scan/{id}            → scan progress + summary
  GET  /scan/{id}/projects   → list of project reports for a scan
  GET  /project/{id}         → full detailed project report
  GET  /projects             → all reports across scans (latest first)
"""
from __future__ import annotations

import asyncio
import logging
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from models.schemas import (
    Persona,
    ProjectReport,
    ScanConfig,
    ScanPhase,
    ScanProgress,
    ScanStatus,
)
# IMPORTANT: settings_store must be imported BEFORE `from data import sources`
# so that API keys configured via the Settings UI (stored in settings.json)
# are applied to os.environ before sources.py caches them at module-load time.
# settings_store's __init__ calls apply_to_env() which is idempotent and safe.
import settings_store  # noqa: F401 — side effect: applies settings to env

from framework import analysis, discovery, evidence
from data import sources
import db

# --------------------------------------------------------------------------- #
#  Logging
# --------------------------------------------------------------------------- #
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
log = logging.getLogger("scanner")

# --------------------------------------------------------------------------- #
#  Persistence layer — SQLite for durability + in-memory for speed
#  All writes go to BOTH in-memory (for fast reads) and SQLite (for restarts).
#  On startup, in-memory is populated from SQLite.
# --------------------------------------------------------------------------- #
db.init_db()

# Ensure the "manual" scan bucket exists in the DB (for manual coin analyses)
db.save_scan(
    scan_id="manual", status="completed", phase="Completed", progress=100.0,
    total=0, processed=0, persona="manual",
    config_json='{"persona": "manual"}',
    started_at=datetime.now(timezone.utc).isoformat(),
    finished_at=datetime.now(timezone.utc).isoformat(),
)

SCANS: dict[str, ScanProgress] = {}
REPORTS: dict[str, ProjectReport] = {}
SCAN_REPORT_IDS: dict[str, list[str]] = {}


# --------------------------------------------------------------------------- #
#  App
# --------------------------------------------------------------------------- #
@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("Crypto Scanner service starting on port 3003")
    yield
    log.info("Crypto Scanner service shutting down")


app = FastAPI(title="Crypto Market Discovery Framework", version="1.0.0", lifespan=lifespan)

# CORS — restrict to known origins.
#
# In production the browser only ever talks to the Next.js app (same-origin
# /api/scanner/* routes proxy to this service server-side). Direct browser
# access to port 3003 is a dev/debug convenience only, so we restrict to:
#   - localhost variants (dev)
#   - the Caddy gateway origin (port 81)
#   - explicit extra origins via the SCANNER_CORS_ORIGINS env var (comma-sep)
#
# Never use allow_origins=["*"] in production — it permits any website to
# call this service directly, bypassing the Next.js proxy.
import os as _os
_default_origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:81",
    "http://127.0.0.1:81",
]
_extra = _os.environ.get("SCANNER_CORS_ORIGINS", "")
if _extra:
    _default_origins.extend([o.strip() for o in _extra.split(",") if o.strip()])

app.add_middleware(
    CORSMiddleware,
    allow_origins=_default_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Content-Type", "Authorization"],
)


# --------------------------------------------------------------------------- #
#  Request models
# --------------------------------------------------------------------------- #
class ScanRequest(BaseModel):
    persona: Persona = Persona.INVESTOR
    market_cap_min: float = 0.0
    market_cap_max: float = 1_000_000.0
    sectors: list[str] = []
    max_projects: int = 15
    lang: str = "en"  # "en" or "fa" — controls language of generated text
    # Custom persona weights (optional — overrides the preset persona weights)
    # All 5 weights must sum to 1.0. If provided, takes priority over `persona`.
    custom_weights: dict[str, float] | None = None


class AnalyzeRequest(BaseModel):
    gecko_id: str
    persona: Persona = Persona.INVESTOR
    lang: str = "en"
    custom_weights: dict[str, float] | None = None


# --------------------------------------------------------------------------- #
#  Health
# --------------------------------------------------------------------------- #
@app.get("/health")
async def health():
    return {
        "status": "ok",
        "service": "crypto-scanner",
        "framework_version": "1.0.0",
        "scans_total": len(SCANS) + db.get_scan_count() - min(len(SCANS), db.get_scan_count()),
        "reports_total": len(REPORTS) + max(0, db.get_report_count() - len(REPORTS)),
        "db_scans": db.get_scan_count(),
        "db_reports": db.get_report_count(),
        "cache": sources.cache_info(),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


# --------------------------------------------------------------------------- #
#  Data sources status — surfaces which APIs are configured (free vs key)
# --------------------------------------------------------------------------- #
@app.get("/sources")
async def data_sources_status():
    """Returns the availability of each data source (free or API-key-backed)."""
    return {
        "sources": [
            {"name": "CoinGecko", "type": "free", "available": True,
             "description": "Prices, market cap, supply, volume, coin search"},
            {"name": "DeFiLlama", "type": "free", "available": True,
             "description": "TVL, fees, revenue, protocol metadata"},
            {"name": "CoinMarketCap (Pro)", "type": "api_key", "available": sources.is_cmc_available(),
             "description": "EXCLUSIVE: airdrops, categories, exchange rankings + cross-verification (optional)"},
            {"name": "CoinMarketCap (Keyless)", "type": "free", "available": True,
             "description": "Holder ratios, audit info, price ranges"},
            {"name": "CoinDesk RSS", "type": "free", "available": True,
             "description": "Crypto news feed (English)"},
            {"name": "Cointelegraph RSS", "type": "free", "available": True,
             "description": "Crypto news feed (English)"},
            {"name": "Decrypt RSS", "type": "free", "available": True,
             "description": "Crypto news feed (English)"},
            {"name": "Bitcoinist RSS", "type": "free", "available": True,
             "description": "Crypto news feed (English)"},
            {"name": "ArzDigital (خبر فوری)", "type": "free", "available": True,
             "description": "Persian breaking news + blog articles"},
            {"name": "MihanBlockchain", "type": "free", "available": True,
             "description": "Persian crypto news + market analysis"},
            {"name": "CryptoPanic API", "type": "api_key", "available": bool(sources.CRYPTOPANIC_TOKEN),
             "description": "Curated crypto news (optional, free token)"},
            {"name": "CryptoCompare API", "type": "api_key", "available": bool(sources.CRYPTOCOMPARE_KEY),
             "description": "Crypto news + price data (optional, free key)"},
            {"name": "Fear & Greed (alternative.me)", "type": "free", "available": True,
             "description": "Market sentiment index"},
            {"name": "Telegram (t.me/s/)", "type": "free", "available": True,
             "description": "Public channel web preview (no bot token needed)"},
            {"name": "Dune Analytics", "type": "api_key", "available": sources.is_dune_available(),
             "description": "EXCLUSIVE: On-chain data (Grade A) — real revenue vs fees, token concentration, active users, whale tracking. 100+ chains. Free key at dune.com/api-keys"},
        ],
        "free_count": 11,
        "keyed_count": 4,
        "total_count": 15,
        "dune_config": sources.dune_config_info() if sources.is_dune_available() else None,
    }


# --------------------------------------------------------------------------- #
#  Scan lifecycle
# --------------------------------------------------------------------------- #
@app.post("/scan")
async def start_scan(req: ScanRequest):
    scan_id = uuid.uuid4().hex[:12]
    config = ScanConfig(
        persona=req.persona,
        market_cap_min=req.market_cap_min,
        market_cap_max=req.market_cap_max,
        sectors=req.sectors,
        max_projects=req.max_projects,
        lang=req.lang,
        custom_weights=req.custom_weights,
    )
    progress = ScanProgress(
        scan_id=scan_id,
        status=ScanStatus.QUEUED,
        current_phase=ScanPhase.DISCOVERY,
        progress_pct=0.0,
        config=config,
        started_at=datetime.now(timezone.utc),
    )
    SCANS[scan_id] = progress
    SCAN_REPORT_IDS[scan_id] = []
    # Persist scan to SQLite
    db.save_scan(
        scan_id=scan_id, status="queued", phase=progress.current_phase.value,
        progress=0.0, total=0, processed=0, persona=config.persona.value,
        config_json=config.model_dump_json(),
        started_at=progress.started_at.isoformat(),
    )
    # fire and forget — with done callback to surface any crash
    task = asyncio.create_task(_run_scan(scan_id))
    task.add_done_callback(_scan_done_callback)
    return {"scan_id": scan_id, "status": "queued"}


def _scan_done_callback(t: asyncio.Task) -> None:
    if t.cancelled():
        return
    exc = t.exception()
    if exc:
        log.error("Scan task crashed: %r", exc, exc_info=exc)


@app.get("/scan/{scan_id}")
async def get_scan(scan_id: str):
    if scan_id not in SCANS:
        raise HTTPException(404, "scan not found")
    p = SCANS[scan_id]
    # include lightweight summary of reports
    report_summaries = [
        {
            "id": r.id,
            "name": r.candidate.name,
            "symbol": r.candidate.symbol,
            "project_quality": r.project_quality_score,
            "token_quality": r.token_quality_score,
            "action": r.decision.action_label,
            "confidence": r.confidence,
            "image": r.candidate.image,
            "veto": r.veto.triggered,
            "category": r.candidate.category,
            "sector": r.candidate.sector,
            "website": r.candidate.website,
            "twitter": r.candidate.twitter,
            "github": r.candidate.github,
            "gecko_id": r.candidate.gecko_id,
        }
        for rid in SCAN_REPORT_IDS.get(scan_id, [])
        for r in [REPORTS.get(rid)]
        if r
    ]
    report_summaries.sort(key=lambda x: x["project_quality"], reverse=True)
    return {
        **p.model_dump(mode="json"),
        "reports": report_summaries,
    }


@app.get("/scan/{scan_id}/projects")
async def get_scan_projects(scan_id: str):
    if scan_id not in SCANS:
        raise HTTPException(404, "scan not found")
    return [
        REPORTS[rid].model_dump(mode="json")
        for rid in SCAN_REPORT_IDS.get(scan_id, [])
        if rid in REPORTS
    ]


@app.get("/project/{report_id}")
async def get_project(report_id: str):
    # Try in-memory first (fast), then SQLite (durable)
    if report_id in REPORTS:
        return REPORTS[report_id].model_dump(mode="json")
    db_report = db.load_report(report_id)
    if db_report:
        return db_report
    raise HTTPException(404, "project report not found")


@app.get("/projects")
async def all_projects(limit: int = 50):
    """List all analyzed projects (summary fields).

    Reads from SQLite (persistent) so reports survive restarts. Falls back
    to in-memory REPORTS if DB is empty (e.g. first run).
    """
    # Validate limit (same pattern as /score-history)
    if limit < 1:
        limit = 1
    elif limit > 500:
        limit = 500

    # Try DB first (persistent across restarts)
    db_rows = db.list_all_reports(limit=limit)
    if db_rows:
        return db_rows

    # Fallback to in-memory (first run or DB issue)
    items = sorted(REPORTS.values(), key=lambda r: r.created_at, reverse=True)[:limit]
    return [
        {
            "id": r.id,
            "name": r.candidate.name,
            "symbol": r.candidate.symbol,
            "project_quality": r.project_quality_score,
            "token_quality": r.token_quality_score,
            "investment_attractiveness": r.investment_attractiveness_score,
            "action": r.decision.action_label,
            "confidence": r.confidence,
            "image": r.candidate.image,
            "category": r.candidate.category,
            "sector": r.candidate.sector,
            "scan_id": r.scan_id,
            "created_at": r.created_at.isoformat(),
        }
        for r in items
    ]


@app.get("/scans")
async def list_scans():
    return [
        {
            "scan_id": s.scan_id,
            "status": s.status.value,
            "phase": s.current_phase.value,
            "progress": s.progress_pct,
            "total": s.total_candidates,
            "processed": s.processed,
            "started_at": s.started_at.isoformat(),
            "finished_at": s.finished_at.isoformat() if s.finished_at else None,
            "persona": s.config.persona.value,
        }
        for s in sorted(SCANS.values(), key=lambda x: x.started_at, reverse=True)
    ]


@app.get("/score-history/{symbol}")
async def get_score_history(symbol: str, limit: int = 20):
    """Get historical scores for a symbol — for trend analysis.

    Returns a list of {symbol, scan_id, project_quality, token_quality,
    confidence, action, timestamp} entries, newest first. Data persists
    across restarts via SQLite.

    `limit` must be between 1 and 500. Negative limits in SQLite return
    ALL rows (DoS vector); 0 returns empty; clamped here to prevent abuse.
    """
    # Validate limit — SQLite LIMIT -1 returns ALL rows (DoS), and
    # Python slicing rows[:0] returns empty (surprising). Clamp to 1-500.
    if limit < 1:
        limit = 1
    elif limit > 500:
        limit = 500
    history = db.get_score_history(symbol, limit=limit)
    if not history:
        return {"symbol": symbol.upper(), "history": [], "count": 0}
    return {"symbol": symbol.upper(), "history": history, "count": len(history)}


# --------------------------------------------------------------------------- #
#  The actual scan runner
# --------------------------------------------------------------------------- #
async def _run_scan(scan_id: str):
    progress = SCANS[scan_id]
    config = progress.config
    log.info("Scan %s started (persona=%s)", scan_id, config.persona.value)

    try:
        progress.status = ScanStatus.RUNNING
        progress.current_phase = ScanPhase.DISCOVERY
        progress.phase_log.append("Discovery: scanning CoinGecko + DeFiLlama")
        candidates, llama_by_symbol, fees_by_symbol = await discovery.discover_candidates(
            market_cap_min_m=config.market_cap_min,
            market_cap_max_m=config.market_cap_max,
            sectors=config.sectors,
            max_projects=config.max_projects,
        )
        progress.total_candidates = len(candidates)
        progress.phase_log.append(f"Discovery complete: {len(candidates)} candidates")
        progress.progress_pct = 15.0

        if not candidates:
            progress.status = ScanStatus.COMPLETED
            progress.current_phase = ScanPhase.DONE
            progress.finished_at = datetime.now(timezone.utc)
            progress.phase_log.append("No candidates discovered.")
            return

        # process each candidate through PHASE 2-8
        for i, cand in enumerate(candidates):
            pct = 15.0 + (i / max(1, len(candidates))) * 80.0
            progress.progress_pct = pct
            phase = ScanPhase.SCREENING if i == 0 else ScanPhase.EVALUATION
            progress.current_phase = phase
            progress.phase_log.append(f"[{i+1}/{len(candidates)}] {cand.symbol} — collecting evidence")

            try:
                # Match fees by symbol OR name (many fee protocols lack symbol field)
                fees_entry = fees_by_symbol.get(cand.symbol)
                if not fees_entry:
                    # Try name-based matching (e.g. "Aave" matches "Aave V3")
                    cand_name = cand.name.lower()
                    for f in fees_by_symbol.values():
                        fname = (f.get("name") or "").lower()
                        if fname and (fname.startswith(cand_name + " ") or
                                      fname.startswith(cand_name + "-") or
                                      fname == cand_name or
                                      cand_name.startswith(fname + " ") or
                                      cand_name.startswith(fname + "-")):
                            fees_entry = f
                            break
                ev = await evidence.collect(
                    cand,
                    llama_overview=llama_by_symbol.get(cand.symbol),
                    fees_overview=fees_entry,
                )
                report = analysis.build_report(cand, ev, config, scan_id)
                REPORTS[report.id] = report
                SCAN_REPORT_IDS[scan_id].append(report.id)
                # Persist to SQLite
                try:
                    db.save_report(report.id, scan_id, report.model_dump(mode="json"))
                except asyncio.CancelledError:
                    raise
                except Exception as exc:  # noqa: BLE001
                    log.warning("Failed to persist report %s: %s", report.id, exc)
            except asyncio.CancelledError:
                raise
            except Exception as exc:  # noqa: BLE001
                log.exception("Failed processing %s: %s", cand.symbol, exc)
                progress.phase_log.append(f"  ! {cand.symbol} failed: {exc}")

            progress.processed = i + 1
            # small breath between candidates to be polite to public APIs
            await asyncio.sleep(0.15)

        progress.progress_pct = 100.0
        progress.current_phase = ScanPhase.DONE
        progress.status = ScanStatus.COMPLETED
        progress.finished_at = datetime.now(timezone.utc)
        progress.phase_log.append("Scan complete.")
        log.info("Scan %s complete: %d reports", scan_id, len(SCAN_REPORT_IDS[scan_id]))
        # Persist final scan status to SQLite
        db.save_scan(
            scan_id=scan_id, status="completed", phase=ScanPhase.DONE.value,
            progress=100.0, total=progress.total_candidates, processed=progress.processed,
            persona=config.persona.value, config_json=config.model_dump_json(),
            started_at=progress.started_at.isoformat(),
            finished_at=progress.finished_at.isoformat(),
            phase_log=progress.phase_log,
        )

    except asyncio.CancelledError:
        raise
    except Exception as exc:  # noqa: BLE001
        log.exception("Scan %s failed: %s", scan_id, exc)
        progress.status = ScanStatus.FAILED
        progress.error = str(exc)
        progress.finished_at = datetime.now(timezone.utc)
        # Persist failed status to SQLite
        db.save_scan(
            scan_id=scan_id, status="failed", phase=progress.current_phase.value,
            progress=progress.progress_pct, total=progress.total_candidates,
            processed=progress.processed, persona=config.persona.value,
            config_json=config.model_dump_json(),
            started_at=progress.started_at.isoformat(),
            finished_at=progress.finished_at.isoformat(),
            error=str(exc), phase_log=progress.phase_log,
        )


# --------------------------------------------------------------------------- #
#  Manual coin search & single-coin analysis (Coin Explorer)
# --------------------------------------------------------------------------- #
@app.get("/search")
async def search_coins(q: str = ""):
    """Search coins by name/symbol via CoinGecko."""
    results = await sources.search_coins(q)
    return {"query": q, "count": len(results), "results": results}


# AnalyzeRequest is defined above (with custom_weights support)


@app.get("/alerts")
async def get_alerts(threshold: float = 10.0):
    """Check for significant score changes in score_history.

    Returns alerts for symbols whose project_quality changed by `threshold`
    points or more between consecutive scans.

    Designed to be polled by the frontend every 60s for in-app notifications.

    Note: `threshold` must be positive. A non-positive threshold is rejected
    with 422 because `abs(delta) >= negative` is always True, which would
    spam false alerts for every symbol with >=2 history entries.
    """
    if threshold <= 0:
        from fastapi import HTTPException
        raise HTTPException(
            status_code=422,
            detail=f"threshold must be positive (got {threshold})",
        )
    conn = db._get_conn()
    # Find symbols with multiple score entries
    rows = conn.execute("""
        SELECT symbol, COUNT(*) as cnt
        FROM score_history
        GROUP BY symbol
        HAVING cnt >= 2
        ORDER BY MAX(timestamp) DESC
        LIMIT 20
    """).fetchall()

    alerts = []
    for row in rows:
        symbol = row["symbol"]
        history = db.get_score_history(symbol, limit=5)
        if len(history) < 2:
            continue
        latest = history[0]
        previous = history[1]
        delta = latest["project_quality"] - previous["project_quality"]
        if abs(delta) >= threshold:
            alerts.append({
                "symbol": symbol,
                "type": "score_increase" if delta > 0 else "score_decrease",
                "delta": round(delta, 1),
                "current_score": latest["project_quality"],
                "previous_score": previous["project_quality"],
                # NOTE: score_history.action column stores the action LABEL
                # (string like 'Watch', 'High Conviction'), not the int
                # ActionLevel. Renamed from 'action' to 'action_label' to
                # match what it actually contains and avoid type confusion
                # with Decision.action (int Enum).
                "action_label": latest.get("action"),
                "timestamp": latest["timestamp"],
                "message": f"{symbol} score {'increased' if delta > 0 else 'decreased'} by {abs(delta):.1f} points ({previous['project_quality']:.0f} → {latest['project_quality']:.0f})",
            })

    return {
        "alerts": alerts,
        "count": len(alerts),
        "threshold": threshold,
        "fetched_at": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/backtest")
async def backtest():
    """Compare historical framework scores with actual price performance.

    For each symbol in score_history, fetches the price at the time of scoring
    and the current price, then calculates the correlation between score and
    price change.

    Returns: {results: [{symbol, score, price_then, price_now, change_pct, ...}],
              summary: {correlation, avg_score_up, avg_score_down, ...}}
    """
    conn = db._get_conn()
    # Get all unique symbols with score history
    rows = conn.execute("""
        SELECT symbol, MIN(timestamp) as first_ts, MAX(timestamp) as last_ts,
               COUNT(*) as cnt
        FROM score_history
        GROUP BY symbol
        HAVING cnt >= 1
        ORDER BY last_ts DESC
        LIMIT 30
    """).fetchall()

    results = []
    for row in rows:
        symbol = row["symbol"]
        history = db.get_score_history(symbol, limit=1)
        if not history:
            continue
        entry = history[0]
        score = entry["project_quality"]
        timestamp = entry["timestamp"]

        # Try to find the gecko_id from reports
        report_row = conn.execute(
            "SELECT report_json FROM reports WHERE symbol = ? ORDER BY created_at DESC LIMIT 1",
            (symbol,)
        ).fetchone()
        gecko_id = None
        if report_row:
            try:
                report_data = json.loads(report_row["report_json"])
                gecko_id = report_data.get("candidate", {}).get("gecko_id")
            except asyncio.CancelledError:
                raise
            except Exception:  # noqa: BLE001
                pass

        # Fetch current price from CoinGecko
        price_now = None
        price_then = None
        if gecko_id:
            try:
                detail = await sources.fetch_coin_detail(gecko_id)
                if detail:
                    md = detail.get("market_data", {})
                    price_now = md.get("current_price", {}).get("usd")
                    # Fetch historical price: use days since the score was
                    # registered, NOT a fixed 30d window. The old code used
                    # days=30 which gave "30 days ago from now" — but for a
                    # score registered yesterday, that's 29 days of irrelevant
                    # price movement before the score even existed.
                    # price_then = price at approximately the score timestamp.
                    try:
                        score_dt = datetime.fromisoformat(
                            timestamp.replace("Z", "+00:00")
                        )
                    except (ValueError, TypeError):
                        score_dt = None
                    if score_dt:
                        days_ago = max(
                            1,
                            (datetime.now(timezone.utc) - score_dt).days,
                        )
                    else:
                        days_ago = 30  # fallback if timestamp unparseable
                    chart = await sources.fetch_price_chart(
                        gecko_id, days=min(days_ago, 365)
                    )
                    if chart and chart.get("prices"):
                        prices = chart["prices"]
                        if len(prices) >= 2:
                            price_then = prices[0][1]  # oldest = ~score time
            except asyncio.CancelledError:
                raise
            except Exception:  # noqa: BLE001
                pass

        change_pct = None
        if price_then and price_now and price_then > 0:
            change_pct = round((price_now - price_then) / price_then * 100, 2)

        results.append({
            "symbol": symbol,
            "score": score,
            # score_history.action column stores the action LABEL (string),
            # not the int ActionLevel. Renamed from 'action' to 'action_label'
            # for consistency with /alerts (same column, same type mismatch).
            "action_label": entry.get("action"),
            "timestamp": timestamp,
            "gecko_id": gecko_id,
            "price_then": price_then,
            "price_now": price_now,
            "change_pct": change_pct,
            "correct": None if change_pct is None else (
                (score >= 50 and change_pct > 0) or (score < 50 and change_pct < 0)
            ),
        })

    # Calculate summary statistics
    valid = [r for r in results if r["change_pct"] is not None]
    if valid:
        up_scores = [r["score"] for r in valid if r["change_pct"] > 0]
        down_scores = [r["score"] for r in valid if r["change_pct"] < 0]
        correct = sum(1 for r in valid if r["correct"])
        avg_up = sum(up_scores) / len(up_scores) if up_scores else 0
        avg_down = sum(down_scores) / len(down_scores) if down_scores else 0
        accuracy = round(correct / len(valid) * 100, 1) if valid else 0
    else:
        avg_up = avg_down = accuracy = 0

    return {
        "results": results,
        "count": len(results),
        "valid_count": len(valid),
        "summary": {
            "accuracy_pct": accuracy,
            "avg_score_price_up": round(avg_up, 1),
            "avg_score_price_down": round(avg_down, 1),
            "total_compared": len(valid),
        },
        "fetched_at": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/correlation")
async def correlation_analysis():
    """Calculate Pearson correlation between framework scores and price changes.

    Uses the same data as /backtest but computes the statistical correlation
    coefficient to measure how well the framework's quality scores predict
    price performance.

    Returns: {correlation, r_squared, interpretation, data_points, ...}
    """
    conn = db._get_conn()
    rows = conn.execute("""
        SELECT symbol, MIN(timestamp) as first_ts, MAX(timestamp) as last_ts,
               COUNT(*) as cnt
        FROM score_history
        GROUP BY symbol
        HAVING cnt >= 1
        ORDER BY last_ts DESC
        LIMIT 30
    """).fetchall()

    pairs = []  # (score, change_pct)
    for row in rows:
        symbol = row["symbol"]
        history = db.get_score_history(symbol, limit=1)
        if not history:
            continue
        entry = history[0]
        score = entry["project_quality"]

        report_row = conn.execute(
            "SELECT report_json FROM reports WHERE symbol = ? ORDER BY created_at DESC LIMIT 1",
            (symbol,)
        ).fetchone()
        gecko_id = None
        if report_row:
            try:
                gecko_id = json.loads(report_row["report_json"]).get("candidate", {}).get("gecko_id")
            except asyncio.CancelledError:
                raise
            except Exception:  # noqa: BLE001
                pass

        if not gecko_id:
            continue

        try:
            # Use days since the score was registered (same fix as /backtest).
            # The old code used days=30 which is wrong for scores registered
            # less than 30 days ago — it measured price movement BEFORE the
            # score, not AFTER.
            try:
                score_dt = datetime.fromisoformat(
                    entry["timestamp"].replace("Z", "+00:00")
                )
            except (ValueError, TypeError):
                score_dt = None
            if score_dt:
                days_ago = max(
                    1, (datetime.now(timezone.utc) - score_dt).days
                )
            else:
                days_ago = 30
            chart = await sources.fetch_price_chart(
                gecko_id, days=min(days_ago, 365)
            )
            if chart and chart.get("prices") and len(chart["prices"]) >= 2:
                price_then = chart["prices"][0][1]
                price_now = chart["prices"][-1][1]
                if price_then > 0:
                    change_pct = (price_now - price_then) / price_then * 100
                    pairs.append((score, change_pct, symbol))
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001
            pass

    if len(pairs) < 3:
        return {
            "correlation": None,
            "r_squared": None,
            "interpretation": "Not enough data points (need at least 3)",
            "data_points": len(pairs),
            "pairs": [],
        }

    # Pearson correlation coefficient
    n = len(pairs)
    scores = [p[0] for p in pairs]
    changes = [p[1] for p in pairs]
    mean_s = sum(scores) / n
    mean_c = sum(changes) / n

    num = sum((s - mean_s) * (c - mean_c) for s, c in zip(scores, changes))
    den_s = (sum((s - mean_s) ** 2 for s in scores)) ** 0.5
    den_c = (sum((c - mean_c) ** 2 for c in changes)) ** 0.5

    correlation = num / (den_s * den_c) if den_s > 0 and den_c > 0 else 0
    r_squared = correlation ** 2

    # Interpretation — check extreme cases FIRST so they're reachable.
    # The old order checked correlation < -0.2 before < -0.5, so
    # "Strong negative" was never reachable (any corr < -0.2 hit "Negative").
    if correlation > 0.5:
        interpretation = "Strong positive — high scores predict price gains"
    elif correlation > 0.2:
        interpretation = "Moderate positive — scores weakly predict price"
    elif correlation >= -0.2:
        interpretation = "No correlation — scores don't predict price"
    elif correlation > -0.5:
        interpretation = "Negative — high scores predict price drops"
    else:
        interpretation = "Strong negative — scores inversely predict price"

    return {
        "correlation": round(correlation, 4),
        "r_squared": round(r_squared, 4),
        "interpretation": interpretation,
        "data_points": n,
        "pairs": [{"symbol": p[2], "score": p[0], "change_pct": round(p[1], 2)} for p in pairs],
        "fetched_at": datetime.now(timezone.utc).isoformat(),
    }


@app.post("/analyze")
async def analyze_single_coin(req: AnalyzeRequest):
    """Run the full 8-phase framework on a single coin selected by gecko_id.

    Reuses the same evidence + analysis pipeline as a scan, but for one coin.
    The resulting report is stored like any other and can be opened in the
    project detail view.
    """
    if not req.gecko_id:
        raise HTTPException(400, "gecko_id is required")
    # Validate gecko_id format — CoinGecko IDs are lowercase alphanumeric + hyphens
    # (e.g. "bitcoin", "usd-coin", "binancecoin"). Reject anything that could
    # cause malformed API calls or be a path-injection vector.
    gid = req.gecko_id.strip().lower()
    if not gid or not all(c.isalnum() or c == "-" for c in gid):
        raise HTTPException(422, f"invalid gecko_id format: {req.gecko_id!r} (expected lowercase alphanumeric + hyphens)")
    log.info("Manual analyze: %s (persona=%s, lang=%s)", gid, req.persona.value, req.lang)

    # Build a CandidateInfo from the CoinGecko coin detail
    detail = await sources.fetch_coin_detail(gid)
    if not detail:
        raise HTTPException(404, f"coin '{gid}' not found on CoinGecko (may be rate-limited)")

    from models.schemas import CandidateInfo
    md = detail.get("market_data") or {}
    links = detail.get("links") or {}
    name = detail.get("name") or req.gecko_id
    symbol = (detail.get("symbol") or req.gecko_id).upper()
    market_cap = (md.get("market_cap") or {}).get("usd") or 0.0
    img_data = detail.get("image") or {}

    # Infer category using the discovery helper
    category = discovery._guess_category({"name": name}, symbol)  # type: ignore[attr-defined]

    # Match DeFiLlama + fees for this symbol
    llama_protos = await sources.fetch_defillama_protocols()
    fees_list = await sources.fetch_fees_overview()
    llama_entry = sources.match_llama_protocol(symbol, name, llama_protos)
    # fees match by symbol then name — when multiple entries share the same
    # symbol (e.g. "SOL" matches both "Solana" and "Solana Name Service"),
    # pick the one with the highest 24h fees (the real protocol/chain).
    fees_entry = None
    symbol_matches: list[dict[str, Any]] = []
    for f in fees_list:
        if (f.get("symbol") or "").upper() == symbol:
            symbol_matches.append(f)
    if symbol_matches:
        # Sort by fees_24h descending — the real protocol has higher fees
        symbol_matches.sort(key=lambda x: x.get("fees_24h") or 0, reverse=True)
        fees_entry = symbol_matches[0]
    if not fees_entry:
        nm = name.lower()
        # Collect ALL name matches, then pick the one with highest fees
        # (e.g. "Solana" matches both "Solana Name Service" and "Solana" —
        # the real chain "Solana" has $708K fees vs $1.8K for the name service)
        name_matches: list[dict[str, Any]] = []
        for f in fees_list:
            fname = (f.get("name") or "").lower()
            if fname and (fname == nm or fname.startswith(nm + " ") or nm.startswith(fname + " ")):
                name_matches.append(f)
        if name_matches:
            name_matches.sort(key=lambda x: x.get("fees_24h") or 0, reverse=True)
            fees_entry = name_matches[0]

    cand = CandidateInfo(
        name=name,
        symbol=symbol,
        category=category,
        sector=discovery._sector_for(category),  # type: ignore[attr-defined]
        description=discovery._short_description(  # type: ignore[attr-defined]
            {"market_cap": market_cap,
             "price_change_percentage_24h": md.get("price_change_percentage_24h")},
            llama_entry,
        ),
        key_signal=discovery._describe_signal(fees_entry, llama_entry, category),  # type: ignore[attr-defined]
        initial_priority="Manual",
        gecko_id=req.gecko_id,
        llama_id=llama_entry.get("slug") if llama_entry else None,
        image=img_data.get("large") or img_data.get("small") if isinstance(img_data, dict) else None,
        website=(links.get("homepage") or [None])[0] if links else None,
        twitter=links.get("twitter_screen_name") if links else None,
        github=((links.get("repos_url") or {}).get("github") or [None])[0] if links else None,
        discord=(links.get("chat_url") or [None])[0] if links else None,
        blockchain_explorer=((links.get("blockchain_site") or [None])[0]) if links else None,
    )

    ev = await evidence.collect(cand, llama_overview=llama_entry, fees_overview=fees_entry)
    config = ScanConfig(persona=req.persona, lang=req.lang, custom_weights=req.custom_weights)
    report = analysis.build_report(cand, ev, config, scan_id="manual")
    REPORTS[report.id] = report
    # Persist to SQLite
    try:
        db.save_report(report.id, "manual", report.model_dump(mode="json"))
    except asyncio.CancelledError:
        raise
    except Exception as exc:  # noqa: BLE001
        log.warning("Failed to persist manual report %s: %s", report.id, exc)
    # Also track under a synthetic "manual" bucket so /scans doesn't break
    if "manual" not in SCAN_REPORT_IDS:
        SCAN_REPORT_IDS["manual"] = []
    SCAN_REPORT_IDS["manual"].append(report.id)
    log.info("Manual analyze complete: %s -> report %s", symbol, report.id)
    return report.model_dump(mode="json")


# --------------------------------------------------------------------------- #
#  Market Intelligence — comprehensive overview (replaces CMC + DeFiLlama visits)
# --------------------------------------------------------------------------- #
@app.get("/market/overview")
async def market_overview():
    """One-shot comprehensive market snapshot.

    Returns: global stats, trending coins, top coins by mcap, biggest
    gainers & losers (24h), top DeFi protocols by TVL, top fee-generating
    protocols, sector breakdown, and the fear & greed index.

    All upstream calls are cached (90-300s) so repeated dashboard loads are
    fast and don't hammer public APIs.

    Returns a top-level `health` field: 'healthy' (all ok), 'degraded'
    (some sources failed), or 'all_failed' (every source returned None/[]).
    The frontend can render a banner when health != 'healthy' so the user
    knows whether an empty dashboard is genuine or due to upstream failure.
    """
    # Fire all independent fetches in parallel (module-level asyncio import)
    results = await asyncio.gather(
        sources.fetch_global_market(),
        sources.fetch_trending(),
        sources.fetch_top_markets_extended(per_page=250),
        sources.fetch_defillama_protocols(),
        sources.fetch_fees_overview(),
        sources.fetch_fear_greed(),
        return_exceptions=True,
    )
    global_data = results[0] if isinstance(results[0], dict) else None
    trending = results[1] if isinstance(results[1], list) else []
    markets = results[2] if isinstance(results[2], list) else []
    defi_protos = results[3] if isinstance(results[3], list) else []
    fees_list = results[4] if isinstance(results[4], list) else []
    fng = results[5] if isinstance(results[5], dict) else None

    # Top coins (first 50 by market cap)
    top_coins = markets[:50]

    # Gainers & losers by 24h change — use `is not None` for market_cap too,
    # not truthy check (category #5: truthiness treats 0/0.0 as falsy).
    with_change = [
        m for m in markets
        if m.get("price_change_percentage_24h_in_currency") is not None
        and m.get("market_cap") is not None
    ]
    gainers = sorted(with_change, key=lambda x: x["price_change_percentage_24h_in_currency"], reverse=True)[:10]
    losers = sorted(with_change, key=lambda x: x["price_change_percentage_24h_in_currency"])[:10]

    # Top DeFi protocols by TVL (already sorted by DeFiLlama)
    top_defi = []
    for p in defi_protos[:50]:
        top_defi.append({
            "name": p.get("name"),
            "symbol": (p.get("symbol") or "").upper(),
            "slug": p.get("slug"),
            "tvl": p.get("tvl"),
            "chain": p.get("chain"),
            "category": p.get("category"),
            "logo": p.get("logo") or p.get("icon"),
            "url": p.get("url"),
            "twitter": p.get("twitter"),
            "github": p.get("github"),
            "audit_links": p.get("audit_links") or [],
        })

    # Top fee-generating protocols (24h)
    fees_with_data = [f for f in fees_list if (f.get("fees_24h") or 0) > 0]
    fees_with_data.sort(key=lambda x: x.get("fees_24h") or 0, reverse=True)
    top_fees = fees_with_data[:30]

    # Sector breakdown (aggregate market cap by inferred sector)
    sector_map: dict[str, dict] = {}
    for m in markets:
        if not m.get("market_cap"):
            continue
        sym = (m.get("symbol") or "").upper()
        cat = discovery._guess_category(m, sym)  # type: ignore[attr-defined]
        sector = discovery._sector_for(cat)  # type: ignore[attr-defined]
        if sector not in sector_map:
            sector_map[sector] = {"sector": sector, "count": 0, "total_market_cap": 0.0, "total_volume": 0.0}
        sector_map[sector]["count"] += 1
        sector_map[sector]["total_market_cap"] += m.get("market_cap") or 0
        sector_map[sector]["total_volume"] += m.get("total_volume") or 0
    sectors = sorted(sector_map.values(), key=lambda x: x["total_market_cap"], reverse=True)

    # Aggregate DeFi TVL
    defi_tvl = sum((p.get("tvl") or 0) for p in defi_protos)

    # Health detection (MI-1 fix): surface all-source-failure so frontend
    # can render an error banner instead of a silent empty dashboard.
    sources_ok_count = sum(
        1 for r in results
        if isinstance(r, (dict, list)) and (
            (isinstance(r, dict) and r) or (isinstance(r, list) and r)
        )
    )
    if sources_ok_count == 0:
        health = "all_failed"
    elif sources_ok_count < 6:
        health = "degraded"
    else:
        health = "healthy"

    return {
        "global": global_data,
        "fear_greed": fng,
        "trending": trending,
        "top_coins": top_coins,
        "gainers": gainers,
        "losers": losers,
        "top_defi": top_defi,
        "top_fees": top_fees,
        "sectors": sectors,
        "defi_tvl_total": defi_tvl,
        "coin_count": len(markets),
        "defi_protocol_count": len(defi_protos),
        "health": health,  # 'healthy' | 'degraded' | 'all_failed'
        "sources_ok": sources_ok_count,
        "sources_total": 6,
        "cached_at": datetime.now(timezone.utc).isoformat(),
    }


# --------------------------------------------------------------------------- #
#  Crypto News — multi-source aggregation
# --------------------------------------------------------------------------- #
def _get_user_news_sources() -> list[tuple[str, str]]:
    """Load user-configured RSS feeds from settings.json.

    Returns list of (name, url) tuples for enabled RSS sources.
    Merges with built-in defaults (deduped by URL).
    """
    try:
        settings = settings_store.load()
        user_sources = settings.get("news_sources", [])
        result: list[tuple[str, str]] = []
        for s in user_sources:
            if not s.get("enabled", True):
                continue
            if s.get("type") == "rss":
                name = str(s.get("name", "")).strip()
                url = str(s.get("url", "")).strip()
                if name and url:
                    result.append((name, url))
        return result
    except Exception:
        return []


@app.get("/news")
async def get_news(limit: int = 40, source: str = ""):
    """Aggregate crypto news from multiple RSS feeds + optional API-key sources.

    Reads user-configured RSS feeds from settings.json (Settings page) and
    merges with built-in defaults (CoinDesk, Cointelegraph, etc.).

    Query params:
      limit  — max articles to return (default 40)
      source — filter by source name (case-insensitive, e.g. "CoinDesk")
    """
    # Validate limit
    if limit < 1:
        limit = 1
    elif limit > 200:
        limit = 200

    # Merge user-configured RSS feeds with defaults
    user_feeds = _get_user_news_sources()

    # NE-1 fix: actually pass user_feeds to the fetcher (was computed but
    # never passed — UI advertised sources that weren't actually fetched).
    articles = await sources.fetch_crypto_news(
        limit=limit * 2 if source else limit,
        extra_feeds=user_feeds,
    )
    if source:
        s = source.lower()
        articles = [a for a in articles if s in (a.get("source") or "").lower()]
    articles = articles[:limit]
    return {
        "count": len(articles),
        "sources_configured": {
            "rss": [n for n, _ in sources.NEWS_FEEDS] + [n for n, _ in user_feeds],
            "user_feeds": len(user_feeds),
            "cryptopanic": bool(sources.CRYPTOPANIC_TOKEN),
            "cryptocompare": bool(sources.CRYPTOCOMPARE_KEY),
        },
        "articles": articles,
        "fetched_at": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/news/fa")
async def get_news_fa(limit: int = 40, category: str = ""):
    """Aggregate Persian (Farsi) crypto news from ArzDigital + MihanBlockchain.

    Query params:
      limit    — max articles (default 40)
      category — "breaking", "blog", "news", "analysis" (empty = all)
    """
    # Validate limit
    if limit < 1:
        limit = 1
    elif limit > 200:
        limit = 200
    # FE-1 fix: validate category against allowed set
    allowed_categories = {"", "breaking", "blog", "news", "analysis"}
    if category not in allowed_categories:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid category: {category!r}. Must be one of: breaking, blog, news, analysis, or empty.",
        )
    articles = await sources.fetch_crypto_news_fa(limit=limit, category=category)
    return {
        "count": len(articles),
        "lang": "fa",
        "sources_configured": {
            "rss_fa": [
                {"source": n, "category": c, "url": u}
                for n, u, c in sources.NEWS_FEEDS_FA
            ],
        },
        "articles": articles,
        "fetched_at": datetime.now(timezone.utc).isoformat(),
    }


# --------------------------------------------------------------------------- #
#  Telegram Channel Feed — public web preview (no bot token needed)
# --------------------------------------------------------------------------- #
@app.get("/telegram")
async def get_telegram(channel: str = "Mastersharkcrypto", limit: int = 20):
    """Fetch recent messages from a public Telegram channel via t.me/s/.

    Default channel: Mastersharkcrypto (the user's requested channel).
    Works for any public channel — no API key or bot token required.

    Channel must be a valid Telegram username: starts with a letter,
    alphanumeric + underscore, 5-32 chars.
    """
    # TE-1 fix: validate channel format — prevents path traversal,
    # query injection, and control characters.
    import re
    ch = (channel or "").strip()
    if not re.match(r"^[a-zA-Z][a-zA-Z0-9_]{4,31}$", ch):
        raise HTTPException(
            status_code=422,
            detail=f"Invalid channel format: {channel!r}. Must be 5-32 chars, "
                   f"start with a letter, alphanumeric + underscore only.",
        )
    # TE-2 fix: validate limit — negative causes Python slice footgun
    if limit < 1:
        limit = 1
    elif limit > 100:
        limit = 100
    data = await sources.fetch_telegram_channel(ch, limit=limit)
    return data


# --------------------------------------------------------------------------- #
#  CMC Pro exclusive data — airdrops, categories, exchanges
# --------------------------------------------------------------------------- #
# These endpoints surface data that is ONLY available with a CMC Pro API key.
# When no key is configured, they return a clear "cmc_pro_required" flag so the
# frontend can show an upgrade prompt instead of empty data.

@app.get("/cmc/airdrops")
async def get_cmc_airdrops(limit: int = 50, status: str = "ONGOING"):
    """Fetch cryptocurrency airdrops (CMC Pro exclusive).

    Status: ONGOING | UPCOMING | ENDED
    Returns cmc_pro_required=True when no API key is set.
    Returns plan_not_supported=True when the key's plan doesn't include airdrops (403).
    """
    if not sources.is_cmc_available():
        return {"cmc_pro_required": True, "airdrops": [], "count": 0,
                "message": "Set CMC_API_KEY env var to unlock airdrop data"}
    try:
        airdrops = await sources.fetch_cmc_airdrops(limit=limit, status=status)
    except sources.CmcPlanNotSupported:
        return {"plan_not_supported": True, "airdrops": [], "count": 0,
                "message": "Your CMC API key plan doesn't support the airdrops endpoint. Upgrade to a higher tier."}
    return {"airdrops": airdrops or [], "count": len(airdrops or []),
            "status_filter": status, "fetched_at": datetime.now(timezone.utc).isoformat()}


@app.get("/cmc/categories")
async def get_cmc_categories():
    """Fetch CMC cryptocurrency categories with market cap (CMC Pro exclusive).

    Returns cmc_pro_required=True when no API key is set.
    Returns plan_not_supported=True when the key's plan doesn't include this endpoint (403).
    """
    if not sources.is_cmc_available():
        return {"cmc_pro_required": True, "categories": [], "count": 0,
                "message": "Set CMC_API_KEY env var to unlock category data"}
    try:
        cats = await sources.fetch_cmc_categories()
    except sources.CmcPlanNotSupported:
        return {"plan_not_supported": True, "categories": [], "count": 0,
                "message": "Your CMC API key plan doesn't support the categories endpoint. Upgrade to a higher tier."}
    return {"categories": cats or [], "count": len(cats or []),
            "fetched_at": datetime.now(timezone.utc).isoformat()}


@app.get("/cmc/exchanges")
async def get_cmc_exchanges(limit: int = 50):
    """Fetch top exchanges ranked by volume (CMC Pro exclusive).

    Returns cmc_pro_required=True when no API key is set.
    Returns plan_not_supported=True when the key's plan doesn't include this endpoint (403).
    """
    if not sources.is_cmc_available():
        return {"cmc_pro_required": True, "exchanges": [], "count": 0,
                "message": "Set CMC_API_KEY env var to unlock exchange rankings"}
    try:
        exchanges = await sources.fetch_cmc_exchange_map(limit=limit)
    except sources.CmcPlanNotSupported:
        return {"plan_not_supported": True, "exchanges": [], "count": 0,
                "message": "Your CMC API key plan doesn't support the exchanges endpoint. Upgrade to a higher tier."}
    return {"exchanges": exchanges or [], "count": len(exchanges or []),
            "fetched_at": datetime.now(timezone.utc).isoformat()}


@app.get("/cmc/global-metrics")
async def get_cmc_global_metrics():
    """Fetch global crypto market metrics from CMC Pro (cross-verification).

    Provides CMC's own BTC dominance, total mcap, and 24h volume — used to
    cross-verify CoinGecko's global data. Available with Basic plan.
    Returns cmc_pro_required=True when no API key is set.
    Returns plan_not_supported=True when the key's plan doesn't include this endpoint (403).
    """
    if not sources.is_cmc_available():
        return {"cmc_pro_required": True, "metrics": None,
                "message": "Set CMC_API_KEY env var to unlock CMC global metrics"}
    try:
        metrics = await sources.fetch_cmc_global_metrics()
    except sources.CmcPlanNotSupported:
        return {"plan_not_supported": True, "metrics": None,
                "message": "Your CMC API key plan doesn't support the global-metrics endpoint. Upgrade to a higher tier."}
    return {"metrics": metrics, "fetched_at": datetime.now(timezone.utc).isoformat()}


# --------------------------------------------------------------------------- #
#  Dune Analytics — On-Chain Data (Grade A Evidence)
# --------------------------------------------------------------------------- #
# Dune provides data directly from blockchain transactions — the most reliable
# source in the pipeline. Requires DUNE_API_KEY (free at dune.com/api-keys).

@app.get("/dune/query/{query_id}")
async def get_dune_query(query_id: str, limit: int = 100):
    """Fetch cached results from any Dune query by ID.

    Browse https://dune.com/browse to find query IDs.
    Returns dune_pro_required=True when no API key is set.

    `limit` must be between 1 and 1000. Negative limits cause Python slicing
    to return unexpected slices (e.g. rows[:-5] = 'all but last 5');
    clamped here to prevent silent data truncation.
    """
    if not sources.is_dune_available():
        return {"dune_pro_required": True, "rows": [], "row_count": 0,
                "message": "Set DUNE_API_KEY env var (free at dune.com/api-keys) to unlock on-chain data"}
    # Validate limit — rows[:limit] with negative limit returns unexpected slices
    if limit < 1:
        limit = 1
    elif limit > 1000:
        limit = 1000
    data = await sources.fetch_dune_query_results(query_id, limit=limit)
    if data is None:
        return {"rows": [], "row_count": 0, "message": "Query returned no data or failed"}
    return data


@app.post("/dune/execute/{query_id}")
async def execute_dune_query(query_id: str, params: dict | None = None):
    """Execute a Dune query with parameters and fetch fresh results.

    Body: {"token_symbol": "ETH", ...}  (params passed directly, NOT wrapped)

    Returns dune_pro_required=True when no API key is set.
    """
    if not sources.is_dune_available():
        return {"dune_pro_required": True, "rows": [], "row_count": 0,
                "message": "Set DUNE_API_KEY env var (free at dune.com/api-keys)"}
    data = await sources.fetch_dune_execute(query_id, params=params or {})
    if data is None:
        return {"rows": [], "row_count": 0, "message": "Execution failed or timed out"}
    return data


@app.get("/dune/insights/{symbol}")
async def get_dune_insights(symbol: str):
    """Fetch pre-configured on-chain insights for a token/protocol.

    Returns token concentration, real revenue, and active users from Dune
    (when the corresponding DUNE_QUERY_* env vars are configured).

    This is the endpoint that upgrades the evidence pipeline to Grade A.
    """
    if not sources.is_dune_available():
        return {"dune_pro_required": True, "message": "Set DUNE_API_KEY env var (free at dune.com/api-keys)"}
    import asyncio as _aio
    # Fetch all available insights in parallel
    results = await _aio.gather(
        sources.fetch_dune_token_concentration(symbol),
        sources.fetch_dune_real_revenue(symbol),
        sources.fetch_dune_active_users(symbol),
        return_exceptions=True,
    )
    return {
        "symbol": symbol,
        "token_concentration": results[0] if isinstance(results[0], dict) else None,
        "real_revenue": results[1] if isinstance(results[1], dict) else None,
        "active_users": results[2] if isinstance(results[2], dict) else None,
        "config": sources.dune_config_info(),
        "fetched_at": datetime.now(timezone.utc).isoformat(),
    }


# --------------------------------------------------------------------------- #
#  CoinGecko enhanced endpoints (price charts, OHLC, new coins, categories)
# --------------------------------------------------------------------------- #
def _validate_gecko_id(gecko_id: str) -> str:
    """Validate gecko_id format — lowercase alphanumeric + hyphens only.

    CoinGecko IDs are like 'bitcoin', 'usd-coin', 'binancecoin'.
    Reject anything that could cause malformed API calls or be a
    path-injection vector. Returns the validated (stripped+lowered) ID.
    Raises HTTPException(422) if invalid.
    """
    gid = (gecko_id or "").strip().lower()
    if not gid or not all(c.isalnum() or c == "-" for c in gid):
        raise HTTPException(422, f"invalid gecko_id format: {gecko_id!r} (expected lowercase alphanumeric + hyphens)")
    return gid


@app.get("/coingecko/chart/{gecko_id}")
async def get_price_chart(gecko_id: str, days: int = 7):
    """Fetch historical price chart (sparkline) for a coin.

    `days` must be 1-365. CoinGecko accepts max=365 for free tier.
    Returns empty prices array on rate-limit (graceful degradation) so
    the frontend can show 'chart unavailable' without a thrown error.
    """
    gid = _validate_gecko_id(gecko_id)
    # Validate days — CoinGecko chart endpoint accepts 1-365
    if days < 1:
        days = 1
    elif days > 365:
        days = 365
    data = await sources.fetch_price_chart(gid, days=days)
    if data is None:
        # Return empty structure instead of error — frontend handles
        # empty prices array gracefully (shows 'chart unavailable' badge)
        # without throwing a console error.
        return {
            "gecko_id": gid,
            "days": days,
            "prices": [],
            "market_caps": [],
            "total_volumes": [],
            "note": "Chart data unavailable (rate-limited or no data)",
        }
    return data


@app.get("/coingecko/ohlc/{gecko_id}")
async def get_ohlc(gecko_id: str, days: int = 7):
    """Fetch OHLC candlestick data for a coin.

    CoinGecko OHLC endpoint accepts ONLY these values for `days`:
    1, 7, 14, 30, 90, 180, 360. Any other value causes a 400 error.
    We clamp to the nearest allowed value to avoid silent failures.
    """
    gid = _validate_gecko_id(gecko_id)
    # CoinGecko OHLC only accepts: 1, 7, 14, 30, 90, 180, 360
    allowed_ohlc_days = [1, 7, 14, 30, 90, 180, 360]
    if days not in allowed_ohlc_days:
        # Clamp to nearest allowed value
        days = min(allowed_ohlc_days, key=lambda x: abs(x - days))
    data = await sources.fetch_ohlc(gid, days=days)
    if data is None:
        return {"error": "OHLC data unavailable"}
    return {"gecko_id": gid, "days": days, "candles": data, "count": len(data)}


@app.get("/coingecko/new-coins")
async def get_new_coins():
    """Fetch recently listed coins from CoinGecko."""
    data = await sources.fetch_new_coins()
    return {"coins": data or [], "count": len(data or [])}


@app.get("/coingecko/categories")
async def get_coingecko_categories():
    """Fetch CoinGecko coin categories (free, different from CMC)."""
    data = await sources.fetch_coingecko_categories()
    return {"categories": data or [], "count": len(data or [])}


# --------------------------------------------------------------------------- #
#  Binance — live price ticker (free, no API key)
# --------------------------------------------------------------------------- #
@app.get("/binance/price/{symbol}")
async def get_binance_price(symbol: str):
    """Fetch live 24h price ticker from Binance (free, no API key).

    Args:
        symbol: trading symbol without quote suffix (e.g. "BTC", "ETH").
                The backend appends "USDT" (or "USDC" as fallback).

    Returns: {symbol, price, change_24h_pct, high_24h, low_24h,
              volume_24h, source: "Binance"}
    """
    sym = (symbol or "").strip().upper()
    if not sym or not all(c.isalnum() for c in sym):
        raise HTTPException(422, f"invalid symbol format: {symbol!r}")
    data = await sources.fetch_binance_ticker(sym)
    if data is None:
        return {"error": f"No Binance market found for {sym}USDT or {sym}USDC"}
    return data


# --------------------------------------------------------------------------- #
#  System Health Check — validates data pipeline integrity
# --------------------------------------------------------------------------- #
# This endpoint scans the top coins and checks for data quality issues:
#   - Coins with TVL=$0 that should have TVL (blockchain tokens)
#   - Missing fee data from DeFiLlama
#   - Missing holder data from CMC Keyless
#   - API source availability
# Designed to be called by a background scheduler every 30 minutes.

@app.get("/system/health-check")
async def system_health_check():
    """Validate data pipeline integrity across all sources.

    Checks the top 20 coins by market cap for:
    - TVL data availability (blockchain tokens should have chain TVL)
    - Fee data availability (DeFi protocols should have fees)
    - CMC Keyless data availability (holders, audits)
    - Cross-verification between CoinGecko and CMC

    Returns a detailed report of any data gaps found.
    """
    import asyncio as _aio
    report = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "sources": {},
        "data_gaps": [],
        "blockchain_detection": {},
        "summary": {},
    }

    # 1) Check source availability
    sources_status = {
        "coingecko": False,
        "defillama": False,
        "cmc_keyless": False,
        "cmc_pro": sources.is_cmc_available(),
        "dune": sources.is_dune_available(),
    }

    # Test CoinGecko
    markets: list[dict] = []  # initialize BEFORE try so UnboundLocalError is impossible
    try:
        markets = await sources.fetch_top_markets_extended(per_page=20)
        sources_status["coingecko"] = len(markets) > 0
    except asyncio.CancelledError:
        raise
    except Exception:  # noqa: BLE001
        pass

    # Test DeFiLlama
    protos: list[dict] = []  # initialize BEFORE try so UnboundLocalError is impossible
    try:
        protos = await sources.fetch_defillama_protocols()
        sources_status["defillama"] = len(protos) > 0
    except asyncio.CancelledError:
        raise
    except Exception:  # noqa: BLE001
        pass

    # Test CMC Keyless
    try:
        kl = await sources.fetch_cmc_keyless_by_symbol("BTC")
        sources_status["cmc_keyless"] = kl is not None and kl.get("name") is not None
    except asyncio.CancelledError:
        raise
    except Exception:  # noqa: BLE001
        pass

    report["sources"] = sources_status

    # 2) Sync chain mapping
    await sources._sync_chain_mapping()
    chain_sym_count = len(sources._CHAIN_SYMBOL_CACHE or {})
    chain_name_count = len(sources._CHAIN_NAME_CACHE or {})
    report["blockchain_detection"] = {
        "auto_synced_symbols": chain_sym_count,
        "auto_synced_names": chain_name_count,
        "manual_overrides": len(sources._BLOCKCHAIN_TO_CHAIN),
    }

    # 3) Check top 20 coins for data gaps
    if markets and protos:
        fees_list = await sources.fetch_fees_overview()
        fees_by_sym: dict[str, list[dict]] = {}
        for f in fees_list:
            sym = (f.get("symbol") or "").upper()
            if sym:
                fees_by_sym.setdefault(sym, []).append(f)

        for m in markets[:20]:
            sym = (m.get("symbol") or "").upper()
            name = m.get("name") or ""
            mc = m.get("market_cap") or 0
            if mc < 1_000_000_000:  # Only check $1B+ coins
                continue

            issues = []

            # Check TVL
            chain = sources.is_blockchain_token(sym, name)
            if chain:
                chain_data = await sources.fetch_defillama_chain_tvl(chain, protos)
                tvl = (chain_data or {}).get("tvl") or 0
                if tvl == 0:
                    issues.append(f"Blockchain token but TVL=$0 (chain={chain})")
            else:
                # Check if it's a DeFi protocol with TVL
                llama_match = sources.match_llama_protocol(sym, name, protos)
                if llama_match and (llama_match.get("tvl") or 0) == 0:
                    issues.append("DeFi protocol with TVL=$0")

            # Check fees (for DeFi protocols)
            if sym in fees_by_sym:
                best_fees = max(fees_by_sym[sym], key=lambda x: x.get("fees_24h") or 0)
                if (best_fees.get("fees_24h") or 0) == 0:
                    issues.append("Has fee entry but fees_24h=$0")

            # Check CMC Keyless
            try:
                kl = await sources.fetch_cmc_keyless_by_symbol(sym)
                if not kl or not kl.get("name"):
                    issues.append("CMC Keyless: no data (slug mismatch)")
            except asyncio.CancelledError:
                raise
            except Exception:  # noqa: BLE001
                issues.append("CMC Keyless: fetch failed")

            if issues:
                report["data_gaps"].append({
                    "symbol": sym,
                    "name": name,
                    "market_cap": mc,
                    "issues": issues,
                })

    # 4) Summary
    coins_checked_count = min(len(markets), 20) if markets else 0
    report["summary"] = {
        "sources_online": sum(1 for v in sources_status.values() if v),
        "sources_total": len(sources_status),
        "coins_checked": coins_checked_count,  # actual count, not gaps+20
        "data_gaps_found": len(report["data_gaps"]),
        "blockchain_tokens_detectable": chain_sym_count,
        "status": "healthy" if len(report["data_gaps"]) <= 3 else "needs_attention",
    }

    return report


# ========================================================================== #
#  Settings management — API keys + news sources (Task: settings-page)
# ========================================================================== #
# This block exposes:
#   GET    /settings
#   POST   /settings/api-keys
#   DELETE /settings/api-keys/{key_name}
#   POST   /settings/news-sources
#   DELETE /settings/news-sources/{name}
#   POST   /settings/test-api-key/{key_name}
#
# All responses mask API key values (****XXXX — last 4 chars only).
# Raw values are NEVER returned, NEVER logged.
#
# Storage: settings.json (gitignored). The settings_store module loads
# it on import and applies enabled keys to os.environ so that the
# existing data layer (`from data import sources`) picks them up at
# scanner startup.

# --- Pydantic request models --------------------------------------------- #

class ApiKeyUpsertRequest(BaseModel):
    """Add or update an API key entry in settings.json.

    `key_type` is informational (free | keyed | manual) and controls how
    the UI presents the row; it does NOT change runtime behaviour.
    `key_value` is required for add/update but optional on test (use
    the stored value when omitted).
    """
    key_name: str
    key_value: str = ""
    enabled: bool = True
    key_type: str = "keyed"


class NewsSourceUpsertRequest(BaseModel):
    """Add or update a news source (RSS feed or Telegram channel)."""
    name: str
    url: str
    source_type: str = "rss"  # "rss" | "telegram"
    enabled: bool = True


class TestApiKeyRequest(BaseModel):
    """Optional body for the test-api-key endpoint. If `key_value` is
    provided, it overrides the stored value (useful for testing a key
    before saving it). Otherwise the currently stored value is used."""
    key_value: str | None = None


# --- Helpers -------------------------------------------------------------- #

# Allowed news-source types (strict allowlist — prevents typos like "tg").
_ALLOWED_SOURCE_TYPES = {"rss", "telegram"}


def _validate_key_name(key_name: str) -> str:
    """Reject anything that's not in our known API keys list."""
    known = {name for name, *_ in settings_store.list_known_api_keys()}
    if key_name not in known:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown API key name: {key_name}. Supported: {sorted(known)}",
        )
    return key_name


def _build_api_keys_view(raw_keys: dict) -> list[dict]:
    """Transform the on-disk api_keys dict into the masked GET response list.

    Always includes EVERY known API key, even if "Not configured" — this
    matches the "Never guess missing data" principle: the UI can always
    show all configurable keys with their real status.
    """
    known = settings_store.list_known_api_keys()
    view: list[dict] = []
    for env_name, default_type, label, description in known:
        entry = raw_keys.get(env_name) or {}
        value = str(entry.get("value") or "")
        enabled = bool(entry.get("enabled"))
        key_type = str(entry.get("type") or default_type)
        view.append({
            "key_name": env_name,
            "label": label,
            "description": description,
            "masked_value": settings_store.mask_value(value),
            "has_value": bool(value),
            "enabled": enabled,
            "type": key_type,
            "active": bool(value and enabled),
        })
    return view


# --- Endpoints ------------------------------------------------------------ #

@app.get("/settings")
async def get_settings():
    """Return the current settings.

    API key values are MASKED — only the last 4 characters are shown.
    News sources are returned in full (URLs are not secret).
    """
    settings = settings_store.load()
    return {
        "api_keys": _build_api_keys_view(settings.get("api_keys", {})),
        "news_sources": settings.get("news_sources", []),
        "supported_api_keys": [
            {"key_name": name, "label": label, "description": desc,
             "default_type": ktype}
            for name, ktype, label, desc in settings_store.list_known_api_keys()
        ],
    }


@app.post("/settings/api-keys")
async def upsert_api_key(req: ApiKeyUpsertRequest):
    """Add or update an API key entry.

    - If `key_value` is empty, the existing value is preserved (only the
      `enabled` flag / `key_type` are updated).
    - If `key_value` is non-empty, it OVERWRITES the stored value.
    """
    key_name = _validate_key_name(req.key_name)
    # Validate key_type against a small allowlist (free|keyed|manual)
    if req.key_type not in {"free", "keyed", "manual"}:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid key_type: {req.key_type!r}. Must be free|keyed|manual.",
        )
    settings = settings_store.load()
    api_keys = settings.setdefault("api_keys", {})
    entry = api_keys.get(key_name) or {}
    new_value = req.key_value if req.key_value else str(entry.get("value") or "")
    api_keys[key_name] = {
        "value": new_value,
        "enabled": bool(req.enabled),
        "type": req.key_type,
    }
    settings_store.save(settings)
    log.info("API key %s updated (enabled=%s, has_value=%s, type=%s)",
             key_name, req.enabled, bool(new_value), req.key_type)
    return {
        "ok": True,
        "key_name": key_name,
        "masked_value": settings_store.mask_value(new_value),
        "enabled": bool(req.enabled),
        "type": req.key_type,
    }


@app.delete("/settings/api-keys/{key_name}")
async def delete_api_key(key_name: str):
    """Remove an API key from settings.json.

    Note: this only removes the value from settings.json. If the same key
    is also set via .env / shell, the env value remains in effect until
    the next process restart (env takes precedence per settings_store.apply_to_env).
    """
    _validate_key_name(key_name)
    settings = settings_store.load()
    api_keys = settings.get("api_keys", {})
    if key_name in api_keys:
        # Clear the value but keep the entry (so the UI still shows the row).
        api_keys[key_name]["value"] = ""
        api_keys[key_name]["enabled"] = False
        settings_store.save(settings)
        log.info("API key %s removed", key_name)
        return {"ok": True, "key_name": key_name, "removed": True}
    # Key was not configured — return removed=False so the frontend can inform
    # the user that there was nothing to delete (avoids silent no-op).
    return {"ok": True, "key_name": key_name, "removed": False}


@app.post("/settings/news-sources")
async def upsert_news_source(req: NewsSourceUpsertRequest):
    """Add or update a news source. Existing sources with the same `name`
    are updated in-place (URL / type / enabled)."""
    if req.source_type not in _ALLOWED_SOURCE_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid source_type: {req.source_type!r}. Must be rss|telegram.",
        )
    if not req.name.strip():
        raise HTTPException(status_code=400, detail="name is required")
    if not req.url.strip():
        raise HTTPException(status_code=400, detail="url is required")
    # URL scheme validation — prevent stored XSS via javascript: URLs
    # rendered as <a href> in the frontend news sources table.
    import urllib.parse as _urlparse
    parsed = _urlparse.urlparse(req.url.strip())
    if parsed.scheme not in ("http", "https"):
        raise HTTPException(
            status_code=400,
            detail=f"URL must start with http:// or https:// (got scheme: {parsed.scheme!r})",
        )
    settings = settings_store.load()
    sources_list = settings.setdefault("news_sources", [])
    # Find existing by name (case-insensitive)
    name_lower = req.name.strip().lower()
    existing = None
    for s in sources_list:
        if str(s.get("name", "")).strip().lower() == name_lower:
            existing = s
            break
    payload = {
        "name": req.name.strip(),
        "url": req.url.strip(),
        "type": req.source_type,
        "enabled": bool(req.enabled),
    }
    if existing is None:
        sources_list.append(payload)
    else:
        existing.update(payload)
    settings_store.save(settings)
    log.info("News source %r updated (type=%s, enabled=%s)",
             req.name, req.source_type, req.enabled)
    return {"ok": True, "source": payload}


@app.delete("/settings/news-sources/{name}")
async def delete_news_source(name: str):
    """Remove a news source by name (case-insensitive)."""
    settings = settings_store.load()
    sources_list = settings.get("news_sources", [])
    name_lower = name.strip().lower()
    before = len(sources_list)
    settings["news_sources"] = [
        s for s in sources_list
        if str(s.get("name", "")).strip().lower() != name_lower
    ]
    if len(settings["news_sources"]) != before:
        settings_store.save(settings)
        log.info("News source %r removed", name)
    return {"ok": True, "name": name}


@app.post("/settings/test-api-key/{key_name}")
async def test_api_key(key_name: str, req: TestApiKeyRequest | None = None):
    """Test if an API key works by making a real upstream API call.

    Returns {valid: bool, message: str, status_code: int|null}.

    The test does NOT log the key value. It returns a human-readable
    message indicating success or the specific failure reason.

    Supported keys:
      - CMC_API_KEY        → CoinMarketCap Pro /v1/cryptocurrency/listings/latest?limit=1
      - DUNE_API_KEY       → Dune API /health (lightweight, no quota consumed)
      - COINGECKO_API_KEY  → CoinGecko /ping (lightweight, no quota consumed)
      - CRYPTOPANIC_TOKEN  → CryptoPanic /api/v1/posts/?limit=1
      - CRYPTOCOMPARE_KEY  → CryptoCompare /data/v2/news/?feeds=abc
    """
    _validate_key_name(key_name)
    # If a key_value is provided in the body, use it (lets users test
    # before saving). Otherwise use the stored value.
    if req and req.key_value:
        value = req.key_value
    else:
        value = settings_store.get_api_key_value(key_name)
    if not value:
        return {
            "valid": False,
            "message": "Key is not configured. Set a value first.",
            "status_code": None,
        }
    import httpx
    tests = {
        "CMC_API_KEY": {
            "url": "https://pro-api.coinmarketcap.com/v1/cryptocurrency/listings/latest",
            "params": {"limit": 1, "convert": "USD"},
            "headers": {"X-CMC_Pro_API_Key": value, "Accept": "application/json"},
            "ok_codes": {200},
        },
        "DUNE_API_KEY": {
            # /health doesn't require auth — use /api/v1/queries endpoint instead.
            "url": "https://api.dune.com/api/v1/queries",
            "params": {"page": 1, "page_size": 1},
            "headers": {"x-dune-api-key": value},
            "ok_codes": {200, 400, 422},  # 400/422 with valid auth = key OK
        },
        "COINGECKO_API_KEY": {
            "url": "https://api.coingecko.com/api/v3/ping",
            "params": {},
            "headers": {"x-cg-demo-api-key": value, "accept": "application/json"},
            "ok_codes": {200},
        },
        "CRYPTOPANIC_TOKEN": {
            "url": "https://cryptopanic.com/api/v1/posts/",
            "params": {"auth_token": value, "kind": "news", "page": 1},
            "headers": {},
            "ok_codes": {200},
        },
        "CRYPTOCOMPARE_KEY": {
            "url": "https://min-api.cryptocompare.com/data/v2/news/",
            "params": {"feeds": "cryptocompare", "lang": "EN"},
            "headers": {"authorization": f"Apikey {value}"},
            "ok_codes": {200},
        },
    }
    spec = tests.get(key_name)
    if not spec:
        return {"valid": False, "message": f"No test available for {key_name}",
                "status_code": None}
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.get(
                spec["url"], params=spec["params"], headers=spec["headers"],
            )
        ok = r.status_code in spec["ok_codes"]
        # NEVER log r.text — it might contain hints. Just status code.
        if ok:
            msg = f"OK — upstream returned HTTP {r.status_code} (key accepted)."
        else:
            # Map common failure codes to actionable messages
            sc = r.status_code
            if sc == 401 or sc == 403:
                msg = f"Invalid key — upstream returned HTTP {sc} (authentication failed)."
            elif sc == 429:
                msg = f"Rate-limited — HTTP {sc}. The key may be valid but the upstream is throttling us."
            else:
                msg = f"Upstream returned HTTP {sc}. Key may be invalid or the service is unavailable."
        return {"valid": ok, "message": msg, "status_code": r.status_code}
    except httpx.TimeoutException:
        return {"valid": False,
                "message": "Timed out connecting to upstream API. The key was not verified.",
                "status_code": None}
    except httpx.HTTPError as exc:
        return {"valid": False,
                "message": f"Network error: {exc.__class__.__name__}.",
                "status_code": None}
    except asyncio.CancelledError:
        raise
    except Exception as exc:  # noqa: BLE001
        return {"valid": False,
                "message": f"Test failed: {exc.__class__.__name__}.",
                "status_code": None}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=3003, reload=False, log_level="info")
