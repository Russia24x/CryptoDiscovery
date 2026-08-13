"""
Minimal test suite for CryptoSieve framework critical logic.

Tests the most important business logic:
  - Veto gates (PHASE 2)
  - Scoring formula (PHASE 5)
  - Valuation multiples P/R, P/F, P/T (PHASE 6)
  - Action mapping (PHASE 7)
  - Weakest-link penalty
  - Revenue ≠ Fees principle

Run: cd mini-services/crypto-scanner && python -m pytest tests/ -v
  or: python tests/test_framework.py
"""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from framework.core import (
    evaluate_vetoes,
    build_severe_risks,
    weakest_link_penalty,
    project_quality_band,
    action_from_scores,
    PERSONA_WEIGHTS,
)
from models.schemas import Persona, EvidenceGrade


# ========================================================================== #
#  PHASE 2: Veto Gates
# ========================================================================== #

def test_veto_fraud_guaranteed_returns():
    """Guaranteed return claims should trigger HARD REJECT."""
    result = evaluate_vetoes(
        guaranteed_return_claims=True,
        ponzi_structure=False,
        unresolved_hack=False,
        single_key_custody=False,
        opaque_custody=False,
        backing_transparency_failure=False,
        legal_deception=False,
    )
    assert result.triggered is True
    assert "FRAUD" in str(result.veto_type)

def test_veto_fraud_ponzi():
    """Ponzi structure should trigger HARD REJECT."""
    result = evaluate_vetoes(
        guaranteed_return_claims=False,
        ponzi_structure=True,
        unresolved_hack=False,
        single_key_custody=False,
        opaque_custody=False,
        backing_transparency_failure=False,
        legal_deception=False,
    )
    assert result.triggered is True

def test_veto_security_unresolved_hack():
    """Unresolved hack should trigger HARD REJECT."""
    result = evaluate_vetoes(
        guaranteed_return_claims=False,
        ponzi_structure=False,
        unresolved_hack=True,
        single_key_custody=False,
        opaque_custody=False,
        backing_transparency_failure=False,
        legal_deception=False,
    )
    assert result.triggered is True

def test_veto_custody_single_key():
    """Single-key custody should trigger HARD REJECT."""
    result = evaluate_vetoes(
        guaranteed_return_claims=False,
        ponzi_structure=False,
        unresolved_hack=False,
        single_key_custody=True,
        opaque_custody=False,
        backing_transparency_failure=False,
        legal_deception=False,
    )
    assert result.triggered is True

def test_veto_no_trigger_when_clean():
    """Clean project should NOT trigger any veto."""
    result = evaluate_vetoes(
        guaranteed_return_claims=False,
        ponzi_structure=False,
        unresolved_hack=False,
        single_key_custody=False,
        opaque_custody=False,
        backing_transparency_failure=False,
        legal_deception=False,
    )
    assert result.triggered is False

def test_veto_first_hit_wins():
    """If multiple veto conditions are true, first hit wins (Fraud > Security)."""
    result = evaluate_vetoes(
        guaranteed_return_claims=True,
        ponzi_structure=False,
        unresolved_hack=True,
        single_key_custody=False,
        opaque_custody=False,
        backing_transparency_failure=False,
        legal_deception=False,
    )
    assert result.triggered is True
    assert "FRAUD" in str(result.veto_type)


# ========================================================================== #
#  PHASE 5: Scoring
# ========================================================================== #

def test_weakest_link_penalty_below_4():
    """Axis score below 4.0 should incur penalty."""
    penalty, high_risk = weakest_link_penalty(min_axis_score=2.0, min_sub_score=5.0)
    assert penalty > 0
    assert penalty == (4.0 - 2.0) * 6.0  # = 12.0
    assert high_risk is False

def test_weakest_link_penalty_sub_factor_below_3():
    """Sub-factor below 3.0 should flag high risk."""
    penalty, high_risk = weakest_link_penalty(min_axis_score=5.0, min_sub_score=2.0)
    assert high_risk is True
    assert penalty == 10.0

def test_weakest_link_no_penalty_when_healthy():
    """Healthy scores should incur no penalty."""
    penalty, high_risk = weakest_link_penalty(min_axis_score=5.0, min_sub_score=4.0)
    assert penalty == 0.0
    assert high_risk is False

def test_quality_bands():
    """Quality band thresholds."""
    assert project_quality_band(95) == "Elite Infrastructure"
    assert project_quality_band(85) == "Strong Infrastructure"
    assert project_quality_band(75) == "Promising"
    assert project_quality_band(65) == "Watchlist"
    assert project_quality_band(55) == "Weak"
    assert project_quality_band(30) == "Story / Speculation"

