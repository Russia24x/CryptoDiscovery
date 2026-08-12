"""
Pydantic schemas for the Crypto Market Discovery & Analysis Framework.
Mirrors the 8-phase framework structure.
"""
from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, Field


# --------------------------------------------------------------------------- #
#  PHASE 0 — Settings
# --------------------------------------------------------------------------- #
class Persona(str, Enum):
    RESEARCHER = "researcher"
    INVESTOR = "investor"
    INSTITUTIONAL = "institutional"
    DEVELOPER = "developer"
    TRADER = "trader"


class ScanConfig(BaseModel):
    persona: Persona = Persona.INVESTOR
    market_cap_min: float = 0.0          # in USD millions
    market_cap_max: float = 1_000_000.0  # effectively unbounded
    sectors: list[str] = Field(default_factory=list)  # empty = all
    max_projects: int = 20
    data_cutoff: datetime = Field(default_factory=datetime.utcnow)


# --------------------------------------------------------------------------- #
#  PHASE 2 — Veto & Evidence
# --------------------------------------------------------------------------- #
class EvidenceGrade(str, Enum):
    A = "A - Primary Verified"
    B = "B - Strong Secondary"
    C = "C - Indirect"
    D = "D - Unverified"


class VetoType(str, Enum):
    FRAUD = "A - Fraud / Guaranteed Return"
    SECURITY = "B - Unresolved Critical Security Failure"
    CUSTODY = "C - Unacceptable Custody Risk"
    BACKING = "D - Backing / Asset Transparency Failure"
    LEGAL = "E - Material Legal Deception"


class VetoResult(BaseModel):
    triggered: bool
    veto_type: Optional[VetoType] = None
    reason: str = ""


class SevereRisk(BaseModel):
    name: str
    present: bool
    note: str = ""


# --------------------------------------------------------------------------- #
#  PHASE 4 — Five Fundamental Axes
# --------------------------------------------------------------------------- #
class AxisName(str, Enum):
    INVISIBLE_UTILITY = "Invisible Utility"
    ECONOMIC_ENGINE = "Economic Engine"
    MOAT = "Moat"
    TOKEN_MARKET = "Token & Market Structure"
    GOVERNANCE_LEGAL = "Governance / Legal / Security"


class AxisScore(BaseModel):
    name: AxisName
    score: float = Field(ge=0.0, le=10.0)
    confidence: float = Field(ge=0.0, le=100.0)
    key_reason: str
    sub_factors: dict[str, float] = Field(default_factory=dict)


class Tokenomics(BaseModel):
    market_cap: Optional[float] = None
    fdv: Optional[float] = None
    circulating_supply: Optional[float] = None
    total_supply: Optional[float] = None
    max_supply: Optional[float] = None
    supply_growth_pct: Optional[float] = None
    unlock_risk: Optional[str] = None
    insider_allocation_pct: Optional[float] = None
    staking_pct: Optional[float] = None
    utility_level: int = Field(default=0, ge=0, le=4)
    value_capture: Optional[str] = None
    buyback: Optional[bool] = None
    burn: Optional[bool] = None


class MarketStructure(BaseModel):
    spot_liquidity: Optional[float] = None
    dex_liquidity: Optional[float] = None
    daily_volume: Optional[float] = None
    holder_concentration: Optional[float] = None
    market_maker_dependency: Optional[str] = None
    slippage_note: Optional[str] = None


class EconomicEngine(BaseModel):
    gross_volume: Optional[float] = None
    fees: Optional[float] = None
    revenue: Optional[float] = None
    net_revenue: Optional[float] = None
    revenue_growth_pct: Optional[float] = None
    aum: Optional[float] = None
    tvl: Optional[float] = None
    customer_count: Optional[int] = None
    retention_pct: Optional[float] = None
    customer_concentration: Optional[str] = None
    recurrence: Optional[str] = None


# --------------------------------------------------------------------------- #
#  PHASE 5 — Scoring
# --------------------------------------------------------------------------- #
class PeerBenchmark(BaseModel):
    peer_percentile: Optional[float] = None
    category_rank: Optional[str] = None
    closest_comparables: list[str] = Field(default_factory=list)


# --------------------------------------------------------------------------- #
#  PHASE 6 — Investment Analysis
# --------------------------------------------------------------------------- #
class ValuationVerdict(str, Enum):
    CHEAP = "Cheap"
    FAIR = "Fair"
    EXPENSIVE = "Expensive"
    UNABLE = "Unable to Determine"


