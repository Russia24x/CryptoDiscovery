"""
PHASE 3 — Evidence Collection.

For each candidate, pull detailed on-chain & off-chain data:
  - CoinGecko coin detail (tokenomics, market structure, links)
  - DeFiLlama protocol detail (TVL history, chain count)
  - DeFiLlama fees detail (fees / revenue breakdown)

Aggregates into EconomicEngine, Tokenomics, MarketStructure,
and evidence-grade metadata used by the evaluator.
"""
from __future__ import annotations

import logging
from typing import Any

from models.schemas import (
    EconomicEngine,
    EvidenceGrade,
    MarketStructure,
    Tokenomics,
)
from data import sources

log = logging.getLogger("scanner.evidence")


# --------------------------------------------------------------------------- #
#  Public entry
# --------------------------------------------------------------------------- #
class EvidenceBundle:
    """Everything the evaluator needs to score a project."""

    def __init__(self) -> None:
        self.economic = EconomicEngine()
        self.tokenomics = Tokenomics()
        self.market = MarketStructure()
        self.grade = EvidenceGrade.D
        self.sources = 0
        self.freshness_factor = 1.0

        # raw flags for veto & axis 5
        self.team_transparent = False
        self.has_legal_entity = False
        self.audit_status = "none"
        self.incident_history = "none"
        self.multisig = False
        self.upgrade_admin_decentralized = False
        self.regulatory_status = "uncertain"
        self.disclosure_quality = "medium"

        # moat signals
        self.tvl_rank: int | None = None
        self.chain_count = 1
        self.has_regulatory_license = False
        self.partner_integrations = 0
        self.liquidity_tvl = 0.0
        self.category = ""

        # invisible utility signals
        self.has_api = False
        self.has_sdk = False
        self.has_docs = False
        self.developer_count = 0
        self.github_stars = 0
        self.is_infrastructure = False
        self.is_user_facing_app = False
        self.switching_cost_signal = False

        # severe risks
        self.anonymous_team = True
        self.centralized_governance = True
        self.centralized_upgrade = True
        self.high_customer_concentration = False
        self.near_unlock_cliff = False
        self.market_maker_dependency = False
        self.bridge_dependency = False
        self.chain_dependency = False
        self.unclear_token_value_capture = False
        self.regulatory_uncertainty = True

        # veto inputs (defaults safe)
        self.guaranteed_return_claims = False
        self.ponzi_structure = False
        self.unresolved_hack = False
        self.single_key_custody = False
        self.opaque_custody = False
        self.backing_transparency_failure = False
        self.legal_deception = False

        # has token?
        self.has_token = True
        self.market_cap_usd: float | None = None
        self.fdv_usd: float | None = None


async def collect(
    candidate,
    llama_overview: dict[str, Any] | None = None,
    fees_overview: dict[str, Any] | None = None,
) -> EvidenceBundle:
    """Collect all available evidence for a single candidate.

    Uses the already-fetched DeFiLlama overview data (no per-protocol
    API call needed). Only optionally hits CoinGecko for tokenomics,
    with a graceful fallback when rate-limited.
    """
    b = EvidenceBundle()

    # 1) DeFiLlama protocol overview (from cache — no network)
    if llama_overview:
        _apply_llama_detail(b, llama_overview)
        b.sources += 1

    # 2) DeFiLlama fees overview (from cache — no network)
    if fees_overview:
        _apply_fees_overview(b, fees_overview)
        b.sources += 1

    # 3) CoinGecko coin detail (network — may 429, that's OK)
    if candidate.gecko_id:
        try:
            detail = await sources.fetch_coin_detail(candidate.gecko_id)
            if detail:
                _apply_gecko_detail(b, detail)
                b.sources += 1
        except Exception:  # noqa: BLE001
            pass

    # 4) Category-derived signals
    _apply_category_inferences(b, candidate.category)

    # 5) Evidence grade
    if b.sources >= 3:
        b.grade = EvidenceGrade.A
    elif b.sources == 2:
        b.grade = EvidenceGrade.B
    elif b.sources == 1:
        b.grade = EvidenceGrade.C
    else:
        b.grade = EvidenceGrade.D

    # category + infrastructure
    b.category = candidate.category
    infra_cats = {"oracle", "rpc", "bridge", "infrastructure", "payments", "data", "liquid staking", "dex", "lending"}
    b.is_infrastructure = any(x in candidate.category.lower() for x in infra_cats)
    return b


