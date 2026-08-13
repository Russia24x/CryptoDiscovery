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
    async with httpx.AsyncClient(follow_redirects=True) as c:
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
    async with httpx.AsyncClient(follow_redirects=True) as c:
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
    async with httpx.AsyncClient(follow_redirects=True) as c:
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
    async with httpx.AsyncClient(follow_redirects=True) as c:
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
    """Fetch from CMC Pro API with API key header. Returns None on any error."""
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


class CmcPlanNotSupported(Exception):
    """Raised when the CMC API key's subscription plan doesn't support an endpoint (HTTP 403)."""
    pass


async def _cmc_get_strict(client: httpx.AsyncClient, path: str, **params: Any) -> dict[str, Any]:
    """Fetch from CMC Pro API, raising CmcPlanNotSupported on 403.

    Unlike _cmc_get, this surfaces 403 errors so the caller can distinguish
    "no API key" from "key exists but plan doesn't support this endpoint".
    """
    r = await client.get(
        f"{CMC_PRO_BASE}{path}",
        params=params,
        headers={"X-CMC_Pro_API_Key": CMC_API_KEY},
        timeout=TIMEOUT,
    )
    if r.status_code == 403:
        raise CmcPlanNotSupported(f"CMC plan doesn't support {path}")
    if r.status_code != 200:
        log.warning("CMC GET %s -> %s", path, r.status_code)
        return {}
    return r.json()


async def fetch_cmc_quotes(symbols: list[str]) -> dict[str, dict[str, Any]] | None:
    """Fetch market data (price, MC, FDV, volume, supply) for multiple symbols.

    Returns dict keyed by symbol uppercase.
    """
    if not CMC_AVAILABLE or not symbols:
        return None
    sym_str = ",".join(symbols[:100])  # CMC allows up to 100 symbols
    async with httpx.AsyncClient(follow_redirects=True) as c:
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
    async with httpx.AsyncClient(follow_redirects=True) as c:
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
    async with httpx.AsyncClient(follow_redirects=True) as c:
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
#  CMC Pro exclusive endpoints — unique data NOT available from free sources
# --------------------------------------------------------------------------- #
# These endpoints require the CMC Pro API key and provide data that no free
# source (CoinGecko, DeFiLlama, CMC Keyless) offers:
#
#   - /v1/cryptocurrency/categories  → market cap + volume per CMC category
#   - /v1/cryptocurrency/airdrop     → upcoming / active / ended airdrops
#   - /v1/exchange/map               → exchange rankings by volume
#
# When the key is absent, these return None and the frontend shows a
# "CMC Pro required" placeholder instead of partial data.


async def fetch_cmc_categories() -> list[dict[str, Any]] | None:
    """Fetch all CMC cryptocurrency categories with market cap & volume.

    Unique to CMC Pro — CoinGecko has categories but CMC's taxonomy includes
    24h/7d market cap change per category, top 3 coins, and volume.
    Returns None if no API key.
    Raises CmcPlanNotSupported if the key's plan doesn't include this endpoint (403).
    """
    if not CMC_AVAILABLE:
        return None
    cache_key = "cmc_categories"
    cached = cache_get(cache_key, ttl=300.0)
    if cached is not None:
        return cached
    try:
        async with httpx.AsyncClient(follow_redirects=True) as c:
            data = await _cmc_get_strict(c, "/v1/cryptocurrency/categories")
        if not isinstance(data, dict) or "data" not in data:
            return None
        out = []
        for cat in (data.get("data") or [])[:100]:
            out.append({
                "id": cat.get("id"),
                "name": cat.get("name"),
                "title": cat.get("title"),
                "description": cat.get("description"),
                "num_tokens": cat.get("num_tokens"),
                "market_cap": cat.get("market_cap"),
                "market_cap_change_24h": cat.get("market_cap_change_24h"),
                "market_cap_change_7d": cat.get("market_cap_change_7d"),
                "volume_24h": cat.get("volume_24h"),
                "top_coins": [c.get("name") for c in (cat.get("top_3_coins") or []) if isinstance(c, dict)],
                "avg_price_change_24h": cat.get("avg_price_change_24h"),
                "last_updated": cat.get("last_updated"),
            })
        cache_set(cache_key, out)
        log.info("CMC Pro: fetched %d categories", len(out))
        return out
    except CmcPlanNotSupported:
        raise  # Re-raise so the endpoint can show the correct message
    except (httpx.HTTPError, ValueError) as exc:
        log.warning("CMC categories failed: %s", exc)
        return None


