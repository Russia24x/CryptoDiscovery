"""
Data source integrations — public, no-API-key endpoints.

Uses:
  - CoinGecko public API  (prices, market cap, supply, volume)
  - DeFiLlama public API  (TVL, fees, revenue, protocol metadata)

All network calls go through httpx with a sane timeout and graceful
degradation: if a source is unreachable, we return None-shaped payloads
so the framework can still run (with lower confidence).
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any

import httpx

log = logging.getLogger("scanner.sources")

COINGECKO_BASE = "https://api.coingecko.com/api/v3"
DEFILLAMA_BASE = "https://api.llama.fi"
DEFILLAMA_PROTOCOLS = "https://api.llama.fi/protocols"
DEFILLAMA_FEES = "https://api.llama.fi/overview/fees"
DEFILLAMA_STABLECOINS = "https://api.llama.fi/stablecoins"

TIMEOUT = 15.0


# --------------------------------------------------------------------------- #
#  Low-level fetchers
# --------------------------------------------------------------------------- #
async def _get_json(client: httpx.AsyncClient, url: str, **params: Any) -> Any:
    try:
        r = await client.get(url, params=params, timeout=TIMEOUT)
        if r.status_code != 200:
            log.warning("GET %s -> %s", url, r.status_code)
            return None
        return r.json()
    except Exception as exc:  # noqa: BLE001
        log.warning("GET %s failed: %s", url, exc)
        return None


# --------------------------------------------------------------------------- #
#  DeFiLlama
# --------------------------------------------------------------------------- #
async def fetch_defillama_protocols() -> list[dict[str, Any]]:
    """Full protocol list with TVL, chain, category — slimmed to needed fields."""
    async with httpx.AsyncClient() as c:
        data = await _get_json(c, DEFILLAMA_PROTOCOLS)
    if not isinstance(data, list):
        return []
    # keep only the fields we actually use, to bound memory
    keep = ("name", "symbol", "slug", "tvl", "chain", "category",
            "description", "parentProtocol", "audit_links", "hallmarks",
            "governance", "methodology", "methodologyURL")
    slim: list[dict[str, Any]] = []
    for p in data:
        slim.append({k: p.get(k) for k in keep})
    return slim


async def fetch_protocol_detail(slug: str) -> dict[str, Any] | None:
    """Per-protocol TVL history & metadata."""
    async with httpx.AsyncClient() as c:
        return await _get_json(c, f"{DEFILLAMA_BASE}/protocol/{slug}")


async def fetch_fees_overview() -> list[dict[str, Any]]:
    """Protocols with fees/revenue (24h, 7d, 30d, cumulative) — slimmed."""
    async with httpx.AsyncClient() as c:
        data = await _get_json(c, DEFILLAMA_FEES)
    if not isinstance(data, list):
        return []
    keep = ("name", "slug", "id", "symbol", "category",
            "fees_24h", "revenue_24h", "fees_7d", "revenue_7d",
            "fees_30d", "revenue_30d")
    slim: list[dict[str, Any]] = []
    for p in data:
        slim.append({k: p.get(k) for k in keep})
    return slim


async def fetch_protocol_fees(slug: str) -> dict[str, Any] | None:
    """Detailed fees/revenue breakdown for one protocol."""
    async with httpx.AsyncClient() as c:
        return await _get_json(c, f"{DEFILLAMA_FEES}/{slug}")


# --------------------------------------------------------------------------- #
#  CoinGecko (markets endpoint — no key required)
# --------------------------------------------------------------------------- #
async def fetch_top_markets(vs: str = "usd", per_page: int = 100, pages: int = 1) -> list[dict[str, Any]]:
    """
    Fetch top markets by market cap. CoinGecko free tier is heavily
    rate-limited; we fetch a single page and gracefully fall back to
    DeFiLlama-only discovery when it 429s.
    """
    out: list[dict[str, Any]] = []
    async with httpx.AsyncClient() as c:
        for page in range(1, pages + 1):
            data = await _get_json(
                c,
                f"{COINGECKO_BASE}/coins/markets",
                vs_currency=vs,
                order="market_cap_desc",
                per_page=per_page,
                page=page,
                sparkline="false",
                price_change_percentage="24h,7d,30d",
            )
            if not isinstance(data, list):
                break
            out.extend(data)
            if len(data) < per_page:
                break
            # be polite to the public endpoint
            await asyncio.sleep(0.4)
    return out


async def fetch_coin_detail(gecko_id: str) -> dict[str, Any] | None:
    """Full coin detail incl. market_data, tokenomics, links."""
    async with httpx.AsyncClient() as c:
        return await _get_json(
            c,
            f"{COINGECKO_BASE}/coins/{gecko_id}",
            localization="false",
            tickers="false",
            market_data="true",
            community_data="false",
            developer_data="false",
            sparkline="false",
        )


# --------------------------------------------------------------------------- #
#  Convenience: link CoinGecko coin -> DeFiLlama protocol
# --------------------------------------------------------------------------- #
def match_llama_protocol(
    gecko_symbol: str,
    gecko_name: str,
    llama_protocols: list[dict[str, Any]],
) -> dict[str, Any] | None:
    """Best-effort match of a CoinGecko coin to a DeFiLlama protocol by symbol/name."""
    sym = (gecko_symbol or "").upper()
    nm = (gecko_name or "").lower()
    for p in llama_protocols:
        psym = (p.get("symbol") or "").upper()
        pname = (p.get("name") or "").lower()
        if sym and psym == sym:
            return p
        if nm and pname and (nm in pname or pname in nm):
            return p
    return None


def match_fees_protocol(
    llama_slug: str | None,
    llama_name: str | None,
    fees_list: list[dict[str, Any]],
) -> dict[str, Any] | None:
    if llama_slug:
        for f in fees_list:
            if f.get("slug") == llama_slug or f.get("id") == llama_slug:
                return f
    if llama_name:
        n = llama_name.lower()
        for f in fees_list:
            fn = (f.get("name") or "").lower()
            if fn and (fn == n or n in fn or fn in n):
                return f
    return None
