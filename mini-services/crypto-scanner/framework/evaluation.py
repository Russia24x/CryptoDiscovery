"""
PHASE 4 — Fundamental Evaluation.

Scores the five fundamental axes (0-10) with confidence (0-100).
All scoring is rule-based and transparent, derived from the evidence
collected in PHASE 3.
"""
from __future__ import annotations

from typing import Any

from models.schemas import (
    AxisName,
    AxisScore,
    EconomicEngine,
    EvidenceGrade,
    MarketStructure,
    Tokenomics,
)


# --------------------------------------------------------------------------- #
#  Helpers
# --------------------------------------------------------------------------- #
def _clamp(v: float, lo: float = 0.0, hi: float = 10.0) -> float:
    return max(lo, min(hi, v))


def _confidence_from(grade: EvidenceGrade, sources: int, freshness_factor: float = 1.0) -> float:
    base = {
        EvidenceGrade.A: 90.0,
        EvidenceGrade.B: 76.0,
        EvidenceGrade.C: 56.0,
        EvidenceGrade.D: 32.0,
    }[grade]
    # reward independent sources, cap at 100
    src_bonus = min(10.0, sources * 2.0)
    return _clamp(base + src_bonus * freshness_factor, 0.0, 100.0) * 1.0


# --------------------------------------------------------------------------- #
#  AXIS 1 — INVISIBLE UTILITY
# --------------------------------------------------------------------------- #
def score_invisible_utility(
    *,
    has_api: bool | None,
    has_sdk: bool | None,
    has_docs: bool | None,
    developer_count: int,
    github_stars: int,
    is_infrastructure: bool,
    is_user_facing_app: bool,
    switching_cost_signal: bool,
    evidence_grade: EvidenceGrade,
    sources: int,
) -> AxisScore:
    # Three-state sub-factor scoring: True=positive, False=negative,
    # None=neutral (unknown). Per "Never guess missing data" principle:
    # when we lack evidence, we don't default to the worst score (1.0),
    # we default to a neutral midpoint (~2.5-3.0 out of 5).
    NEUTRAL = 2.5  # midpoint of the 1.0-4.0 positive/negative range
    subs: dict[str, float] = {}
    subs["User Abstraction"] = 3.0 if is_infrastructure else (5.0 if is_user_facing_app else 1.0)
    # Integration Simplicity: True=4.0 (API confirmed), False=1.0 (no API),
    # None=2.5 (unknown — don't penalize for missing evidence)
    subs["Integration Simplicity"] = (
        4.0 if has_api is True else (1.0 if has_api is False else NEUTRAL)
    )
    # API Usability: True+SDK=4.0, True no SDK=2.0, False=1.0, None=2.5
    if has_api is True and has_sdk is True:
        subs["API Usability"] = 4.0
    elif has_api is True:
        subs["API Usability"] = 2.0
    elif has_api is False:
        subs["API Usability"] = 1.0
    else:  # has_api is None (unknown)
        subs["API Usability"] = NEUTRAL
    subs["Developer Experience"] = min(8.0, 2.0 + developer_count * 0.5)
    # Documentation: True=4.0 (docs confirmed), False=1.0 (no docs),
    # None=2.5 (unknown)
    subs["Documentation"] = (
        4.0 if has_docs is True else (1.0 if has_docs is False else NEUTRAL)
    )
    subs["Switching Cost"] = 5.0 if switching_cost_signal else 2.0
    subs["Community Signal"] = min(7.0, 1.0 + github_stars / 1000.0)
    s = sum(subs.values()) / len(subs)
    s = _clamp(s)
    conf = _confidence_from(evidence_grade, sources)
    reason = (
        "Infrastructure-layer with API/SDK abstraction" if is_infrastructure and has_api is True
        else "Consumer-facing app, limited invisible utility" if is_user_facing_app
        else "Limited developer-facing abstraction"
    )
    return AxisScore(
        name=AxisName.INVISIBLE_UTILITY,
        score=round(s, 2),
        confidence=round(conf, 1),
        key_reason=reason,
        sub_factors={k: round(v, 2) for k, v in subs.items()},
    )


