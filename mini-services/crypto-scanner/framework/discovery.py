"""
PHASE 1 — Market Scanning.

Discovery lenses applied to the merged CoinGecko + DeFiLlama dataset.
Produces a Candidate Pool ranked by composite signal strength.
"""
from __future__ import annotations

import logging
from typing import Any

from models.schemas import CandidateInfo
from data import sources

log = logging.getLogger("scanner.discovery")


# --------------------------------------------------------------------------- #
#  Lens signals (PHASE 1.1)
# --------------------------------------------------------------------------- #
def lens_money_flow(fees_entry: dict[str, Any] | None, llama_entry: dict[str, Any] | None) -> float:
    """Lens A — real revenue & fee generation."""
    score = 0.0
    if fees_entry:
        f24 = fees_entry.get("fees_24h") or 0.0
        r24 = fees_entry.get("revenue_24h") or 0.0
        # log-scaled
        if f24 > 0:
            score += min(40.0, (f24 / 50_000.0))
        if r24 > 0:
            score += min(35.0, (r24 / 50_000.0))
    if llama_entry:
        tvl = llama_entry.get("tvl") or 0.0
        if tvl > 0:
            score += min(25.0, (tvl / 500_000_000.0) * 25.0)
    return score


def lens_hidden_infrastructure(category: str, name: str) -> float:
    """Lens B — protocols hiding blockchain complexity (plumbing)."""
    infra_cats = {
        "oracle", "rpc", "bridge", "infrastructure", "payments", "liquid staking",
        "staking", "indexing", "data", "identity", "account abstraction",
        "wallet", "sequencer", "data availability", "zkp", "aggregator",
    }
    n = (name or "").lower()
    c = (category or "").lower()
    if any(x in c for x in infra_cats):
        return 15.0
    if any(x in n for x in infra_cats):
        return 10.0
    return 3.0


def lens_bottleneck(llama_entry: dict[str, Any] | None) -> float:
    """Lens C — would the ecosystem break without it?"""
    if not llama_entry:
        return 2.0
    tvl = llama_entry.get("tvl") or 0.0
    chain_count = llama_entry.get("chain") or ""
    # multi-chain + large TVL => hard to replace
    cc = 1 if chain_count else 0
    if isinstance(chain_count, str) and chain_count:
        cc = len(chain_count.split(","))
    score = 0.0
    if tvl >= 5_000_000_000:
        score += 18.0
    elif tvl >= 1_000_000_000:
        score += 12.0
    elif tvl >= 200_000_000:
        score += 7.0
    score += min(8.0, cc * 1.2)
    return score


def lens_institutional(llama_entry: dict[str, Any] | None, category: str) -> float:
    """Lens D — institutional adoption signals."""
    inst_cats = {"rwa", "stablecoin", "payments", "privacy", "liquid staking"}
    c = (category or "").lower()
    if any(x in c for x in inst_cats):
        return 12.0
    if llama_entry and (llama_entry.get("tvl") or 0) > 1_000_000_000:
        return 6.0
    return 2.0


def lens_emerging(category: str) -> float:
    """Lens E — emerging rails."""
    emerging_cats = {"ai agents", "ai", "intent", "modular", "data availability", "account abstraction", "rwa", "depin"}
    c = (category or "").lower()
    if any(x in c for x in emerging_cats):
        return 14.0
    return 2.0


