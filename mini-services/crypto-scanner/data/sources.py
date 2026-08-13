"""
Data source integrations — multi-source with optional API key support.

Uses:
  - CoinGecko public API  (prices, market cap, supply, volume, links)
  - DeFiLlama public API  (TVL, fees, revenue, protocol metadata)
  - CoinMarketCap Pro API (optional, with key — cross-verification)

All network calls go through httpx with a sane timeout and graceful
degradation: if a source is unreachable, we return None-shaped payloads
so the framework can still run (with lower confidence).

CoinMarketCap API key is optional. If CMC_API_KEY environment variable
is set, CMC data is used for cross-verification of market cap, price,
and supply data, increasing confidence scores.
"""
from __future__ import annotations

import asyncio
import logging
import os
from typing import Any

import httpx

log = logging.getLogger("scanner.sources")

COINGECKO_BASE = "https://api.coingecko.com/api/v3"
DEFILLAMA_BASE = "https://api.llama.fi"
DEFILLAMA_PROTOCOLS = "https://api.llama.fi/protocols"
DEFILLAMA_FEES = "https://api.llama.fi/overview/fees"
DEFILLAMA_STABLECOINS = "https://api.llama.fi/stablecoins"

# CoinMarketCap Pro API (optional — requires API key)
CMC_PRO_BASE = "https://pro-api.coinmarketcap.com"
CMC_API_KEY = os.environ.get("CMC_API_KEY", "")
CMC_AVAILABLE = bool(CMC_API_KEY)

TIMEOUT = 15.0


# --------------------------------------------------------------------------- #
#  Low-level fetchers
# --------------------------------------------------------------------------- #
async def _get_json(client: httpx.AsyncClient, url: str, **params: Any) -> Any:
    try:
        r = await client.get(url, params=params, timeout=TIMEOUT)
        if r.status_code == 429:
            # Rate limited — wait and retry once
            log.warning("GET %s -> 429 (rate limited), retrying in 2s...", url)
            await asyncio.sleep(2)
            r = await client.get(url, params=params, timeout=TIMEOUT)
            if r.status_code != 200:
                log.warning("GET %s -> %s after retry", url, r.status_code)
                return None
        elif r.status_code != 200:
            log.warning("GET %s -> %s", url, r.status_code)
            return None
        return r.json()
    except (httpx.HTTPError, ValueError) as exc:  # network errors + JSON decode errors
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
            "governance", "methodology", "methodologyURL",
            "logo", "icon", "twitter", "github", "url")
    slim: list[dict[str, Any]] = []
    for p in data:
        slim.append({k: p.get(k) for k in keep})
    return slim


async def fetch_fees_overview() -> list[dict[str, Any]]:
    """Protocols with fees/revenue (24h, 7d, 30d, cumulative) — slimmed.

    The /overview/fees endpoint returns a dict with a 'protocols' key
    containing the list of protocol fee data. Field names are:
    total24h, total7d, total30d (NOT fees_24h etc.)
    """
    async with httpx.AsyncClient() as c:
        data = await _get_json(c, DEFILLAMA_FEES)
    # Handle both dict (new API) and list (old API) formats
    if isinstance(data, dict):
        protos = data.get("protocols", [])
    elif isinstance(data, list):
        protos = data
    else:
        return []
    # Map the actual DeFiLlama fee field names to our schema
    slim: list[dict[str, Any]] = []
    for p in protos:
        if not isinstance(p, dict):
            continue
        slim.append({
            "name": p.get("name") or p.get("displayName"),
            "slug": p.get("slug"),
            "id": str(p.get("defillamaId") or p.get("id") or ""),
            "symbol": p.get("symbol", ""),
            "category": p.get("category", ""),
            "fees_24h": p.get("total24h") or p.get("fees_24h"),
            "revenue_24h": p.get("revenue_24h"),
            "fees_7d": p.get("total7d") or p.get("fees_7d"),
            "revenue_7d": p.get("revenue_7d"),
            "fees_30d": p.get("total30d") or p.get("fees_30d"),
            "revenue_30d": p.get("revenue_30d"),
            "chains": p.get("chains", []),
        })
    return slim


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


# --------------------------------------------------------------------------- #
#  CoinMarketCap Pro API (optional — requires CMC_API_KEY env var)
# --------------------------------------------------------------------------- #

async def _cmc_get(client: httpx.AsyncClient, path: str, **params: Any) -> Any:
    """Fetch from CMC Pro API with API key header."""
    if not CMC_AVAILABLE:
        return None
    try:
        r = await client.get(
            f"{CMC_PRO_BASE}{path}",
            params=params,
            headers={"X-CMC_Pro_API_Key": CMC_API_KEY},
            timeout=TIMEOUT,
        )
        if r.status_code != 200:
            log.warning("CMC GET %s -> %s", path, r.status_code)
            return None
        return r.json()
    except (httpx.HTTPError, ValueError) as exc:
        log.warning("CMC GET %s failed: %s", path, exc)
        return None


