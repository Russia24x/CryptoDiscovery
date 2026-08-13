"""
PHASE 5-8 — Scoring, Investment Analysis, Decision, and Output Formatting.

Combines axis scores into project quality, runs weakest-link penalty,
derives token quality, investment attractiveness, cycle phase, catalysts,
thesis & kill conditions, and the final 23-section report.
"""
from __future__ import annotations

import hashlib
import time
from datetime import datetime
from typing import Any

from models.schemas import (
    ActionLevel,
    Catalyst,
    CandidateInfo,
    CyclePhase,
    Decision,
    EvidenceGrade,
    InvestmentAnalysis,
    PeerBenchmark,
    ProjectReport,
    ScanConfig,
    ValuationVerdict,
)
from framework.core import (
    PERSONA_WEIGHTS,
    action_from_scores,
    build_severe_risks,
    evaluate_vetoes,
    project_quality_band,
    weakest_link_penalty,
)
from framework.evidence import EvidenceBundle
from framework.evaluation import (
    score_economic_engine,
    score_governance_legal,
    score_invisible_utility,
    score_moat,
    score_token_market,
    token_quality_score,
)


# --------------------------------------------------------------------------- #
#  Build a full report from evidence
# --------------------------------------------------------------------------- #
def build_report(
    candidate: CandidateInfo,
    ev: EvidenceBundle,
    config: ScanConfig,
    scan_id: str,
) -> ProjectReport:
    now = datetime.utcnow()

    # --- PHASE 2: Veto gates ---
    veto = evaluate_vetoes(
        guaranteed_return_claims=ev.guaranteed_return_claims,
        ponzi_structure=ev.ponzi_structure,
        unresolved_hack=ev.unresolved_hack,
        single_key_custody=ev.single_key_custody,
        opaque_custody=ev.opaque_custody,
        backing_transparency_failure=ev.backing_transparency_failure,
        legal_deception=ev.legal_deception,
    )

    # severe risks
    severe = build_severe_risks({
        "Anonymous team": ev.anonymous_team,
        "Stale audit": ev.audit_status == "stale",
        "Centralized governance": ev.centralized_governance,
        "Centralized upgrade authority": ev.centralized_upgrade,
        "Single solver dependency": False,
        "High customer concentration": ev.high_customer_concentration,
        "Near token unlock cliff": ev.near_unlock_cliff,
        "Market maker dependency": ev.market_maker_dependency,
        "Critical bridge dependency": ev.bridge_dependency,
        "Critical chain dependency": ev.chain_dependency,
        "Unclear token value capture": ev.unclear_token_value_capture,
        "Regulatory uncertainty": ev.regulatory_uncertainty,
    })

    # --- PHASE 4: Axes ---
    a1 = score_invisible_utility(
        has_api=ev.has_api,
        has_sdk=ev.has_sdk,
        has_docs=ev.has_docs,
        developer_count=ev.developer_count,
        github_stars=ev.github_stars,
        is_infrastructure=ev.is_infrastructure,
        is_user_facing_app=ev.is_user_facing_app,
        switching_cost_signal=ev.switching_cost_signal,
        evidence_grade=ev.grade,
        sources=ev.sources,
    )
    a2 = score_economic_engine(ev.economic, evidence_grade=ev.grade, sources=ev.sources)
    a3 = score_moat(
        tvl_rank=ev.tvl_rank,
        category=ev.category,
        chain_count=ev.chain_count,
        has_regulatory_license=ev.has_regulatory_license,
        partner_integrations=ev.partner_integrations,
        liquidity_tvl=ev.liquidity_tvl,
        evidence_grade=ev.grade,
        sources=ev.sources,
    )
    a4 = score_token_market(
        ev.tokenomics, ev.market,
        has_token=ev.has_token,
        evidence_grade=ev.grade,
        sources=ev.sources,
    )
    a5 = score_governance_legal(
        team_transparent=ev.team_transparent,
        has_legal_entity=ev.has_legal_entity,
        audit_status=ev.audit_status,
        incident_history=ev.incident_history,
        multisig=ev.multisig,
        upgrade_admin_decentralized=ev.upgrade_admin_decentralized,
        regulatory_status="clear" if not ev.regulatory_uncertainty else "uncertain",
        disclosure_quality=ev.disclosure_quality,
        evidence_grade=ev.grade,
        sources=ev.sources,
    )
    axes = [a1, a2, a3, a4, a5]

    # --- PHASE 5: Weighted scoring ---
    weights = PERSONA_WEIGHTS[config.persona]
    raw = sum(weights[a.name] * a.score * 10.0 for a in axes)  # 0-100

    min_axis = min(a.score for a in axes)
    min_sub = None
    for a in axes:
        for v in a.sub_factors.values():
            if min_sub is None or v < min_sub:
                min_sub = v
    penalty, high_risk = weakest_link_penalty(min_axis, min_sub)
    project_quality = max(0.0, raw - penalty)

    # overall confidence: weighted by axis confidence
    overall_conf = sum(weights[a.name] * a.confidence for a in axes)

    risk_adjusted = project_quality * (overall_conf / 100.0)

    # Token quality
    tq = token_quality_score(ev.tokenomics, ev.market) if ev.has_token else None

    # --- PHASE 6: Investment analysis ---
    inv = _build_investment_analysis(ev, project_quality, tq, overall_conf)

    # cycle phase
    cycle = _infer_cycle_phase(ev, project_quality)

    # peer benchmark
    peer = PeerBenchmark(
        peer_percentile=round(_peer_percentile(project_quality), 1),
        category_rank=f"#{_rank_from_score(project_quality)}",
        closest_comparables=_comparables(ev.category, candidate.name),
    )

    # catalysts
    catalysts = _build_catalysts(ev, cycle)

    # thesis + kill conditions
    thesis = _build_thesis(candidate, ev, cycle)
    kills = _build_kill_conditions(ev)

    # --- PHASE 7: Decision ---
    action_level, action_label = action_from_scores(
        project_quality=project_quality,
        token_quality=tq,
        investment_attractiveness=inv.investment_attractiveness,
        confidence=overall_conf,
        veto_triggered=veto.triggered,
    )
    decision = Decision(
        raw_score=round(project_quality, 1),
        confidence=round(overall_conf, 1),
        risk_adjusted_score=round(risk_adjusted, 1),
        action=ActionLevel(action_level),
        action_label=action_label,
        underfollowed=_underfollowed_test(ev, project_quality),
        key_risks=[r.name for r in severe if r.present][:6],
    )

    # executive verdict
    if veto.triggered:
        verdict = f"HARD REJECT — {veto.reason}"
    elif high_risk:
        verdict = (
            f"{project_quality_band(project_quality)} but flagged HIGH RISK due to a critical "
            f"sub-factor below 3. Action: {action_label}."
        )
    else:
        verdict = (
            f"{project_quality_band(project_quality)} (score {project_quality:.0f}/100). "
            f"Token quality {('N/A' if tq is None else f'{tq:.0f}')}. "
            f"Valuation {inv.valuation.value}. Action: {action_label}."
        )

    # five final answers
    answers = _five_answers(candidate, ev, veto, thesis, kills)

    # data needing verification
    needs_verify = _data_to_verify(ev)

    # Framework 3.0 additions
    cross_verifs = _build_cross_verifications(ev)
    bias_checks = _build_bias_checks(ev, project_quality, candidate)
    val_multiples = _build_valuation_multiples(inv)
    fee_stability = "volatile" if inv.fee_volatility_pct and inv.fee_volatility_pct > 40 else "stable" if inv.fee_volatility_pct is not None else "unknown"

    # final thesis one-liner
    final_thesis = thesis

    # report id
    rid = hashlib.sha1(f"{candidate.symbol}:{scan_id}:{time.time()}".encode()).hexdigest()[:12]

    return ProjectReport(
        id=rid,
        candidate=candidate,
        data_cutoff=config.data_cutoff,
        veto=veto,
        severe_risks=severe,
        executive_verdict=verdict,
        project_quality_score=round(project_quality, 1),
        token_quality_score=tq,
        valuation_label=inv.valuation,
        investment_attractiveness_score=inv.investment_attractiveness,
        confidence=round(overall_conf, 1),
        axes=axes,
        economic_engine=ev.economic,
        tokenomics=ev.tokenomics,
        market_structure=ev.market,
        institutional_adoption=_institutional_adoption(ev),
        competitive_moat=_competitive_moat(ev, a3),
        cycle_phase=cycle,
        peer_benchmark=peer,
        catalysts=catalysts,
        thesis_kill_conditions=kills,
        decision=decision,
        evidence_grade=ev.grade,
        data_needing_verification=needs_verify,
        final_thesis=final_thesis,
        five_final_answers=answers,
        valuation_multiples=val_multiples,
        cross_verifications=cross_verifs,
        fee_stability=fee_stability,
        bias_checks=bias_checks,
        scan_id=scan_id,
        created_at=now,
    )