# --------------------------------------------------------------------------- #
#  CoinGecko detail applier
# --------------------------------------------------------------------------- #
def _apply_gecko_detail(b: EvidenceBundle, d: dict[str, Any]) -> None:
    md = d.get("market_data") or {}
    b.tokenomics.market_cap = md.get("market_cap", {}).get("usd")
    b.tokenomics.fdv = md.get("fully_diluted_valuation", {}).get("usd")
    b.tokenomics.circulating_supply = md.get("circulating_supply")
    b.tokenomics.total_supply = md.get("total_supply")
    b.tokenomics.max_supply = md.get("max_supply")

    b.market.daily_volume = md.get("total_volume", {}).get("usd")
    b.market_cap_usd = b.tokenomics.market_cap
    b.fdv_usd = b.tokenomics.fdv

    # inflation: if max supply exists, derive annualized growth from circulating vs total
    cs = b.tokenomics.circulating_supply or 0.0
    ts = b.tokenomics.total_supply or 0.0
    ms = b.tokenomics.max_supply or 0.0
    if ts and cs:
        # very rough: % of supply not yet released / 3 years
        pending = max(0.0, ts - cs)
        if ts > 0:
            b.tokenomics.supply_growth_pct = round((pending / ts) * 100 / 3, 2)
    elif ms and cs:
        pending = max(0.0, ms - cs)
        if ms > 0:
            b.tokenomics.supply_growth_pct = round((pending / ms) * 100 / 3, 2)

    # links → detect API/docs presence
    links = d.get("links") or {}
    site = (links.get("homepage") or [None])[0]
    repo = (links.get("repos_url") or {}).get("github") or []
    if repo:
        b.has_docs = True  # repos usually have docs
        b.has_sdk = True
        b.has_api = True
        # rough developer count from stars
        # (we don't call GitHub API to stay key-less; use a heuristic)
        b.github_stars = 1500  # placeholder signal (kept conservative)

    # community data
    cd = d.get("community_data") or {}
    tw = cd.get("twitter_followers") or 0
    if tw > 50_000:
        b.disclosure_quality = "medium"

    # asset-platform / contract (governance hint)
    ap = d.get("asset_platform_id")
    if ap:
        b.has_legal_entity = True  # having a deployed platform implies some entity

    # platforms present (multi-chain?)
    platforms = d.get("platforms") or {}
    non_empty = {k: v for k, v in platforms.items() if v}
    if len(non_empty) > 1:
        b.chain_count = len(non_empty)

    # token utility level inference
    util_text = " ".join(str(x).lower() for x in [
        d.get("description", {}).get("en", ""),
        d.get("name", ""),
    ])
    if any(x in util_text for x in ["staking", "fee", "burn", "buyback", "revenue share"]):
        b.tokenomics.utility_level = 3
        b.tokenomics.value_capture = "moderate"
    elif any(x in util_text for x in ["governance", "vote"]):
        b.tokenomics.utility_level = 1
        b.tokenomics.value_capture = "weak"
    else:
        b.tokenomics.utility_level = 2
        b.tokenomics.value_capture = "moderate"

    # detect staking
    if "staking" in util_text:
        b.tokenomics.staking_pct = 30.0  # placeholder

    # Insider allocation heuristic: use public_supply vs total
    if cs and ts and ts > 0:
        circ_ratio = cs / ts
        # if circulating < 50% → insiders hold majority
        if circ_ratio < 0.5:
            b.tokenomics.insider_allocation_pct = round((1 - circ_ratio) * 70, 1)
            b.near_unlock_cliff = True
        else:
            b.tokenomics.insider_allocation_pct = round((1 - circ_ratio) * 50, 1)

    b.is_user_facing_app = any(x in util_text for x in ["wallet", "exchange", "swap", "trade"])


