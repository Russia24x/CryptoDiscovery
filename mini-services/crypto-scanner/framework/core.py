"""
Core principles & shared framework primitives.

Implements the immutable rules from Part 1 (Core Principles) and the
hard veto gates from PHASE 2.
"""
from __future__ import annotations

from dataclasses import dataclass

from models.schemas import (
    EvidenceGrade,
    Persona,
    SevereRisk,
    VetoResult,
    VetoType,
)


# --------------------------------------------------------------------------- #
#  Persona weights (PHASE 4.3)
# --------------------------------------------------------------------------- #
PERSONA_WEIGHTS: dict[Persona, dict[str, float]] = {
    Persona.RESEARCHER: {
        "Invisible Utility": 0.25,
        "Economic Engine": 0.20,
        "Moat": 0.25,
        "Token & Market Structure": 0.10,
        "Governance / Legal / Security": 0.20,
    },
    Persona.INVESTOR: {
        "Economic Engine": 0.30,
        "Moat": 0.20,
        "Token & Market Structure": 0.20,
        "Invisible Utility": 0.15,
        "Governance / Legal / Security": 0.15,
    },
    Persona.INSTITUTIONAL: {
        "Economic Engine": 0.30,
        "Governance / Legal / Security": 0.25,
        "Moat": 0.20,
        "Invisible Utility": 0.15,
        "Token & Market Structure": 0.10,
    },
    Persona.DEVELOPER: {
        "Invisible Utility": 0.30,
        "Moat": 0.25,
        "Economic Engine": 0.20,
        "Governance / Legal / Security": 0.15,
        "Token & Market Structure": 0.10,
    },
    Persona.TRADER: {
        "Token & Market Structure": 0.30,
        "Economic Engine": 0.25,
        "Moat": 0.15,
        "Invisible Utility": 0.15,
        "Governance / Legal / Security": 0.15,
    },
    Persona.COMPREHENSIVE: {
        "Economic Engine": 0.22,
        "Moat": 0.22,
        "Governance / Legal / Security": 0.20,
        "Invisible Utility": 0.18,
        "Token & Market Structure": 0.18,
    },
}


# --------------------------------------------------------------------------- #
#  Evidence freshness buckets (PHASE 3.2)
# --------------------------------------------------------------------------- #
@dataclass
class FreshnessBucket:
    label: str
    decay_factor: float  # multiplier applied to confidence


FRESHNESS = {
    "fresh": FreshnessBucket("0-90 days (Fresh)", 1.00),
    "recent": FreshnessBucket("91-180 days (Recent)", 0.85),
    "aging": FreshnessBucket("181-365 days (Aging)", 0.65),
    "old": FreshnessBucket("1-2 years (Old)", 0.40),
    "very_old": FreshnessBucket("2+ years (Very Old)", 0.20),
}


def evidence_grade_to_confidence(grade: EvidenceGrade) -> float:
    """Baseline confidence contribution by evidence grade."""
    return {
        EvidenceGrade.A: 92.0,
        EvidenceGrade.B: 78.0,
        EvidenceGrade.C: 58.0,
        EvidenceGrade.D: 35.0,
    }[grade]


# --------------------------------------------------------------------------- #
#  Hard Veto Gates (PHASE 2.2)
# --------------------------------------------------------------------------- #
def evaluate_vetoes(
    *,
    guaranteed_return_claims: bool,
    ponzi_structure: bool,
    unresolved_hack: bool,
    single_key_custody: bool,
    opaque_custody: bool,
    backing_transparency_failure: bool,
    legal_deception: bool,
) -> VetoResult:
    """Run the five hard veto gates. First hit wins (HARD REJECT)."""
    if guaranteed_return_claims or ponzi_structure:
        return VetoResult(triggered=True, veto_type=VetoType.FRAUD,
                          reason="Project advertises guaranteed returns or ponzi-like structure.")
    if unresolved_hack:
        return VetoResult(triggered=True, veto_type=VetoType.SECURITY,
                          reason="Unresolved critical security failure with insufficient mitigation.")
    if single_key_custody or opaque_custody:
        return VetoResult(triggered=True, veto_type=VetoType.CUSTODY,
                          reason="Unacceptable custody risk: single-key or opaque custody.")
    if backing_transparency_failure:
        return VetoResult(triggered=True, veto_type=VetoType.BACKING,
                          reason="Asset backing / redemption mechanism is opaque.")
    if legal_deception:
        return VetoResult(triggered=True, veto_type=VetoType.LEGAL,
                          reason="Material legal / regulatory deception detected.")
    return VetoResult(triggered=False)


