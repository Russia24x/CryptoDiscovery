"use client";

/* -------------------------------------------------------------------------- *
 *  HubView  ·  Task 1
 *  ---------------------------------------------------------------------------
 *  The main landing page of the crypto analysis dashboard. Aggregates a
 *  live snapshot of every subsystem (Discovery, Coin Explorer, Market
 *  Intelligence, News & Signals) into one premium, glassmorphic command
 *  center — inspired by CoinMarketCap, CoinGecko and DeFiLlama.
 *
 *  Layout (5 sections, all independently resilient):
 *
 *    1. Hero Banner              — Total Market Cap + 24h Δ, BTC/ETH dominance,
 *                                   Fear & Greed semicircle gauge, live pulse.
 *    2. Quick Actions Grid       — 4 large clickable cards (one per main view),
 *                                   2×2 on mobile, 4-col on desktop.
 *    3. Market Snapshot Strip    — horizontally scrollable row of trending
 *                                   coins, top DeFi, sentiment, TVL, active coins.
 *    4. Two-Column Layout        — Left (60%): News (EN/FA tabs) + Telegram.
 *                                   Right (40%): Framework Stats, Cross-
 *                                   Verification, Top Movers.
 *    5. Data Sources Footer      — 14 sources with green/grey health dots.
 *
 *  API contracts (all already built & verified — do NOT modify backend):
 *    GET /api/scanner/market/overview              -> MarketOverview
 *    GET /api/scanner/cmc/global-metrics           -> CmcGlobalMetricsResponse
 *    GET /api/scanner/news?limit=5                 -> NewsResponse
 *    GET /api/scanner/news/fa?limit=5              -> PersianNewsResponse
 *    GET /api/scanner/telegram?channel=..&limit=3  -> TelegramResponse
 *    GET /api/scanner/scans                        -> ScanListItem[]
 *    GET /api/scanner/sources                      -> SourcesStatus
 *
 *  Conventions:
 *    - shadcn/ui (New York) — Card, Button, Badge, Tabs, Skeleton, Tooltip,
 *      Separator.
 *    - Tailwind 4 — emerald (Discovery), amber (Explorer), sky (Market),
 *      rose (News), teal / violet accents. NO indigo / blue primaries.
 *    - lucide-react icons.
 *    - useLanguage() for i18n; translation keys live under `hub.*`.
 *    - Every section degrades gracefully: skeleton while loading, hidden /
 *      muted on error, empty-state note when data is absent.
 * ------------------------------------------------------------------------- */

import * as React from "react";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  ArrowDownRight,
  Boxes,
  Crosshair,
  Eye,
  Flame,
  Gauge,
  Globe,
  Layers,
  MessageCircle,
  Newspaper,
  Radar,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Zap,
} from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { cn } from "@/lib/utils";
import type {
  CmcGlobalMetricsResponse,
  DataSourceInfo,
  FearGreedData,
  MarketOverview,
  NewsArticle,
  NewsResponse,
  PersianNewsArticle,
  PersianNewsResponse,
  ScanListItem,
  SourcesStatus,
  TelegramMessage,
  TelegramResponse,
  TopCoin,
  TopDefiProtocol,
  TrendingCoin,
} from "@/lib/scanner-types";

/* -------------------------------------------------------------------------- */
/*  Props                                                                     */
/* -------------------------------------------------------------------------- */

export interface HubViewProps {
  /** Navigate to a specific main view. */
  onNavigate: (view: "discovery" | "explorer" | "market" | "news" | "settings") => void;
  /** Start a scan immediately (shortcut to Discovery scan). */
  onQuickScan?: () => void;
}

/* ========================================================================== */
/*  Constants                                                                 */
/* ========================================================================== */

/** Per-view accent system used by Quick Actions and section highlights. */
type Accent = "emerald" | "amber" | "sky" | "rose" | "teal" | "violet";

const ACCENT_TEXT: Record<Accent, string> = {
  emerald: "text-emerald-500",
  amber: "text-amber-500",
  sky: "text-sky-500",
  rose: "text-rose-500",
  teal: "text-teal-500",
  violet: "text-violet-500",
};

const ACCENT_ICON_BG: Record<Accent, string> = {
  emerald: "bg-gradient-to-br from-emerald-500/25 to-emerald-500/5 text-emerald-500 ring-1 ring-emerald-500/30",
  amber: "bg-gradient-to-br from-amber-500/25 to-amber-500/5 text-amber-500 ring-1 ring-amber-500/30",
  sky: "bg-gradient-to-br from-sky-500/25 to-sky-500/5 text-sky-500 ring-1 ring-sky-500/30",
  rose: "bg-gradient-to-br from-rose-500/25 to-rose-500/5 text-rose-500 ring-1 ring-rose-500/30",
  teal: "bg-gradient-to-br from-teal-500/25 to-teal-500/5 text-teal-500 ring-1 ring-teal-500/30",
  violet: "bg-gradient-to-br from-violet-500/25 to-violet-500/5 text-violet-500 ring-1 ring-violet-500/30",
};

const ACCENT_GLOW: Record<Accent, string> = {
  emerald: "hover:border-emerald-500/40 hover:shadow-emerald-500/10",
  amber: "hover:border-amber-500/40 hover:shadow-amber-500/10",
  sky: "hover:border-sky-500/40 hover:shadow-sky-500/10",
  rose: "hover:border-rose-500/40 hover:shadow-rose-500/10",
  teal: "hover:border-teal-500/40 hover:shadow-teal-500/10",
  violet: "hover:border-violet-500/40 hover:shadow-violet-500/10",
};

/* ========================================================================== */
/*  Formatting helpers                                                        */
/* ========================================================================== */

/** `$2.27T` · `$1.2B` · `$340M` · `$12K` · `$0.034` · `—` for null. */
function fmtUsd(v: number | null | undefined): string {
  if (v == null || typeof v !== "number" || isNaN(v)) return "—";
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 1e12) return `${sign}$${(abs / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(1)}K`;
  if (abs >= 1) return `${sign}$${abs.toFixed(2)}`;
  if (abs > 0) return `${sign}$${abs.toFixed(4)}`;
  return "$0.00";
}

/** `+1.2%` / `-2.1%` / `—`. */
function fmtPct(v: number | null | undefined, digits = 2): string {
  if (v == null || typeof v !== "number" || isNaN(v)) return "—";
  const s = v > 0 ? "+" : "";
  return `${s}${v.toFixed(digits)}%`;
}