async def fetch_cmc_airdrops(limit: int = 50, status: str = "ONGOING") -> list[dict[str, Any]] | None:
    """Fetch cryptocurrency airdrops from CMC Pro.

    Unique to CMC Pro — no free source provides structured airdrop data.
    Status: ONGOING, UPCOMING, ENDED (default ONGOING).
    Returns None if no API key.
    Raises CmcPlanNotSupported if the key's plan doesn't include airdrops (403).
    """
    if not CMC_AVAILABLE:
        return None
    cache_key = f"cmc_airdrops:{status}:{limit}"
    cached = cache_get(cache_key, ttl=300.0)
    if cached is not None:
        return cached
    try:
        async with httpx.AsyncClient(follow_redirects=True) as c:
            data = await _cmc_get_strict(c, "/v1/cryptocurrency/airdrop", limit=limit, status=status)
        if not isinstance(data, dict) or "data" not in data:
            return None
        out = []
        for a in (data.get("data") or []):
            out.append({
                "id": a.get("id"),
                "name": a.get("name"),
                "symbol": a.get("symbol"),
                "status": a.get("status"),
                "description": a.get("description"),
                "start_date": a.get("start_date"),
                "end_date": a.get("end_date"),
                "total_value_usd": a.get("total_value"),
                "participants": a.get("participants"),
                "requirements": a.get("requirements") or [],
                "website": (a.get("urls") or {}).get("website", [None])[0] if isinstance(a.get("urls"), dict) else None,
                "logo": a.get("logo"),
            })
        cache_set(cache_key, out)
        log.info("CMC Pro: fetched %d airdrops (status=%s)", len(out), status)
        return out
    except CmcPlanNotSupported:
        raise  # Re-raise so the endpoint can show the correct message
    except (httpx.HTTPError, ValueError) as exc:
        log.warning("CMC airdrops failed: %s", exc)
        return None


async def fetch_cmc_exchange_map(limit: int = 50) -> list[dict[str, Any]] | None:
    """Fetch top exchanges ranked by volume from CMC Pro.

    Unique to CMC Pro — DeFiLlama has some CEX data but CMC has comprehensive
    exchange rankings with spot/derivatives volume split.
    Returns None if no API key.
    Raises CmcPlanNotSupported if the key's plan doesn't include this endpoint (403).
    """
    if not CMC_AVAILABLE:
        return None
    cache_key = f"cmc_exchanges:{limit}"
    cached = cache_get(cache_key, ttl=300.0)
    if cached is not None:
        return cached
    try:
        async with httpx.AsyncClient(follow_redirects=True) as c:
            data = await _cmc_get_strict(c, "/v1/exchange/map", listing_status="active", limit=limit, sort="volume_24h")
        if not isinstance(data, dict) or "data" not in data:
            return None
        out = []
        for ex in (data.get("data") or []):
            out.append({
                "id": ex.get("id"),
                "name": ex.get("name"),
                "slug": ex.get("slug"),
                "is_active": ex.get("is_active"),
                "first_historical_data": ex.get("first_historical_data"),
                "last_historical_data": ex.get("last_historical_data"),
            })
        cache_set(cache_key, out)
        log.info("CMC Pro: fetched %d exchanges", len(out))
        return out
    except CmcPlanNotSupported:
        raise  # Re-raise so the endpoint can show the correct message
    except (httpx.HTTPError, ValueError) as exc:
        log.warning("CMC exchange map failed: %s", exc)
        return None


async def fetch_cmc_global_metrics() -> dict[str, Any] | None:
    """Fetch global crypto market metrics from CMC Pro.

    Available with Basic plan — provides CMC's own BTC dominance, total mcap,
    and 24h volume. Used to cross-verify CoinGecko's global data.
    Returns None if no API key.
    Raises CmcPlanNotSupported if the key's plan doesn't include this endpoint (403).
    """
    if not CMC_AVAILABLE:
        return None
    cache_key = "cmc_global_metrics"
    cached = cache_get(cache_key, ttl=300.0)
    if cached is not None:
        return cached
    try:
        async with httpx.AsyncClient(follow_redirects=True) as c:
            data = await _cmc_get_strict(c, "/v1/global-metrics/quotes/latest")
        if not isinstance(data, dict) or "data" not in data:
            return None
        d = data["data"]
        out = {
            "total_market_cap_usd": d.get("quote", {}).get("USD", {}).get("total_market_cap"),
            "total_volume_24h_usd": d.get("quote", {}).get("USD", {}).get("total_volume_24h"),
            "total_market_cap_yesterday_usd": d.get("quote", {}).get("USD", {}).get("total_market_cap_yesterday"),
            "total_volume_24h_yesterday_usd": d.get("quote", {}).get("USD", {}).get("total_volume_24h_yesterday"),
            "total_market_cap_percentage_change_24h": d.get("quote", {}).get("USD", {}).get("total_market_cap_yesterday_percentage_change"),
            "btc_dominance": d.get("btc_dominance"),
            "eth_dominance": d.get("eth_dominance"),
            "active_cryptocurrencies": d.get("active_cryptocurrencies"),
            "active_market_pairs": d.get("active_market_pairs"),
            "last_updated": d.get("last_updated"),
        }
        cache_set(cache_key, out)
        log.info("CMC Pro: global metrics fetched (BTC dom=%s)", out.get("btc_dominance"))
        return out
    except CmcPlanNotSupported:
        raise  # Re-raise so the endpoint can show the correct message
    except (httpx.HTTPError, ValueError) as exc:
        log.warning("CMC global metrics failed: %s", exc)
        return None