# --------------------------------------------------------------------------- #
#  AXIS 2 — ECONOMIC ENGINE
# --------------------------------------------------------------------------- #
def score_economic_engine(
    econ: EconomicEngine,
    *,
    evidence_grade: EvidenceGrade,
    sources: int,
) -> AxisScore:
    subs: dict[str, float] = {}

    # Revenue scale — Framework 3.0: Fees ≠ Revenue.
    # If revenue is available, use it. If not, use fees as "Annualized Run-Rate"
    # but explicitly flag it (lower confidence, capped score).
    daily_rev = econ.revenue or 0.0
    daily_fees = econ.fees or 0.0
    annual_rev = daily_rev * 365.0
    annual_fees = daily_fees * 365.0

    # Revenue Scale: use actual revenue if available, otherwise capped fees-based proxy
    if daily_rev > 0:
        # Real revenue exists — full scoring
        if annual_rev >= 500_000_000:
            subs["Revenue Scale"] = 9.5
        elif annual_rev >= 100_000_000:
            subs["Revenue Scale"] = 8.0
        elif annual_rev >= 30_000_000:
            subs["Revenue Scale"] = 6.5
        elif annual_rev >= 10_000_000:
            subs["Revenue Scale"] = 5.0
        elif annual_rev >= 1_000_000:
            subs["Revenue Scale"] = 3.5
        else:
            subs["Revenue Scale"] = 2.0
    elif daily_fees > 0:
        # No revenue data — use fees as "Annualized Run-Rate" proxy (capped)
        # Framework 3.0: "Fees × 12 is annualized run-rate, NOT real revenue"
        # Cap at 5.0 (can't score higher than "moderate" without real revenue)
        if annual_fees >= 100_000_000:
            subs["Revenue Scale"] = 5.0  # Capped — fees ≠ revenue
        elif annual_fees >= 30_000_000:
            subs["Revenue Scale"] = 4.0
        elif annual_fees >= 10_000_000:
            subs["Revenue Scale"] = 3.0
        elif annual_fees >= 1_000_000:
            subs["Revenue Scale"] = 2.0
        else:
            subs["Revenue Scale"] = 1.5
    else:
        subs["Revenue Scale"] = 0.5

    # Fees scale (separate from revenue — captures economic activity)
    if annual_fees >= 1_000_000_000:
        subs["Fee Generation"] = 9.5
    elif annual_fees >= 300_000_000:
        subs["Fee Generation"] = 7.5
    elif annual_fees >= 50_000_000:
        subs["Fee Generation"] = 5.5
    elif annual_fees > 0:
        subs["Fee Generation"] = 3.0
    else:
        subs["Fee Generation"] = 0.5

    # Growth
    g = econ.fee_growth_pct or 0.0
    if g >= 100:
        subs["Growth"] = 9.0
    elif g >= 50:
        subs["Growth"] = 7.5
    elif g >= 20:
        subs["Growth"] = 6.0
    elif g >= 0:
        subs["Growth"] = 4.0
    else:
        subs["Growth"] = 2.0

    # TVL / AUM
    tvl = econ.tvl or 0.0
    if tvl >= 10_000_000_000:
        subs["AUM / TVL"] = 9.0
    elif tvl >= 1_000_000_000:
        subs["AUM / TVL"] = 7.0
    elif tvl >= 100_000_000:
        subs["AUM / TVL"] = 5.0
    elif tvl > 0:
        subs["AUM / TVL"] = 3.0
    else:
        subs["AUM / TVL"] = 1.0

    # Recurrence / retention
    subs["Recurrence"] = 6.0 if (econ.recurrence and "recur" in econ.recurrence.lower()) else 3.0
    subs["Retention"] = (econ.retention_pct or 0.0) / 10.0  # 0-100 → 0-10

    # Customer concentration (lower is better)
    cc = (econ.customer_concentration or "").lower()
    if "high" in cc:
        subs["Customer Diversification"] = 2.0
    elif "medium" in cc:
        subs["Customer Diversification"] = 5.0
    elif "low" in cc:
        subs["Customer Diversification"] = 8.0
    else:
        subs["Customer Diversification"] = 4.0

    score = _clamp(sum(subs.values()) / len(subs))
    conf = _confidence_from(evidence_grade, sources)
    reason = (
        f"Annualized revenue ~${annual_rev/1e6:.1f}M, fees ~${annual_fees/1e6:.1f}M"
        if annual_rev > 0 or annual_fees > 0
        else "Limited fee/revenue evidence — confidence capped"
    )
    return AxisScore(
        name=AxisName.ECONOMIC_ENGINE,
        score=round(score, 2),
        confidence=round(conf, 1),
        key_reason=reason,
        sub_factors={k: round(v, 2) for k, v in subs.items()},
    )