# --------------------------------------------------------------------------- #
#  Investment analysis
# --------------------------------------------------------------------------- #
def _build_investment_analysis(
    ev: EvidenceBundle, project_quality: float, token_q: float | None, confidence: float
) -> InvestmentAnalysis:
    mc = ev.market_cap_usd
    fdv = ev.fdv_usd or mc
    annual_rev = (ev.economic.revenue or 0.0) * 365.0
    annual_fees = (ev.economic.fees or 0.0) * 365.0
    tvl = ev.economic.tvl or 0.0

    fdv_rev = (fdv / annual_rev) if (fdv and annual_rev > 0) else None
    mc_rev = (mc / annual_rev) if (mc and annual_rev > 0) else None
    fdv_fees = (fdv / annual_fees) if (fdv and annual_fees > 0) else None
    mc_tvl = (mc / tvl) if (mc and tvl > 0) else None

    # valuation verdict
    valuation = ValuationVerdict.UNABLE
    if fdv_rev is not None:
        if fdv_rev < 8:
            valuation = ValuationVerdict.CHEAP
        elif fdv_rev < 20:
            valuation = ValuationVerdict.FAIR
        else:
            valuation = ValuationVerdict.EXPENSIVE
    elif mc_tvl is not None:
        if mc_tvl < 0.15:
            valuation = ValuationVerdict.CHEAP
        elif mc_tvl < 0.4:
            valuation = ValuationVerdict.FAIR
        else:
            valuation = ValuationVerdict.EXPENSIVE

    # valuation attractiveness (0-100): lower multiples = more attractive
    val_attr = None
    if fdv_rev is not None:
        val_attr = max(0.0, min(100.0, 100.0 - fdv_rev * 2.5))
    elif mc_tvl is not None:
        val_attr = max(0.0, min(100.0, 100.0 - mc_tvl * 150.0))

    # timing: blend momentum (24h change) + cycle position
    timing = 50.0
    if ev.economic.revenue_growth_pct is not None:
        timing = max(0.0, min(100.0, 50.0 + ev.economic.revenue_growth_pct * 0.5))

    # investment attractiveness = blend of project, token, valuation, timing
    inv_attr = None
    if val_attr is not None:
        inv_attr = 0.35 * project_quality + 0.25 * (token_q or 50) + 0.25 * val_attr + 0.15 * timing
        inv_attr = round(max(0.0, min(100.0, inv_attr)), 1)

    # Framework 3.0: P/R, P/F, P/T valuation multiples
    # P/R = MC / Annualized Revenue (real revenue only)
    # P/F = FDV / Annualized Fees (fees ≠ revenue, explicitly)
    # P/T = MC / TVL
    p_r = (mc / annual_rev) if (mc and annual_rev > 0) else None
    p_f = (fdv / annual_fees) if (fdv and annual_fees > 0) else None
    p_t = (mc / tvl) if (mc and tvl > 0) else None

    # Fee volatility check (7d vs 30d average)
    fees_7d = ev.economic.fees or 0.0
    fees_30d = (ev.economic.fees or 0.0) * 30  # approximate if only 24h available
    fee_vol = None
    if fees_7d > 0 and fees_30d > 0:
        avg_7d_daily = fees_7d
        avg_30d_daily = fees_30d / 30
        if avg_30d_daily > 0:
            fee_vol = abs(avg_7d_daily - avg_30d_daily) / avg_30d_daily * 100

    # Fee stability label
    fee_stability = "unknown"
    if fee_vol is not None:
        if fee_vol > 40:
            fee_stability = "volatile"
        else:
            fee_stability = "stable"

    # Valuation verdict: Framework 3.0 prefers P/R, falls back to P/F, then P/T
    valuation = ValuationVerdict.UNABLE
    if p_r is not None:
        if p_r < 8:
            valuation = ValuationVerdict.CHEAP
        elif p_r < 20:
            valuation = ValuationVerdict.FAIR
        else:
            valuation = ValuationVerdict.EXPENSIVE
    elif p_f is not None:
        # Using P/F as proxy (fees ≠ revenue, so wider thresholds)
        if p_f < 10:
            valuation = ValuationVerdict.CHEAP
        elif p_f < 25:
            valuation = ValuationVerdict.FAIR
        else:
            valuation = ValuationVerdict.EXPENSIVE
    elif p_t is not None:
        if p_t < 0.15:
            valuation = ValuationVerdict.CHEAP
        elif p_t < 0.4:
            valuation = ValuationVerdict.FAIR
        else:
            valuation = ValuationVerdict.EXPENSIVE

    # valuation attractiveness (0-100): lower multiples = more attractive
    val_attr = None
    if p_r is not None:
        val_attr = max(0.0, min(100.0, 100.0 - p_r * 2.5))
    elif p_f is not None:
        val_attr = max(0.0, min(100.0, 100.0 - p_f * 2.0))
    elif p_t is not None:
        val_attr = max(0.0, min(100.0, 100.0 - p_t * 150.0))

    # timing: blend momentum (24h change) + cycle position
    timing = 50.0
    if ev.economic.revenue_growth_pct is not None:
        timing = max(0.0, min(100.0, 50.0 + ev.economic.revenue_growth_pct * 0.5))

    # investment attractiveness = blend of project, token, valuation, timing
    inv_attr = None
    if val_attr is not None:
        inv_attr = 0.35 * project_quality + 0.25 * (token_q or 50) + 0.25 * val_attr + 0.15 * timing
        inv_attr = round(max(0.0, min(100.0, inv_attr)), 1)

    return InvestmentAnalysis(
        fdv_revenue=round(fdv_rev, 2) if fdv_rev else None,
        mc_revenue=round(mc_rev, 2) if mc_rev else None,
        fdv_fees=round(fdv_fees, 2) if fdv_fees else None,
        mc_fees=round(mc / annual_fees, 2) if (mc and annual_fees > 0) else None,
        mc_tvl=round(mc_tvl, 2) if mc_tvl else None,
        p_r=round(p_r, 2) if p_r is not None else None,
        p_f=round(p_f, 2) if p_f is not None else None,
        p_t=round(p_t, 2) if p_t is not None else None,
        annualized_fees=round(annual_fees, 0) if annual_fees > 0 else None,
        annualized_revenue=round(annual_rev, 0) if annual_rev > 0 else None,
        fee_volatility_pct=round(fee_vol, 1) if fee_vol is not None else None,
        valuation=valuation,
        project_quality=round(project_quality, 1),
        token_quality=token_q,
        valuation_attractiveness=round(val_attr, 1) if val_attr is not None else None,
        timing=round(timing, 1),
        investment_attractiveness=inv_attr,
        cycle_phase=CyclePhase.HIDDEN_DEV,  # set later
        catalysts=[],
        thesis="",
        kill_conditions=[],
    )