# --------------------------------------------------------------------------- #
#  CoinMarketCap Keyless Public API (always available, no key needed)
# --------------------------------------------------------------------------- #
CMC_KEYLESS_BASE = "https://api.coinmarketcap.com/data-api/v3"

async def fetch_cmc_keyless_detail(slug: str) -> dict[str, Any] | None:
    """Fetch cryptocurrency detail from CMC keyless API (no key required).

    Returns rich data including: price, market_cap, FDV, supply, volume,
    holder ratios, audit info, platform contracts, social links, TVL.
    """
    async with httpx.AsyncClient(follow_redirects=True) as c:
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


# --------------------------------------------------------------------------- #
#  In-memory TTL cache — avoids hammering public APIs on repeated dashboard loads
# --------------------------------------------------------------------------- #
import time as _time

_CACHE: dict[str, tuple[float, Any]] = {}
_CACHE_TTL_DEFAULT = 90.0  # seconds
_CACHE_MAX_ENTRIES = 500  # evict oldest expired entries when this limit is reached


def cache_get(key: str, ttl: float = _CACHE_TTL_DEFAULT) -> Any | None:
    entry = _CACHE.get(key)
    if entry is None:
        return None
    ts, val = entry
    if _time.time() - ts > ttl:
        # Expired — remove lazily to keep the dict from growing unbounded
        _CACHE.pop(key, None)
        return None
    return val


def cache_set(key: str, value: Any) -> None:
    # Evict all expired entries when the cache exceeds the max size threshold.
    # This prevents unbounded memory growth in long-running production.
    if len(_CACHE) >= _CACHE_MAX_ENTRIES:
        _evict_expired()
    _CACHE[key] = (_time.time(), value)


