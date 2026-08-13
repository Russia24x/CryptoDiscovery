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

// --------------------------------------------------------------------------- //
//  Crypto News (from /api/scanner/news)
// --------------------------------------------------------------------------- //
export interface NewsArticle {
  title: string;
  summary: string;
  url: string;
  source: string;
  published_at: string | null;
  image: string | null;
  categories: string[];
}

export interface NewsResponse {
  count: number;
  sources_configured: {
    rss: string[];
    cryptopanic: boolean;
    cryptocompare: boolean;
  };
  articles: NewsArticle[];
  fetched_at: string;
}

// --------------------------------------------------------------------------- //
//  Telegram channel feed (from /api/scanner/telegram)
// --------------------------------------------------------------------------- //
export interface TelegramMessage {
  id: string;
  channel: string;
  channel_url: string;
  text: string;
  published_at: string | null;
  views: string | null;
  author: string;
  media_type: string | null;
  media_url: string | null;
  media_all: string[] | null;
  links: string[];
}

export interface TelegramResponse {
  channel: string;
  channel_url: string;
  messages: TelegramMessage[];
  message_count: number;
  fetched_at: string;
  error?: string;
}

// --------------------------------------------------------------------------- //
//  Persian (Farsi) crypto news (from /api/scanner/news/fa)
// --------------------------------------------------------------------------- //
export interface PersianNewsArticle extends NewsArticle {
  category: string;
  lang: string;
}

export interface PersianNewsResponse {
  count: number;
  lang: string;
  sources_configured: {
    rss_fa: { source: string; category: string; url: string }[];
  };
  articles: PersianNewsArticle[];
  fetched_at: string;
}

// --------------------------------------------------------------------------- //
//  Data sources status (from /api/scanner/sources)
// --------------------------------------------------------------------------- //
export interface DataSourceInfo {
  name: string;
  type: "free" | "api_key";
  available: boolean;
  description: string;
}

export interface SourcesStatus {
  sources: DataSourceInfo[];
  free_count: number;
  keyed_count: number;
  total_count: number;
}

// --------------------------------------------------------------------------- //
//  CMC Pro exclusive data (from /api/scanner/cmc/*)
//  These endpoints return cmc_pro_required=true when no API key is set.
// --------------------------------------------------------------------------- //
export interface CmcAirdrop {
  id: number;
  name: string;
  symbol: string | null;
  status: string;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  total_value_usd: number | null;
  participants: number | null;
  requirements: string[];
  website: string | null;
  logo: string | null;
}

export interface CmcAirdropsResponse {
  cmc_pro_required?: boolean;
  plan_not_supported?: boolean;
  airdrops: CmcAirdrop[];
  count: number;
  status_filter?: string;
  fetched_at?: string;
  message?: string;
}

export interface CmcCategory {
  id: number;
  name: string;
  title: string | null;
  description: string | null;
  num_tokens: number;
  market_cap: number | null;
  market_cap_change_24h: number | null;
  market_cap_change_7d: number | null;
  volume_24h: number | null;
  top_coins: string[];
  avg_price_change_24h: number | null;
  last_updated: string | null;
}

export interface CmcCategoriesResponse {
  cmc_pro_required?: boolean;
  categories: CmcCategory[];
  count: number;
  fetched_at?: string;
  message?: string;
}

export interface CmcExchange {
  id: number;
  name: string;
  slug: string;
  is_active: boolean;
  first_historical_data: string | null;
  last_historical_data: string | null;
}

export interface CmcExchangesResponse {
  cmc_pro_required?: boolean;
  exchanges: CmcExchange[];
  count: number;
  fetched_at?: string;
  message?: string;
}

// --------------------------------------------------------------------------- //
//  CMC global metrics (from /api/scanner/cmc/global-metrics)
//  Used by the Hub for cross-verification of CoinGecko's global market data.
//  `metrics` is null when no CMC API key is configured.
// --------------------------------------------------------------------------- //
export interface CmcGlobalMetrics {
  total_market_cap_usd: number | null;
  total_volume_24h_usd: number | null;
  total_market_cap_yesterday_usd: number | null;
  total_volume_24h_yesterday_usd: number | null;
  total_market_cap_percentage_change_24h: number | null;
  btc_dominance: number | null;
  eth_dominance: number | null;
  active_cryptocurrencies: number | null;
  active_market_pairs: number | null;
  last_updated: string | null;
}

export interface CmcGlobalMetricsResponse {
  metrics: CmcGlobalMetrics | null;
  fetched_at?: string;
  cmc_pro_required?: boolean;
  message?: string;
}

// --------------------------------------------------------------------------- //
//  Dune Analytics — On-Chain Data (Grade A Evidence)
//  When DUNE_API_KEY is configured, these provide the highest-quality data
//  in the pipeline — read directly from blockchain transactions.
// --------------------------------------------------------------------------- //
export interface DuneQueryResults {
  query_id: string;
  rows: Record<string, unknown>[];
  row_count: number;
  column_types: string[];
  is_cached: boolean;
  fetched_at: string;
}

export interface DuneTokenConcentration {
  symbol: string;
  top_10_holder_pct: number | null;
  top_100_holder_pct: number | null;
  whale_wallet_count: number | null;
  team_wallet_concentration_pct: number | null;
  source: string;
  evidence_grade: string;
  fetched_at: string;
}

export interface DuneRealRevenue {
  protocol: string;
  total_fees_24h: number | null;
  real_revenue_24h: number | null;
  revenue_to_fee_ratio: number | null;
  annualized_revenue: number | null;
  annualized_fees: number | null;
  source: string;
  evidence_grade: string;
  fetched_at: string;
}

export interface DuneActiveUsers {
  protocol: string;
  dau: number | null;
  mau: number | null;
  dau_mau_ratio: number | null;
  bot_filtered: boolean;
  new_users_24h: number | null;
  retention_7d: number | null;
  source: string;
  evidence_grade: string;
  fetched_at: string;
}

export interface DuneInsightsResponse {
  symbol: string;
  token_concentration: DuneTokenConcentration | null;
  real_revenue: DuneRealRevenue | null;
  active_users: DuneActiveUsers | null;
  config: {
    available: boolean;
    has_token_concentration_query: boolean;
    has_real_revenue_query: boolean;
    has_active_users_query: boolean;
  };
  fetched_at: string;
  dune_pro_required?: boolean;
  message?: string;
}

// --------------------------------------------------------------------------- //
//  Scan list item (from /api/scanner/scans)
//  Lightweight scan record (without the heavy reports array).
// --------------------------------------------------------------------------- //
export interface ScanListItem {
  scan_id: string;
  status: string;
  phase: string;
  progress: number;
  total: number;
  processed: number;
  started_at: string;
  finished_at: string | null;
  persona: string;
}