# --------------------------------------------------------------------------- #
#  AXIS 3 — MOAT
# --------------------------------------------------------------------------- #
def score_moat(
    *,
    tvl_rank: int | None,
    category: str,
    chain_count: int,
    has_regulatory_license: bool,
    partner_integrations: int,
    liquidity_tvl: float,
    evidence_grade: EvidenceGrade,
    sources: int,
) -> AxisScore:
    subs: dict[str, float] = {}

    # Network / TVL rank moat
    if tvl_rank is not None and tvl_rank <= 3:
        subs["Network Moat"] = 9.0
    elif tvl_rank is not None and tvl_rank <= 10:
        subs["Network Moat"] = 7.0
    elif tvl_rank is not None and tvl_rank <= 25:
        subs["Network Moat"] = 5.0
    else:
        subs["Network Moat"] = 3.0

    # Regulatory moat (compliance != moat; only a real license helps)
    subs["Regulatory Moat"] = 7.0 if has_regulatory_license else 2.0

    # Distribution / integrations moat
    if partner_integrations >= 100:
        subs["Distribution Moat"] = 8.5
    elif partner_integrations >= 25:
        subs["Distribution Moat"] = 6.5
    elif partner_integrations >= 5:
        subs["Distribution Moat"] = 4.5
    else:
        subs["Distribution Moat"] = 2.5

    # Integration depth (multi-chain)
    if chain_count >= 10:
        subs["Integration Moat"] = 8.0
    elif chain_count >= 4:
        subs["Integration Moat"] = 6.0
    elif chain_count >= 2:
        subs["Integration Moat"] = 4.0
    else:
        subs["Integration Moat"] = 2.0

    # Liquidity moat
    if liquidity_tvl >= 5_000_000_000:
        subs["Liquidity Moat"] = 9.0
    elif liquidity_tvl >= 500_000_000:
        subs["Liquidity Moat"] = 6.5
    elif liquidity_tvl >= 50_000_000:
        subs["Liquidity Moat"] = 4.5
    else:
        subs["Liquidity Moat"] = 2.0

    # Data moat — heuristic: protocols in specific categories accumulate data
    data_cats = {"oracle", "analytics", "indexing", "identity", "credit", "risk"}
    subs["Data Moat"] = 6.0 if any(d in category.lower() for d in data_cats) else 3.0

    score = _clamp(sum(subs.values()) / len(subs))
    conf = _confidence_from(evidence_grade, sources)
    reason = (
        f"Strong network effect (rank #{tvl_rank})" if tvl_rank and tvl_rank <= 10
        else "Moderate moat — early network effect"
        if tvl_rank and tvl_rank <= 25
        else "Limited moat evidence"
    )
    return AxisScore(
        name=AxisName.MOAT,
        score=round(score, 2),
        confidence=round(conf, 1),
        key_reason=reason,
        sub_factors={k: round(v, 2) for k, v in subs.items()},
    )