class CyclePhase(str, Enum):
    HIDDEN_DEV = "Phase 1 - Hidden Development"
    PMF = "Phase 2 - Product-Market Fit"
    ADOPTION = "Phase 3 - Adoption"
    MONETIZATION = "Phase 4 - Monetization"
    INSTITUTIONAL = "Phase 5 - Institutional Integration"
    SCALE = "Phase 6 - Scale"
    MATURITY = "Phase 7 - Maturity"


class Catalyst(BaseModel):
    description: str
    positive: bool
    eta: Optional[str] = None


class InvestmentAnalysis(BaseModel):
    fdv_revenue: Optional[float] = None
    mc_revenue: Optional[float] = None
    fdv_fees: Optional[float] = None
    mc_tvl: Optional[float] = None
    valuation: ValuationVerdict = ValuationVerdict.UNABLE
    project_quality: Optional[float] = None
    token_quality: Optional[float] = None
    valuation_attractiveness: Optional[float] = None
    timing: Optional[float] = None
    investment_attractiveness: Optional[float] = None
    cycle_phase: CyclePhase = CyclePhase.HIDDEN_DEV
    catalysts: list[Catalyst] = Field(default_factory=list)
    thesis: str = ""
    kill_conditions: list[str] = Field(default_factory=list)


# --------------------------------------------------------------------------- #
#  PHASE 7 — Decision
# --------------------------------------------------------------------------- #
class ActionLevel(int, Enum):
    IGNORE = 0
    WATCH = 1
    DEEP_RESEARCH = 2
    SMALL_POSITION = 3
    CORE_CANDIDATE = 4
    HIGH_CONVICTION = 5


class Decision(BaseModel):
    raw_score: float
    confidence: float
    risk_adjusted_score: float
    action: ActionLevel
    action_label: str
    underfollowed: bool
    key_risks: list[str] = Field(default_factory=list)


# --------------------------------------------------------------------------- #
#  Full Project Report (PHASE 8 — Output)
# --------------------------------------------------------------------------- #
class CandidateInfo(BaseModel):
    name: str
    symbol: str
    category: str
    sector: str
    description: str
    key_signal: str
    initial_priority: str
    gecko_id: Optional[str] = None
    llama_id: Optional[str] = None
    website: Optional[str] = None
    image: Optional[str] = None


class ProjectReport(BaseModel):
    id: str
    candidate: CandidateInfo
    data_cutoff: datetime
    veto: VetoResult
    severe_risks: list[SevereRisk] = Field(default_factory=list)
    executive_verdict: str
    project_quality_score: float
    token_quality_score: Optional[float] = None
    valuation_label: ValuationVerdict
    investment_attractiveness_score: Optional[float] = None
    confidence: float
    axes: list[AxisScore]
    economic_engine: EconomicEngine
    tokenomics: Tokenomics
    market_structure: MarketStructure
    institutional_adoption: str
    competitive_moat: str
    cycle_phase: CyclePhase
    peer_benchmark: PeerBenchmark
    catalysts: list[Catalyst]
    thesis_kill_conditions: list[str]
    decision: Decision
    evidence_grade: EvidenceGrade
    data_needing_verification: list[str]
    final_thesis: str
    five_final_answers: list[str]
    scan_id: str
    created_at: datetime


# --------------------------------------------------------------------------- #
#  Scan orchestration
# --------------------------------------------------------------------------- #
class ScanStatus(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class ScanPhase(str, Enum):
    DISCOVERY = "PHASE 1 - Market Scanning"
    SCREENING = "PHASE 2 - Initial Screening"
    EVIDENCE = "PHASE 3 - Evidence Collection"
    EVALUATION = "PHASE 4 - Fundamental Evaluation"
    SCORING = "PHASE 5 - Scoring & Ranking"
    INVESTMENT = "PHASE 6 - Investment Analysis"
    DECISION = "PHASE 7 - Decision Making"
    OUTPUT = "PHASE 8 - Final Output"
    DONE = "Completed"


class ScanProgress(BaseModel):
    scan_id: str
    status: ScanStatus
    current_phase: ScanPhase
    progress_pct: float
    phase_log: list[str] = Field(default_factory=list)
    total_candidates: int = 0
    processed: int = 0
    config: ScanConfig
    started_at: datetime
    finished_at: Optional[datetime] = None
    error: Optional[str] = None