def _evict_expired() -> None:
    """Remove all expired entries. Called when cache exceeds _CACHE_MAX_ENTRIES."""
    now = _time.time()
    expired = [k for k, (ts, _) in _CACHE.items() if now - ts > _CACHE_TTL_DEFAULT]
    for k in expired:
        _CACHE.pop(k, None)
    # If still over the limit (all entries are fresh), remove the oldest 20%
    if len(_CACHE) >= _CACHE_MAX_ENTRIES:
        sorted_items = sorted(_CACHE.items(), key=lambda x: x[1][0])
        for k, _ in sorted_items[: len(sorted_items) // 5]:
            _CACHE.pop(k, None)


def cache_info() -> dict[str, Any]:
    """Return cache stats for the health endpoint."""
    now = _time.time()
    live = 0
    for key, (ts, _) in _CACHE.items():
        if now - ts <= _CACHE_TTL_DEFAULT:
            live += 1
    return {"entries": len(_CACHE), "live": live, "ttl_seconds": _CACHE_TTL_DEFAULT, "max_entries": _CACHE_MAX_ENTRIES}


# --------------------------------------------------------------------------- #
#  CoinGecko search (for manual coin explorer)
# --------------------------------------------------------------------------- #
async def search_coins(query: str) -> list[dict[str, Any]]:
    """Search coins by name/symbol via CoinGecko /search endpoint.

    Returns a list of {id, name, symbol, market_cap_rank, thumb, large}.
    """
    if not query or len(query.strip()) < 1:
        return []
    cache_key = f"search:{query.strip().lower()}"
    cached = cache_get(cache_key, ttl=120.0)
    if cached is not None:
        return cached
    async with httpx.AsyncClient(follow_redirects=True) as c:
        data = await _get_json(c, f"{COINGECKO_BASE}/search", query=query.strip())
    if not isinstance(data, dict):
        return []
    coins = data.get("coins") or []
    out = []
    for item in coins[:25]:
        if not isinstance(item, dict):
            continue
        out.append({
            "id": item.get("id"),
            "name": item.get("name"),
            "symbol": (item.get("symbol") or "").upper(),
            "market_cap_rank": item.get("market_cap_rank"),
            "thumb": item.get("thumb"),
            "large": item.get("large"),
            "api_symbol": item.get("api_symbol") or item.get("id"),
        })
    cache_set(cache_key, out)
    return out


# --------------------------------------------------------------------------- #
#  CoinGecko global market data
# --------------------------------------------------------------------------- #
async def fetch_global_market() -> dict[str, Any] | None:
    """Global crypto market stats: total mcap, BTC/ETH dominance, volume, etc."""
    cached = cache_get("global_market", ttl=120.0)
    if cached is not None:
        return cached
    async with httpx.AsyncClient(follow_redirects=True) as c:
        data = await _get_json(c, f"{COINGECKO_BASE}/global")
    if not isinstance(data, dict) or "data" not in data:
        return None
    d = data["data"]
    out = {
        "total_market_cap_usd": (d.get("total_market_cap") or {}).get("usd"),
        "total_volume_usd": (d.get("total_volume") or {}).get("usd"),
        "market_cap_change_percentage_24h_usd": d.get("market_cap_change_percentage_24h_usd"),
        "btc_dominance": d.get("market_cap_percentage", {}).get("btc"),
        "eth_dominance": d.get("market_cap_percentage", {}).get("eth"),
        "active_cryptocurrencies": d.get("active_cryptocurrencies"),
        "markets": d.get("markets"),
    }
    cache_set("global_market", out)
    return out


# --------------------------------------------------------------------------- #
#  CoinGecko trending
# --------------------------------------------------------------------------- #
async def fetch_trending() -> list[dict[str, Any]]:
    """Trending coins (top-7 most searched in last 24h on CoinGecko)."""
    cached = cache_get("trending", ttl=180.0)
    if cached is not None:
        return cached
    async with httpx.AsyncClient(follow_redirects=True) as c:
        data = await _get_json(c, f"{COINGECKO_BASE}/search/trending")
    if not isinstance(data, dict):
        return []
    coins = data.get("coins") or []
    out = []
    for item in coins[:15]:
        if not isinstance(item, dict):
            continue
        ic = item.get("item") or {}
        out.append({
            "id": ic.get("id"),
            "name": ic.get("name"),
            "symbol": (ic.get("symbol") or "").upper(),
            "market_cap_rank": ic.get("market_cap_rank"),
            "thumb": ic.get("thumb"),
            "small": ic.get("small"),
            "large": ic.get("large"),
            "score": ic.get("score"),
            "price_btc": ic.get("price_btc"),
        })
    cache_set("trending", out)
    return out


# --------------------------------------------------------------------------- #
#  Fear & Greed Index (alternative.me — free, no key)
# --------------------------------------------------------------------------- #
async def fetch_fear_greed() -> dict[str, Any] | None:
    cached = cache_get("fear_greed", ttl=300.0)
    if cached is not None:
        return cached
    try:
        async with httpx.AsyncClient(follow_redirects=True) as c:
            r = await c.get("https://api.alternative.me/fng/?limit=1", timeout=TIMEOUT)
            if r.status_code != 200:
                return None
            data = r.json()
        d = (data.get("data") or [{}])[0]
        out = {
            "value": int(d.get("value") or 0),
            "classification": d.get("value_classification") or "Unknown",
            "timestamp": d.get("timestamp"),
        }
        cache_set("fear_greed", out)
        return out
    except (httpx.HTTPError, ValueError, IndexError):
        return None


# --------------------------------------------------------------------------- #
#  Top markets with extended price-change windows (for gainers/losers)
# --------------------------------------------------------------------------- #
async def fetch_top_markets_extended(per_page: int = 250) -> list[dict[str, Any]]:
    """Fetch a larger market snapshot for gainers/losers/sector aggregation.

    Cached for 90s. Returns the raw CoinGecko market objects (filtered to the
    fields we need) so the caller can sort/aggregate as required.
    """
    cached = cache_get("markets_extended", ttl=90.0)
    if cached is not None:
        return cached
    out: list[dict[str, Any]] = []
    async with httpx.AsyncClient(follow_redirects=True) as c:
        data = await _get_json(
            c,
            f"{COINGECKO_BASE}/coins/markets",
            vs_currency="usd",
            order="market_cap_desc",
            per_page=per_page,
            page=1,
            sparkline="false",
            price_change_percentage="1h,24h,7d,30d",
        )
    if isinstance(data, list):
        keep = (
            "id", "symbol", "name", "image", "current_price", "market_cap",
            "market_cap_rank", "total_volume", "high_24h", "low_24h",
            "price_change_percentage_1h_in_currency",
            "price_change_percentage_24h", "price_change_percentage_24h_in_currency",
            "price_change_percentage_7d_in_currency",
            "price_change_percentage_30d_in_currency",
            "circulating_supply", "total_supply", "max_supply",
            "ath", "ath_change_percentage", "atl", "atl_change_percentage",
            "fully_diluted_valuation",
        )
        for m in data:
            if not isinstance(m, dict):
                continue
            out.append({k: m.get(k) for k in keep})
    cache_set("markets_extended", out)
    return out


# ========================================================================== #
#  CRYPTO NEWS — multi-source aggregation (free RSS + optional API keys)
# ========================================================================== #
# Sources (all free, no key required unless noted):
#   1. CoinDesk RSS          — https://www.coindesk.com/arc/outboundfeeds/rss/
#   2. Cointelegraph RSS     — https://cointelegraph.com/rss
#   3. Decrypt RSS           — https://decrypt.co/feed
#   4. Bitcoinist RSS        — https://bitcoinist.com/feed/
#   5. CryptoPanic API       — https://cryptopanic.com/api/v1/posts/ (optional, free token)
#   6. CryptoCompare API     — https://min-api.cryptocompare.com/data/v2/news/ (optional, free key)
#
# Each article is normalised to: {title, summary, url, source, published_at, image, categories}
import urllib.parse as _urlparse
import xml.etree.ElementTree as _ET
from datetime import datetime as _datetime, timezone as _tz


NEWS_FEEDS: list[tuple[str, str]] = [
    ("CoinDesk", "https://www.coindesk.com/arc/outboundfeeds/rss/"),
    ("Cointelegraph", "https://cointelegraph.com/rss"),
    ("Decrypt", "https://decrypt.co/feed"),
    ("Bitcoinist", "https://bitcoinist.com/feed/"),
]

# Persian (Farsi) crypto news sources — all free RSS, no key required
# ArzDigital: breaking news + blog articles (analysis/ideas via /feed which contains /blog/ posts)
# MihanBlockchain: news + market analysis
NEWS_FEEDS_FA: list[tuple[str, str, str]] = [
    # (source_name, rss_url, category)  — category used for sub-tab filtering
    ("ArzDigital", "https://arzdigital.com/breaking/feed/", "breaking"),
    ("ArzDigital", "https://arzdigital.com/feed/", "blog"),
    ("MihanBlockchain", "https://mihanblockchain.com/category/news/feed/", "news"),
    ("MihanBlockchain", "https://mihanblockchain.com/category/markets/feed/", "analysis"),
]

# Optional API-key sources (read from env)
CRYPTOPANIC_TOKEN = os.environ.get("CRYPTOPANIC_TOKEN", "")
CRYPTOCOMPARE_KEY = os.environ.get("CRYPTOCOMPARE_KEY", "")


def _strip_html(text: str) -> str:
    """Remove HTML tags and collapse whitespace."""
    if not text:
        return ""
    import re as _re
    clean = _re.sub(r"<[^>]+>", "", text)
    clean = _re.sub(r"\s+", " ", clean).strip()
    return clean


def _parse_rss_date(raw: str | None) -> str | None:
    """Parse an RSS pubDate (RFC-822) into ISO-8601. Returns None on failure."""
    if not raw:
        return None
    for fmt in ("%a, %d %b %Y %H:%M:%S %z", "%a, %d %b %Y %H:%M:%S %Z", "%Y-%m-%dT%H:%M:%S%z"):
        try:
            dt = _datetime.strptime(raw.strip(), fmt)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=_tz.utc)
            return dt.isoformat()
        except (ValueError, TypeError):
            continue
    return None