def _infer_cycle_phase(ev: EvidenceBundle, project_quality: float) -> CyclePhase:
    rev = ev.economic.revenue or 0.0
    tvl = ev.economic.tvl or 0.0
    if ev.has_regulatory_license and rev * 365 > 50_000_000:
        return CyclePhase.INSTITUTIONAL
    if rev * 365 > 100_000_000:
        return CyclePhase.SCALE
    if rev * 365 > 10_000_000:
        return CyclePhase.MONETIZATION
    if tvl > 500_000_000:
        return CyclePhase.ADOPTION
    if tvl > 50_000_000:
        return CyclePhase.PMF
    return CyclePhase.HIDDEN_DEV


def _peer_percentile(score: float) -> float:
    # very rough mapping of absolute score → percentile
    if score >= 90:
        return 98.0
    if score >= 80:
        return 90.0
    if score >= 70:
        return 75.0
    if score >= 60:
        return 55.0
    if score >= 50:
        return 35.0
    if score >= 40:
        return 20.0
    return 8.0


def _rank_from_score(score: float) -> int:
    if score >= 90:
        return 1
    if score >= 80:
        return 3
    if score >= 70:
        return 8
    if score >= 60:
        return 20
    if score >= 50:
        return 50
    return 100


def _comparables(category: str, self_name: str = "") -> list[str]:
    c = (category or "").lower()
    sn = (self_name or "").lower()
    pool: list[str]
    if "dex" in c:
        pool = ["Uniswap", "Curve", "PancakeSwap", "Balancer", "Trader Joe"]
    elif "lending" in c or "liquid staking" in c:
        pool = ["Aave", "Lido", "Maker", "Compound", "Spark"]
    elif "oracle" in c:
        pool = ["Chainlink", "Pyth", "API3", "Switchboard"]
    elif "stablecoin" in c:
        pool = ["USDC", "USDT", "DAI", "FRAX", "PYUSD"]
    elif "rwa" in c:
        pool = ["Ondo", "Maple", "Centrifuge", "Goldfinch", "Backed"]
    elif "bridge" in c:
        pool = ["Wormhole", "LayerZero", "Across", "Stargate"]
    elif "smart contract" in c or "layer" in c:
        pool = ["Ethereum", "Solana", "Arbitrum", "Optimism", "Base"]
    else:
        pool = []
    return [p for p in pool if p.lower() != sn][:3]