/** `18,404` with commas. */
function fmtNum(v: number | null | undefined): string {
  if (v == null || typeof v !== "number" || isNaN(v)) return "—";
  return v.toLocaleString();
}

/** Color class for a % change: emerald for positive, rose for negative. */
function pctColor(v: number | null | undefined): string {
  if (v == null || isNaN(v)) return "text-muted-foreground";
  if (v > 0) return "text-emerald-500";
  if (v < 0) return "text-rose-500";
  return "text-muted-foreground";
}

/** Format an ISO date string as a short relative time, e.g. "5m ago". */
function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (isNaN(date.getTime())) return "—";
  const diffSec = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (diffSec < 5) return "just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  const min = Math.floor(diffSec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  const wk = Math.floor(day / 7);
  if (wk < 5) return `${wk}w ago`;
  const mon = Math.floor(day / 30);
  if (mon < 12) return `${mon}mo ago`;
  return `${Math.floor(day / 365)}y ago`;
}

/* ========================================================================== */
/*  Fear & Greed tier                                                         */
/* ========================================================================== */

interface FgTier {
  label: string;
  color: string; // hex
  badge: string; // tailwind classes
}

function fearGreedTier(value: number | null | undefined): FgTier {
  if (value == null || isNaN(value)) {
    return { label: "—", color: "#71717a", badge: "bg-muted/40 text-muted-foreground border-muted/60" };
  }
  if (value <= 24) return { label: "Extreme Fear", color: "#f43f5e", badge: "bg-rose-500/15 text-rose-400 border-rose-500/30" };
  if (value <= 44) return { label: "Fear", color: "#f97316", badge: "bg-orange-500/15 text-orange-400 border-orange-500/30" };
  if (value <= 55) return { label: "Neutral", color: "#f59e0b", badge: "bg-amber-500/15 text-amber-400 border-amber-500/30" };
  if (value <= 74) return { label: "Greed", color: "#84cc16", badge: "bg-lime-500/15 text-lime-400 border-lime-500/30" };
  return { label: "Extreme Greed", color: "#10b981", badge: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" };
}

/* ========================================================================== */
/*  i18n helper                                                               */
/* ========================================================================== */

/** Translate-with-fallback: returns the fallback string when the key is missing. */
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

/* ========================================================================== */
/*  Generic API hook — each instance is fully independent                    */
/* ========================================================================== */

interface ApiState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

/**
 * Fetch a JSON endpoint once on mount (and whenever `url` changes).
 * Aborts on unmount, never throws — failures are captured in `error`.
 */
function useApi<T>(url: string | null, opts?: { timeoutMs?: number }): ApiState<T> {
  const [state, setState] = React.useState<ApiState<T>>({
    data: null,
    loading: url !== null,
    error: null,
  });

  const timeoutMs = opts?.timeoutMs ?? 30_000;

  React.useEffect(() => {
    if (!url) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    let cancelled = false;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);

    setState((s) => ({ ...s, loading: true, error: null }));

    fetch(url, { signal: ctrl.signal, cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as T;
        if (!cancelled) setState({ data: json, loading: false, error: null });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const isAbort = err instanceof DOMException && err.name === "AbortError";
        const msg = isAbort
          ? "Request timed out"
          : err instanceof Error
            ? err.message
            : String(err);
        setState({ data: null, loading: false, error: msg });
      })
      .finally(() => {
        clearTimeout(timer);
      });

    return () => {
      cancelled = true;
      ctrl.abort();
      clearTimeout(timer);
    };
  }, [url, timeoutMs]);

  return state;
}