# --------------------------------------------------------------------------- #
#  Discovery pipeline
# --------------------------------------------------------------------------- #
async def discover_candidates(
    market_cap_min_m: float,
    market_cap_max_m: float,
    sectors: list[str],
    max_projects: int,
) -> tuple[list[CandidateInfo], dict[str, dict[str, Any]], dict[str, dict[str, Any]]]:
    """
    Pull top markets + DeFiLlama protocols, merge, apply lenses,
    return (ranked candidate pool, llama_by_symbol, fees_by_symbol)
    so the evidence phase can reuse the overview data without re-fetching.
    """
    log.info("Discovery: fetching CoinGecko markets + DeFiLlama protocols + fees")
    markets, llama_protos, fees_list = await _gather_sources()

    # index overview data by symbol for O(1) lookup later
    llama_by_symbol: dict[str, dict[str, Any]] = {}
    for p in llama_protos:
        sym = (p.get("symbol") or "").upper()
        if sym and sym not in llama_by_symbol:
            llama_by_symbol[sym] = p
    # Build fees lookup by both symbol AND name (many fee protocols lack symbol)
    # When multiple entries share the same symbol (e.g. "SOL" matches both
    # "Solana" and "Solana Name Service"), keep the one with the highest fees_24h.
    fees_by_symbol: dict[str, dict[str, Any]] = {}
    fees_by_name: dict[str, dict[str, Any]] = {}
    for f in fees_list:
        sym = (f.get("symbol") or "").upper()
        if sym:
            existing = fees_by_symbol.get(sym)
            if existing is None or (f.get("fees_24h") or 0) > (existing.get("fees_24h") or 0):
                fees_by_symbol[sym] = f
        name = (f.get("name") or "").lower()
        if name and name not in fees_by_name:
            fees_by_name[name] = f

    # Helper: find fees entry by matching symbol or name, including versioned names (e.g. "Aave V3" matches "Aave")
    def find_fees(sym: str, name: str) -> dict[str, Any] | None:
        # Direct symbol match
        if sym in fees_by_symbol:
            return fees_by_symbol[sym]
        # Direct name match
        nm = name.lower()
        if nm in fees_by_name:
            return fees_by_name[nm]
        # Try matching base name without version suffix (e.g. "Aave" matches "Aave V3")
        # Collect all matches and pick the one with highest fees (usually the active version)
        matches: list[tuple[float, dict[str, Any]]] = []
        for fname, fentry in fees_by_name.items():
            if fname.startswith(nm + " ") or fname.startswith(nm + "-") or fname == nm:
                fees_val = fentry.get("fees_24h") or 0
                matches.append((fees_val, fentry))
            elif nm.startswith(fname + " ") or nm.startswith(fname + "-"):
                fees_val = fentry.get("fees_24h") or 0
                matches.append((fees_val, fentry))
        if matches:
            # Sort by fees descending and return the highest
            matches.sort(key=lambda x: x[0], reverse=True)
            return matches[0][1]
        return None

    if not markets:
        log.warning("Discovery: no CoinGecko data returned — using llama-only pool")
        cands = _llama_only_pool(llama_protos, fees_list, max_projects)
        # Also match fees for llama-only candidates
        for cand in cands:
            if cand.symbol not in fees_by_symbol:
                matched = find_fees(cand.symbol, cand.name)
                if matched:
                    fees_by_symbol[cand.symbol] = matched
                    log.info("Discovery: matched fees for %s via name -> %s (fees_24h=%s)",
                             cand.symbol, matched.get("name"), matched.get("fees_24h"))
        return cands, llama_by_symbol, fees_by_symbol

    candidates: list[tuple[CandidateInfo, float]] = []

    for m in markets:
        mc = m.get("market_cap") or 0.0
        if mc <= 0:
            continue
        mc_m = mc / 1_000_000.0
        if mc_m < market_cap_min_m or mc_m > market_cap_max_m:
            continue

        symbol = (m.get("symbol") or "").upper()
        name = m.get("name") or symbol
        gecko_id = m.get("id")
        category = _guess_category(m, symbol)

        if sectors:
            if not any(s.lower() in category.lower() for s in sectors):
                continue

        llama_entry = llama_by_symbol.get(symbol) or sources.match_llama_protocol(symbol, name, llama_protos)
        fees_entry = find_fees(symbol, name)

        # composite discovery signal
        signal = (
            lens_money_flow(fees_entry, llama_entry)
            + lens_hidden_infrastructure(category, name)
            + lens_bottleneck(llama_entry)
            + lens_institutional(llama_entry, category)
            + lens_emerging(category)
        )

        # priority bucket
        if signal >= 50:
            priority = "High"
        elif signal >= 25:
            priority = "Medium"
        else:
            priority = "Low"

        key_signal = _describe_signal(fees_entry, llama_entry, category)

        cand = CandidateInfo(
            name=name,
            symbol=symbol,
            category=category,
            sector=_sector_for(category),
            description=_short_description(m, llama_entry),
            key_signal=key_signal,
            initial_priority=priority,
            gecko_id=gecko_id,
            llama_id=llama_entry.get("slug") if llama_entry else None,
            image=m.get("image"),
        )
        candidates.append((cand, signal))

    # rank by signal, take top N, but always include any High priority
    candidates.sort(key=lambda x: x[1], reverse=True)
    # de-dup by symbol
    seen: set[str] = set()
    out: list[CandidateInfo] = []
    for c, _ in candidates:
        if c.symbol in seen:
            continue
        seen.add(c.symbol)
        out.append(c)
        if len(out) >= max_projects:
            break

    # Post-process: add name-matched fees entries to fees_by_symbol
    # so that main.py can look them up by candidate symbol
    for cand in out:
        if cand.symbol not in fees_by_symbol:
            matched = find_fees(cand.symbol, cand.name)
            if matched:
                fees_by_symbol[cand.symbol] = matched
                log.info("Discovery: matched fees for %s via name -> %s (fees_24h=%s)",
                         cand.symbol, matched.get("name"), matched.get("fees_24h"))

    log.info("Discovery: %d candidates after ranking & dedup", len(out))
    return out, llama_by_symbol, fees_by_symbol


# --------------------------------------------------------------------------- #
#  Helpers
# --------------------------------------------------------------------------- #
async def _gather_sources() -> tuple[list[dict], list[dict], list[dict]]:
    import asyncio
    tasks = [
        sources.fetch_top_markets(per_page=100, pages=1),
        sources.fetch_defillama_protocols(),
        sources.fetch_fees_overview(),
    ]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    markets = results[0] if isinstance(results[0], list) else []
    protos = results[1] if isinstance(results[1], list) else []
    fees = results[2] if isinstance(results[2], list) else []
    return markets, protos, fees