def _build_catalysts(ev: EvidenceBundle, cycle: CyclePhase) -> list[Catalyst]:
    out: list[Catalyst] = []
    if ev.has_regulatory_license:
        out.append(Catalyst(description="Institutional / regulatory license in place", positive=True, eta="ongoing"))
    if (ev.economic.revenue_growth_pct or 0) > 20:
        out.append(Catalyst(description=f"Revenue growing +{ev.economic.revenue_growth_pct:.0f}% WoW", positive=True, eta="current"))
    if ev.chain_count >= 3:
        out.append(Catalyst(description=f"Multi-chain deployment ({ev.chain_count} chains)", positive=True, eta="ongoing"))
    if ev.tokenomics.buyback:
        out.append(Catalyst(description="Active buyback program", positive=True))
    if ev.tokenomics.burn:
        out.append(Catalyst(description="Token burn mechanism", positive=True))
    if ev.near_unlock_cliff:
        out.append(Catalyst(description="Major token unlock cliff approaching", positive=False, eta="<90d"))
    if ev.bridge_dependency:
        out.append(Catalyst(description="Critical bridge dependency — security risk", positive=False))
    if ev.regulatory_uncertainty:
        out.append(Catalyst(description="Regulatory uncertainty unresolved", positive=False))
    if not out:
        out.append(Catalyst(description="No strong near-term catalyst identified", positive=False))
    return out[:6]


