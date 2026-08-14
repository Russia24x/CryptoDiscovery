"""
PHASE 5-8 — Scoring, Investment Analysis, Decision, and Output Formatting.

Combines axis scores into project quality, runs weakest-link penalty,
derives token quality, investment attractiveness, cycle phase, catalysts,
thesis & kill conditions, and the final 23-section report.
"""
from __future__ import annotations

import hashlib
import time
from datetime import datetime, timezone
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
)
from framework.i18n import t as _t
from models.schemas import ScanConfig, ValuationVerdict
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
    now = datetime.now(timezone.utc)
    lang = getattr(config, "lang", "en")

    def tt(key: str, **kwargs) -> str:
        return _t(key, lang=lang, **kwargs)

    # Enrich candidate with links/image from evidence (CoinGecko detail)
    if ev.image_url and not candidate.image:
        candidate.image = ev.image_url
    if ev.homepage and not candidate.website:
        candidate.website = ev.homepage
    if ev.twitter_handle and not candidate.twitter:
        candidate.twitter = ev.twitter_handle
    if ev.github_url and not candidate.github:
        candidate.github = ev.github_url
    if ev.discord_url and not candidate.discord:
        candidate.discord = ev.discord_url
    if ev.blockchain_explorer and not candidate.blockchain_explorer:
        candidate.blockchain_explorer = ev.blockchain_explorer

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
    # Use custom weights if provided, otherwise fall back to persona preset
    custom_w = getattr(config, "custom_weights", None)
    if custom_w and isinstance(custom_w, dict):
        # Validate: all 5 axes must be present and sum to ~1.0
        required_axes = {"Invisible Utility", "Economic Engine", "Moat",
                         "Token & Market Structure", "Governance / Legal / Security"}
        if set(custom_w.keys()) == required_axes:
            total = sum(custom_w.values())
            if 0.8 <= total <= 1.2:  # Allow slight deviation
                # Normalize to 1.0
                weights = {k: v / total for k, v in custom_w.items()}
            else:
                weights = PERSONA_WEIGHTS[config.persona]
        else:
            weights = PERSONA_WEIGHTS[config.persona]
    else:
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

    # executive verdict (i18n)
    if veto.triggered:
        verdict = tt("verdict.veto", reason=veto.reason)
    elif high_risk:
        band = _quality_band_i18n(project_quality, lang)
        verdict = tt("verdict.high_risk", band=band, action=action_label)
    else:
        band = _quality_band_i18n(project_quality, lang)
        token_q_str = tt("token_q.na") if tq is None else f"{tq:.0f}"
        verdict = tt("verdict.normal", band=band, score=project_quality,
                     token_q=token_q_str, valuation=inv.valuation.value, action=action_label)

    # five final answers (i18n)
    answers = _five_answers_i18n(candidate, ev, veto, thesis, kills, lang)

    # data needing verification (i18n)
    needs_verify = _data_to_verify_i18n(ev, lang)

    # Framework 3.0 additions (i18n)
    cross_verifs = _build_cross_verifications(ev)
    bias_checks = _build_bias_checks_i18n(ev, project_quality, candidate, lang)
    val_multiples = _build_valuation_multiples(inv)
    fee_stability = "volatile" if inv.fee_volatility_pct and inv.fee_volatility_pct > 40 else "stable" if inv.fee_volatility_pct is not None else "unknown"

    # thesis (i18n)
    thesis = _build_thesis_i18n(candidate, ev, cycle, lang)

    # institutional adoption (i18n)
    inst_adoption = _institutional_adoption_i18n(ev, lang)

    # competitive moat (i18n)
    comp_moat = _competitive_moat_i18n(ev, a3, lang)

    # catalysts (i18n)
    catalysts = _build_catalysts_i18n(ev, cycle, lang)

    # kill conditions (i18n)
    kills = _build_kill_conditions_i18n(ev, lang)

    # final thesis one-liner
    final_thesis = thesis

    # Market overview data (from CMC Keyless / CoinGecko — eliminates external site visits)
    market_overview = {
        "price": ev.cmc_price or ev.tokenomics.market_cap and ev.tokenomics.circulating_supply and
            (ev.tokenomics.market_cap / ev.tokenomics.circulating_supply) or None,
        "market_cap": ev.market_cap_usd,
        "fdv": ev.fdv_usd,
        "cmc_rank": ev.cmc_rank,
        "market_cap_dominance": ev.cmc_market_cap_dominance,
        "volume_24h": ev.market.daily_volume,
        "circulating_supply": ev.tokenomics.circulating_supply,
        "total_supply": ev.tokenomics.total_supply,
        "max_supply": ev.tokenomics.max_supply,
        "tvl": ev.economic.tvl,
        "holder_count": ev.cmc_holder_count or ev.economic.customer_count,
        "top_10_holder_ratio": ev.cmc_top10_holder_ratio,
        "top_100_holder_ratio": ev.cmc_top100_holder_ratio,
        "ath": ev.cmc_ath,
        "atl": ev.cmc_atl,
        "audited": ev.cmc_audited,
        "audit_infos": ev.cmc_audit_infos,
        "platform_count": ev.cmc_platform_count or ev.chain_count,
        "description": ev.cmc_description,
        "percent_change_24h": ev.cmc_pct_24h,
        "percent_change_7d": ev.cmc_pct_7d,
        "percent_change_30d": ev.cmc_pct_30d,
        "price_low_24h": ev.cmc_low_24h,
        "price_high_24h": ev.cmc_high_24h,
        "price_low_30d": ev.cmc_low_30d,
        "price_high_30d": ev.cmc_high_30d,
        "price_low_52w": ev.cmc_low_52w,
        "price_high_52w": ev.cmc_high_52w,
        "social_links": {
            "website": candidate.website or ev.homepage,
            "twitter": candidate.twitter or ev.twitter_handle,
            "github": candidate.github or ev.github_url,
            "discord": candidate.discord or ev.discord_url,
            "explorer": candidate.blockchain_explorer or ev.blockchain_explorer,
        },
    }

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
        institutional_adoption=inst_adoption,
        competitive_moat=comp_moat,
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
        market_overview=market_overview,
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

    # Legacy multiples (kept for backward compat in report)
    fdv_rev = (fdv / annual_rev) if (fdv and annual_rev > 0) else None
    mc_rev = (mc / annual_rev) if (mc and annual_rev > 0) else None
    fdv_fees = (fdv / annual_fees) if (fdv and annual_fees > 0) else None
    mc_tvl = (mc / tvl) if (mc and tvl > 0) else None

    # Framework 3.0: P/R, P/F, P/T valuation multiples
    # P/R = MC / Annualized Revenue (real revenue only)
    # P/F = FDV / Annualized Fees (fees ≠ revenue, explicitly)
    # P/T = MC / TVL
    p_r = (mc / annual_rev) if (mc and annual_rev > 0) else None
    p_f = (fdv / annual_fees) if (fdv and annual_fees > 0) else None
    p_t = (mc / tvl) if (mc and tvl > 0) else None

    # Fee volatility check — uses REAL 7d and 30d fees from DeFiLlama
    # Framework 3.0: "If Fee Volatility > 40%, P/R Reliability Low"
    f7d_total = ev.economic.fees_7d or 0.0   # total 7d fees
    f30d_total = ev.economic.fees_30d or 0.0  # total 30d fees
    f24h = ev.economic.fees or 0.0            # 24h fees
    fee_vol = None
    if f7d_total > 0 and f30d_total > 0:
        # Compare daily averages: (7d avg daily) vs (30d avg daily)
        avg_7d_daily = f7d_total / 7.0
        avg_30d_daily = f30d_total / 30.0
        if avg_30d_daily > 0:
            fee_vol = abs(avg_7d_daily - avg_30d_daily) / avg_30d_daily * 100
    elif f24h > 0 and f7d_total > 0:
        # Fallback: compare 24h vs 7d average
        avg_7d_daily = f7d_total / 7.0
        if avg_7d_daily > 0:
            fee_vol = abs(f24h - avg_7d_daily) / avg_7d_daily * 100

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
    if ev.economic.fee_growth_pct is not None:
        timing = max(0.0, min(100.0, 50.0 + ev.economic.fee_growth_pct * 0.5))

    # investment attractiveness = blend of project, token, valuation, timing
    inv_attr = None
    if val_attr is not None:
        inv_attr = 0.35 * project_quality + 0.25 * (token_q or 50) + 0.25 * val_attr + 0.15 * timing
        inv_attr = round(max(0.0, min(100.0, inv_attr)), 1)

    return InvestmentAnalysis(
        fdv_revenue=round(fdv_rev, 2) if fdv_rev is not None else None,
        mc_revenue=round(mc_rev, 2) if mc_rev is not None else None,
        fdv_fees=round(fdv_fees, 2) if fdv_fees is not None else None,
        mc_fees=round(mc / annual_fees, 2) if (mc and annual_fees > 0) else None,
        mc_tvl=round(mc_tvl, 2) if mc_tvl is not None else None,
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
    if (ev.economic.fee_growth_pct or 0) > 20:
        out.append(Catalyst(description=f"Revenue growing +{ev.economic.fee_growth_pct:.0f}% WoW", positive=True, eta="current"))
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
    sector_lower = (c.sector or "").lower()
    position = "inside" if ev.is_infrastructure else "adjacent to"
    return (
        f"If on-chain {sector_lower} activity grows, then {c.name} ({c.symbol}) "
        f"{rail} demand should increase, because it sits {position} "
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
#  Framework 3.0: Cross-Verification Engine (PHASE 8)
# --------------------------------------------------------------------------- #
def _build_cross_verifications(ev: EvidenceBundle) -> list:
    """Cross-verify key metrics between multiple data sources.

    Sources used:
      - CoinGecko: market_cap, daily_volume, circulating_supply
      - DeFiLlama: TVL, fees
      - CoinMarketCap (Pro/Keyless): market_cap, volume, circulating_supply, TVL
    """
    from models.schemas import CrossVerification
    results = []

    # TVL cross-verification — DeFiLlama vs CMC Keyless (cmc_tvl)
    if ev.economic.tvl and ev.economic.tvl > 0:
        cmc_tvl = getattr(ev, 'cmc_tvl', None)
        if cmc_tvl and cmc_tvl > 0:
            discrepancy = abs(ev.economic.tvl - cmc_tvl) / max(ev.economic.tvl, cmc_tvl) * 100
            status = "verified" if discrepancy <= 20 else "discrepancy"
            results.append(CrossVerification(
                metric="TVL",
                source_a="DeFiLlama",
                value_a=ev.economic.tvl,
                source_b="CoinMarketCap",
                value_b=cmc_tvl,
                discrepancy_pct=round(discrepancy, 1),
                status=status,
            ))
        else:
            results.append(CrossVerification(
                metric="TVL",
                source_a="DeFiLlama",
                value_a=ev.economic.tvl,
                source_b="CoinMarketCap",
                value_b=None,
                status="single-source",
            ))

    # Market cap cross-verification
    if ev.market_cap_usd and ev.market_cap_usd > 0:
        cmc_mc = ev.cmc_market_cap
        if cmc_mc and cmc_mc > 0:
            discrepancy = abs(ev.market_cap_usd - cmc_mc) / max(ev.market_cap_usd, cmc_mc) * 100
            status = "verified" if discrepancy <= 15 else "discrepancy"
            results.append(CrossVerification(
                metric="Market Cap",
                source_a="CoinGecko",
                value_a=ev.market_cap_usd,
                source_b="CoinMarketCap",
                value_b=cmc_mc,
                discrepancy_pct=round(discrepancy, 1),
                status=status,
            ))
        else:
            results.append(CrossVerification(
                metric="Market Cap",
                source_a="CoinGecko" if ev.market_cap_usd else "CoinMarketCap",
                value_a=ev.market_cap_usd,
                source_b="CoinMarketCap",
                value_b=None,
                status="single-source",
            ))

    # Volume cross-verification
    if ev.market.daily_volume and ev.market.daily_volume > 0:
        cmc_vol = ev.cmc_volume_24h
        if cmc_vol and cmc_vol > 0:
            discrepancy = abs(ev.market.daily_volume - cmc_vol) / max(ev.market.daily_volume, cmc_vol) * 100
            status = "verified" if discrepancy <= 20 else "discrepancy"
            results.append(CrossVerification(
                metric="Volume 24h",
                source_a="CoinGecko",
                value_a=ev.market.daily_volume,
                source_b="CoinMarketCap",
                value_b=cmc_vol,
                discrepancy_pct=round(discrepancy, 1),
                status=status,
            ))

    # Fees cross-verification — DeFiLlama vs Dune (if available)
    if ev.economic.fees and ev.economic.fees > 0:
        dune_rev = getattr(ev, 'dune_real_revenue', None)
        if dune_rev and isinstance(dune_rev, dict):
            dune_fees = dune_rev.get('total_fees_24h')
            if dune_fees and dune_fees > 0:
                discrepancy = abs(ev.economic.fees - dune_fees) / max(ev.economic.fees, dune_fees) * 100
                status = "verified" if discrepancy <= 25 else "discrepancy"
                results.append(CrossVerification(
                    metric="Fees 24h",
                    source_a="DeFiLlama Fees",
                    value_a=ev.economic.fees,
                    source_b="Dune Analytics",
                    value_b=dune_fees,
                    discrepancy_pct=round(discrepancy, 1),
                    status=status,
                ))
            else:
                results.append(CrossVerification(
                    metric="Fees 24h",
                    source_a="DeFiLlama Fees",
                    value_a=ev.economic.fees,
                    source_b="Dune Analytics",
                    value_b=None,
                    status="single-source",
                ))
        else:
            results.append(CrossVerification(
                metric="Fees 24h",
                source_a="DeFiLlama Fees",
                value_a=ev.economic.fees,
                source_b="Dune Analytics",
                value_b=None,
                status="single-source (Dune not configured)",
            ))

    # Supply cross-verification
    if ev.tokenomics.circulating_supply and ev.cmc_circulating_supply:
        discrepancy = abs(ev.tokenomics.circulating_supply - ev.cmc_circulating_supply) / max(ev.tokenomics.circulating_supply, ev.cmc_circulating_supply) * 100
        status = "verified" if discrepancy <= 5 else "discrepancy"
        results.append(CrossVerification(
            metric="Circulating Supply",
            source_a="CoinGecko",
            value_a=ev.tokenomics.circulating_supply,
            source_b="CoinMarketCap",
            value_b=ev.cmc_circulating_supply,
            discrepancy_pct=round(discrepancy, 1),
            status=status,
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
    if ev.economic.fees and not ev.economic.fee_growth_pct:
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


# --------------------------------------------------------------------------- #
#  i18n helper functions for dynamic text generation
# --------------------------------------------------------------------------- #

def _quality_band_i18n(score: float, lang: str) -> str:
    if score >= 90: return _t("band.elite", lang)
    if score >= 80: return _t("band.strong", lang)
    if score >= 70: return _t("band.promising", lang)
    if score >= 60: return _t("band.watchlist", lang)
    if score >= 50: return _t("band.weak", lang)
    return _t("band.story", lang)


def _build_thesis_i18n(c: CandidateInfo, ev: EvidenceBundle, cycle: CyclePhase, lang: str) -> str:
    rail = _t("thesis.rail.infra", lang) if ev.is_infrastructure else _t("thesis.rail.app", lang)
    rev_part = _t("thesis.rev.real", lang) if (ev.economic.revenue or 0) > 0 else _t("thesis.rev.pre", lang)
    sector_lower = (c.sector or "").lower()
    position = _t("thesis.position.inside", lang) if ev.is_infrastructure else _t("thesis.position.adjacent", lang)
    return _t("thesis.template", lang, sector=sector_lower, name=c.name, symbol=c.symbol,
              rail=rail, position=position, rev_part=rev_part)


def _build_catalysts_i18n(ev: EvidenceBundle, cycle: CyclePhase, lang: str) -> list[Catalyst]:
    out: list[Catalyst] = []
    if ev.has_regulatory_license:
        out.append(Catalyst(description=_t("catalyst.reg_license", lang), positive=True, eta="ongoing"))
    if (ev.economic.fee_growth_pct or 0) > 20:
        out.append(Catalyst(description=_t("catalyst.rev_growing", lang, growth=ev.economic.fee_growth_pct), positive=True, eta="current"))
    if ev.chain_count >= 3:
        out.append(Catalyst(description=_t("catalyst.multichain", lang, chains=ev.chain_count), positive=True, eta="ongoing"))
    if ev.tokenomics.buyback:
        out.append(Catalyst(description=_t("catalyst.buyback", lang), positive=True))
    if ev.tokenomics.burn:
        out.append(Catalyst(description=_t("catalyst.burn", lang), positive=True))
    if ev.near_unlock_cliff:
        out.append(Catalyst(description=_t("catalyst.unlock", lang), positive=False, eta="<90d"))
    if ev.bridge_dependency:
        out.append(Catalyst(description=_t("catalyst.bridge_risk", lang), positive=False))
    if ev.regulatory_uncertainty:
        out.append(Catalyst(description=_t("catalyst.reg_uncertain", lang), positive=False))
    if not out:
        out.append(Catalyst(description=_t("catalyst.none", lang), positive=False))
    return out[:6]


def _build_kill_conditions_i18n(ev: EvidenceBundle, lang: str) -> list[str]:
    out = [
        _t("kill.revenue_decline", lang),
        _t("kill.security_exploit", lang),
        _t("kill.customer_loss", lang),
    ]
    if ev.tokenomics.market_cap:
        out.append(_t("kill.unlock_pressure", lang))
    if ev.regulatory_uncertainty:
        out.append(_t("kill.regulatory", lang))
    if ev.bridge_dependency:
        out.append(_t("kill.bridge_failure", lang))
    return out[:5]


def _institutional_adoption_i18n(ev: EvidenceBundle, lang: str) -> str:
    bits = []
    if ev.has_regulatory_license:
        bits.append(_t("catalyst.reg_license", lang))
    if ev.chain_count >= 3:
        bits.append(_t("inst.deployed", lang, chains=ev.chain_count))
    if (ev.economic.tvl or 0) > 1_000_000_000:
        bits.append(_t("inst.tvl_high", lang))
    elif (ev.economic.tvl or 0) > 100_000_000:
        bits.append(_t("inst.tvl_mid", lang))
    if (ev.economic.revenue or 0) * 365 > 50_000_000:
        bits.append(_t("inst.revenue", lang))
    if not bits:
        bits.append(_t("inst.limited", lang))
    return " ".join(bits)


def _competitive_moat_i18n(ev: EvidenceBundle, a3, lang: str) -> str:
    switching = _t("moat.switching.high", lang) if ev.switching_cost_signal else _t("moat.switching.moderate", lang)
    network = _t("moat.network.strong", lang) if (ev.liquidity_tvl or 0) > 1e9 else _t("moat.network.developing", lang)
    factors = ", ".join(list(a3.sub_factors.keys())[:3])
    return _t("moat.template", lang, score=a3.score, conf=a3.confidence,
              factors=factors, switching=switching, network=network)


def _five_answers_i18n(c: CandidateInfo, ev: EvidenceBundle, veto, thesis: str, kills: list[str], lang: str) -> list[str]:
    a1 = (
        _t("answer1.yes", lang) if ev.is_infrastructure and (ev.economic.revenue or 0) > 0
        else _t("answer1.partial", lang) if ev.is_infrastructure
        else _t("answer1.no", lang)
    )
    a2 = (
        _t("answer2.yes", lang) if (ev.economic.revenue or 0) > 0
        else _t("answer2.unclear", lang)
    )
    a3 = _t("answer3.template", lang, name=c.name,
            value_capture=ev.tokenomics.value_capture or _t("answer4.limited", lang))
    a4 = (
        _t("answer4.template", lang, level=ev.tokenomics.utility_level,
           capture_desc=_t("answer4.captures", lang) if ev.tokenomics.utility_level >= 3 else _t("answer4.limited", lang))
        if ev.has_token
        else "N/A — No token."
    )
    a5 = " · ".join(kills[:3]) if kills else "Not specified."
    return [a1, a2, a3, a4, a5]


def _data_to_verify_i18n(ev: EvidenceBundle, lang: str) -> list[str]:
    out = []
    if ev.economic.revenue is None:
        out.append(_t("verify.revenue", lang))
    if ev.tokenomics.insider_allocation_pct is None:
        out.append(_t("verify.allocation", lang))
    if ev.audit_status == "none":
        out.append(_t("verify.audit", lang))
    if ev.team_transparent is False:
        out.append(_t("verify.team", lang))
    if ev.tokenomics.value_capture == "moderate":
        out.append(_t("verify.value_capture", lang))
    if ev.regulatory_uncertainty:
        out.append(_t("verify.regulatory", lang))
    return out or [_t("verify.all_good", lang)]


def _build_bias_checks_i18n(ev: EvidenceBundle, project_quality: float, candidate, lang: str) -> list[str]:
    checks = []
    popular_names = {"aave", "uniswap", "bitcoin", "ethereum", "solana", "chainlink"}
    if candidate.name.lower() in popular_names:
        checks.append(_t("bias.popular", lang))
    checks.append(_t("bias.source", lang))
    if ev.economic.fees and not ev.economic.fee_growth_pct:
        checks.append(_t("bias.snapshot", lang))
    if project_quality > 0 and ev.grade.value.startswith("D"):
        checks.append(_t("bias.precision", lang))
    if ev.is_infrastructure and project_quality < 30:
        checks.append(_t("bias.narrative", lang))
    checks.append(_t("bias.confirmation", lang))
    checks.append(_t("bias.anti_promise", lang))
    return checks