async def fetch_cmc_quotes(symbols: list[str]) -> dict[str, dict[str, Any]] | None:
    """Fetch market data (price, MC, FDV, volume, supply) for multiple symbols.

    Returns dict keyed by symbol uppercase.
    """
    if not CMC_AVAILABLE or not symbols:
        return None
    sym_str = ",".join(symbols[:100])  # CMC allows up to 100 symbols
    async with httpx.AsyncClient() as c:
        data = await _cmc_get(c, "/v2/cryptocurrency/quotes/latest", symbol=sym_str, convert="USD")
    if not isinstance(data, dict) or "data" not in data:
        return None
    result: dict[str, dict[str, Any]] = {}
    for sym, entries in (data.get("data") or {}).items():
        if not isinstance(entries, list) or not entries:
            continue
        item = entries[0]
        q = (item.get("quote") or {}).get("USD") or {}
        result[sym.upper()] = {
            "name": item.get("name"),
            "symbol": item.get("symbol"),
            "cmc_rank": item.get("cmc_rank"),
            "price": q.get("price"),
            "market_cap": q.get("market_cap"),
            "fdv": q.get("fully_diluted_market_cap"),
            "volume_24h": q.get("volume_24h"),
            "circulating_supply": item.get("circulating_supply"),
            "total_supply": item.get("total_supply"),
            "max_supply": item.get("max_supply"),
            "percent_change_24h": q.get("percent_change_24h"),
            "percent_change_7d": q.get("percent_change_7d"),
            "percent_change_30d": q.get("percent_change_30d"),
        }
    log.info("CMC: fetched quotes for %d/%d symbols", len(result), len(symbols))
    return result


async def fetch_cmc_metadata(symbol: str) -> dict[str, Any] | None:
    """Fetch metadata (logo, links, category) for a single symbol."""
    if not CMC_AVAILABLE:
        return None
    async with httpx.AsyncClient() as c:
        data = await _cmc_get(c, "/v2/cryptocurrency/info", symbol=symbol)
    if not isinstance(data, dict) or "data" not in data:
        return None
    entries = (data.get("data") or {}).get(symbol.upper()) or []
    if not entries:
        return None
    info = entries[0]
    urls = info.get("urls") or {}
    return {
        "name": info.get("name"),
        "logo": info.get("logo"),
        "category": info.get("category"),
        "website": (urls.get("website") or [None])[0],
        "twitter": (urls.get("twitter") or [None])[0],
        "source_code": (urls.get("source_code") or [None])[0],
        "reddit": (urls.get("reddit") or [None])[0],
        "description": info.get("description"),
    }


async def fetch_cmc_listings(limit: int = 100) -> list[dict[str, Any]] | None:
    """Fetch top cryptocurrencies by market cap (for discovery)."""
    if not CMC_AVAILABLE:
        return None
    async with httpx.AsyncClient() as c:
        data = await _cmc_get(c, "/v1/cryptocurrency/listings/latest", limit=limit, convert="USD")
    if not isinstance(data, dict) or "data" not in data:
        return None
    result = []
    for item in (data.get("data") or []):
        q = (item.get("quote") or {}).get("USD") or {}
        result.append({
            "name": item.get("name"),
            "symbol": item.get("symbol"),
            "cmc_rank": item.get("cmc_rank"),
            "market_cap": q.get("market_cap"),
            "price": q.get("price"),
            "volume_24h": q.get("volume_24h"),
            "circulating_supply": item.get("circulating_supply"),
            "total_supply": item.get("total_supply"),
            "percent_change_24h": q.get("percent_change_24h"),
            "platform": item.get("platform"),
        })
    log.info("CMC: fetched %d listings", len(result))
    return result


def is_cmc_available() -> bool:
    """Check if CMC API key is configured."""
    return CMC_AVAILABLE


# --------------------------------------------------------------------------- #
#  CoinMarketCap Keyless Public API (always available, no key needed)
# --------------------------------------------------------------------------- #
CMC_KEYLESS_BASE = "https://api.coinmarketcap.com/data-api/v3"