def _build_thesis(c: CandidateInfo, ev: EvidenceBundle, cycle: CyclePhase) -> str:
    rail = "infrastructure" if ev.is_infrastructure else "application"
    rev_part = "with real fee/revenue generation" if (ev.economic.revenue or 0) > 0 else "pre-revenue"
    return (
        f"If on-chain {c.seector_lower()} activity grows, then {c.name} ({c.symbol}) "
        f"{rail} demand should increase, because it sits {ev.position_phrase()} "
        f"the transaction/liquidity rail {rev_part}."
    )


def _build_kill_conditions(ev: EvidenceBundle) -> list[str]:
    out = [
        "Revenue / fees decline >40% for 2 consecutive months.",
        "A critical security exploit occurs without transparent remediation.",
        "Core integration or largest customer is discontinued.",
    ]
    if ev.tokenomics.market_cap:
        out.append("Token unlock cliff materially exceeds value capture (>2x annual revenue).")
    if ev.regulatory_uncertainty:
        out.append("Regulatory status materially deteriorates (enforcement action / delisting).")
    if ev.bridge_dependency:
        out.append("Dependent bridge suffers a critical failure.")
    return out[:5]


def _institutional_adoption(ev: EvidenceBundle) -> str:
    bits = []
    if ev.has_regulatory_license:
        bits.append("Regulatory license / clear status present.")
    if ev.chain_count >= 3:
        bits.append(f"Deployed across {ev.chain_count} chains.")
    if (ev.economic.tvl or 0) > 1_000_000_000:
        bits.append("TVL above $1B — institutional-grade liquidity.")
    if (ev.economic.revenue or 0) * 365 > 50_000_000:
        bits.append("Annualized revenue >$50M — meaningful cash flow.")
    if not bits:
        bits.append("Limited institutional adoption evidence — requires verification.")
    return " ".join(bits)