# --------------------------------------------------------------------------- #
#  AXIS 4 — TOKEN & MARKET STRUCTURE
# --------------------------------------------------------------------------- #
def score_token_market(
    token: Tokenomics,
    market: MarketStructure,
    *,
    has_token: bool,
    evidence_grade: EvidenceGrade,
    sources: int,
) -> AxisScore:
    if not has_token:
        return AxisScore(
            name=AxisName.TOKEN_MARKET,
            score=0.0,
            confidence=80.0,
            key_reason="No token — N/A for token analysis (evaluate equity separately).",
            sub_factors={"Has Token": 0.0},
        )

    subs: dict[str, float] = {}

    # Utility level (0-4 → 0-10)
    subs["Token Utility"] = token.utility_level * 2.5

    # Value capture
    vc = (token.value_capture or "").lower()
    if "strong" in vc or "high" in vc:
        subs["Value Capture"] = 8.0
    elif "moderate" in vc:
        subs["Value Capture"] = 5.0
    elif "weak" in vc or "low" in vc:
        subs["Value Capture"] = 2.5
    else:
        subs["Value Capture"] = 4.0

    # Supply inflation (annualized supply growth)
    sg = token.supply_growth_pct or 0.0
    if sg <= 1.0:
        subs["Supply Discipline"] = 9.0
    elif sg <= 3.0:
        subs["Supply Discipline"] = 7.5
    elif sg <= 6.0:
        subs["Supply Discipline"] = 5.5
    elif sg <= 10.0:
        subs["Supply Discipline"] = 3.5
    else:
        subs["Supply Discipline"] = 2.0

    # Unlock risk
    ur = (token.unlock_risk or "").lower()
    if "high" in ur:
        subs["Unlock Risk"] = 2.0
    elif "medium" in ur:
        subs["Unlock Risk"] = 5.0
    elif "low" in ur:
        subs["Unlock Risk"] = 8.0
    else:
        subs["Unlock Risk"] = 5.0

    # Insider allocation (lower is better)
    ia = token.insider_allocation_pct or 50.0
    if ia <= 15:
        subs["Holder Alignment"] = 8.5
    elif ia <= 30:
        subs["Holder Alignment"] = 6.5
    elif ia <= 50:
        subs["Holder Alignment"] = 4.5
    else:
        subs["Holder Alignment"] = 2.0

    # Buyback / burn
    bb = 2.0
    if token.buyback:
        bb += 3.0
    if token.burn:
        bb += 3.0
    subs["Buyback / Burn"] = bb

    # Liquidity (market depth)
    dv = market.daily_volume or 0.0
    mc = token.market_cap or 0.0
    if mc > 0:
        vol_ratio = dv / mc
        if vol_ratio >= 0.20:
            subs["Market Liquidity"] = 9.0
        elif vol_ratio >= 0.10:
            subs["Market Liquidity"] = 7.0
        elif vol_ratio >= 0.05:
            subs["Market Liquidity"] = 5.0
        elif vol_ratio >= 0.02:
            subs["Market Liquidity"] = 3.5
        else:
            subs["Market Liquidity"] = 2.0
    else:
        subs["Market Liquidity"] = 3.0

    # Holder concentration (lower better)
    hc = market.holder_concentration or 0.0
    if hc <= 0.20:
        subs["Holder Distribution"] = 8.5
    elif hc <= 0.40:
        subs["Holder Distribution"] = 6.5
    elif hc <= 0.60:
        subs["Holder Distribution"] = 4.5
    else:
        subs["Holder Distribution"] = 2.5

    score = _clamp(sum(subs.values()) / len(subs))
    conf = _confidence_from(evidence_grade, sources)
    reason = (
        f"Utility L{token.utility_level}, "
        f"supply growth ~{token.supply_growth_pct or 0:.1f}%"
    )
    return AxisScore(
        name=AxisName.TOKEN_MARKET,
        score=round(score, 2),
        confidence=round(conf, 1),
        key_reason=reason,
        sub_factors={k: round(v, 2) for k, v in subs.items()},
    )


