"use client";

/* -------------------------------------------------------------------------- *
 *  CoinPortal  ·  Task ID: coin-portal-component
 *  ---------------------------------------------------------------------------
 *  A left-side Sheet (drawer) that opens when the user clicks a row in
 *  CoinTable (Market Intelligence view). Behaves like CoinMarketCap's coin
 *  detail page: it aggregates live price (Binance), 7-day sparkline
 *  (CoinGecko chart), CoinGecko search metadata (image / rank), and DeFiLlama
 *  protocol stats into a single portal.
 *
 *  Architecture
 *  ------------
 *  - Client component ("use client" at top).
 *  - All API calls go through Next.js proxy routes (same-origin) — NO direct
 *    calls to localhost:3003.
 *  - 4 sources are fetched in PARALLEL using Promise.allSettled so one
 *    failure doesn't break the rest (graceful degradation).
 *  - Each fetch wrapped in try/catch — errors are logged and surfaced as
 *    "Unavailable" badges per section, never silently swallowed.
 *  - AbortController stored in ref; aborted on unmount or geckoId change.
 *  - reqIdRef pattern (mirrors useMarketOverview in market-intelligence-view
 *    lines 230-296) guards against stale responses.
 *  - 15-second auto-refresh for Binance live price (separate AbortController +
 *    separate effect with interval cleanup).
 *
 *  Sources
 *  -------
 *  1. CoinGecko search:  /api/scanner/search?q={geckoId}
 *  2. Binance ticker:    /api/scanner/binance/price/{symbol}
 *  3. CoinGecko chart:   /api/scanner/coingecko/chart/{geckoId}?days=7
 *  4. DeFiLlama match:   /api/scanner/market/overview  (cached; look in
 *                        top_defi / top_fees arrays for symbol/name match)
 * ------------------------------------------------------------------------- */

import * as React from "react";
import {
  Activity,
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  ExternalLink,
  Globe,
  Layers,
  RefreshCw,
  Sparkles,
  Wallet,
  Zap,
} from "lucide-react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { fmtUsd } from "@/lib/format-utils";
import type {
  CoinSearchResult,
  MarketOverview,
} from "@/lib/scanner-types";
import { cn } from "@/lib/utils";

/* -------------------------------------------------------------------------- */
/*  Public props                                                              */
/* -------------------------------------------------------------------------- */

export interface CoinPortalProps {
  /** When non-null, the portal opens for this CoinGecko coin id. */
  geckoId: string | null;
  coinSymbol: string;
  coinName: string;
  onClose: () => void;
  /** Switch to Coin Explorer view (run the 8-phase analysis). */
  onAnalyze: (geckoId: string, name: string) => void;
}

/* -------------------------------------------------------------------------- */
/*  Local types — mirror the (untyped) backend response shapes                */
/* -------------------------------------------------------------------------- */

interface BinanceTicker {
  symbol?: string;
  binance_symbol?: string;
  price: number | null;
  change_24h_pct: number | null;
  high_24h: number | null;
  low_24h: number | null;
  volume_24h: number | null;
  trade_count?: number | null;
  source?: string;
  fetched_at?: string;
}

interface CoinChart {
  gecko_id?: string;
  days?: number;
  prices?: [number, number][];
  market_caps?: [number, number][];
  total_volumes?: [number, number][];
}

/** A DeFiLlama protocol match — drawn from either top_defi or top_fees. */
interface DefiMatch {
  /** Where the match came from: "defi" (TVL list) or "fees" (fees list). */
  source: "defi" | "fees";
  name: string;
  symbol: string;
  slug: string | null;
  tvl: number | null;
  fees_24h: number | null;
  revenue_24h: number | null;
  fees_7d: number | null;
  revenue_7d: number | null;
  fees_30d: number | null;
  revenue_30d: number | null;
  chains: string[];
  chain: string | null;
  category: string | null;
  url: string | null;
}

/** Per-source error map — null means "no error / not yet attempted". */
interface PortalErrors {
  search: string | null;
  binance: string | null;
  chart: string | null;
  market: string | null;
}

/* -------------------------------------------------------------------------- */
/*  Number formatting helpers (local to keep the portal self-contained)       */
/*                                                                            */
/*  fmtUsd from @/lib/format-utils handles $XB / $XM / $XK / $0.034 already.   */
/*  Here we add fmtPrice (token-price tuned) and fmtPct with sign.            */
/* -------------------------------------------------------------------------- */