/** A re-ticking "now" timestamp (every 30s) so `timeAgo` labels stay fresh. */
function useNowTick(intervalMs = 30_000): number {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/* ========================================================================== */
/*  Sub-component: Fear & Greed semicircle gauge (hero)                      */
/* ========================================================================== */

/**
 * Compact semicircular SVG gauge, 0 (left) → 100 (right), with a colored
 * value arc, needle marker and center readout.
 */
function FearGreedGauge({ value, classification }: { value: number | null; classification: string }) {
  const tier = fearGreedTier(value);
  const W = 220;
  const H = 132;
  const cx = W / 2;
  const cy = 112;
  const r = 92;
  const arcLen = Math.PI * r; // semicircle length

  const safe = typeof value === "number" && !isNaN(value) ? Math.max(0, Math.min(100, value)) : 0;
  const fill = (safe / 100) * arcLen;

  // needle endpoint: angle measured from +x axis, CCW (math), y inverted on screen
  const angle = Math.PI * (1 - safe / 100); // 180°→0°
  const nx = cx + (r - 14) * Math.cos(angle);
  const ny = cy - (r - 14) * Math.sin(angle);

  return (
    <div className="flex flex-col items-center gap-1" aria-label={`Fear and Greed index: ${value ?? "unknown"}, ${classification}`}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-[220px]" role="img">
        {/* track */}
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="14"
          strokeLinecap="round"
          className="text-muted/30"
        />
        {/* value arc */}
        {typeof value === "number" && !isNaN(value) && (
          <path
            d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
            fill="none"
            stroke={tier.color}
            strokeWidth="14"
            strokeLinecap="round"
            strokeDasharray={`${fill} ${arcLen}`}
            style={{ transition: "stroke-dasharray 600ms ease" }}
          />
        )}
        {/* needle */}
        {typeof value === "number" && !isNaN(value) && (
          <g style={{ transition: "transform 600ms ease" }}>
            <line x1={cx} y1={cy} x2={nx} y2={ny} stroke={tier.color} strokeWidth="3" strokeLinecap="round" />
            <circle cx={cx} cy={cy} r="5" fill={tier.color} />
          </g>
        )}
      </svg>
      <div className="-mt-6 flex flex-col items-center">
        <span className="text-3xl font-bold tabular-nums" style={{ color: tier.color }}>
          {typeof value === "number" && !isNaN(value) ? value : "—"}
        </span>
        <span className="text-xs font-medium text-muted-foreground">{classification || tier.label}</span>
      </div>
    </div>
  );
}

/* ========================================================================== */
/*  Sub-component: Fear & Greed mini (snapshot strip)                        */
/* ========================================================================== */

/** Compact conic-gradient circle for the snapshot strip. */
function FearGreedMini({ value, classification }: { value: number | null; classification: string }) {
  const tier = fearGreedTier(value);
  const safe = typeof value === "number" && !isNaN(value) ? Math.max(0, Math.min(100, value)) : 0;
  const deg = (safe / 100) * 360;
  return (
    <div className="flex items-center gap-3" aria-label={`Sentiment ${value ?? "unknown"} ${classification}`}>
      <div
        className="relative size-12 shrink-0 rounded-full"
        style={{
          background: `conic-gradient(${tier.color} ${deg}deg, hsl(var(--muted) / 0.3) ${deg}deg 360deg)`,
        }}
      >
        <div className="absolute inset-[5px] flex items-center justify-center rounded-full bg-card">
          <span className="text-sm font-bold tabular-nums" style={{ color: tier.color }}>
            {typeof value === "number" && !isNaN(value) ? value : "—"}
          </span>
        </div>
      </div>
      <div className="min-w-0">
        <p className="truncate text-xs text-muted-foreground">Sentiment</p>
        <p className="truncate text-sm font-semibold">{classification || tier.label}</p>
      </div>
    </div>
  );
}

/* ========================================================================== */
/*  Sub-component: Image with graceful fallback                               */
/* ========================================================================== */

function ImgWithFallback({
  src,
  alt,
  className,
  fallbackIcon,
}: {
  src: string | null | undefined;
  alt: string;
  className?: string;
  fallbackIcon?: React.ReactNode;
}) {
  const [errored, setErrored] = React.useState(false);
  React.useEffect(() => setErrored(false), [src]);
  if (!src || errored) {
    return (
      <div className={cn("flex items-center justify-center bg-muted/40 text-muted-foreground/40", className)}>
        {fallbackIcon ?? <Sparkles className="size-4" />}
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setErrored(true)}
      className={className}
    />
  );
}

/* ========================================================================== */
/*  SECTION 1 — Hero Banner                                                   */
/* ========================================================================== */

function HeroBanner({ market, cmc }: { market: ApiState<MarketOverview>; cmc: ApiState<CmcGlobalMetricsResponse> }) {
  const tt = useTt();
  useNowTick(30_000); // keep timeAgo labels fresh

  const g = market.data?.global ?? null;
  const fg: FearGreedData | null = market.data?.fear_greed ?? null;
  const cachedAt = market.data?.cached_at ?? null;

  // Prefer CMC dominance when available (cross-verified), else CoinGecko.
  const cmcMetrics = cmc.data?.metrics ?? null;
  const btcDom = cmcMetrics?.btc_dominance ?? g?.btc_dominance ?? null;
  const ethDom = cmcMetrics?.eth_dominance ?? g?.eth_dominance ?? null;
  const totalMcap = g?.total_market_cap_usd ?? null;
  const mcapChange = g?.market_cap_change_percentage_24h_usd ?? null;

  const changePositive = (mcapChange ?? 0) >= 0;

  return (
    <Card className="relative overflow-hidden border-border/60 bg-gradient-to-br from-emerald-500/10 via-card/60 to-sky-500/10 p-0 backdrop-blur-sm">
      {/* animated grain / noise overlay */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.18] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='160'%20height='160'%3E%3Cfilter%20id='n'%3E%3CfeTurbulence%20type='fractalNoise'%20baseFrequency='0.85'%20numOctaves='2'%20stitchTiles='stitch'/%3E%3C/filter%3E%3Crect%20width='100%25'%20height='100%25'%20filter='url(%23n)'/%3E%3C/svg%3E\")",
          backgroundSize: "160px 160px",
          animation: "hub-grain 6s steps(4) infinite",
        }}
        aria-hidden
      />
      <style>{`@keyframes hub-grain{0%{background-position:0 0}25%{background-position:40px 20px}50%{background-position:80px -10px}75%{background-position:20px 60px}100%{background-position:0 0}}`}</style>

      <CardContent className="relative grid gap-6 p-5 sm:p-7 md:grid-cols-[1.4fr_1fr_0.9fr] md:items-center">
        {/* — Left: Total Market Cap + 24h change — */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500/70" />
              <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
            </span>
            <span className="text-xs font-medium uppercase tracking-wider text-emerald-500">{tt("hub.live", "Live")}</span>
            <span className="text-xs text-muted-foreground">
              {cachedAt ? `${tt("hub.updated", "Updated")} ${timeAgo(cachedAt)}` : tt("hub.justNow", "just now")}
            </span>
          </div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {tt("hub.hero.totalMarketCap", "Total Market Cap")}
          </p>
          {market.loading ? (
            <Skeleton className="h-10 w-44" />
          ) : (
            <div className="flex items-end gap-3">
              <span className="text-3xl font-bold tabular-nums sm:text-4xl">{fmtUsd(totalMcap)}</span>
              {mcapChange != null && (
                <span className={cn("mb-1 flex items-center gap-1 text-sm font-semibold tabular-nums", pctColor(mcapChange))}>
                  {changePositive ? <ArrowUpRight className="size-4" /> : <ArrowDownRight className="size-4" />}
                  {fmtPct(mcapChange)}
                </span>
              )}
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            {tt("hub.hero.totalVolume", "24h Volume")}:{" "}
            <span className="font-semibold text-foreground tabular-nums">{market.loading ? "—" : fmtUsd(g?.total_volume_usd ?? null)}</span>
          </p>
        </div>

        {/* — Center: BTC + ETH dominance — */}
        <div className="grid grid-cols-2 gap-3">
          <DominancePill
            label={tt("hub.hero.btcDominance", "BTC Dominance")}
            value={btcDom}
            loading={market.loading && cmc.loading}
            accent="amber"
          />
          <DominancePill
            label={tt("hub.hero.ethDominance", "ETH Dominance")}
            value={ethDom}
            loading={market.loading && cmc.loading}
            accent="violet"
          />
        </div>

        {/* — Right: Fear & Greed gauge — */}
        <div className="flex flex-col items-center justify-center rounded-xl border border-border/40 bg-card/30 p-3">
          <p className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {tt("hub.hero.fearGreed", "Fear & Greed")}
          </p>
          {market.loading ? (
            <Skeleton className="h-[120px] w-[180px]" />
          ) : (
            <FearGreedGauge value={fg?.value ?? null} classification={fg?.classification ?? ""} />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function DominancePill({
  label,
  value,
  loading,
  accent,
}: {
  label: string;
  value: number | null;
  loading: boolean;
  accent: Accent;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-border/40 bg-card/30 p-3">
      <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
      {loading ? (
        <Skeleton className="h-6 w-16" />
      ) : (
        <span className={cn("text-xl font-bold tabular-nums", ACCENT_TEXT[accent])}>
          {value == null ? "—" : `${value.toFixed(2)}%`}
        </span>
      )}
    </div>
  );
}

/* ========================================================================== */
/*  SECTION 2 — Quick Actions Grid                                            */
/* ========================================================================== */

interface QuickActionDef {
  view: "discovery" | "explorer" | "market" | "news";
  icon: React.ReactNode;
  titleKey: string;
  titleFallback: string;
  subtitleKey: string;
  subtitleFallback: string;
  actionKey: string;
  actionFallback: string;
  accent: Accent;
  badge?: React.ReactNode;
}

function QuickActionsGrid({
  onNavigate,
  onQuickScan,
  scanCount,
  scanLoading,
}: {
  onNavigate: HubViewProps["onNavigate"];
  onQuickScan?: () => void;
  scanCount: number | null;
  scanLoading: boolean;
}) {
  const tt = useTt();

  const actions: QuickActionDef[] = [
    {
      view: "discovery",
      icon: <Radar className="size-6" />,
      titleKey: "hub.quickActions.discoveryTitle",
      titleFallback: "Discovery",
      subtitleKey: "hub.quickActions.discoverySubtitle",
      subtitleFallback: "8-phase framework analysis",
      actionKey: "hub.quickActions.discoveryAction",
      actionFallback: "Scan Market",
      accent: "emerald",
      badge:
        scanCount != null && scanCount > 0 ? (
          <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
            {tt("hub.quickActions.scanCount", "{count} scans run", { count: scanCount })}
          </Badge>
        ) : null,
    },
    {
      view: "explorer",
      icon: <Crosshair className="size-6" />,
      titleKey: "hub.quickActions.explorerTitle",
      titleFallback: "Coin Explorer",
      subtitleKey: "hub.quickActions.explorerSubtitle",
      subtitleFallback: "Search → persona → report",
      actionKey: "hub.quickActions.explorerAction",
      actionFallback: "Analyze Any Coin",
      accent: "amber",
    },
    {
      view: "market",
      icon: <Globe className="size-6" />,
      titleKey: "hub.quickActions.marketTitle",
      titleFallback: "Market Intelligence",
      subtitleKey: "hub.quickActions.marketSubtitle",
      subtitleFallback: "CMC + DeFiLlama unified",
      actionKey: "hub.quickActions.marketAction",
      actionFallback: "Market Overview",
      accent: "sky",
    },
    {
      view: "news",
      icon: <Newspaper className="size-6" />,
      titleKey: "hub.quickActions.newsTitle",
      titleFallback: "News & Signals",
      subtitleKey: "hub.quickActions.newsSubtitle",
      subtitleFallback: "EN + FA + Telegram",
      actionKey: "hub.quickActions.newsAction",
      actionFallback: "Latest News",
      accent: "rose",
    },
    {
      view: "settings",
      icon: <Settings className="size-6" />,
      titleKey: "hub.quickActions.settingsTitle",
      titleFallback: "Settings",
      subtitleKey: "hub.quickActions.settingsSubtitle",
      subtitleFallback: "API keys + news sources",
      actionKey: "hub.quickActions.settingsAction",
      actionFallback: "Configure",
      accent: "teal",
    },
  ];

  return (
    <section aria-label={tt("hub.quickActions.title", "Quick Actions")} className="space-y-3">
      <div className="flex items-center gap-2">
        <Zap className="size-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          {tt("hub.quickActions.title", "Quick Actions")}
        </h2>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {actions.map((a) => {
          const handleClick = () => {
            if (a.view === "discovery" && onQuickScan) onQuickScan();
            else onNavigate(a.view);
          };
          return (
            <button
              key={a.view}
              type="button"
              onClick={handleClick}
              className={cn(
                "group relative flex h-full flex-col gap-3 rounded-xl border border-border/60 bg-card/40 p-4 text-left backdrop-blur-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                ACCENT_GLOW[a.accent],
              )}
            >
              <div className="flex items-start justify-between">
                <div className={cn("flex size-11 items-center justify-center rounded-lg", ACCENT_ICON_BG[a.accent])}>
                  {a.icon}
                </div>
                {a.badge}
              </div>
              <div className="space-y-1">
                <h3 className="font-semibold leading-tight">{tt(a.titleKey, a.titleFallback)}</h3>
                <p className="text-xs text-muted-foreground">{tt(a.subtitleKey, a.subtitleFallback)}</p>
              </div>
              <div className="mt-auto flex items-center gap-1 text-xs font-medium opacity-80 transition-all group-hover:gap-2 group-hover:opacity-100">
                <span className={ACCENT_TEXT[a.accent]}>{tt(a.actionKey, a.actionFallback)}</span>
                <ArrowRight className={cn("size-3.5 transition-transform group-hover:translate-x-0.5", ACCENT_TEXT[a.accent])} />
              </div>
            </button>
          );
        })}
      </div>
      {scanLoading && (
        <p className="sr-only">Loading scan count</p>
      )}
    </section>
  );
}

/* ========================================================================== */
/*  SECTION 3 — Market Snapshot Strip                                         */
/* ========================================================================== */

function SnapshotStrip({ market }: { market: ApiState<MarketOverview> }) {
  const tt = useTt();

  if (market.error) return null;

  const trending: TrendingCoin[] = market.data?.trending ?? [];
  const topDefi: TopDefiProtocol[] = market.data?.top_defi ?? [];
  const fg = market.data?.fear_greed ?? null;
  const defiTvl = market.data?.defi_tvl_total ?? null;
  const activeCoins = market.data?.global?.active_cryptocurrencies ?? null;
  const rateLimited = market.data && trending.length === 0 && topDefi.length === 0;

  return (
    <section aria-label={tt("hub.snapshot.title", "Market Snapshot")} className="space-y-3">
      <div className="flex items-center gap-2">
        <Activity className="size-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          {tt("hub.snapshot.title", "Market Snapshot")}
        </h2>
      </div>
      <Card className="border-border/60 bg-card/40 backdrop-blur-sm">
        <CardContent className="p-3">
          {market.loading ? (
            <div className="flex gap-3 overflow-hidden">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-40 shrink-0 rounded-lg" />
              ))}
            </div>
          ) : rateLimited ? (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">
              {tt("hub.snapshot.loadingData", "Market data loading…")}{" "}
              {tt("hub.snapshot.rateLimited", "Some live feeds are temporarily rate-limited.")}
            </p>
          ) : (
            <div className="flex gap-3 overflow-x-auto pb-1 [scrollbar-width:thin]">
              {/* Trending coins */}
              {trending.length > 0 && (
                <SnapshotGroup label={tt("hub.snapshot.trending", "Trending")} icon={<Flame className="size-3.5 text-rose-500" />}>
                  {trending.slice(0, 6).map((c) => (
                    <div
                      key={c.id}
                      className="flex shrink-0 items-center gap-2 rounded-full border border-border/50 bg-muted/30 py-1 pl-1 pr-3"
                      title={c.name}
                    >
                      <ImgWithFallback
                        src={c.thumb ?? c.small}
                        alt={c.name}
                        className="size-6 rounded-full"
                        fallbackIcon={<span className="text-[10px] font-bold">{c.symbol?.[0] ?? "?"}</span>}
                      />
                      <span className="text-xs font-semibold">{c.symbol}</span>
                      {c.market_cap_rank != null && (
                        <span className="text-[10px] text-muted-foreground">#{c.market_cap_rank}</span>
                      )}
                    </div>
                  ))}
                </SnapshotGroup>
              )}

              {/* Top DeFi */}
              {topDefi.length > 0 && (
                <SnapshotGroup label={tt("hub.snapshot.topDefi", "Top DeFi")} icon={<Layers className="size-3.5 text-sky-500" />}>
                  {topDefi.slice(0, 3).map((p, i) => (
                    <div
                      key={p.slug ?? p.name}
                      className="flex shrink-0 items-center gap-2 rounded-lg border border-border/50 bg-muted/30 px-2 py-1"
                      title={p.name}
                    >
                      <span className="text-[10px] font-bold text-muted-foreground">{i + 1}</span>
                      <ImgWithFallback
                        src={p.logo}
                        alt={p.name}
                        className="size-5 rounded-full"
                        fallbackIcon={<Boxes className="size-3" />}
                      />
                      <div className="flex flex-col leading-tight">
                        <span className="text-xs font-semibold">{p.name}</span>
                        <span className="text-[10px] text-muted-foreground tabular-nums">{fmtUsd(p.tvl)}</span>
                      </div>
                    </div>
                  ))}
                </SnapshotGroup>
              )}

              {/* DeFi TVL total */}
              {defiTvl != null && defiTvl > 0 && (
                <SnapshotStat
                  label={tt("hub.snapshot.defiTvl", "DeFi TVL Total")}
                  value={fmtUsd(defiTvl)}
                  icon={<Boxes className="size-3.5 text-teal-500" />}
                />
              )}

              {/* Active coins */}
              {activeCoins != null && activeCoins > 0 && (
                <SnapshotStat
                  label={tt("hub.snapshot.activeCoins", "Active Coins")}
                  value={fmtNum(activeCoins)}
                  icon={<Globe className="size-3.5 text-violet-500" />}
                />
              )}

              {/* Fear & Greed mini */}
              {fg && <div className="shrink-0 rounded-lg border border-border/50 bg-muted/30 px-3 py-2"><FearGreedMini value={fg.value} classification={fg.classification} /></div>}
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

function SnapshotGroup({ label, icon, children }: { label: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex shrink-0 flex-col gap-1.5">
      <span className="flex items-center gap-1 px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </span>
      <div className="flex gap-2">{children}</div>
    </div>
  );
}

function SnapshotStat({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="flex shrink-0 flex-col justify-center gap-0.5 rounded-lg border border-border/50 bg-muted/30 px-3 py-2">
      <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </span>
      <span className="text-sm font-bold tabular-nums">{value}</span>
    </div>
  );
}

/* ========================================================================== */
/*  SECTION 4 (Left) — News + Telegram column                                 */
/* ========================================================================== */

function NewsAndTelegramColumn({
  news,
  newsFa,
  telegram,
  onNavigate,
}: {
  news: ApiState<NewsResponse>;
  newsFa: ApiState<PersianNewsResponse>;
  telegram: ApiState<TelegramResponse>;
  onNavigate: HubViewProps["onNavigate"];
}) {
  const tt = useTt();
  const [tab, setTab] = React.useState<"en" | "fa">("en");

  const enArticles: NewsArticle[] = news.data?.articles ?? [];
  const faArticles: PersianNewsArticle[] = newsFa.data?.articles ?? [];
  const tgMessages: TelegramMessage[] = telegram.data?.messages ?? [];

  return (
    <div className="space-y-4">
      {/* — Latest News — */}
      <Card className="border-border/60 bg-card/40 backdrop-blur-sm">
        <CardHeader className="gap-2 pb-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Newspaper className="size-4 text-rose-500" />
              <CardTitle className="text-base">{tt("hub.news.title", "Latest News")}</CardTitle>
            </div>
            <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => onNavigate("news")}>
              {tt("hub.news.viewAll", "View all")}
              <ArrowRight className="size-3" />
            </Button>
          </div>
          <Tabs value={tab} onValueChange={(v) => setTab(v as "en" | "fa")}>
            <TabsList className="h-8">
              <TabsTrigger value="en" className="text-xs">{tt("hub.news.tabEn", "English")}</TabsTrigger>
              <TabsTrigger value="fa" className="text-xs">{tt("hub.news.tabFa", "فارسی")}</TabsTrigger>
            </TabsList>
            <TabsContent value="en" className="mt-3">
              <NewsList articles={enArticles} loading={news.loading} emptyText={tt("hub.news.noArticles", "No recent articles")} dir="ltr" />
            </TabsContent>
            <TabsContent value="fa" className="mt-3">
              <NewsList articles={faArticles} loading={newsFa.loading} emptyText={tt("hub.news.noArticles", "No recent articles")} dir="rtl" />
            </TabsContent>
          </Tabs>
        </CardHeader>
      </Card>

      {/* — Telegram Latest — */}
      <Card className="border-border/60 bg-card/40 backdrop-blur-sm">
        <CardHeader className="gap-2 pb-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Send className="size-4 text-sky-500" />
              <CardTitle className="text-base">{tt("hub.news.telegramTitle", "Telegram Latest")}</CardTitle>
            </div>
            <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => onNavigate("news")}>
              {tt("hub.news.viewChannel", "View channel")}
              <ArrowRight className="size-3" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {telegram.loading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full rounded-lg" />
              ))}
            </div>
          ) : tgMessages.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">{tt("hub.news.noMessages", "No recent messages")}</p>
          ) : (
            <div className="space-y-2">
              {tgMessages.slice(0, 3).map((m) => (
                <a
                  key={m.id}
                  href={`https://t.me/${m.channel}/${m.id.replace(/^.*\//, "")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block rounded-lg border border-border/40 bg-muted/20 p-3 transition-colors hover:border-sky-500/30 hover:bg-sky-500/5"
                >
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1 text-xs font-semibold text-sky-500">
                      <MessageCircle className="size-3" />
                      @{m.channel}
                    </span>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                      {m.views && (
                        <span className="flex items-center gap-0.5">
                          <Eye className="size-3" />
                          {m.views}
                        </span>
                      )}
                      <span>{timeAgo(m.published_at)}</span>
                    </div>
                  </div>
                  <p className="line-clamp-2 text-sm text-foreground/90" dir="auto">{m.text || "—"}</p>
                </a>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/** Compact horizontal news list (5 items). */
function NewsList({
  articles,
  loading,
  emptyText,
  dir,
}: {
  articles: { title: string; url: string; source: string; published_at: string | null; image: string | null }[];
  loading: boolean;
  emptyText: string;
  dir: "ltr" | "rtl";
}) {
  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-lg" />
        ))}
      </div>
    );
  }
  if (articles.length === 0) {
    return <p className="py-4 text-center text-sm text-muted-foreground">{emptyText}</p>;
  }
  return (
    <ul className="space-y-1.5" dir={dir}>
      {articles.slice(0, 5).map((a, i) => (
        <li key={`${a.url}-${i}`}>
          <a
            href={a.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-center gap-3 rounded-lg p-1.5 transition-colors hover:bg-muted/40"
          >
            <ImgWithFallback
              src={a.image}
              alt=""
              className="size-10 shrink-0 rounded-md object-cover"
              fallbackIcon={<Newspaper className="size-4" />}
            />
            <div className="min-w-0 flex-1">
              <p className="line-clamp-1 text-sm font-medium leading-snug group-hover:text-foreground" dir="auto">{a.title}</p>
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <Badge variant="outline" className="h-4 px-1.5 text-[9px] font-medium">{a.source}</Badge>
                <span>{timeAgo(a.published_at)}</span>
              </div>
            </div>
          </a>
        </li>
      ))}
    </ul>
  );
}

/* ========================================================================== */
/*  SECTION 4 (Right) — System status column                                  */
/* ========================================================================== */

function SystemStatusColumn({
  scans,
  sources,
  market,
  cmc,
}: {
  scans: ApiState<ScanListItem[]>;
  sources: ApiState<SourcesStatus>;
  market: ApiState<MarketOverview>;
  cmc: ApiState<CmcGlobalMetricsResponse>;
}) {
  return (
    <div className="space-y-4">
      <FrameworkStatsCard scans={scans} sources={sources} cmc={cmc} />
      <CrossVerificationCard market={market} cmc={cmc} />
      <TopMoversCard market={market} />
    </div>
  );
}

/* ---------- Framework Stats ---------- */

function FrameworkStatsCard({
  scans,
  sources,
  cmc,
}: {
  scans: ApiState<ScanListItem[]>;
  sources: ApiState<SourcesStatus>;
  cmc: ApiState<CmcGlobalMetricsResponse>;
}) {
  const tt = useTt();

  const scanList = scans.data ?? [];
  const totalScans = scanList.length;
  const projectsAnalyzed = scanList.reduce((sum, s) => sum + (s.processed || 0), 0);
  const lastScan = scanList[0] ?? null;
  const cmcProActive = !!(cmc.data?.metrics); // metrics present ⇒ key configured

  const srcList: DataSourceInfo[] = sources.data?.sources ?? [];
  const srcLive = srcList.filter((s) => s.available).length;
  const srcTotal = srcList.length || (sources.data?.total_count ?? 0);

  return (
    <Card className="border-border/60 bg-card/40 backdrop-blur-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="size-4 text-emerald-500" />
          <CardTitle className="text-base">{tt("hub.status.frameworkStats", "Framework Stats")}</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        <div className="grid grid-cols-2 gap-3">
          <StatTile
            label={tt("hub.status.totalScans", "Total Scans")}
            value={scans.loading ? null : totalScans}
            loading={scans.loading}
            icon={<Radar className="size-3.5 text-emerald-500" />}
          />
          <StatTile
            label={tt("hub.status.projectsAnalyzed", "Projects Analyzed")}
            value={scans.loading ? null : projectsAnalyzed}
            loading={scans.loading}
            icon={<Crosshair className="size-3.5 text-amber-500" />}
          />
          <StatTile
            label={tt("hub.status.dataSources", "Data Sources Active")}
            value={sources.loading ? null : `${srcLive}/${srcTotal}`}
            loading={sources.loading}
            icon={<Activity className="size-3.5 text-sky-500" />}
          />
          <div className="flex flex-col gap-1 rounded-lg border border-border/40 bg-muted/20 p-3">
            <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <Gauge className="size-3.5 text-violet-500" />
              {tt("hub.status.cmcPro", "CMC Pro")}
            </span>
            <Badge
              variant="outline"
              className={cn(
                "w-fit",
                cmc.loading
                  ? "border-muted/40 bg-muted/20 text-muted-foreground"
                  : cmcProActive
                    ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                    : "border-muted/40 bg-muted/20 text-muted-foreground",
              )}
            >
              <span className={cn("size-1.5 rounded-full", cmc.loading ? "bg-muted-foreground" : cmcProActive ? "bg-emerald-500" : "bg-muted-foreground")} />
              {cmc.loading ? "…" : cmcProActive ? tt("hub.status.cmcProActive", "Active") : tt("hub.status.cmcProInactive", "Inactive")}
            </Badge>
          </div>
        </div>

        <Separator />

        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="text-muted-foreground">{tt("hub.status.lastScan", "Last Scan")}</span>
          {scans.loading ? (
            <Skeleton className="h-4 w-24" />
          ) : lastScan ? (
            <span className="font-medium tabular-nums">{timeAgo(lastScan.started_at)}</span>
          ) : (
            <span className="text-muted-foreground">{tt("hub.status.noScans", "No scans yet")}</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function StatTile({
  label,
  value,
  loading,
  icon,
}: {
  label: string;
  value: React.ReactNode;
  loading: boolean;
  icon: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border/40 bg-muted/20 p-3">
      <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </span>
      {loading ? (
        <Skeleton className="h-5 w-12" />
      ) : (
        <span className="text-lg font-bold tabular-nums">{value}</span>
      )}
    </div>
  );
}

/* ---------- Cross-Verification ---------- */

function CrossVerificationCard({
  market,
  cmc,
}: {
  market: ApiState<MarketOverview>;
  cmc: ApiState<CmcGlobalMetricsResponse>;
}) {
  const tt = useTt();

  // Hide entirely until we have CMC metrics (the whole point of the card).
  if (cmc.loading || market.loading) {
    return (
      <Card className="border-border/60 bg-card/40 backdrop-blur-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-teal-500" />
            <CardTitle className="text-base">{tt("hub.status.crossVerification", "Cross-Verification")}</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-2 pt-0">
          <Skeleton className="h-16 w-full rounded-lg" />
          <Skeleton className="h-16 w-full rounded-lg" />
        </CardContent>
      </Card>
    );
  }

  const cmcMetrics = cmc.data?.metrics ?? null;
  if (!cmcMetrics) return null;

  const cg = market.data?.global ?? null;
  const cgBtcDom = cg?.btc_dominance ?? null;
  const cgMcap = cg?.total_market_cap_usd ?? null;
  const cmcBtcDom = cmcMetrics.btc_dominance ?? null;
  const cmcMcap = cmcMetrics.total_market_cap_usd ?? null;

  const btcDiff = discrepancyPct(cgBtcDom, cmcBtcDom);
  const mcapDiff = discrepancyPct(cgMcap, cmcMcap);

  // When either source is missing (discrepancyPct returns null), we cannot
  // claim "Verified" — that would falsely assure the user. The old code used
  // `?? 1` fallback which treated missing data as "1% discrepancy" (just under
  // the OK thresholds of 1.5%/5%), rendering a green "Verified" badge even
  // though one source had not returned.
  // Now: if either diff is null → "Awaiting data" (partial) state.
  const isPartial = btcDiff == null || mcapDiff == null;
  const bothOk =
    !isPartial &&
    (btcDiff as number) <= 1.5 &&
    (mcapDiff as number) <= 5;

  return (
    <Card className="border-border/60 bg-card/40 backdrop-blur-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-teal-500" />
            <CardTitle className="text-base">{tt("hub.status.crossVerification", "Cross-Verification")}</CardTitle>
          </div>
          <Badge
            variant="outline"
            className={cn(
              bothOk
                ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                : isPartial
                  ? "border-slate-500/30 bg-slate-500/15 text-slate-600 dark:text-slate-400"
                  : "border-amber-500/30 bg-amber-500/15 text-amber-600 dark:text-amber-400",
            )}
          >
            {bothOk
              ? tt("hub.status.verified", "Verified")
              : isPartial
                ? tt("hub.status.awaiting", "Awaiting data")
                : tt("hub.status.discrepancy", "Discrepancy")}
          </Badge>
        </div>
        <CardDescription className="text-xs">
          {tt("hub.status.cgLabel", "CoinGecko")} ↔ {tt("hub.status.cmcLabel", "CMC")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 pt-0">
        <VerificationRow
          label={tt("hub.status.btcDom", "BTC Dominance")}
          a={cgBtcDom != null ? `${cgBtcDom.toFixed(2)}%` : "—"}
          b={cmcBtcDom != null ? `${cmcBtcDom.toFixed(2)}%` : "—"}
          diff={btcDiff}
        />
        <VerificationRow
          label={tt("hub.status.totalMcap", "Total Market Cap")}
          a={fmtUsd(cgMcap)}
          b={fmtUsd(cmcMcap)}
          diff={mcapDiff}
        />
      </CardContent>
    </Card>
  );
}

/** Relative discrepancy as a %, or null if either value is missing. */
function discrepancyPct(a: number | null, b: number | null): number | null {
  if (a == null || b == null || a === 0) return null;
  return Math.abs((a - b) / a) * 100;
}

function VerificationRow({
  label,
  a,
  b,
  diff,
}: {
  label: string;
  a: string;
  b: string;
  diff: number | null;
}) {
  const ok = (diff ?? 0) <= 5;
  return (
    <div className="rounded-lg border border-border/40 bg-muted/20 p-3">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        {diff != null && (
          <span className={cn("text-[10px] font-semibold tabular-nums", ok ? "text-emerald-500" : "text-amber-500")}>
            Δ {diff.toFixed(2)}%
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div className="flex flex-col">
          <span className="text-[9px] uppercase tracking-wider text-muted-foreground">CoinGecko</span>
          <span className="font-semibold tabular-nums">{a}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-[9px] uppercase tracking-wider text-muted-foreground">CMC</span>
          <span className="font-semibold tabular-nums">{b}</span>
        </div>
      </div>
    </div>
  );
}

/* ---------- Top Movers ---------- */

function TopMoversCard({ market }: { market: ApiState<MarketOverview> }) {
  const tt = useTt();

  const gainers: TopCoin[] = market.data?.gainers ?? [];
  const losers: TopCoin[] = market.data?.losers ?? [];

  if (market.loading) {
    return (
      <Card className="border-border/60 bg-card/40 backdrop-blur-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="size-4 text-emerald-500" />
            <CardTitle className="text-base">{tt("hub.status.topMovers", "Top Movers")}</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-2 pt-0">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full rounded-lg" />
          ))}
        </CardContent>
      </Card>
    );
  }

  // CoinGecko rate-limited → no gainers/losers. Hide gracefully.
  if (gainers.length === 0 && losers.length === 0) {
    return (
      <Card className="border-border/60 bg-card/40 backdrop-blur-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="size-4 text-emerald-500" />
            <CardTitle className="text-base">{tt("hub.status.topMovers", "Top Movers")}</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="py-3 text-center text-sm text-muted-foreground">{tt("hub.status.noMovers", "No mover data right now")}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/60 bg-card/40 backdrop-blur-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="size-4 text-emerald-500" />
          <CardTitle className="text-base">{tt("hub.status.topMovers", "Top Movers")}</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        {gainers.length > 0 && (
          <div>
            <span className="mb-1.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-500">
              <ArrowUpRight className="size-3" />
              {tt("hub.status.gainers", "Gainers")}
            </span>
            <MoverList coins={gainers} positive />
          </div>
        )}
        {losers.length > 0 && (
          <div>
            <span className="mb-1.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-rose-500">
              <ArrowDownRight className="size-3" />
              {tt("hub.status.losers", "Losers")}
            </span>
            <MoverList coins={losers} positive={false} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MoverList({ coins, positive }: { coins: TopCoin[]; positive: boolean }) {
  return (
    <ul className="space-y-1">
      {coins.slice(0, 3).map((c) => {
        const change = c.price_change_percentage_24h ?? null;
        return (
          <li key={c.id} className="flex items-center justify-between gap-2 rounded-md px-2 py-1 hover:bg-muted/30">
            <div className="flex min-w-0 items-center gap-2">
              <ImgWithFallback
                src={c.image}
                alt={c.name}
                className="size-5 shrink-0 rounded-full"
                fallbackIcon={<span className="text-[9px] font-bold">{c.symbol?.[0] ?? "?"}</span>}
              />
              <span className="truncate text-xs font-medium">{c.name}</span>
              <span className="text-[10px] uppercase text-muted-foreground">{c.symbol}</span>
            </div>
            <span className={cn("shrink-0 text-xs font-semibold tabular-nums", positive ? "text-emerald-500" : "text-rose-500")}>
              {fmtPct(change)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/* ========================================================================== */
/*  SECTION 5 — Data Sources Health Footer                                    */
/* ========================================================================== */

function DataSourcesFooter({ sources }: { sources: ApiState<SourcesStatus> }) {
  const tt = useTt();

  const srcList: DataSourceInfo[] = sources.data?.sources ?? [];
  const live = srcList.filter((s) => s.available).length;
  const total = srcList.length;
  const offline = total - live;

  return (
    <Card className="border-border/60 bg-card/40 backdrop-blur-sm">
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Activity className={cn("size-4", sources.loading ? "text-muted-foreground" : offline === 0 ? "text-emerald-500" : "text-amber-500")} />
          <span className="text-sm font-medium">{tt("hub.sources.title", "Data Sources")}</span>
          {sources.loading ? (
            <Skeleton className="h-5 w-32" />
          ) : (
            <Badge
              variant="outline"
              className={cn(
                offline === 0
                  ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                  : "border-amber-500/30 bg-amber-500/15 text-amber-600 dark:text-amber-400",
              )}
            >
              {offline === 0
                ? tt("hub.sources.allOperational", "All systems operational")
                : tt("hub.sources.sourcesOffline", "{count} source(s) offline", { count: offline })}
            </Badge>
          )}
        </div>

        {sources.loading ? (
          <div className="flex flex-wrap gap-1.5">
            {Array.from({ length: 14 }).map((_, i) => (
              <Skeleton key={i} className="size-2.5 rounded-full" />
            ))}
          </div>
        ) : (
          <TooltipProvider delayDuration={200}>
            <div className="flex flex-wrap items-center gap-1.5" role="list" aria-label={`${total} data sources`}>
              {srcList.map((s) => (
                <Tooltip key={s.name}>
                  <TooltipTrigger asChild>
                    <span
                      role="listitem"
                      className={cn(
                        "size-2.5 rounded-full transition-transform hover:scale-125",
                        s.available ? "bg-emerald-500" : "bg-muted-foreground/40",
                      )}
                      aria-label={`${s.name}: ${s.available ? "online" : "offline"}`}
                    />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">
                    <p className="font-semibold">{s.name}</p>
                    <p className={cn("text-[10px]", s.available ? "text-emerald-400" : "text-rose-400")}>
                      {s.available ? "● Online" : "● Offline"}
                    </p>
                    <p className="max-w-[200px] text-[10px] text-muted-foreground">{s.description}</p>
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>
          </TooltipProvider>
        )}

        {!sources.loading && total > 0 && (
          <span className="text-xs text-muted-foreground tabular-nums">
            {tt("hub.sources.total", "{count} sources", { count: total })}
          </span>
        )}
      </CardContent>
    </Card>
  );
}

/* ========================================================================== */
/*  MAIN — HubView                                                            */
/* ========================================================================== */

/**
 * The Hub landing page. Fetches 7 endpoints in parallel (each fully
 * independent — one failure never breaks the others) and composes the
 * 5 sections described at the top of this file.
 */
export function HubView({ onNavigate, onQuickScan }: HubViewProps) {
  const tt = useTt();

  // Each hook is independent: a failing endpoint sets only its own error.
  const market = useApi<MarketOverview>("/api/scanner/market/overview", { timeoutMs: 60_000 });
  const cmc = useApi<CmcGlobalMetricsResponse>("/api/scanner/cmc/global-metrics", { timeoutMs: 20_000 });
  const news = useApi<NewsResponse>("/api/scanner/news?limit=5", { timeoutMs: 30_000 });
  const newsFa = useApi<PersianNewsResponse>("/api/scanner/news/fa?limit=5", { timeoutMs: 30_000 });
  const telegram = useApi<TelegramResponse>("/api/scanner/telegram?channel=Mastersharkcrypto&limit=3", { timeoutMs: 20_000 });
  const scans = useApi<ScanListItem[]>("/api/scanner/scans", { timeoutMs: 15_000 });
  const sources = useApi<SourcesStatus>("/api/scanner/sources", { timeoutMs: 15_000 });

  const scanCount = scans.data?.length ?? null;

  return (
    <div className="space-y-5">
      {/* Page heading */}
      <header className="space-y-1">
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{tt("hub.title", "Crypto Discovery Hub")}</h1>
        <p className="text-sm text-muted-foreground">{tt("hub.subtitle", "Your command center for crypto market intelligence")}</p>
      </header>

      {/* 1. Hero Banner */}
      <HeroBanner market={market} cmc={cmc} />

      {/* 2. Quick Actions Grid */}
      <QuickActionsGrid onNavigate={onNavigate} onQuickScan={onQuickScan} scanCount={scanCount} scanLoading={scans.loading} />

      {/* 3. Market Snapshot Strip */}
      <SnapshotStrip market={market} />

      {/* 4. Two-Column Layout */}
      <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        <NewsAndTelegramColumn news={news} newsFa={newsFa} telegram={telegram} onNavigate={onNavigate} />
        <SystemStatusColumn scans={scans} sources={sources} market={market} cmc={cmc} />
      </div>

      {/* 5. Data Sources Health Footer */}
      <DataSourcesFooter sources={sources} />
    </div>
  );
}

export default HubView;
