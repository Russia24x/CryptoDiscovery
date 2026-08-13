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
from typing import Optional

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
from framework import analysis, discovery, evidence

# --------------------------------------------------------------------------- #
#  Logging
# --------------------------------------------------------------------------- #
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
log = logging.getLogger("scanner")

# --------------------------------------------------------------------------- #
#  In-memory stores (good enough for a single-instance analysis tool)
# --------------------------------------------------------------------------- #
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

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
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


# --------------------------------------------------------------------------- #
#  Health
# --------------------------------------------------------------------------- #
@app.get("/health")
async def health():
    return {
        "status": "ok",
        "service": "crypto-scanner",
        "framework_version": "1.0.0",
        "scans_total": len(SCANS),
        "reports_total": len(REPORTS),
        "timestamp": datetime.now(timezone.utc).isoformat(),
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
    if report_id not in REPORTS:
        raise HTTPException(404, "project report not found")
    return REPORTS[report_id].model_dump(mode="json")


@app.get("/projects")
async def all_projects(limit: int = 50):
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

    except Exception as exc:  # noqa: BLE001
        log.exception("Scan %s failed: %s", scan_id, exc)
        progress.status = ScanStatus.FAILED
        progress.error = str(exc)
        progress.finished_at = datetime.now(timezone.utc)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=3003, reload=False, log_level="info")