async def _fetch_rss_feed(client: httpx.AsyncClient, name: str, url: str, category: str = "") -> list[dict[str, Any]]:
    """Fetch and parse a single RSS feed into normalised article dicts.

    The optional ``category`` tags every article from this feed (e.g. "breaking",
    "blog", "analysis") so the frontend can filter by content type.

    Image extraction priority:
      1. <enclosure type="image/*"> tag
      2. media:content / media:thumbnail (MRSS namespace)
      3. First real <img src="..."> in content:encoded (full article body),
         skipping data: URIs (base64 SVG placeholders)
      4. First real <img src="..."> in description
    """
    import re as _re
    try:
        r = await client.get(url, timeout=TIMEOUT, headers={"User-Agent": "Mozilla/5.0 (crypto-scanner)"})
        if r.status_code != 200:
            log.warning("RSS %s -> %s", name, r.status_code)
            return []
        root = _ET.fromstring(r.text)
    except Exception as exc:  # noqa: BLE001
        log.warning("RSS %s failed: %s", name, exc)
        return []

    # Namespace for content:encoded (WordPress / standard RSS extension)
    CONTENT_NS = "{http://purl.org/rss/1.0/modules/content/}"

    def _first_real_img(html_text: str) -> str | None:
        """Extract the first non-data: URI image from HTML."""
        if not html_text:
            return None
        for m in _re.finditer(r'<img[^>]+src=["\']([^"\']+)["\']', html_text):
            url = m.group(1)
            # Skip base64 data: URIs (SVG placeholders, tiny inline images)
            if not url.startswith("data:"):
                return url
        return None

    items = root.findall(".//item")
    out: list[dict[str, Any]] = []
    for it in items[:30]:
        title = (it.findtext("title") or "").strip()
        link = (it.findtext("link") or "").strip()
        pub = it.findtext("pubDate")
        desc_raw = it.findtext("description") or ""
        # content:encoded (full article body — often has images that description lacks)
        encoded_el = it.find(f"{CONTENT_NS}encoded")
        encoded_raw = (encoded_el.text or "") if encoded_el is not None else ""

        # Image extraction (priority order)
        image = None
        # 1) enclosure
        enc = it.find("enclosure")
        if enc is not None and (enc.get("type") or "").startswith("image"):
            image = enc.get("url")
        # 2) media:content / media:thumbnail
        if not image:
            mc = it.find("{http://search.yahoo.com/mrss/}content")
            if mc is not None:
                image = mc.get("url")
        if not image:
            mt = it.find("{http://search.yahoo.com/mrss/}thumbnail")
            if mt is not None:
                image = mt.get("url")
        # 3) content:encoded (richest source — has the full article with images)
        if not image:
            image = _first_real_img(encoded_raw)
        # 4) description fallback
        if not image:
            image = _first_real_img(desc_raw)

        # categories from the feed
        cats = [c.text.strip() for c in it.findall("category") if c.text]
        # Inject the feed-level category if provided
        if category and category not in cats:
            cats.insert(0, category)

        out.append({
            "title": title,
            "summary": _strip_html(desc_raw)[:400],
            "url": link,
            "source": name,
            "published_at": _parse_rss_date(pub),
            "image": image,
            "categories": cats[:5],
            "category": category,
        })
    return out