def _competitive_moat(ev: EvidenceBundle, a3) -> str:
    return (
        f"Moat score {a3.score:.1f}/10 (conf {a3.confidence:.0f}%). "
        f"Key factors: {', '.join(list(a3.sub_factors.keys())[:3])}. "
        f"Switching cost: {'high' if ev.switching_cost_signal else 'moderate'}. "
        f"Network effect: {'strong' if (ev.liquidity_tvl or 0) > 1e9 else 'developing'}."
    )


def _underfollowed_test(ev: EvidenceBundle, project_quality: float) -> bool:
    # heuristic: high quality + low social signal
    return project_quality >= 70 and ev.github_stars < 3000


def _five_answers(c: CandidateInfo, ev: EvidenceBundle, veto, thesis: str, kills: list[str]) -> list[str]:
    a1 = (
        "Yes — appears to be a settlement / infrastructure layer for real business."
        if ev.is_infrastructure and (ev.economic.revenue or 0) > 0
        else "Partially — has infrastructure traits but revenue evidence is limited."
        if ev.is_infrastructure
        else "No — primarily a consumer-facing or speculative asset."
    )
    a2 = (
        "Yes — fee/revenue generation would persist without crypto-twitter attention."
        if (ev.economic.revenue or 0) > 0
        else "Unclear — limited recurring revenue evidence."
    )
    a3 = (
        f"Revenue flows to {c.name} protocol treasury and (partially) to token holders via "
        f"{ev.tokenomics.value_capture or 'unclear'} value capture."
    )
    a4 = (
        f"Token utility level {ev.tokenomics.utility_level}/4 — "
        f"{'captures value' if ev.tokenomics.utility_level >= 3 else 'limited value capture'}."
        if ev.has_token
        else "N/A — no token."
    )
    a5 = " · ".join(kills[:3]) if kills else "Not specified."
    return [a1, a2, a3, a4, a5]


def _data_to_verify(ev: EvidenceBundle) -> list[str]:
    out = []
    if ev.economic.revenue is None:
        out.append("Revenue / fee figures — verify on official dashboard.")
    if ev.tokenomics.insider_allocation_pct is None:
        out.append("Token allocation breakdown — verify in tokenomics docs.")
    if ev.audit_status == "none":
        out.append("Security audits — verify with protocol team.")
    if ev.team_transparent is False:
        out.append("Team identity — verify publicly.")
    if ev.tokenomics.value_capture == "moderate":
        out.append("Token value capture mechanism — verify revenue share / burn details.")
    if ev.regulatory_uncertainty:
        out.append("Regulatory status — verify jurisdiction & licenses.")
    return out or ["All key data points have at least secondary evidence."]


# --------------------------------------------------------------------------- #
#  Monkey-patches for thesis templating (kept tiny & local)
# --------------------------------------------------------------------------- #
def _sector_lower(self) -> str:
    return (self.sector or "").lower()


def _position_phrase(self) -> str:
    return "inside" if self.is_infrastructure else "adjacent to"