# --------------------------------------------------------------------------- #
#  Severe risks (PHASE 2.3) — not veto, but penalty
# --------------------------------------------------------------------------- #
DEFAULT_SEVERE_RISKS = [
    "Anonymous team",
    "Stale audit",
    "Centralized governance",
    "Centralized upgrade authority",
    "Single solver dependency",
    "High customer concentration",
    "Near token unlock cliff",
    "Market maker dependency",
    "Critical bridge dependency",
    "Critical chain dependency",
    "Unclear token value capture",
    "Regulatory uncertainty",
]


def build_severe_risks(active: dict[str, bool]) -> list[SevereRisk]:
    return [
        SevereRisk(name=n, present=active.get(n, False))
        for n in DEFAULT_SEVERE_RISKS
    ]


# --------------------------------------------------------------------------- #
#  Weakest-link penalty (PHASE 5.2)
# --------------------------------------------------------------------------- #
def weakest_link_penalty(min_axis_score: float, min_sub_score: float | None) -> tuple[float, bool]:
    """
    Returns (penalty_amount, high_risk_flag).
    If any axis < 4 → penalty; if any critical sub-factor < 3 → high risk.
    """
    penalty = 0.0
    high_risk = False
    if min_axis_score < 4.0:
        penalty += (4.0 - min_axis_score) * 6.0  # up to 24 pts
    if min_sub_score is not None and min_sub_score < 3.0:
        high_risk = True
        penalty += 10.0
    return penalty, high_risk


# --------------------------------------------------------------------------- #
#  Project quality band (PHASE 5.3)
# --------------------------------------------------------------------------- #
def project_quality_band(score: float) -> str:
    if score >= 90:
        return "Elite Infrastructure"
    if score >= 80:
        return "Strong Infrastructure"
    if score >= 70:
        return "Promising"
    if score >= 60:
        return "Watchlist"
    if score >= 50:
        return "Weak"
    return "Story / Speculation"


# --------------------------------------------------------------------------- #
#  Action mapping (PHASE 7.1)
# --------------------------------------------------------------------------- #
def action_from_scores(
    *,
    project_quality: float,
    token_quality: float | None,
    investment_attractiveness: float | None,
    confidence: float,
    veto_triggered: bool,
) -> tuple[int, str]:
    if veto_triggered:
        return 0, "Ignore (Hard Veto)"
    # Combine project + token + investment attractiveness
    token_q = token_quality if token_quality is not None else 50.0
    inv_a = investment_attractiveness if investment_attractiveness is not None else 50.0

    blended = 0.4 * project_quality + 0.3 * token_q + 0.3 * inv_a

    # Base level from blended score (WITHOUT confidence interference).
    if blended >= 85:
        base_level, base_label = 5, "High Conviction"
    elif blended >= 75:
        base_level, base_label = 4, "Core Position Candidate"
    elif blended >= 65:
        base_level, base_label = 3, "Small Position"
    elif blended >= 55:
        base_level, base_label = 2, "Deep Research"
    elif blended >= 45:
        base_level, base_label = 1, "Watch"
    else:
        base_level, base_label = 0, "Ignore"

    # Confidence gate: CAP DOWNWARD only — never raise a bad project.
    #
    # The old code returned early on low confidence BEFORE checking blended,
    # which meant blended=10 + confidence=50 → "Deep Research" (level 2),
    # while the same project with confidence=65 → "Ignore" (level 0).
    # Low confidence was ELEVATING bad projects — the opposite of the gate's
    # purpose (which is to cap the max, not override the base).
    #
    # Now: compute base first, then cap at the confidence-appropriate max.
    # A project that already scores below the cap stays at its base level.
    if confidence < 45:
        # Low confidence caps at level 1 (Watch)
        if base_level > 1:
            return 1, "Watch (Low confidence)"
        return base_level, base_label
    if confidence < 60:
        # Medium confidence caps at level 2 (Deep Research)
        if base_level > 2:
            return 2, "Deep Research (Confidence building)"
        return base_level, base_label

    return base_level, base_label