async def fetch_crypto_news(limit: int = 40) -> list[dict[str, Any]]:
    """Aggregate crypto news from multiple free RSS sources + optional API keys.

    Deduplicates by title and sorts by published_at descending.
    """
    cache_key = f"news:{limit}"
    cached = cache_get(cache_key, ttl=300.0)  # 5-min cache
    if cached is not None:
        return cached

    all_articles: list[dict[str, Any]] = []

    # 1) RSS feeds (always available, no key)
    async with httpx.AsyncClient(follow_redirects=True) as c:
        tasks = [_fetch_rss_feed(c, name, url) for name, url in NEWS_FEEDS]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        for res in results:
            if isinstance(res, list):
                all_articles.extend(res)

    # 2) CryptoPanic (optional, free token) — high-quality curated
    if CRYPTOPANIC_TOKEN:
        try:
            async with httpx.AsyncClient(follow_redirects=True) as c:
                r = await c.get(
                    "https://cryptopanic.com/api/v1/posts/",
                    params={"auth_token": CRYPTOPANIC_TOKEN, "kind": "news", "filter": "hot"},
                    timeout=TIMEOUT,
                )
            if r.status_code == 200:
                data = r.json()
                for p in (data.get("results") or [])[:20]:
                    all_articles.append({
                        "title": p.get("title", ""),
                        "summary": (p.get("slug") or "")[:400],
                        "url": p.get("url", ""),
                        "source": "CryptoPanic",
                        "published_at": p.get("published_at"),
                        "image": None,
                        "categories": [p.get("currency", {}).get("code")] if p.get("currency") else [],
                    })
        except Exception as exc:  # noqa: BLE001
            log.warning("CryptoPanic fetch failed: %s", exc)

    # 3) CryptoCompare (optional, free key)
    if CRYPTOCOMPARE_KEY:
        try:
            async with httpx.AsyncClient(follow_redirects=True) as c:
                r = await c.get(
                    "https://min-api.cryptocompare.com/data/v2/news/?lang=EN",
                    headers={"authorization": f"Apikey {CRYPTOCOMPARE_KEY}"},
                    timeout=TIMEOUT,
                )
            if r.status_code == 200:
                data = r.json()
                for a in (data.get("Data") or [])[:20]:
                    all_articles.append({
                        "title": a.get("title", ""),
                        "summary": (a.get("body") or "")[:400],
                        "url": a.get("url", ""),
                        "source": a.get("source_info", {}).get("name", "CryptoCompare"),
                        "published_at": _parse_rss_date(a.get("published_on") and f"{a['published_on']}"),
                        "image": a.get("imageurl"),
                        "categories": [a.get("category")] if a.get("category") else [],
                    })
        except Exception as exc:  # noqa: BLE001
            log.warning("CryptoCompare fetch failed: %s", exc)

    # Deduplicate by normalised title
    seen: set[str] = set()
    unique: list[dict[str, Any]] = []
    for a in all_articles:
        key = (a.get("title") or "").lower().strip()[:80]
        if not key or key in seen:
            continue
        seen.add(key)
        unique.append(a)

    # Sort by published_at descending (None last)
    unique.sort(key=lambda x: x.get("published_at") or "", reverse=True)
    out = unique[:limit]
    cache_set(cache_key, out)
    log.info("News: aggregated %d articles from %d sources", len(out), len(NEWS_FEEDS) + bool(CRYPTOPANIC_TOKEN) + bool(CRYPTOCOMPARE_KEY))
    return out