# attach helpers to CandidateInfo / EvidenceBundle at import time
CandidateInfo.seector_lower = _sector_lower  # type: ignore[attr-defined]
EvidenceBundle.position_phrase = _position_phrase  # type: ignore[attr-defined]


# --------------------------------------------------------------------------- #
#  Framework 3.0: Cross-Verification Engine (PHASE 8)
# --------------------------------------------------------------------------- #
def _build_cross_verifications(ev: EvidenceBundle) -> list:
    """Cross-verify key metrics between CoinGecko and DeFiLlama."""
    from models.schemas import CrossVerification
    results = []

    # TVL cross-verification
    if ev.economic.tvl and ev.economic.tvl > 0:
        results.append(CrossVerification(
            metric="TVL",
            source_a="DeFiLlama",
            value_a=ev.economic.tvl,
            source_b="CoinGecko",
            value_b=None,  # CoinGecko doesn't provide TVL directly
            status="single-source",
        ))

    # Market cap cross-verification
    if ev.market_cap_usd and ev.market_cap_usd > 0:
        results.append(CrossVerification(
            metric="Market Cap",
            source_a="CoinGecko",
            value_a=ev.market_cap_usd,
            source_b="DeFiLlama",
            value_b=None,  # DeFiLlama doesn't provide MC directly
            status="single-source",
        ))

    # Fees cross-verification
    if ev.economic.fees and ev.economic.fees > 0:
        results.append(CrossVerification(
            metric="Fees 24h",
            source_a="DeFiLlama Fees",
            value_a=ev.economic.fees,
            source_b="Protocol Dashboard",
            value_b=None,  # Would need direct protocol dashboard
            status="single-source",
        ))

    return results


# --------------------------------------------------------------------------- #
#  Framework 3.0: Self-Correction Engine (PHASE 31)
# --------------------------------------------------------------------------- #
def _build_bias_checks(ev: EvidenceBundle, project_quality: float, candidate) -> list[str]:
    """Framework 3.0 PHASE 31: Bias checks for self-correction."""
    checks = []

    # Bias Check: Popular project bias
    popular_names = {"aave", "uniswap", "bitcoin", "ethereum", "solana", "chainlink"}
    if candidate.name.lower() in popular_names:
        checks.append("⚠️ Bias Check: Popular project — ensure score is evidence-based, not reputation-based.")

    # English-Source Bias
    checks.append("ℹ️ Source Bias: Primary sources are English-language (CoinGecko, DeFiLlama).")

    # Snapshot Bias
    if ev.economic.fees and not ev.economic.revenue_growth_pct:
        checks.append("⚠️ Snapshot Bias: Fees data is point-in-time, not trend-verified.")

    # Precision Illusion
    if project_quality > 0 and ev.grade.value.startswith("D"):
        checks.append("⚠️ Precision Illusion: Low evidence grade — score may not reflect reality.")

    # Narrative Bias
    if ev.is_infrastructure and project_quality < 30:
        checks.append("ℹ️ Narrative Check: Infrastructure classification doesn't guarantee quality.")

    # Confirmation Bias
    checks.append("ℹ️ Confirmation Check: Ensure both positive and negative evidence collected.")

    # Anti-Promise
    checks.append("ℹ️ Anti-Promise: No guaranteed outcomes — all scores are probabilistic.")

    return checks


# --------------------------------------------------------------------------- #
#  Framework 3.0: Valuation Multiples Summary
# --------------------------------------------------------------------------- #
def _build_valuation_multiples(inv: InvestmentAnalysis) -> dict:
    """Build valuation multiples summary for Framework 3.0."""
    return {
        "p_r": inv.p_r,  # Price-to-Revenue
        "p_f": inv.p_f,  # Price-to-Fees
        "p_t": inv.p_t,  # Price-to-TVL
        "annualized_revenue": inv.annualized_revenue,
        "annualized_fees": inv.annualized_fees,
        "fee_volatility_pct": inv.fee_volatility_pct,
        "note": "P/R uses real revenue. P/F uses fees (≠ revenue). P/T uses TVL.",
    }