# --------------------------------------------------------------------------- #
#  AXIS 5 — GOVERNANCE, LEGAL & SECURITY
# --------------------------------------------------------------------------- #
def score_governance_legal(
    *,
    team_transparent: bool,
    has_legal_entity: bool,
    audit_status: str,  # "recent", "stale", "none"
    incident_history: str,  # "none", "minor", "major_unresolved", "major_resolved"
    multisig: bool,
    upgrade_admin_decentralized: bool,
    regulatory_status: str,  # "clear", "uncertain", "adverse"
    disclosure_quality: str,  # "high", "medium", "low"
    evidence_grade: EvidenceGrade,
    sources: int,
) -> AxisScore:
    subs: dict[str, float] = {}

    subs["Team Transparency"] = 7.0 if team_transparent else 2.5
    subs["Legal Entity"] = 7.0 if has_legal_entity else 3.0

    audit_score = {"recent": 8.5, "stale": 5.0, "none": 2.0}.get(audit_status, 4.0)
    subs["Audit Quality"] = audit_score

    incident_score = {
        "none": 9.0,
        "minor": 6.5,
        "major_resolved": 5.5,
        "major_unresolved": 1.5,
    }.get(incident_history, 5.0)
    subs["Incident History"] = incident_score

    subs["Operational Security"] = 7.5 if multisig else 3.0
    subs["Upgrade Decentralization"] = 7.5 if upgrade_admin_decentralized else 3.5

    reg_score = {"clear": 8.5, "uncertain": 4.5, "adverse": 1.5}.get(regulatory_status, 4.5)
    subs["Regulatory Status"] = reg_score

    disc_score = {"high": 8.0, "medium": 5.5, "low": 2.5}.get(disclosure_quality, 4.5)
    subs["Disclosure Quality"] = disc_score

    score = _clamp(sum(subs.values()) / len(subs))
    conf = _confidence_from(evidence_grade, sources)
    reason_map = {
        "none": "Clean incident record",
        "minor": "Minor past incident, resolved",
        "major_resolved": "Major past incident, mitigated",
        "major_unresolved": "Major unresolved incident — high risk",
    }
    reason = (
        f"{reason_map.get(incident_history, 'Unknown incident status')}; "
        f"audit {audit_status}; regulatory {regulatory_status}"
    )
    return AxisScore(
        name=AxisName.GOVERNANCE_LEGAL,
        score=round(score, 2),
        confidence=round(conf, 1),
        key_reason=reason,
        sub_factors={k: round(v, 2) for k, v in subs.items()},
    )


# --------------------------------------------------------------------------- #
#  Token quality (PHASE 5.4) — separate from project quality
# --------------------------------------------------------------------------- #
def token_quality_score(token: Tokenomics, market: MarketStructure) -> float:
    """0-100 score for the token itself (value capture, structure, liquidity)."""
    if token.market_cap is None:
        return 40.0
    parts: list[float] = []
    parts.append(min(25.0, token.utility_level * 6.0))
    vc = (token.value_capture or "").lower()
    parts.append(25.0 if "strong" in vc else (15.0 if "moderate" in vc else 5.0))
    sg = token.supply_growth_pct or 5.0
    parts.append(max(0.0, 20.0 - sg * 2.0))
    ia = token.insider_allocation_pct or 50.0
    parts.append(max(0.0, 20.0 - ia * 0.3))
    if token.market_cap and market.daily_volume:
        ratio = market.daily_volume / token.market_cap
        parts.append(min(10.0, ratio * 40.0))
    else:
        parts.append(3.0)
    return round(_clamp(sum(parts), 0.0, 100.0), 1)