function fmtPrice(v: number | null | undefined): string {
  if (v == null || typeof v !== "number" || isNaN(v)) return "—";
  const abs = Math.abs(v);
  if (abs >= 1e3) return `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  if (abs >= 1) return `$${v.toFixed(2)}`;
  if (abs >= 0.01) return `$${v.toFixed(4)}`;
  if (abs > 0) return `$${v.toFixed(6)}`;
  return "$0.00";
}

function fmtPctSigned(v: number | null | undefined, digits = 2): string {
  if (v == null || typeof v !== "number" || isNaN(v)) return "—";
  const s = v > 0 ? "+" : "";
  return `${s}${v.toFixed(digits)}%`;
}

function fmtNum(v: number | null | undefined): string {
  if (v == null || typeof v !== "number" || isNaN(v)) return "—";
  return v.toLocaleString();
}

/** Translate-with-fallback helper. Same pattern as useTt in
 *  market-intelligence-view.tsx (lines 215-224). */
function useTt() {
  const { t } = useLanguage();
  return React.useCallback(
    (key: string, fallback: string, vars?: Record<string, string | number>): string => {
      const v = t(key, vars);
      return typeof v === "string" && v !== key ? v : fallback;
    },
    [t],
  );
}

/* -------------------------------------------------------------------------- */
/*  Sparkline — pure SVG, no chart library                                    */
/* -------------------------------------------------------------------------- */

interface SparklineProps {
  /** Flat array of price samples. */
  data: number[];
  /** SVG viewport width. Height is fixed at 64. */
  width?: number;
  height?: number;
  /** Optional explicit stroke color (hex). Defaults to up/down coloring. */
  color?: string;
  className?: string;
}

function Sparkline({
  data,
  width = 320,
  height = 64,
  color,
  className,
}: SparklineProps) {
  // Sanitise useId — React returns ":r0:"-style strings; colons break CSS
  // selectors / SVG url() references.
  const rawId = React.useId();
  const gradId = `coin-portal-spark-${rawId.replace(/[:]/g, "")}`;

  if (!data || data.length < 2) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1; // avoid divide-by-zero when flat

  const points: Array<[number, number]> = data.map((p, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((p - min) / range) * (height - 4) - 2;
    return [x, y];
  });

  const linePath = points
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`)
    .join(" ");
  const areaPath = `${linePath} L${width.toFixed(2)} ${height} L0 ${height} Z`;

  // Up/down coloring when no explicit color given.
  const isUp = data[data.length - 1] >= data[0];
  const stroke = color ?? (isUp ? "#10b981" : "#f43f5e");

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={cn("block w-full", className)}
      style={{ height: `${height}px` }}
      role="img"
      aria-label={`7-day price sparkline (${isUp ? "up" : "down"} over period)`}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity={0.28} />
          <stop offset="100%" stopColor={stroke} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradId})`} />
      <path
        d={linePath}
        fill="none"
        stroke={stroke}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/*  Sub-component — small Stat card                                            */
/* -------------------------------------------------------------------------- */

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  accent?: "emerald" | "rose" | "amber" | "sky" | "teal" | "default";
  loading?: boolean;
}

const STAT_ACCENT: Record<NonNullable<StatCardProps["accent"]>, string> = {
  emerald: "text-emerald-500 bg-emerald-500/10",
  rose: "text-rose-500 bg-rose-500/10",
  amber: "text-amber-500 bg-amber-500/10",
  sky: "text-sky-500 bg-sky-500/10",
  teal: "text-teal-500 bg-teal-500/10",
  default: "text-foreground bg-muted/40",
};

function StatCard({ icon, label, value, sub, accent = "default", loading }: StatCardProps) {
  if (loading) {
    return (
      <Card className="border-border/60 bg-card/40 p-4 gap-3">
        <Skeleton className="h-7 w-7 rounded-md" />
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-6 w-28" />
      </Card>
    );
  }
  return (
    <Card className="border-border/60 bg-card/40 p-4 gap-2 transition-colors hover:border-border/90">
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium" dir="auto">
          {label}
        </span>
        <span className={cn("flex size-7 items-center justify-center rounded-md", STAT_ACCENT[accent])}>
          {icon}
        </span>
      </div>
      <div className="text-xl font-bold tabular-nums leading-none">{value}</div>
      {sub != null && <div className="text-xs text-muted-foreground" dir="auto">{sub}</div>}
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/*  Sub-component — external link button                                       */
/* -------------------------------------------------------------------------- */

interface ExternalLinkButtonProps {
  href: string;
  icon: React.ReactNode;
  label: string;
}

function ExternalLinkButton({ href, icon, label }: ExternalLinkButtonProps) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs bg-muted/30 hover:bg-muted/60 border border-border/40 hover:border-border/70 transition-colors text-foreground/80 hover:text-foreground"
    >
      <span className="flex size-3.5 items-center justify-center">{icon}</span>
      <span dir="auto">{label}</span>
      <ExternalLink className="size-3 opacity-60" />
    </a>
  );
}

/* -------------------------------------------------------------------------- */
/*  Sub-component — section-level unavailable / error placeholder              */
/* -------------------------------------------------------------------------- */

function UnavailableSection({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-md border border-amber-500/30 bg-amber-500/5 text-amber-600 dark:text-amber-400 text-xs">
      <AlertCircle className="size-3.5 flex-shrink-0" />
      <span dir="auto">{message}</span>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Fetch helpers — each wrapped in try/catch, returns null on error           */
/* -------------------------------------------------------------------------- */

/**
 * Fetch CoinGecko search results for `geckoId`. The search endpoint searches
 * by name/symbol — we treat the geckoId as a search query and find the
 * result whose `id` matches exactly (falling back to the first result).
 */
async function fetchSearch(
  geckoId: string,
  signal: AbortSignal,
): Promise<CoinSearchResult | null> {
  const url = `/api/scanner/search?q=${encodeURIComponent(geckoId)}`;
  const res = await fetch(url, { signal, cache: "no-store" });
  if (!res.ok) {
    throw new Error(`search HTTP ${res.status}`);
  }
  const json = (await res.json()) as { results?: CoinSearchResult[]; error?: string };
  if (json.error) {
    throw new Error(json.error);
  }
  const results = Array.isArray(json.results) ? json.results : [];
  if (results.length === 0) return null;
  // Prefer exact id match; fall back to first result.
  const exact = results.find((r) => r?.id === geckoId);
  return exact ?? results[0] ?? null;
}

/** Fetch Binance 24h ticker for `symbol` (e.g. "BTC", "ETH"). */
async function fetchBinancePrice(
  symbol: string,
  signal: AbortSignal,
): Promise<BinanceTicker | null> {
  if (!symbol) return null;
  const url = `/api/scanner/binance/price/${encodeURIComponent(symbol.toUpperCase())}`;
  const res = await fetch(url, { signal, cache: "no-store" });
  if (!res.ok) {
    throw new Error(`binance HTTP ${res.status}`);
  }
  const json = (await res.json()) as BinanceTicker & { error?: string };
  if (json.error) {
    throw new Error(json.error);
  }
  if (json.price == null && json.change_24h_pct == null) {
    return null;
  }
  return json;
}

/** Fetch CoinGecko 7-day price chart for `geckoId`. */
async function fetchChart(
  geckoId: string,
  days: number,
  signal: AbortSignal,
): Promise<CoinChart | null> {
  const url = `/api/scanner/coingecko/chart/${encodeURIComponent(geckoId)}?days=${days}`;
  const res = await fetch(url, { signal, cache: "no-store" });
  if (!res.ok) {
    throw new Error(`chart HTTP ${res.status}`);
  }
  const json = (await res.json()) as CoinChart & { error?: string };
  if (json.error) {
    throw new Error(json.error);
  }
  if (!Array.isArray(json.prices) || json.prices.length === 0) {
    return null;
  }
  return json;
}

/** Fetch the cached market overview (used for DeFiLlama protocol match). */
async function fetchMarketOverview(
  signal: AbortSignal,
): Promise<MarketOverview | null> {
  const res = await fetch("/api/scanner/market/overview", { signal, cache: "no-store" });
  if (!res.ok) {
    throw new Error(`market HTTP ${res.status}`);
  }
  const json = (await res.json()) as MarketOverview & { error?: string };
  if (json.error) {
    throw new Error(json.error);
  }
  return json;
}

/**
 * Find a DeFiLlama protocol that matches the given coin by symbol or name.
 * Checks top_defi (TVL list) first, then top_fees (fees list).
 */
function findDefiMatch(
  market: MarketOverview | null,
  symbol: string,
  name: string,
): DefiMatch | null {
  if (!market) return null;
  const sym = (symbol || "").toUpperCase().trim();
  const nm = (name || "").toLowerCase().trim();

  const symbolMatches = (p: { symbol?: string | null }): boolean =>
    !!p.symbol && (p.symbol as string).toUpperCase().trim() === sym;
  const nameMatches = (p: { name?: string | null }): boolean =>
    !!p.name && typeof p.name === "string" &&
    (p.name.toLowerCase().includes(nm) || nm.includes(p.name.toLowerCase()));

  // 1) top_defi (TVL list)
  const defiList = Array.isArray(market.top_defi) ? market.top_defi : [];
  for (const p of defiList) {
    if (symbolMatches(p) || nameMatches(p)) {
      return {
        source: "defi",
        name: p.name,
        symbol: p.symbol,
        slug: p.slug ?? null,
        tvl: p.tvl ?? null,
        fees_24h: null,
        revenue_24h: null,
        fees_7d: null,
        revenue_7d: null,
        fees_30d: null,
        revenue_30d: null,
        chains: p.chain ? [p.chain] : [],
        chain: p.chain ?? null,
        category: p.category ?? null,
        url: p.url ?? null,
      };
    }
  }

  // 2) top_fees (fees list)
  const feesList = Array.isArray(market.top_fees) ? market.top_fees : [];
  for (const p of feesList) {
    if (symbolMatches(p) || nameMatches(p)) {
      return {
        source: "fees",
        name: p.name,
        symbol: p.symbol,
        slug: p.slug ?? null,
        tvl: null,
        fees_24h: p.fees_24h ?? null,
        revenue_24h: p.revenue_24h ?? null,
        fees_7d: p.fees_7d ?? null,
        revenue_7d: p.revenue_7d ?? null,
        fees_30d: p.fees_30d ?? null,
        revenue_30d: p.revenue_30d ?? null,
        chains: Array.isArray(p.chains) ? p.chains : [],
        chain: null,
        category: p.category ?? null,
        url: null,
      };
    }
  }

  return null;
}

/* -------------------------------------------------------------------------- */
/*  Main component                                                             */
/* -------------------------------------------------------------------------- */

export function CoinPortal({
  geckoId,
  coinSymbol,
  coinName,
  onClose,
  onAnalyze,
}: CoinPortalProps) {
  const tt = useTt();

  /* ----- State ---------------------------------------------------------- */
  const [loading, setLoading] = React.useState<boolean>(false);
  const [search, setSearch] = React.useState<CoinSearchResult | null>(null);
  const [binance, setBinance] = React.useState<BinanceTicker | null>(null);
  const [chart, setChart] = React.useState<CoinChart | null>(null);
  const [market, setMarket] = React.useState<MarketOverview | null>(null);
  const [defiMatch, setDefiMatch] = React.useState<DefiMatch | null>(null);
  const [errors, setErrors] = React.useState<PortalErrors>({
    search: null,
    binance: null,
    chart: null,
    market: null,
  });

  /* ----- Refs ----------------------------------------------------------- */
  // Main AbortController — shared by all 4 parallel fetches; aborted on
  // unmount or when geckoId changes (MI-FE-1 / MI-FE-2 pattern).
  const mainAbortRef = React.useRef<AbortController | null>(null);
  // Separate AbortController for the 15s Binance auto-refresh — so it never
  // interferes with a full re-load.
  const binanceAbortRef = React.useRef<AbortController | null>(null);
  // Request ID ref — guards against stale responses (MI-FE-2 pattern).
  const reqIdRef = React.useRef(0);
  // Track the geckoId currently being loaded so the Binance auto-refresh
  // effect can detect a stale closure.
  const loadedGeckoRef = React.useRef<string | null>(null);

  /* ----- Reset state when portal closes -------------------------------- */
  React.useEffect(() => {
    if (geckoId === null) {
      setSearch(null);
      setBinance(null);
      setChart(null);
      setMarket(null);
      setDefiMatch(null);
      setErrors({ search: null, binance: null, chart: null, market: null });
      setLoading(false);
      loadedGeckoRef.current = null;
    }
  }, [geckoId]);

  /* ----- Main load — Promise.allSettled for 4 parallel fetches ---------- */
  const loadAll = React.useCallback(
    async (gid: string, sym: string, nm: string) => {
      // Abort any in-flight main load before starting a new one.
      mainAbortRef.current?.abort();
      const ctrl = new AbortController();
      mainAbortRef.current = ctrl;
      const myReqId = ++reqIdRef.current;
      loadedGeckoRef.current = gid;

      setLoading(true);
      setErrors({ search: null, binance: null, chart: null, market: null });

      // Promise.allSettled — one failure must NOT break the others.
      const [searchR, binanceR, chartR, marketR] = await Promise.allSettled([
        fetchSearch(gid, ctrl.signal).catch((e) => {
          // Log per-source errors — never silently swallow (MI-FE-3 fix).
          console.error("[CoinPortal] search failed:", e);
          throw e;
        }),
        fetchBinancePrice(sym, ctrl.signal).catch((e) => {
          console.error("[CoinPortal] binance failed:", e);
          throw e;
        }),
        fetchChart(gid, 7, ctrl.signal).catch((e) => {
          console.error("[CoinPortal] chart failed:", e);
          throw e;
        }),
        fetchMarketOverview(ctrl.signal).catch((e) => {
          console.error("[CoinPortal] market overview failed:", e);
          throw e;
        }),
      ]);

      // Stale-response guard: skip if a newer request has superseded this one.
      if (myReqId !== reqIdRef.current) return;

      // ----- Search -----
      if (searchR.status === "fulfilled") {
        setSearch(searchR.value);
        setErrors((e) => ({ ...e, search: null }));
      } else {
        const msg =
          searchR.reason instanceof Error
            ? searchR.reason.message
            : String(searchR.reason);
        setSearch(null);
        setErrors((e) => ({ ...e, search: msg }));
      }

      // ----- Binance -----
      if (binanceR.status === "fulfilled") {
        setBinance(binanceR.value);
        setErrors((e) => ({ ...e, binance: null }));
      } else {
        const msg =
          binanceR.reason instanceof Error
            ? binanceR.reason.message
            : String(binanceR.reason);
        setBinance(null);
        setErrors((e) => ({ ...e, binance: msg }));
      }

      // ----- Chart -----
      if (chartR.status === "fulfilled") {
        setChart(chartR.value);
        setErrors((e) => ({ ...e, chart: null }));
      } else {
        const msg =
          chartR.reason instanceof Error
            ? chartR.reason.message
            : String(chartR.reason);
        setChart(null);
        setErrors((e) => ({ ...e, chart: msg }));
      }

      // ----- Market overview (for DeFiLlama match) -----
      if (marketR.status === "fulfilled") {
        setMarket(marketR.value);
        setDefiMatch(findDefiMatch(marketR.value, sym, nm));
        setErrors((e) => ({ ...e, market: null }));
      } else {
        const msg =
          marketR.reason instanceof Error
            ? marketR.reason.message
            : String(marketR.reason);
        setMarket(null);
        setDefiMatch(null);
        setErrors((e) => ({ ...e, market: msg }));
      }

      // Only clear loading if this is still the current request.
      if (myReqId === reqIdRef.current) {
        setLoading(false);
      }
    },
    [],
  );

  // Trigger main load when geckoId changes.
  React.useEffect(() => {
    if (!geckoId) return;
    loadAll(geckoId, coinSymbol, coinName);
    // Cleanup: abort in-flight request on unmount or geckoId change.
    return () => {
      mainAbortRef.current?.abort();
    };
  }, [geckoId, coinSymbol, coinName, loadAll]);

  /* ----- 15s Binance auto-refresh --------------------------------------- */
  React.useEffect(() => {
    if (!geckoId || !coinSymbol) return;
    const sym = coinSymbol;

    const tick = async () => {
      // If the portal has been closed (geckoId cleared) or a new coin is now
      // loading, skip this tick — the new loadAll will fetch fresh data.
      if (loadedGeckoRef.current !== geckoId) return;

      binanceAbortRef.current?.abort();
      const ctrl = new AbortController();
      binanceAbortRef.current = ctrl;
      try {
        const data = await fetchBinancePrice(sym, ctrl.signal);
        // Only update if we're still on the same coin and not aborted.
        if (loadedGeckoRef.current !== geckoId) return;
        if (data) {
          setBinance(data);
          setErrors((e) => (e.binance ? { ...e, binance: null } : e));
        }
      } catch (err) {
        // Don't clear stale price on auto-refresh failure — keep showing the
        // last known value. Log so it's traceable in dev tools.
        if (err instanceof DOMException && err.name === "AbortError") return;
        console.error("[CoinPortal] Binance auto-refresh failed:", err);
      }
    };

    const id = window.setInterval(tick, 15_000);
    return () => {
      window.clearInterval(id);
      binanceAbortRef.current?.abort();
    };
  }, [geckoId, coinSymbol]);

  /* ----- Derived values ------------------------------------------------- */
  const isOpen = geckoId !== null;

  const rank = search?.market_cap_rank ?? null;
  const imageUrl = search?.large ?? search?.thumb ?? null;

  const change24h = binance?.change_24h_pct ?? null;
  const changeBadgeCls =
    change24h == null
      ? "bg-muted/40 text-muted-foreground border-muted/60"
      : change24h > 0
        ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
        : change24h < 0
          ? "bg-rose-500/15 text-rose-400 border-rose-500/30"
          : "bg-muted/40 text-muted-foreground border-muted/60";

  // Extract sparkline samples from chart.prices (array of [ts, price]).
  const sparkData: number[] = React.useMemo(() => {
    if (!chart?.prices || chart.prices.length === 0) return [];
    return chart.prices
      .map((p) => (Array.isArray(p) && p.length >= 2 ? p[1] : null))
      .filter((p): p is number => typeof p === "number" && !isNaN(p));
  }, [chart]);

  const sparkFirst = sparkData.length > 0 ? sparkData[0] : null;
  const sparkLast = sparkData.length > 0 ? sparkData[sparkData.length - 1] : null;
  const sparkChangePct =
    sparkFirst != null && sparkLast != null && sparkFirst !== 0
      ? ((sparkLast - sparkFirst) / sparkFirst) * 100
      : null;

  // External links.
  const coingeckoUrl = `https://www.coingecko.com/en/coins/${geckoId ?? ""}`;
  const cmcUrl = `https://coinmarketcap.com/currencies/${geckoId ?? ""}/`;
  const defillamaUrl = defiMatch?.slug
    ? `https://defillama.com/protocol/${defiMatch.slug}`
    : `https://defillama.com/protocols${geckoId ? `?q=${encodeURIComponent(geckoId)}` : ""}`;
  const websiteUrl = defiMatch?.url ?? null;

  const handleAnalyze = React.useCallback(() => {
    if (!geckoId) return;
    onAnalyze(geckoId, coinName);
  }, [geckoId, coinName, onAnalyze]);

  /* ----- Render --------------------------------------------------------- */
  return (
    <Sheet open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="left"
        className="w-full sm:max-w-2xl lg:max-w-3xl p-0 flex flex-col gap-0 overflow-hidden"
        aria-label={tt("portal.ariaLabel", "Coin detail portal")}
      >
        {/* ---------- Header (sticky) ---------- */}
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-border/60 sticky top-0 bg-background/95 backdrop-blur z-10 gap-2">
          <div className="flex items-start gap-3">
            {/* Coin image (or symbol placeholder) */}
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted/40 border border-border/40 overflow-hidden flex-shrink-0">
              {loading && !imageUrl ? (
                <Skeleton className="h-full w-full rounded-full" />
              ) : imageUrl ? (
                <img
                  src={imageUrl}
                  alt={`${coinName} logo`}
                  className="h-full w-full object-cover"
                  onError={(e) => {
                    // Hide broken image — keep the layout space so the
                    // header doesn't jump.
                    (e.currentTarget as HTMLImageElement).style.visibility = "hidden";
                  }}
                />
              ) : (
                <span className="text-sm font-bold">
                  {coinSymbol.slice(0, 3).toUpperCase()}
                </span>
              )}
            </div>

            {/* Name + symbol + rank + 24h change */}
            <div className="min-w-0 flex-1">
              <SheetTitle className="flex flex-wrap items-center gap-2 text-base">
                <span className="font-bold" dir="auto">{coinName || "—"}</span>
                {coinSymbol && (
                  <span className="font-mono text-xs text-muted-foreground">
                    ${coinSymbol.toUpperCase()}
                  </span>
                )}
                {rank != null && (
                  <Badge
                    variant="outline"
                    className="bg-muted/30 text-muted-foreground border-border/40 text-[10px]"
                  >
                    #{rank}
                  </Badge>
                )}
                {change24h != null && (
                  <Badge
                    variant="outline"
                    className={cn("text-[10px] tabular-nums", changeBadgeCls)}
                  >
                    {change24h > 0 ? (
                      <ArrowUpRight className="size-3 mr-0.5" />
                    ) : change24h < 0 ? (
                      <ArrowDownRight className="size-3 mr-0.5" />
                    ) : null}
                    {fmtPctSigned(change24h)}
                  </Badge>
                )}
              </SheetTitle>
              <SheetDescription className="sr-only">
                {tt(
                  "portal.description",
                  "Detailed view with live price, 7-day chart, and DeFi data.",
                )}
              </SheetDescription>
              {/* Live indicator */}
              <div className="flex items-center gap-1.5 mt-1 text-[11px] text-muted-foreground">
                <span className="relative flex size-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />
                  <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
                </span>
                <span dir="auto">{tt("portal.livePrice", "Live price")}</span>
                {binance?.fetched_at && (
                  <span className="text-muted-foreground/60">
                    · {new Date(binance.fetched_at).toLocaleTimeString()}
                  </span>
                )}
              </div>
            </div>
          </div>
        </SheetHeader>

        {/* ---------- Body (scrollable) ---------- */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* ===== Live price section ===== */}
          <section aria-label={tt("portal.priceSection", "Live price")}>
            <SectionTitle
              icon={<Activity className="size-3.5" />}
              label={tt("portal.binanceTicker", "Binance live ticker")}
              right={
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {tt("portal.refreshesEvery", "refreshes 15s")}
                </span>
              }
            />
            {errors.binance && !binance ? (
              <UnavailableSection
                message={tt(
                  "portal.binanceUnavailable",
                  "Binance ticker unavailable — showing other data.",
                )}
              />
            ) : (
              <div className="mt-2 flex items-baseline gap-3 flex-wrap">
                {loading && !binance ? (
                  <Skeleton className="h-10 w-44" />
                ) : (
                  <span
                    className="text-4xl font-bold tabular-nums leading-none"
                    dir="ltr"
                  >
                    {fmtPrice(binance?.price ?? null)}
                  </span>
                )}
                {change24h != null && (
                  <span
                    className={cn(
                      "text-sm font-medium tabular-nums",
                      change24h > 0
                        ? "text-emerald-500"
                        : change24h < 0
                          ? "text-rose-500"
                          : "text-muted-foreground",
                    )}
                  >
                    {fmtPctSigned(change24h)} {tt("portal.last24h", "24h")}
                  </span>
                )}
              </div>
            )}

            {/* 24h high / low / volume / trade count grid */}
            <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2">
              <StatCard
                icon={<ArrowUpRight className="size-3.5" />}
                label={tt("portal.high24h", "24h High")}
                value={fmtPrice(binance?.high_24h ?? null)}
                accent="emerald"
                loading={loading && !binance}
              />
              <StatCard
                icon={<ArrowDownRight className="size-3.5" />}
                label={tt("portal.low24h", "24h Low")}
                value={fmtPrice(binance?.low_24h ?? null)}
                accent="rose"
                loading={loading && !binance}
              />
              <StatCard
                icon={<Wallet className="size-3.5" />}
                label={tt("portal.volume24h", "24h Volume")}
                value={fmtUsd(binance?.volume_24h ?? null)}
                accent="sky"
                loading={loading && !binance}
              />
              <StatCard
                icon={<BarChart3 className="size-3.5" />}
                label={tt("portal.trades24h", "24h Trades")}
                value={fmtNum(binance?.trade_count ?? null)}
                accent="teal"
                loading={loading && !binance}
              />
            </div>
          </section>

          {/* ===== Sparkline ===== */}
          <section aria-label={tt("portal.sparklineSection", "7-day sparkline")}>
            <SectionTitle
              icon={<Sparkles className="size-3.5" />}
              label={tt("portal.sparkline7d", "7-day price chart")}
              right={
                sparkChangePct != null ? (
                  <span
                    className={cn(
                      "text-xs font-medium tabular-nums",
                      sparkChangePct > 0
                        ? "text-emerald-500"
                        : sparkChangePct < 0
                          ? "text-rose-500"
                          : "text-muted-foreground",
                    )}
                  >
                    {fmtPctSigned(sparkChangePct)} {tt("portal.last7d", "7d")}
                  </span>
                ) : null
              }
            />
            <div className="mt-2 rounded-lg border border-border/40 bg-card/30 p-3">
              {loading && sparkData.length === 0 ? (
                <Skeleton className="h-16 w-full" />
              ) : errors.chart ? (
                <UnavailableSection
                  message={tt(
                    "portal.chartUnavailable",
                    "7-day chart unavailable (rate-limited or no data).",
                  )}
                />
              ) : sparkData.length >= 2 ? (
                <Sparkline data={sparkData} />
              ) : (
                <div className="flex h-16 items-center justify-center text-xs text-muted-foreground">
                  {tt("portal.noChartData", "No chart data")}
                </div>
              )}
              {sparkData.length >= 2 && sparkFirst != null && sparkLast != null && (
                <div className="mt-2 flex justify-between text-[10px] text-muted-foreground tabular-nums">
                  <span dir="ltr">{fmtPrice(sparkFirst)}</span>
                  <span dir="ltr">{fmtPrice(sparkLast)}</span>
                </div>
              )}
            </div>
          </section>

          {/* ===== External links ===== */}
          <section aria-label={tt("portal.externalLinks", "External links")}>
            <SectionTitle
              icon={<ExternalLink className="size-3.5" />}
              label={tt("portal.externalLinks", "External links")}
            />
            <div className="mt-2 flex flex-wrap gap-2">
              <ExternalLinkButton
                href={coingeckoUrl}
                icon={<BarChart3 className="size-3.5" />}
                label="CoinGecko"
              />
              <ExternalLinkButton
                href={cmcUrl}
                icon={<BarChart3 className="size-3.5" />}
                label="CoinMarketCap"
              />
              <ExternalLinkButton
                href={defillamaUrl}
                icon={<Layers className="size-3.5" />}
                label="DeFiLlama"
              />
              {websiteUrl && (
                <ExternalLinkButton
                  href={websiteUrl}
                  icon={<Globe className="size-3.5" />}
                  label={tt("portal.website", "Website")}
                />
              )}
            </div>
          </section>

          {/* ===== Action button — Run 8-Phase Analysis ===== */}
          <section>
            <Button
              onClick={handleAnalyze}
              disabled={!geckoId}
              className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
              size="lg"
            >
              <Zap className="size-4" />
              <span dir="auto">
                {tt("portal.runAnalysis", "Run 8-Phase Analysis")}
              </span>
            </Button>
            <p className="mt-1.5 text-[11px] text-muted-foreground text-center" dir="auto">
              {tt(
                "portal.runAnalysisHint",
                "Switches to Coin Explorer with this coin pre-selected.",
              )}
            </p>
          </section>

          {/* ===== DeFi data section ===== */}
          <section aria-label={tt("portal.defiSection", "DeFi data")}>
            <SectionTitle
              icon={<Layers className="size-3.5" />}
              label={tt("portal.defiLlama", "DeFiLlama protocol data")}
              right={
                defiMatch && (
                  <Badge
                    variant="outline"
                    className="text-[10px] bg-teal-500/10 text-teal-500 border-teal-500/30"
                  >
                    {defiMatch.source === "defi" ? "TVL list" : "Fees list"}
                  </Badge>
                )
              }
            />
            {loading && !defiMatch && !errors.market ? (
              <div className="mt-2 grid grid-cols-2 md:grid-cols-3 gap-2">
                <StatCard icon={null} label="" value="" loading />
                <StatCard icon={null} label="" value="" loading />
                <StatCard icon={null} label="" value="" loading />
              </div>
            ) : defiMatch ? (
              <>
                <div className="mt-2 grid grid-cols-2 md:grid-cols-3 gap-2">
                  {defiMatch.tvl != null && (
                    <StatCard
                      icon={<Layers className="size-3.5" />}
                      label={tt("portal.tvl", "TVL")}
                      value={fmtUsd(defiMatch.tvl)}
                      accent="teal"
                    />
                  )}
                  {defiMatch.fees_24h != null && (
                    <StatCard
                      icon={<Wallet className="size-3.5" />}
                      label={tt("portal.fees24h", "Fees 24h")}
                      value={fmtUsd(defiMatch.fees_24h)}
                      accent="sky"
                    />
                  )}
                  {defiMatch.revenue_24h != null && (
                    <StatCard
                      icon={<Wallet className="size-3.5" />}
                      label={tt("portal.revenue24h", "Revenue 24h")}
                      value={fmtUsd(defiMatch.revenue_24h)}
                      accent="emerald"
                    />
                  )}
                  {defiMatch.fees_7d != null && (
                    <StatCard
                      icon={<Wallet className="size-3.5" />}
                      label={tt("portal.fees7d", "Fees 7d")}
                      value={fmtUsd(defiMatch.fees_7d)}
                      accent="sky"
                    />
                  )}
                  {defiMatch.fees_30d != null && (
                    <StatCard
                      icon={<Wallet className="size-3.5" />}
                      label={tt("portal.fees30d", "Fees 30d")}
                      value={fmtUsd(defiMatch.fees_30d)}
                      accent="sky"
                    />
                  )}
                  <StatCard
                    icon={<Activity className="size-3.5" />}
                    label={tt("portal.chains", "Chains")}
                    value={
                      defiMatch.chains.length > 0
                        ? String(defiMatch.chains.length)
                        : defiMatch.chain ?? "—"
                    }
                    sub={
                      defiMatch.chains.length > 0
                        ? defiMatch.chains.slice(0, 3).join(", ") +
                          (defiMatch.chains.length > 3
                            ? ` +${defiMatch.chains.length - 3}`
                            : "")
                        : undefined
                    }
                    accent="default"
                  />
                </div>
                {defiMatch.category && (
                  <p className="mt-2 text-xs text-muted-foreground" dir="auto">
                    {tt("portal.category", "Category")}: {defiMatch.category}
                  </p>
                )}
              </>
            ) : errors.market ? (
              <UnavailableSection
                message={tt(
                  "portal.marketOverviewUnavailable",
                  "Market overview unavailable — DeFi match not loaded.",
                )}
              />
            ) : (
              <div className="mt-2 flex items-center gap-2 px-3 py-2 rounded-md border border-border/40 bg-muted/20 text-xs text-muted-foreground">
                <AlertCircle className="size-3.5 flex-shrink-0" />
                <span dir="auto">
                  {tt(
                    "portal.noDefiMatch",
                    "No DeFiLlama protocol match found for this coin.",
                  )}
                </span>
              </div>
            )}
          </section>
        </div>

        {/* ---------- Footer (manual refresh) ---------- */}
        <div className="border-t border-border/60 px-6 py-3 flex items-center justify-between gap-3 bg-background/95">
          <span className="text-[11px] text-muted-foreground" dir="auto">
            {market?.cached_at
              ? `${tt("portal.cached", "Cached")} ${new Date(market.cached_at).toLocaleTimeString()}`
              : tt("portal.notCached", "Live data")}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => geckoId && loadAll(geckoId, coinSymbol, coinName)}
            disabled={loading || !geckoId}
            className="gap-1.5"
          >
            <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
            <span dir="auto">{tt("portal.refreshAll", "Refresh all")}</span>
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/* -------------------------------------------------------------------------- */
/*  Sub-component — section title bar (icon + label + right slot)              */
/* -------------------------------------------------------------------------- */

function SectionTitle({
  icon,
  label,
  right,
}: {
  icon: React.ReactNode;
  label: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <span className="text-muted-foreground/70">{icon}</span>
        <span dir="auto">{label}</span>
      </div>
      {right}
    </div>
  );
}

export default CoinPortal;