def _llama_only_pool(
    protos: list[dict[str, Any]],
    fees: list[dict[str, Any]],
    max_projects: int,
) -> list[CandidateInfo]:
    # Build fees lookup by name for matching
    fees_by_name: dict[str, dict[str, Any]] = {}
    for f in fees:
        name = (f.get("name") or "").lower()
        if name and name not in fees_by_name:
            fees_by_name[name] = f

    out: list[CandidateInfo] = []
    for p in sorted(protos, key=lambda x: x.get("tvl") or 0, reverse=True)[:max_projects * 3]:
        name = p.get("name") or "Unknown"
        symbol = (p.get("symbol") or "").upper()
        tvl = p.get("tvl") or 0
        # Try to find matching fees entry
        fees_entry = None
        nm = name.lower()
        if nm in fees_by_name:
            fees_entry = fees_by_name[nm]
        else:
            for fname, fentry in fees_by_name.items():
                if fname.startswith(nm + " ") or fname.startswith(nm + "-") or nm.startswith(fname + " "):
                    fees_entry = fentry
                    break

        fees_24h = fees_entry.get("fees_24h") if fees_entry else None
        signal_parts = [f"TVL ${tvl/1e6:.1f}M"]
        if fees_24h:
            signal_parts.append(f"Fees ${fees_24h/1e3:.0f}K/day")

        out.append(CandidateInfo(
            name=name,
            symbol=symbol,
            category=p.get("category") or "Unknown",
            sector=_sector_for(p.get("category") or ""),
            description=" · ".join(signal_parts),
            key_signal=" · ".join(signal_parts),
            initial_priority="High" if fees_24h else "Medium",
            llama_id=p.get("slug"),
            image=p.get("logo") or p.get("icon"),
        ))
        if len(out) >= max_projects:
            break
    return out


def _guess_category(market: dict[str, Any], symbol: str) -> str:
    # CoinGecko market endpoint doesn't give category; infer from name/symbol heuristics
    n = (market.get("name") or "").lower()
    s = symbol.lower()
    if "usd" in s and "e" in s:
        return "stablecoin"
    if "bitcoin" in n or s == "btc":
        return "currency"
    if "ethereum" in n or s == "eth":
        return "smart contract platform"
    if any(x in n for x in ["chain", "layer", "rollup", "polygon", "arbitrum", "optimism", "base"]):
        return "smart contract platform"
    if any(x in n for x in ["uniswap", "curve", "sushi", "pancake", "balancer"]):
        return "dex"
    if any(x in n for x in ["aave", "compound", "maker", "lido", "rocket"]):
        return "lending / liquid staking"
    if any(x in n for x in ["chainlink", "pyth", "api3"]):
        return "oracle"
    if any(x in n for x in ["usdc", "usdt", "dai", "tether"]):
        return "stablecoin"
    if any(x in n for x in ["render", "akash", "filecoin", "arweave"]):
        return "depin"
    if any(x in n for x in ["ondo", "centrifuge", "maple", "goldfinch"]):
        return "rwa"
    return "other"


def _sector_for(category: str) -> str:
    c = (category or "").lower()
    if any(x in c for x in ["stablecoin", "currency"]):
        return "Payments / Stablecoins"
    if any(x in c for x in ["dex", "lending", "liquid staking"]):
        return "DeFi"
    if any(x in c for x in ["oracle", "rpc", "bridge", "infrastructure", "data"]):
        return "Infrastructure"
    if any(x in c for x in ["rwa"]):
        return "RWA"
    if any(x in c for x in ["depin"]):
        return "DePIN"
    if any(x in c for x in ["smart contract", "layer", "rollup"]):
        return "L1 / L2"
    return "Other"


def _short_description(market: dict[str, Any], llama: dict[str, Any] | None) -> str:
    mc = market.get("market_cap") or 0.0
    chg = market.get("price_change_percentage_24h") or 0.0
    parts = [f"MC ${mc/1e6:.0f}M", f"24h {chg:+.1f}%"]
    if llama:
        tvl = llama.get("tvl") or 0.0
        if tvl > 0:
            parts.append(f"TVL ${tvl/1e6:.0f}M")
        chains = llama.get("chain") or ""
        if chains:
            parts.append(f"chains: {chains[:60]}")
    return " · ".join(parts)


def _describe_signal(fees: dict[str, Any] | None, llama: dict[str, Any] | None, category: str) -> str:
    bits: list[str] = []
    if fees:
        f24 = fees.get("fees_24h") or 0.0
        r24 = fees.get("revenue_24h") or 0.0
        if f24 > 0:
            bits.append(f"fees 24h ${f24/1e3:.0f}K")
        if r24 > 0:
            bits.append(f"rev 24h ${r24/1e3:.0f}K")
    if llama:
        tvl = llama.get("tvl") or 0.0
        if tvl > 0:
            bits.append(f"TVL ${tvl/1e6:.0f}M")
    if category:
        bits.append(f"cat: {category}")
    return " · ".join(bits) if bits else "limited signal"
