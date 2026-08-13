/**
 * Shared types for the crypto-scanner framework.
 *
 * These mirror the Pydantic schemas in mini-services/crypto-scanner/models/schemas.py
 * and are used by the standalone view components (Coin Explorer, Market Intelligence)
 * so they don't need to depend on page.tsx's internal type definitions.
 *
 * page.tsx keeps its own structural copies for now; TypeScript's structural typing
 * makes the two interchangeable at call sites.
 */

export type Persona =
  | "researcher"
  | "investor"
  | "institutional"
  | "developer"
  | "trader"
  | "comprehensive";

export interface CandidateInfo {
  name: string;
  symbol: string;
  category: string;
  sector: string;
  description: string;
  key_signal: string;
  initial_priority: string;
  image: string | null;
  website: string | null;
  twitter: string | null;
  github: string | null;
  discord: string | null;
  blockchain_explorer: string | null;
}

export interface FullReport {
  id: string;
  candidate: CandidateInfo;
  data_cutoff: string;
  veto: { triggered: boolean; veto_type: string | null; reason: string };
  severe_risks: { name: string; present: boolean; note: string }[];
  executive_verdict: string;
  project_quality_score: number;
  token_quality_score: number | null;
  valuation_label: string;
  investment_attractiveness_score: number | null;
  confidence: number;
  axes: {
    name: string;
    score: number;
    confidence: number;
    key_reason: string;
    sub_factors: Record<string, number>;
  }[];
  economic_engine: {
    gross_volume: number | null;
    fees: number | null;
    revenue: number | null;
    net_revenue: number | null;
    revenue_growth_pct: number | null;
    aum: number | null;
    tvl: number | null;
    customer_count: number | null;
    retention_pct: number | null;
    customer_concentration: string | null;
    recurrence: string | null;
  };
  tokenomics: {
    market_cap: number | null;
    fdv: number | null;
    circulating_supply: number | null;
    total_supply: number | null;
    max_supply: number | null;
    supply_growth_pct: number | null;
    unlock_risk: string | null;
    insider_allocation_pct: number | null;
    staking_pct: number | null;
    utility_level: number;
    value_capture: string | null;
    buyback: boolean | null;
    burn: boolean | null;
  };
  market_structure: {
    spot_liquidity: number | null;
    dex_liquidity: number | null;
    daily_volume: number | null;
    holder_concentration: number | null;
    market_maker_dependency: string | null;
    slippage_note: string | null;
  };
  institutional_adoption: string;
  competitive_moat: string;
  cycle_phase: string;
  peer_benchmark: {
    peer_percentile: number | null;
    category_rank: string | null;
    closest_comparables: string[];
  };
  catalysts: { description: string; positive: boolean; eta: string | null }[];
  thesis_kill_conditions: string[];
  decision: {
    raw_score: number;
    confidence: number;
    risk_adjusted_score: number;
    action: number;
    action_label: string;
    underfollowed: boolean;
    key_risks: string[];
  };
  evidence_grade: string;
  data_needing_verification: string[];
  final_thesis: string;
  five_final_answers: string[];
  valuation_multiples?: {
    p_r: number | null;
    p_f: number | null;
    p_t: number | null;
    annualized_revenue: number | null;
    annualized_fees: number | null;
    fee_volatility_pct: number | null;
    note: string;
  } | null;
  cross_verifications?: {
    metric: string;
    source_a: string;
    value_a: number | null;
    source_b: string;
    value_b: number | null;
    discrepancy_pct: number | null;
    status: string;
  }[];
  fee_stability?: string | null;
  bias_checks?: string[];
  market_overview?: Record<string, unknown> | null;
}

// --------------------------------------------------------------------------- //
//  Coin search result (from /api/scanner/search)
// --------------------------------------------------------------------------- //
export interface CoinSearchResult {
  id: string;
  name: string;
  symbol: string;
  market_cap_rank: number | null;
  thumb: string | null;
  large: string | null;
  api_symbol: string;
}

// --------------------------------------------------------------------------- //
//  Market overview (from /api/scanner/market/overview)
// --------------------------------------------------------------------------- //
export interface GlobalMarketData {
  total_market_cap_usd: number | null;
  total_volume_usd: number | null;
  market_cap_change_percentage_24h_usd: number | null;
  btc_dominance: number | null;
  eth_dominance: number | null;
  active_cryptocurrencies: number | null;
  markets: number | null;
}

export interface FearGreedData {
  value: number;
  classification: string;
  timestamp: string | null;
}

export interface TrendingCoin {
  id: string;
  name: string;
  symbol: string;
  market_cap_rank: number | null;
  thumb: string | null;
  small: string | null;
  large: string | null;
  score: number | null;
  price_btc: number | null;
}

export interface TopCoin {
  id: string;
  symbol: string;
  name: string;
  image: string | null;
  current_price: number | null;
  market_cap: number | null;
  market_cap_rank: number | null;
  total_volume: number | null;
  high_24h: number | null;
  low_24h: number | null;
  price_change_percentage_1h_in_currency: number | null;
  price_change_percentage_24h: number | null;
  price_change_percentage_24h_in_currency: number | null;
  price_change_percentage_7d_in_currency: number | null;
  price_change_percentage_30d_in_currency: number | null;
  circulating_supply: number | null;
  total_supply: number | null;
  max_supply: number | null;
  ath: number | null;
  ath_change_percentage: number | null;
  atl: number | null;
  atl_change_percentage: number | null;
  fully_diluted_valuation: number | null;
}

export interface TopDefiProtocol {
  name: string;
  symbol: string;
  slug: string | null;
  tvl: number | null;
  chain: string | null;
  category: string | null;
  logo: string | null;
  url: string | null;
  twitter: string | null;
  github: string | null;
  audit_links: string[];
}

export interface TopFeeProtocol {
  name: string;
  symbol: string;
  slug: string | null;
  id: string;
  category: string;
  fees_24h: number | null;
  revenue_24h: number | null;
  fees_7d: number | null;
  revenue_7d: number | null;
  fees_30d: number | null;
  revenue_30d: number | null;
  chains: string[];
}

export interface SectorBreakdown {
  sector: string;
  count: number;
  total_market_cap: number;
  total_volume: number;
}

export interface MarketOverview {
  global: GlobalMarketData | null;
  fear_greed: FearGreedData | null;
  trending: TrendingCoin[];
  top_coins: TopCoin[];
  gainers: TopCoin[];
  losers: TopCoin[];
  top_defi: TopDefiProtocol[];
  top_fees: TopFeeProtocol[];
  sectors: SectorBreakdown[];
  defi_tvl_total: number;
  coin_count: number;
  defi_protocol_count: number;
  cached_at: string;
}