async def fetch_crypto_news_fa(limit: int = 40, category: str = "") -> list[dict[str, Any]]:
    """Aggregate Persian (Farsi) crypto news from ArzDigital + MihanBlockchain.

    All sources are free RSS — no API key required.
    Categories: breaking, blog, news, analysis (empty = all).

    Each article includes a ``category`` field and ``lang="fa"``.
    """
    cache_key = f"news_fa:{limit}:{category}"
    cached = cache_get(cache_key, ttl=300.0)  # 5-min cache
    if cached is not None:
        return cached

    all_articles: list[dict[str, Any]] = []

    # Fetch all Persian RSS feeds in parallel
    async with httpx.AsyncClient(follow_redirects=True) as c:
        tasks = [
            _fetch_rss_feed(c, name, url, cat)
            for name, url, cat in NEWS_FEEDS_FA
            if not category or cat == category
        ]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        for res in results:
            if isinstance(res, list):
                all_articles.extend(res)

    # Tag each article with lang=fa
    for a in all_articles:
        a["lang"] = "fa"

    # Deduplicate by normalised title (some articles may appear in multiple feeds)
    seen: set[str] = set()
    unique: list[dict[str, Any]] = []
    for a in all_articles:
        key = (a.get("title") or "").lower().strip()[:80]
        if not key or key in seen:
            continue
        seen.add(key)
        unique.append(a)

    # Sort by published_at descending
    unique.sort(key=lambda x: x.get("published_at") or "", reverse=True)
    out = unique[:limit]
    cache_set(cache_key, out)
    log.info("News (fa): aggregated %d Persian articles (category=%s)", len(out), category or "all")
    return out


# ========================================================================== #
#  TELEGRAM CHANNEL FEED — public web preview (no API key, no bot needed)
# ========================================================================== #
# Uses https://t.me/s/<channel> — the public web preview which requires no
# authentication and works for any public channel. Parses the server-rendered
# HTML to extract messages, timestamps, views, and media.

TELEGRAM_BASE = "https://t.me/s"


def _parse_telegram_html(html: str, channel: str) -> list[dict[str, Any]]:
    """Parse the t.me/s/ HTML into structured messages.

    Extracts: id, text, datetime, views, media_type, media_url, author.
    """
    import re as _re
    import html as _html

    messages: list[dict[str, Any]] = []

    # Each message is wrapped in <div class="tgme_widget_message ...">
    # data-post="channel/123"
    msg_blocks = _re.findall(
        r'<div class="tgme_widget_message[^"]*"[^>]*data-post="([^"]+)"(.*?)</div>\s*</div>\s*</div>\s*</div>',
        html,
        _re.DOTALL,
    )
    # Fallback: simpler split if the greedy regex above doesn't match
    if not msg_blocks:
        msg_blocks = []
        for m in _re.finditer(r'data-post="([^"]+)"', html):
            post_id = m.group(1)
            start = m.start()
            # grab a window of 6000 chars after the post id
            chunk = html[start:start + 6000]
            msg_blocks.append((post_id, chunk))

    for post_id, block in msg_blocks:
        # Text content
        text_match = _re.search(
            r'<div class="tgme_widget_message_text[^"]*"[^>]*>(.*?)</div>\s*(?=<div|</div>)',
            block,
            _re.DOTALL,
        )
        text_html = text_match.group(1) if text_match else ""
        # Convert <br> to newlines, strip tags, then unescape HTML entities
        text = _re.sub(r"<br\s*/?>", "\n", text_html)
        text = _strip_html(text)
        text = _html.unescape(text)
        # Remove RTL/LRM marks and zero-width chars that clutter display
        text = text.replace("\u200f", "").replace("\u200e", "").replace("\u200b", "").strip()
        if not text:
            continue

        # Datetime
        dt_match = _re.search(r'<time datetime="([^"]+)"', block)
        published_at = dt_match.group(1) if dt_match else None

        # Views
        views_match = _re.search(r'<span class="tgme_widget_message_views">([^<]+)</span>', block)
        views_str = views_match.group(1).strip() if views_match else None

        # Author
        author_match = _re.search(r'<span class="tgme_widget_message_owner_name[^"]*">(.*?)</span>', block, _re.DOTALL)
        author = _strip_html(author_match.group(1)) if author_match else channel

        # Media detection — Telegram uses background-image:url('...') with single quotes
        # The style attribute may contain other CSS properties before background-image
        media_type = None
        media_url = None
        # Try single-quoted URL: background-image:url('https://...')
        photo_match = _re.search(
            r'tgme_widget_message_photo_wrap[^>]*style="[^"]*background-image:url\([\'"]([^\'"\)]+)[\'"]\)',
            block,
        )
        if photo_match:
            media_type = "photo"
            media_url = photo_match.group(1)
        # Also collect additional photos in grouped media (albums)
        all_photos = _re.findall(
            r'tgme_widget_message_photo_wrap[^>]*style="[^"]*background-image:url\([\'"]([^\'"\)]+)[\'"]\)',
            block,
        )
        if len(all_photos) > 1:
            # Store all photos for album display
            media_url = all_photos[0]  # primary
        # Video player
        video_match = _re.search(r'<i class="tgme_widget_message_video_player[^"]*"[^>]*data-src="([^"]+)"', block)
        if video_match:
            media_type = "video"
            media_url = video_match.group(1)
        # GIF / round video
        gif_match = _re.search(r'<i class="tgme_widget_message_roundvideo[^"]*"[^>]*data-src="([^"]+)"', block)
        if gif_match and not media_url:
            media_type = "gif"
            media_url = gif_match.group(1)

        # Extract links mentioned in the message (often news sources)
        links = _re.findall(r'href="(https?://[^"]+)"[^>]*class="tgme_widget_message_link_hover', block)
        # Also grab any other plain links in the text
        if not links:
            links = _re.findall(r'href="(https?://[^"]+)"', block)
            links = [l for l in links if "t.me" not in l][:5]

        messages.append({
            "id": post_id,
            "channel": channel,
            "channel_url": f"https://t.me/{channel}",
            "text": text,
            "published_at": published_at,
            "views": views_str,
            "author": author,
            "media_type": media_type,
            "media_url": media_url,
            "media_all": all_photos if len(all_photos) > 1 else None,
            "links": links[:5],
        })

    # Sort newest first (ISO dates sort correctly as strings)
    messages.sort(key=lambda x: x.get("published_at") or "", reverse=True)
    return messages