async def fetch_cmc_keyless_detail(slug: str) -> dict[str, Any] | None:
    """Fetch cryptocurrency detail from CMC keyless API (no key required).

    Returns rich data including: price, market_cap, FDV, supply, volume,
    holder ratios, audit info, platform contracts, social links, TVL.
    """
    async with httpx.AsyncClient() as c:
        data = await _get_json(c, f"{CMC_KEYLESS_BASE}/cryptocurrency/detail", slug=slug)
    if not isinstance(data, dict) or "data" not in data:
        return None
    d = data.get("data") or {}
    stats = d.get("statistics") or {}
    supply = d.get("supplyDetails") or {}
    urls = d.get("urls") or {}
    holders = d.get("holders") or {}
    audits = d.get("auditInfos") or []
    platforms = d.get("platforms") or []

    circ_supply = None
    if isinstance(supply.get("circulatingSupply"), dict):
        circ_supply = supply["circulatingSupply"].get("value")
    total_supply = None
    if isinstance(supply.get("totalSupply"), dict):
        total_supply = supply["totalSupply"].get("value")
    max_supply = None
    if isinstance(supply.get("maxSupply"), dict):
        max_supply = supply["maxSupply"].get("value")

    return {
        "name": d.get("name"),
        "symbol": d.get("symbol"),
        "slug": d.get("slug"),
        "category": d.get("category"),
        "description": d.get("description"),
        "logo": d.get("logo") or f"https://s2.coinmarketcap.com/static/img/coins/64x64/{d.get('id')}.png",
        # Market data
        "price": stats.get("price"),
        "market_cap": stats.get("marketCap"),
        "fdv": stats.get("fullyDilutedMarketCap"),
        "volume_24h": stats.get("volume24h"),
        "volume_7d": stats.get("volume7d"),
        "volume_30d": stats.get("volume30d"),
        "cmc_rank": stats.get("rank"),
        "market_cap_dominance": stats.get("marketCapDominance"),
        # Price changes
        "percent_change_1h": stats.get("priceChangePercentage1h"),
        "percent_change_24h": stats.get("priceChangePercentage24h"),
        "percent_change_7d": stats.get("priceChangePercentage7d"),
        "percent_change_30d": stats.get("priceChangePercentage30d"),
        "percent_change_60d": stats.get("priceChangePercentage60d"),
        "percent_change_90d": stats.get("priceChangePercentage90d"),
        "percent_change_1y": stats.get("priceChangePercentage1y"),
        # Supply
        "circulating_supply": circ_supply,
        "total_supply": total_supply,
        "max_supply": max_supply if max_supply and max_supply > 0 else None,
        # TVL
        "tvl": stats.get("tvl"),
        "tvl_ratio": stats.get("tvlRatio"),
        # Holder data (keyless unique feature)
        "holder_count": holders.get("holderCount"),
        "daily_active": holders.get("dailyActive"),
        "top_10_holder_ratio": holders.get("topTenHolderRatio"),
        "top_20_holder_ratio": holders.get("topTwentyHolderRatio"),
        "top_50_holder_ratio": holders.get("topFiftyHolderRatio"),
        "top_100_holder_ratio": holders.get("topHundredHolderRatio"),
        # Price ranges
        "low_24h": stats.get("low24h"),
        "high_24h": stats.get("high24h"),
        "low_7d": stats.get("low7d"),
        "high_7d": stats.get("high7d"),
        "low_30d": stats.get("low30d"),
        "high_30d": stats.get("high30d"),
        "low_52w": stats.get("low52w"),
        "high_52w": stats.get("high52w"),
        "ath": stats.get("highAllTime"),
        "atl": stats.get("lowAllTime"),
        # Audit info
        "audited": d.get("isAudited"),
        "audit_infos": [
            {"auditor": a.get("auditor"), "status": a.get("auditStatus"),
             "time": a.get("auditTime"), "url": a.get("reportUrl")}
            for a in audits if isinstance(a, dict)
        ],
        # Social links
        "website": (urls.get("website") or [None])[0] if isinstance(urls, dict) else None,
        "twitter": (urls.get("twitter") or [None])[0] if isinstance(urls, dict) else None,
        "source_code": (urls.get("source_code") or [None])[0] if isinstance(urls, dict) else None,
        "reddit": (urls.get("reddit") or [None])[0] if isinstance(urls, dict) else None,
        "chat": (urls.get("chat") or [None])[0] if isinstance(urls, dict) else None,
        "technical_doc": (urls.get("technical_doc") or [None])[0] if isinstance(urls, dict) else None,
        "explorer": (urls.get("explorer") or [None])[0] if isinstance(urls, dict) else None,
        # Platform contracts
        "platforms": [
            {"chain": p.get("contractPlatform"), "address": p.get("contractAddress")}
            for p in platforms if isinstance(p, dict) and p.get("contractAddress")
        ],
        "platform_count": len(platforms),
    }


async def fetch_cmc_keyless_by_symbol(symbol: str) -> dict[str, Any] | None:
    """Try to fetch CMC keyless detail by trying the slug = symbol.lower().

    CMC keyless API uses slug (e.g. 'aave', 'bitcoin') not symbol.
    We try the lowercase symbol as slug, which works for most projects.
    """
    slug = symbol.lower().replace(" ", "-")
    return await fetch_cmc_keyless_detail(slug)
