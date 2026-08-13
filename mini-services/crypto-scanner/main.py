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
from data import sources

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
    lang: str = "en"  # "en" or "fa" — controls language of generated text


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


# --------------------------------------------------------------------------- #
#  Manual coin search & single-coin analysis (Coin Explorer)
# --------------------------------------------------------------------------- #
@app.get("/search")
async def search_coins(q: str = ""):
    """Search coins by name/symbol via CoinGecko."""
    results = await sources.search_coins(q)
    return {"query": q, "count": len(results), "results": results}


class AnalyzeRequest(BaseModel):
    gecko_id: str
    persona: Persona = Persona.INVESTOR
    lang: str = "en"


@app.post("/analyze")
async def analyze_single_coin(req: AnalyzeRequest):
    """Run the full 8-phase framework on a single coin selected by gecko_id.

    Reuses the same evidence + analysis pipeline as a scan, but for one coin.
    The resulting report is stored like any other and can be opened in the
    project detail view.
    """
    if not req.gecko_id:
        raise HTTPException(400, "gecko_id is required")
    log.info("Manual analyze: %s (persona=%s, lang=%s)", req.gecko_id, req.persona.value, req.lang)

    # Build a CandidateInfo from the CoinGecko coin detail
    detail = await sources.fetch_coin_detail(req.gecko_id)
    if not detail:
        raise HTTPException(404, f"coin '{req.gecko_id}' not found on CoinGecko (may be rate-limited)")

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
    # fees match by symbol then name
    fees_entry = None
    for f in fees_list:
        if (f.get("symbol") or "").upper() == symbol:
            fees_entry = f
            break
    if not fees_entry:
        nm = name.lower()
        for f in fees_list:
            fname = (f.get("name") or "").lower()
            if fname and (fname == nm or fname.startswith(nm + " ") or nm.startswith(fname + " ")):
                fees_entry = f
                break

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
    config = ScanConfig(persona=req.persona, lang=req.lang)
    report = analysis.build_report(cand, ev, config, scan_id="manual")
    REPORTS[report.id] = report
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
    """
    # Fire all independent fetches in parallel
    import asyncio as _aio
    results = await _aio.gather(
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

    # Gainers & losers by 24h change
    with_change = [
        m for m in markets
        if m.get("price_change_percentage_24h_in_currency") is not None
        and m.get("market_cap")
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
        "cached_at": datetime.now(timezone.utc).isoformat(),
    }


# --------------------------------------------------------------------------- #
#  Crypto News — multi-source aggregation
# --------------------------------------------------------------------------- #
@app.get("/news")
async def get_news(limit: int = 40, source: str = ""):
    """Aggregate crypto news from multiple RSS feeds + optional API-key sources.

    Query params:
      limit  — max articles to return (default 40)
      source — filter by source name (case-insensitive, e.g. "CoinDesk")
    """
    articles = await sources.fetch_crypto_news(limit=limit * 2 if source else limit)
    if source:
        s = source.lower()
        articles = [a for a in articles if s in (a.get("source") or "").lower()]
    articles = articles[:limit]
    return {
        "count": len(articles),
        "sources_configured": {
            "rss": [n for n, _ in sources.NEWS_FEEDS],
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
    """
    data = await sources.fetch_telegram_channel(channel, limit=limit)
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
    """
    if not sources.is_dune_available():
        return {"dune_pro_required": True, "rows": [], "row_count": 0,
                "message": "Set DUNE_API_KEY env var (free at dune.com/api-keys) to unlock on-chain data"}
    data = await sources.fetch_dune_query_results(query_id, limit=limit)
    if data is None:
        return {"rows": [], "row_count": 0, "message": "Query returned no data or failed"}
    return data


@app.post("/dune/execute/{query_id}")
async def execute_dune_query(query_id: str, params: dict | None = None):
    """Execute a Dune query with parameters and fetch fresh results.

    Body: {"params": {"token_symbol": "ETH", ...}}
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
@app.get("/coingecko/chart/{gecko_id}")
async def get_price_chart(gecko_id: str, days: int = 7):
    """Fetch historical price chart (sparkline) for a coin."""
    data = await sources.fetch_price_chart(gecko_id, days=days)
    if data is None:
        return {"error": "Chart data unavailable (may be rate-limited)"}
    return data


@app.get("/coingecko/ohlc/{gecko_id}")
async def get_ohlc(gecko_id: str, days: int = 7):
    """Fetch OHLC candlestick data for a coin."""
    data = await sources.fetch_ohlc(gecko_id, days=days)
    if data is None:
        return {"error": "OHLC data unavailable"}
    return {"gecko_id": gecko_id, "days": days, "candles": data, "count": len(data)}


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


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=3003, reload=False, log_level="info")