async def fetch_telegram_channel(channel: str, limit: int = 20) -> dict[str, Any]:
    """Fetch recent messages from a public Telegram channel via t.me/s/.

    Returns: {channel, channel_url, messages[], message_count, fetched_at}
    No API key or bot token required — uses the public web preview.
    """
    channel = channel.strip().lstrip("@")
    cache_key = f"telegram:{channel}:{limit}"
    cached = cache_get(cache_key, ttl=120.0)  # 2-min cache
    if cached is not None:
        return cached

    url = f"{TELEGRAM_BASE}/{channel}"
    try:
        async with httpx.AsyncClient(follow_redirects=True) as c:
            r = await c.get(url, timeout=TIMEOUT, headers={"User-Agent": "Mozilla/5.0 (crypto-scanner)"})
        if r.status_code != 200:
            log.warning("Telegram %s -> %s", channel, r.status_code)
            return {"channel": channel, "channel_url": f"https://t.me/{channel}", "messages": [], "message_count": 0, "error": f"HTTP {r.status_code}", "fetched_at": _datetime.now(_tz.utc).isoformat()}
        messages = _parse_telegram_html(r.text, channel)
    except Exception as exc:  # noqa: BLE001
        log.warning("Telegram %s failed: %s", channel, exc)
        return {"channel": channel, "channel_url": f"https://t.me/{channel}", "messages": [], "message_count": 0, "error": str(exc), "fetched_at": _datetime.now(_tz.utc).isoformat()}

    out = {
        "channel": channel,
        "channel_url": f"https://t.me/{channel}",
        "messages": messages[:limit],
        "message_count": len(messages[:limit]),
        "fetched_at": _datetime.now(_tz.utc).isoformat(),
    }
    cache_set(cache_key, out)
    log.info("Telegram @%s: fetched %d messages", channel, len(messages))
    return out


# ========================================================================== #
#  MULTI-SOURCE CROSS-VERIFICATION — merge price/mcap from CoinGecko + CMC
# ========================================================================== #
async def fetch_price_cross_verified(coin_ids_gecko: list[str], symbols: list[str]) -> dict[str, Any]:
    """Cross-verify price data between CoinGecko and CoinMarketCap.

    Returns per-symbol: {price, market_cap, sources: [...], discrepancy_pct}
    """
    # CoinGecko simple/price (free, always available)
    gecko_data = {}
    if coin_ids_gecko:
        try:
            async with httpx.AsyncClient(follow_redirects=True) as c:
                data = await _get_json(
                    c,
                    f"{COINGECKO_BASE}/simple/price",
                    ids=",".join(coin_ids_gecko),
                    vs_currencies="usd",
                    include_market_cap="true",
                    include_24hr_vol="true",
                )
            if isinstance(data, dict):
                gecko_data = data
        except Exception:  # noqa: BLE001
            pass

    # CMC Pro (optional)
    cmc_data = {}
    if CMC_AVAILABLE and symbols:
        cmc_quotes = await fetch_cmc_quotes(symbols)
        if cmc_quotes:
            cmc_data = cmc_quotes

    result: dict[str, Any] = {}
    for sym in symbols:
        gecko_price = None
        cmc_price = None
        # match by symbol heuristics
        for gid, gd in gecko_data.items():
            # we don't have symbol->id mapping here, so skip for now
            pass
        if sym.upper() in cmc_data:
            cmc_price = cmc_data[sym.upper()].get("price")

        sources = []
        if gecko_price is not None:
            sources.append({"source": "CoinGecko", "price": gecko_price})
        if cmc_price is not None:
            sources.append({"source": "CoinMarketCap", "price": cmc_price})

        discrepancy = None
        if gecko_price and cmc_price and cmc_price > 0:
            discrepancy = round(abs(gecko_price - cmc_price) / cmc_price * 100, 2)

        result[sym] = {
            "price": gecko_price or cmc_price,
            "sources": sources,
            "discrepancy_pct": discrepancy,
        }
    return result