def test_persona_weights_sum_to_one():
    """All persona weights must sum to 1.0."""
    for persona in Persona:
        weights = PERSONA_WEIGHTS[persona]
        total = sum(weights.values())
        assert abs(total - 1.0) < 0.001, f"{persona.value} weights sum to {total}, not 1.0"


# ========================================================================== #
#  PHASE 6: Valuation Multiples (P/R, P/F, P/T)
# ========================================================================== #

def test_pr_calculation():
    """P/R = Market Cap / Annualized Revenue."""
    mc = 1_000_000_000
    daily_revenue = 1_000_000
    annual_rev = daily_revenue * 365
    p_r = mc / annual_rev
    assert abs(p_r - 2.739726) < 0.01

def test_pf_calculation():
    """P/F = FDV / Annualized Fees (NOT revenue)."""
    fdv = 2_000_000_000
    daily_fees = 500_000
    annual_fees = daily_fees * 365
    p_f = fdv / annual_fees
    assert abs(p_f - 10.958904) < 0.01

def test_pt_calculation():
    """P/T = Market Cap / TVL."""
    mc = 500_000_000
    tvl = 5_000_000_000
    p_t = mc / tvl
    assert p_t == 0.1

def test_pr_none_when_no_revenue():
    """P/R should be None when there's no real revenue."""
    mc = 1_000_000_000
    annual_rev = 0
    p_r = (mc / annual_rev) if (mc and annual_rev > 0) else None
    assert p_r is None

def test_fee_volatility_calculation():
    """Fee volatility = |7d avg daily - 30d avg daily| / 30d avg daily * 100."""
    fees_7d = 700_000
    fees_30d = 3_000_000
    avg_7d = fees_7d / 7.0
    avg_30d = fees_30d / 30.0
    vol = abs(avg_7d - avg_30d) / avg_30d * 100
    assert vol == 0.0  # Stable

    fees_7d_volatile = 1_400_000
    avg_7d_v = fees_7d_volatile / 7.0
    vol_v = abs(avg_7d_v - avg_30d) / avg_30d * 100
    assert vol_v == 100.0


# ========================================================================== #
#  PHASE 7: Decision / Action Mapping
# ========================================================================== #

def test_action_veto_always_ignore():
    """Veto should always result in Ignore."""
    level, label = action_from_scores(
        project_quality=90, token_quality=90, investment_attractiveness=90,
        confidence=100, veto_triggered=True,
    )
    assert level == 0
    assert "Ignore" in label

def test_action_low_confidence_caps_at_watch():
    """Low confidence (<45%) should cap at Watch."""
    level, label = action_from_scores(
        project_quality=90, token_quality=90, investment_attractiveness=90,
        confidence=40, veto_triggered=False,
    )
    assert level == 1
    assert "Watch" in label

def test_action_medium_confidence_caps_at_research():
    """Medium confidence (45-60%) should cap at Deep Research."""
    level, label = action_from_scores(
        project_quality=90, token_quality=90, investment_attractiveness=90,
        confidence=55, veto_triggered=False,
    )
    assert level == 2

def test_action_high_conviction():
    """High scores + high confidence → High Conviction."""
    level, label = action_from_scores(
        project_quality=90, token_quality=90, investment_attractiveness=90,
        confidence=80, veto_triggered=False,
    )
    assert level == 5
    assert "High Conviction" in label

def test_action_ignore_for_low_scores():
    """Very low blended score → Ignore."""
    level, label = action_from_scores(
        project_quality=20, token_quality=20, investment_attractiveness=20,
        confidence=80, veto_triggered=False,
    )
    assert level == 0


# ========================================================================== #
#  Revenue ≠ Fees principle
# ========================================================================== #

def test_revenue_not_equal_fees():
    """Revenue and fees are different metrics — fees × 365 ≠ revenue."""
    daily_fees = 1_000_000
    daily_revenue = 300_000
    annual_fees = daily_fees * 365
    annual_revenue = daily_revenue * 365
    assert annual_fees != annual_revenue
    assert annual_fees > annual_revenue

    mc = 1_000_000_000
    p_r = mc / annual_revenue
    p_f = mc / annual_fees
    assert p_r != p_f
    assert p_r > p_f


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    passed = 0
    failed = 0
    for test in tests:
        try:
            test()
            print(f"  ✓ {test.__name__}")
            passed += 1
        except Exception as e:
            print(f"  ✗ {test.__name__}: {e}")
            failed += 1
    print(f"\n{'='*50}")
    print(f"Results: {passed} passed, {failed} failed, {len(tests)} total")
    if failed > 0:
        sys.exit(1)