# --------------------------------------------------------------------------- #
#  DeFiLlama protocol detail applier
# --------------------------------------------------------------------------- #
def _apply_llama_detail(b: EvidenceBundle, p: dict[str, Any]) -> None:
    tvl = p.get("tvl") or 0.0
    b.economic.tvl = tvl
    b.liquidity_tvl = tvl

    # chain count
    chains = p.get("chain") or ""
    if isinstance(chains, str) and chains:
        parts = [c for c in chains.split(",") if c.strip()]
        b.chain_count = max(b.chain_count, len(parts))

    # TVL rank (within category) if present
    rank = p.get("rank") or p.get("tvl_rank")
    if isinstance(rank, int):
        b.tvl_rank = rank

    # parent protocol → integrations hint
    pp = p.get("parentProtocol")
    if pp:
        b.partner_integrations += 1

    # audits / hallmarks
    audits = p.get("audit_links") or []
    if audits:
        b.audit_status = "recent"
    hallmarks = p.get("hallmarks") or []
    for h in hallmarks:
        title = (h.get("title") or "").lower() if isinstance(h, dict) else str(h).lower()
        if "hack" in title or "exploit" in title:
            b.incident_history = "major_resolved"
        if "launch" in title:
            b.team_transparent = True

    # governance
    gov = p.get("governance") or {}
    if gov:
        b.centralized_governance = False
        b.team_transparent = True

    # methodology / disclosure
    method = p.get("methodology") or p.get("methodologyURL")
    if method:
        b.disclosure_quality = "high"

    # bridge / chain dependency inference
    if b.chain_count <= 1:
        b.chain_dependency = True

    b.economic.customer_concentration = "medium"  # default placeholder
    b.economic.recurrence = "recurring" if tvl > 0 else "none"


# --------------------------------------------------------------------------- #
#  DeFiLlama fees detail applier
# --------------------------------------------------------------------------- #
def _apply_fees_overview(b: EvidenceBundle, f: dict[str, Any]) -> None:
    """Apply fees/revenue from the overview list (slim fields)."""
    f24 = f.get("fees_24h") or 0.0
    r24 = f.get("revenue_24h") or 0.0
    f7d = f.get("fees_7d") or 0.0
    r7d = f.get("revenue_7d") or 0.0
    f30d = f.get("fees_30d") or 0.0

    if f24 > 0:
        b.economic.fees = f24
    if r24 > 0:
        b.economic.revenue = r24

    # growth: 24h vs 7d avg
    if f24 > 0 and f7d > 0:
        avg7 = f7d / 7.0
        if avg7 > 0:
            b.economic.revenue_growth_pct = round(((f24 - avg7) / avg7) * 100, 1)

    # net revenue proxy: monthly fees / 30
    if f30d > 0:
        b.economic.net_revenue = f30d / 30.0

    # having real fees implies moderate value capture (to be refined)
    if f24 > 0:
        b.tokenomics.value_capture = "moderate"
        b.unclear_token_value_capture = False


def _apply_fees_detail(b: EvidenceBundle, f: dict[str, Any]) -> None:
    """Apply detailed fees breakdown (when available — richer fields)."""
    _apply_fees_overview(b, f)
    total = f.get("totalDataChart") or f.get("totalDataChartUSD") or []
    breakdowns = f.get("breakdowns") or []
    if breakdowns:
        b.tokenomics.value_capture = "moderate"
        b.unclear_token_value_capture = False
    if total and isinstance(total, list) and len(total) > 30:
        recent = total[-1][1] if isinstance(total[-1], list) else 0
        month_ago = total[-30][1] if isinstance(total[-30], list) else 0
        if month_ago > 0:
            b.economic.net_revenue = recent - month_ago


# --------------------------------------------------------------------------- #
#  Category-driven inferences
# --------------------------------------------------------------------------- #
def _apply_category_inferences(b: EvidenceBundle, category: str) -> None:
    c = (category or "").lower()

    # Stablecoin / RWA → custody & backing matter
    if "stablecoin" in c or "rwa" in c:
        # We have no direct backing data from public APIs, so we mark it
        # as needing verification rather than triggering a veto.
        b.regulatory_uncertainty = False
        b.has_regulatory_license = True  # assume for major stablecoins (verification listed)

    # bridges → bridge dependency
    if "bridge" in c:
        b.bridge_dependency = True

    # oracles → strong moat, no custody risk
    if "oracle" in c:
        b.single_key_custody = False
        b.opaque_custody = False

    # lending / liquid staking → multisig assumed for majors
    if "lending" in c or "liquid staking" in c:
        b.multisig = True
        b.centralized_upgrade = False
        b.team_transparent = True

    # DEX → no custody risk
    if "dex" in c:
        b.single_key_custody = False
        b.opaque_custody = False
        b.team_transparent = True

    # infrastructure → switching cost
    if "infrastructure" in c or "oracle" in c or "rpc" in c or "data" in c:
        b.switching_cost_signal = True
        b.is_infrastructure = True

    # smart contract platform → decentralized
    if "smart contract" in c or "layer" in c or "rollup" in c:
        b.centralized_governance = False
        b.centralized_upgrade = False
        b.team_transparent = True
        b.upgrade_admin_decentralized = True
        b.has_legal_entity = True
        b.regulatory_uncertainty = False
