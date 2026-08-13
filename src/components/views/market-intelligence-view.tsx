"use client";

/* -------------------------------------------------------------------------- *
 *  MarketIntelligenceView  ·  Task 3-b
 *  ---------------------------------------------------------------------------
 *  A standalone React component that replaces the need to visit CoinMarketCap
 *  + DeFiLlama. Fetches `/api/scanner/market/overview` on mount and renders:
 *
 *    1. Global market banner   — 6 stat cards (mcap, 24h %, BTC dom, ETH dom,
 *                                 volume, active coins / markets)
 *    2. Fear & Greed gauge     — horizontal 0-100 gradient gauge with marker
 *    3. DeFi TVL total         — large headline number
 *    4. Tabbed data tables     — Top Coins / Gainers / Losers / Trending /
 *                                 Top DeFi / Top Fees / Sectors
 *    5. Refresh button         — manual re-fetch + spinning icon
 *    6. Cache age indicator    — "Updated Xs ago", auto-updating every 10s
 *
 *  Every coin row in Top Coins / Gainers / Losers / Trending is clickable →
 *  calls `onAnalyzeCoin(geckoId, coinName)` to switch to the Coin Explorer.
 *
 *  Conventions:
 *    - shadcn/ui (New York) — Card, Button, Tabs, Table, Badge, Tooltip,
 *      Skeleton, Alert.
 *    - Tailwind 4 — emerald/teal for positive, rose for negative, amber for
 *      neutral, sky for info (NO indigo / blue primaries).
 *    - lucide-react icons.
 *    - useLanguage() for i18n; translation keys live under `market.*`.
 * ------------------------------------------------------------------------- */

import * as React from "react";
import {
  Activity,
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Boxes,
  Building2,
  Coins,
  DollarSign,
  ExternalLink,
  Eye,
  Flame,
  Gauge,
  Gift,
  Globe,
  KeyRound,
  Layers,
  RefreshCw,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import type {
  CmcAirdropsResponse,
  CmcCategoriesResponse,
  CmcAirdrop,
  CmcCategory,
  FearGreedData,
  GlobalMarketData,
  MarketOverview,
  SectorBreakdown,
  TopCoin,
  TopDefiProtocol,
  TopFeeProtocol,
  TrendingCoin,
} from "@/lib/scanner-types";

/* -------------------------------------------------------------------------- */
/*  Props                                                                     */
/* -------------------------------------------------------------------------- */

export interface MarketIntelligenceViewProps {
  /** Called when user clicks a coin row to analyze it in the Coin Explorer. */
  onAnalyzeCoin?: (geckoId: string, coinName: string) => void;
}

/* -------------------------------------------------------------------------- */
/*  Number formatting helpers                                                 */
/* -------------------------------------------------------------------------- */

/** `$1.27T` · `$1.2B` · `$340M` · `$12K` · `$0.034` · `—` for null. */
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

/** Like fmtUsd but tuned for token prices (more decimals for sub-$1 tokens). */
function fmtPrice(v: number | null | undefined): string {
  if (v == null || typeof v !== "number" || isNaN(v)) return "—";
  const abs = Math.abs(v);
  if (abs >= 1e3) return `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  if (abs >= 1) return `$${v.toFixed(2)}`;
  if (abs >= 0.01) return `$${v.toFixed(4)}`;
  if (abs > 0) return `$${v.toExponential(3)}`;
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

/* -------------------------------------------------------------------------- */
/*  Fear & Greed helpers                                                      */
/* -------------------------------------------------------------------------- */

interface FgTier {
  labelKey: string; // i18n key (empty if no label / not translatable)
  label: string; // English fallback
  color: string; // hex
  badge: string; // tailwind classes
}

function fearGreedTier(value: number | null | undefined): FgTier {
  if (value == null || isNaN(value)) {
    return {
      labelKey: "",
      label: "—",
      color: "#71717a",
      badge: "bg-muted/40 text-muted-foreground border-muted/60",
    };
  }
  if (value <= 24)
    return {
      labelKey: "market.fearGreedExtremeFear",
      label: "Extreme Fear",
      color: "#f43f5e",
      badge: "bg-rose-500/15 text-rose-400 border-rose-500/30",
    };
  if (value <= 44)
    return {
      labelKey: "market.fearGreedFear",
      label: "Fear",
      color: "#f97316",
      badge: "bg-orange-500/15 text-orange-400 border-orange-500/30",
    };
  if (value <= 55)
    return {
      labelKey: "market.fearGreedNeutral",
      label: "Neutral",
      color: "#f59e0b",
      badge: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    };
  if (value <= 74)
    return {
      labelKey: "market.fearGreedGreed",
      label: "Greed",
      color: "#84cc16",
      badge: "bg-lime-500/15 text-lime-400 border-lime-500/30",
    };
  return {
    labelKey: "market.fearGreedExtremeGreed",
    label: "Extreme Greed",
    color: "#10b981",
    badge: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  };
}

/** Translate-with-fallback helper, reusable by any sub-component. */
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
/*  Hooks                                                                     */
/* -------------------------------------------------------------------------- */

function useMarketOverview() {
  const [data, setData] = React.useState<MarketOverview | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async (isRefresh: boolean) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 60_000);
      const res = await fetch("/api/scanner/market/overview", {
        signal: ctrl.signal,
        cache: "no-store",
      });
      clearTimeout(t);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const json: MarketOverview = await res.json();
      setData(json);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (err instanceof DOMException && err.name === "AbortError") {
        setError("Request timed out after 60s.");
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  React.useEffect(() => {
    load(false);
  }, [load]);

  return { data, loading, refreshing, error, refresh: () => load(true) };
}

/** Returns the age in seconds of the cached_at timestamp, re-ticking every 10s. */
function useCacheAge(cachedAt: string | null | undefined): number | null {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(id);
  }, []);
  if (!cachedAt) return null;
  const t = Date.parse(cachedAt);
  if (isNaN(t)) return null;
  return Math.max(0, Math.floor((now - t) / 1000));
}

function formatAge(secs: number | null): string {
  if (secs == null) return "";
  if (secs < 60) return `${secs}s ago`;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  if (m < 60) return `${m}m ${s}s ago`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m ago`;
}

/* -------------------------------------------------------------------------- */
/*  Sub-components — Stat card                                                */
/* -------------------------------------------------------------------------- */

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  accent?: "emerald" | "rose" | "amber" | "sky" | "teal" | "violet" | "default";
  loading?: boolean;
}

const STAT_ACCENT: Record<NonNullable<StatCardProps["accent"]>, string> = {
  emerald: "text-emerald-500 bg-emerald-500/10",
  rose: "text-rose-500 bg-rose-500/10",
  amber: "text-amber-500 bg-amber-500/10",
  sky: "text-sky-500 bg-sky-500/10",
  teal: "text-teal-500 bg-teal-500/10",
  violet: "text-violet-500 bg-violet-500/10",
  default: "text-foreground bg-muted/40",
};

function StatCard({ icon, label, value, sub, accent = "default", loading }: StatCardProps) {
  if (loading) {
    return (
      <Card className="border-border/60 bg-card/40 backdrop-blur-sm p-4 gap-3">
        <Skeleton className="h-8 w-8 rounded-md" />
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-3 w-20" />
      </Card>
    );
  }
  return (
    <Card className="border-border/60 bg-card/40 backdrop-blur-sm p-4 gap-3 hover:border-border/90 transition-colors">
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
          {label}
        </span>
        <span className={`flex size-7 items-center justify-center rounded-md ${STAT_ACCENT[accent]}`}>
          {icon}
        </span>
      </div>
      <div className="text-xl font-bold tabular-nums leading-none">{value}</div>
      {sub != null && <div className="text-xs text-muted-foreground">{sub}</div>}
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/*  Sub-component — Fear & Greed gauge                                        */
/* -------------------------------------------------------------------------- */

function FearGreedGauge({ fg }: { fg: FearGreedData | null }) {
  const tt = useTt();
  const value = fg?.value ?? null;
  const tier = fearGreedTier(value);
  const pct = value != null && !isNaN(value) ? Math.max(0, Math.min(100, value)) : 0;
  const markerLeft = `${pct}%`;

  return (
    <Card className="border-border/60 bg-card/40 backdrop-blur-sm p-5 gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Gauge className="size-4 text-amber-500" />
          <span className="text-sm font-semibold" dir="auto">
            {tt("market.fearGreed", "Fear & Greed")}
          </span>
        </div>
        {value != null && (
          <Badge variant="outline" className={tier.badge} dir="auto">
            {tier.labelKey ? tt(tier.labelKey, tier.label) : tier.label}
          </Badge>
        )}
      </div>

      {value == null ? (
        <div className="flex h-20 items-center justify-center text-sm text-muted-foreground">
          {tt("common.noData", "No data")}
        </div>
      ) : (
        <>
          {/* Big number */}
          <div className="flex items-baseline gap-2">
            <span
              className="text-4xl font-bold tabular-nums leading-none"
              style={{ color: tier.color }}
            >
              {value}
            </span>
            <span className="text-xs text-muted-foreground" dir="auto">
              {tt("market.fearGreedOf100", "/ 100")}
            </span>
          </div>

          {/* Gradient gauge bar */}
          <div className="relative pt-1">
            <div
              className="h-3 w-full rounded-full"
              style={{
                background:
                  "linear-gradient(90deg, #f43f5e 0%, #f97316 25%, #f59e0b 50%, #84cc16 75%, #10b981 100%)",
              }}
            />
            {/* Marker */}
            <div
              className="absolute top-0 -translate-x-1/2"
              style={{ left: markerLeft }}
            >
              <div
                className="size-5 rounded-full border-2 border-background shadow-md"
                style={{ backgroundColor: tier.color }}
              />
              <div
                className="mx-auto mt-0.5 h-1.5 w-0.5"
                style={{ backgroundColor: tier.color }}
              />
            </div>
            {/* Tick labels */}
            <div className="mt-3 flex justify-between text-[10px] text-muted-foreground" dir="auto">
              <span>{tt("market.fearGreedExtremeFear", "Extreme Fear")}</span>
              <span>{tt("market.fearGreedNeutral", "Neutral")}</span>
              <span>{tt("market.fearGreedExtremeGreed", "Extreme Greed")}</span>
            </div>
          </div>
        </>
      )}
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/*  Sub-component — DeFi TVL panel                                            */
/* -------------------------------------------------------------------------- */

function DefiTvlPanel({
  total,
  protocolCount,
}: {
  total: number | null;
  protocolCount: number | null;
}) {
  const tt = useTt();
  return (
    <Card className="border-border/60 bg-card/40 backdrop-blur-sm p-5 gap-4">
      <div className="flex items-center gap-2">
        <Layers className="size-4 text-teal-500" />
        <span className="text-sm font-semibold" dir="auto">
          {tt("market.totalDefiTvl", "Total DeFi TVL")}
        </span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-bold tabular-nums text-teal-400 leading-none">
          {fmtUsd(total)}
        </span>
      </div>
      <div className="text-xs text-muted-foreground" dir="auto">
        {tt("market.acrossProtocols", "across {n} protocols", { n: fmtNum(protocolCount) })}
      </div>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/*  Sub-component — Coin row (Top Coins / Gainers / Losers)                   */
/* -------------------------------------------------------------------------- */

interface CoinRowProps {
  coin: TopCoin;
  onAnalyze?: (geckoId: string, name: string) => void;
}

function CoinRow({ coin, onAnalyze }: CoinRowProps) {
  const tt = useTt();
  const change24h = coin.price_change_percentage_24h_in_currency;
  const change7d = coin.price_change_percentage_7d_in_currency;
  const change30d = coin.price_change_percentage_30d_in_currency;
  const clickable = !!onAnalyze;

  const handleAnalyze = React.useCallback(() => {
    onAnalyze?.(coin.id, coin.name);
  }, [onAnalyze, coin.id, coin.name]);

  return (
    <TableRow
      className={`text-xs ${clickable ? "cursor-pointer hover:bg-muted/30" : ""}`}
      onClick={clickable ? handleAnalyze : undefined}
    >
      <TableCell className="text-right text-muted-foreground tabular-nums">
        {coin.market_cap_rank ?? "—"}
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          {coin.image ? (
            <img
              src={coin.image}
              alt={`${coin.name} logo`}
              loading="lazy"
              className="size-5 rounded-full"
            />
          ) : (
            <div className="size-5 rounded-full bg-muted/40" />
          )}
          <div className="flex flex-col">
            <span className="font-medium text-foreground" dir="auto">{coin.name}</span>
            <span className="text-[10px] uppercase text-muted-foreground">{coin.symbol}</span>
          </div>
        </div>
      </TableCell>
      <TableCell className="text-right tabular-nums font-medium">
        {fmtPrice(coin.current_price)}
      </TableCell>
      <TableCell className="text-right tabular-nums">{fmtUsd(coin.market_cap)}</TableCell>
      <TableCell className="text-right tabular-nums text-muted-foreground">
        {fmtUsd(coin.total_volume)}
      </TableCell>
      <TableCell className={`text-right tabular-nums font-medium ${pctColor(change24h)}`}>
        {change24h != null ? (
          <span className="inline-flex items-center gap-0.5 justify-end">
            {change24h >= 0 ? (
              <ArrowUpRight className="size-3" />
            ) : (
              <ArrowDownRight className="size-3" />
            )}
            {fmtPct(change24h)}
          </span>
        ) : (
          "—"
        )}
      </TableCell>
      <TableCell className={`text-right tabular-nums ${pctColor(change7d)}`}>
        {fmtPct(change7d)}
      </TableCell>
      <TableCell className={`text-right tabular-nums ${pctColor(change30d)}`}>
        {fmtPct(change30d)}
      </TableCell>
      {clickable && (
        <TableCell className="text-right">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                onClick={(e) => {
                  e.stopPropagation();
                  handleAnalyze();
                }}
              >
                <Eye className="size-3.5" />
                {tt("market.analyze", "Analyze")}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{tt("market.runAnalysis", "Run framework analysis")}</TooltipContent>
          </Tooltip>
        </TableCell>
      )}
    </TableRow>
  );
}

/* -------------------------------------------------------------------------- */
/*  Sub-component — Trending row                                              */
/* -------------------------------------------------------------------------- */

interface TrendingRowProps {
  coin: TrendingCoin;
  index: number;
  onAnalyze?: (geckoId: string, name: string) => void;
}

function TrendingRow({ coin, index, onAnalyze }: TrendingRowProps) {
  const tt = useTt();
  const clickable = !!onAnalyze;
  const handleAnalyze = React.useCallback(() => {
    onAnalyze?.(coin.id, coin.name);
  }, [onAnalyze, coin.id, coin.name]);

  return (
    <TableRow
      className={`text-xs ${clickable ? "cursor-pointer hover:bg-muted/30" : ""}`}
      onClick={clickable ? handleAnalyze : undefined}
    >
      <TableCell className="text-right text-muted-foreground tabular-nums">
        {index + 1}
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          {coin.thumb || coin.small ? (
            <img
              src={coin.thumb ?? coin.small ?? ""}
              alt={`${coin.name} logo`}
              loading="lazy"
              className="size-5 rounded-full"
            />
          ) : (
            <div className="size-5 rounded-full bg-muted/40" />
          )}
          <div className="flex flex-col">
            <span className="font-medium text-foreground" dir="auto">{coin.name}</span>
            <span className="text-[10px] uppercase text-muted-foreground">{coin.symbol}</span>
          </div>
        </div>
      </TableCell>
      <TableCell className="text-right tabular-nums text-muted-foreground">
        {coin.market_cap_rank != null ? `#${coin.market_cap_rank}` : "—"}
      </TableCell>
      <TableCell className="text-right tabular-nums text-muted-foreground">
        {coin.price_btc != null ? `${coin.price_btc.toExponential(3)} ₿` : "—"}
      </TableCell>
      {clickable && (
        <TableCell className="text-right">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                onClick={(e) => {
                  e.stopPropagation();
                  handleAnalyze();
                }}
              >
                <Eye className="size-3.5" />
                {tt("market.analyze", "Analyze")}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{tt("market.runAnalysis", "Run framework analysis")}</TooltipContent>
          </Tooltip>
        </TableCell>
      )}
    </TableRow>
  );
}

/* -------------------------------------------------------------------------- */
/*  Sub-component — DeFi protocol row                                         */
/* -------------------------------------------------------------------------- */

function DefiRow({ p }: { p: TopDefiProtocol }) {
  const tt = useTt();
  return (
    <TableRow className="text-xs hover:bg-muted/30">
      <TableCell>
        <div className="flex items-center gap-2">
          {p.logo ? (
            <img
              src={p.logo}
              alt={`${p.name} logo`}
              loading="lazy"
              className="size-5 rounded-full"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.visibility = "hidden";
              }}
            />
          ) : (
            <div className="flex size-5 items-center justify-center rounded-full bg-muted/40 text-[9px] font-semibold uppercase">
              {p.symbol?.slice(0, 2) || "?"}
            </div>
          )}
          <div className="flex flex-col">
            <span className="font-medium text-foreground" dir="auto">{p.name}</span>
            <span className="text-[10px] uppercase text-muted-foreground">{p.symbol}</span>
          </div>
        </div>
      </TableCell>
      <TableCell className="text-right tabular-nums font-medium text-teal-400">
        {fmtUsd(p.tvl)}
      </TableCell>
      <TableCell>
        {p.chain ? (
          <Badge variant="outline" className="border-border/60 bg-muted/30 text-[10px] font-normal" dir="auto">
            {p.chain.length > 14 ? `${p.chain.slice(0, 13)}…` : p.chain}
          </Badge>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell>
        {p.category ? (
          <Badge variant="outline" className="border-sky-500/30 bg-sky-500/10 text-sky-400 text-[10px] font-normal" dir="auto">
            {p.category.length > 22 ? `${p.category.slice(0, 21)}…` : p.category}
          </Badge>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="text-right">
        {p.url ? (
          <a
            href={p.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/40 hover:text-foreground"
            aria-label={tt("market.visitWebsiteAria", "Visit {name} website", { name: p.name })}
          >
            <ExternalLink className="size-3.5" />
          </a>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
    </TableRow>
  );
}

/* -------------------------------------------------------------------------- */
/*  Sub-component — Fee protocol row                                          */
/* -------------------------------------------------------------------------- */

function FeeRow({ p }: { p: TopFeeProtocol }) {
  return (
    <TableRow className="text-xs hover:bg-muted/30">
      <TableCell>
        <div className="flex flex-col">
          <span className="font-medium text-foreground" dir="auto">{p.name}</span>
          <span className="text-[10px] uppercase text-muted-foreground">{p.symbol}</span>
        </div>
      </TableCell>
      <TableCell className="text-right tabular-nums font-medium">
        {fmtUsd(p.fees_24h)}
      </TableCell>
      <TableCell className="text-right tabular-nums text-emerald-400">
        {fmtUsd(p.revenue_24h)}
      </TableCell>
      <TableCell className="text-right tabular-nums text-muted-foreground">
        {fmtUsd(p.fees_30d)}
      </TableCell>
      <TableCell>
        {p.category ? (
          <Badge variant="outline" className="border-sky-500/30 bg-sky-500/10 text-sky-400 text-[10px] font-normal" dir="auto">
            {p.category.length > 22 ? `${p.category.slice(0, 21)}…` : p.category}
          </Badge>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
    </TableRow>
  );
}

/* -------------------------------------------------------------------------- */
/*  Sub-component — Sectors bar chart                                         */
/* -------------------------------------------------------------------------- */

const SECTOR_COLORS = [
  "#10b981", // emerald
  "#14b8a6", // teal
  "#0ea5e9", // sky
  "#f59e0b", // amber
  "#8b5cf6", // violet
  "#f43f5e", // rose
  "#84cc16", // lime
  "#f97316", // orange
  "#06b6d4", // cyan
  "#ec4899", // pink
];

function SectorsChart({ sectors }: { sectors: SectorBreakdown[] }) {
  const tt = useTt();
  const sorted = React.useMemo(
    () => [...sectors].sort((a, b) => (b.total_market_cap || 0) - (a.total_market_cap || 0)),
    [sectors],
  );
  const total = React.useMemo(
    () => sorted.reduce((sum, s) => sum + (s.total_market_cap || 0), 0),
    [sorted],
  );
  const [hovered, setHovered] = React.useState<number | null>(null);

  if (sorted.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
        {tt("market.noSectorData", "No sector data")}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Proportional stacked bar */}
      <div className="flex h-6 w-full overflow-hidden rounded-md border border-border/40">
        {sorted.map((s, i) => {
          const v = s.total_market_cap || 0;
          const w = total > 0 ? (v / total) * 100 : 0;
          if (w <= 0) return null;
          return (
            <Tooltip key={s.sector}>
              <TooltipTrigger asChild>
                <div
                  className="h-full transition-all"
                  style={{
                    width: `${w}%`,
                    backgroundColor: SECTOR_COLORS[i % SECTOR_COLORS.length],
                    opacity: hovered == null || hovered === i ? 1 : 0.35,
                  }}
                  onMouseEnter={() => setHovered(i)}
                  onMouseLeave={() => setHovered(null)}
                />
              </TooltipTrigger>
              <TooltipContent>
                <div className="text-xs" dir="auto">
                  <div className="font-medium">{s.sector}</div>
                  <div className="text-muted-foreground">{fmtUsd(v)} · {((v / total) * 100).toFixed(1)}%</div>
                </div>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>

      {/* Per-sector horizontal bars */}
      <div className="space-y-2">
        {sorted.map((s, i) => {
          const v = s.total_market_cap || 0;
          const w = total > 0 ? (v / total) * 100 : 0;
          const color = SECTOR_COLORS[i % SECTOR_COLORS.length];
          return (
            <div
              key={s.sector}
              className="grid grid-cols-[minmax(120px,1fr)_2fr_auto] items-center gap-3 text-xs"
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
            >
              <div className="flex items-center gap-2 truncate">
                <span
                  className="size-2.5 shrink-0 rounded-sm"
                  style={{ backgroundColor: color }}
                />
                <span className="truncate text-foreground" dir="auto">{s.sector}</span>
              </div>
              <div className="relative h-2.5 overflow-hidden rounded-full bg-muted/40">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${w}%`,
                    backgroundColor: color,
                    opacity: hovered == null || hovered === i ? 1 : 0.45,
                  }}
                />
              </div>
              <div className="flex items-center gap-2 tabular-nums" dir="auto">
                <span className="font-medium text-foreground">{fmtUsd(v)}</span>
                <span className="text-muted-foreground text-[10px]">
                  · {s.count} {tt("market.coinsLabel", "coins")} · {w.toFixed(1)}%
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Sub-component — Coin table wrapper                                        */
/* -------------------------------------------------------------------------- */

interface CoinTableProps {
  coins: TopCoin[];
  onAnalyze?: (geckoId: string, name: string) => void;
  emptyHint?: string;
}

function CoinTable({ coins, onAnalyze, emptyHint }: CoinTableProps) {
  const tt = useTt();
  if (coins.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
        {emptyHint ?? tt("market.noCoins", "No coins")}
      </div>
    );
  }
  return (
    <div className="max-h-[640px] overflow-auto rounded-md border border-border/40">
      <Table>
        <TableHeader className="sticky top-0 z-10 bg-muted/90 backdrop-blur-sm">
          <TableRow className="border-border/40 hover:bg-transparent">
            <TableHead className="w-12 text-right text-[11px] uppercase tracking-wider text-muted-foreground" dir="auto">{tt("market.rank", "#")}</TableHead>
            <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground" dir="auto">{tt("market.coin", "Coin")}</TableHead>
            <TableHead className="text-right text-[11px] uppercase tracking-wider text-muted-foreground" dir="auto">{tt("market.price", "Price")}</TableHead>
            <TableHead className="text-right text-[11px] uppercase tracking-wider text-muted-foreground" dir="auto">{tt("market.mktCap", "Mkt Cap")}</TableHead>
            <TableHead className="text-right text-[11px] uppercase tracking-wider text-muted-foreground" dir="auto">{tt("market.volume", "Volume")}</TableHead>
            <TableHead className="text-right text-[11px] uppercase tracking-wider text-muted-foreground" dir="auto">{tt("market.col24h", "24h")}</TableHead>
            <TableHead className="text-right text-[11px] uppercase tracking-wider text-muted-foreground" dir="auto">{tt("market.col7d", "7d")}</TableHead>
            <TableHead className="text-right text-[11px] uppercase tracking-wider text-muted-foreground" dir="auto">{tt("market.col30d", "30d")}</TableHead>
            {onAnalyze && <TableHead className="w-20 text-right text-[11px] uppercase tracking-wider text-muted-foreground" dir="auto">{tt("market.colAction", "Action")}</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {coins.map((c) => (
            <CoinRow key={`${c.id}-${c.market_cap_rank ?? c.name}`} coin={c} onAnalyze={onAnalyze} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Sub-component — Trending table                                            */
/* -------------------------------------------------------------------------- */

function TrendingTable({
  coins,
  onAnalyze,
}: {
  coins: TrendingCoin[];
  onAnalyze?: (geckoId: string, name: string) => void;
}) {
  const tt = useTt();
  if (coins.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
        {tt("market.noTrendingCoins", "No trending coins")}
      </div>
    );
  }
  return (
    <div className="max-h-[640px] overflow-auto rounded-md border border-border/40">
      <Table>
        <TableHeader className="sticky top-0 z-10 bg-muted/90 backdrop-blur-sm">
          <TableRow className="border-border/40 hover:bg-transparent">
            <TableHead className="w-12 text-right text-[11px] uppercase tracking-wider text-muted-foreground" dir="auto">{tt("market.colRank", "Rank")}</TableHead>
            <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground" dir="auto">{tt("market.coin", "Coin")}</TableHead>
            <TableHead className="text-right text-[11px] uppercase tracking-wider text-muted-foreground" dir="auto">{tt("market.colMktCapRank", "Mkt Cap Rank")}</TableHead>
            <TableHead className="text-right text-[11px] uppercase tracking-wider text-muted-foreground" dir="auto">{tt("market.colPriceBtc", "Price (BTC)")}</TableHead>
            {onAnalyze && <TableHead className="w-20 text-right text-[11px] uppercase tracking-wider text-muted-foreground" dir="auto">{tt("market.colAction", "Action")}</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {coins.map((c, i) => (
            <TrendingRow key={`${c.id}-${i}`} coin={c} index={i} onAnalyze={onAnalyze} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Sub-component — DeFi / Fees tables                                        */
/* -------------------------------------------------------------------------- */

function DefiTable({ protocols }: { protocols: TopDefiProtocol[] }) {
  const tt = useTt();
  if (protocols.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
        {tt("market.noDefiProtocols", "No DeFi protocols")}
      </div>
    );
  }
  return (
    <div className="max-h-[640px] overflow-auto rounded-md border border-border/40">
      <Table>
        <TableHeader className="sticky top-0 z-10 bg-muted/90 backdrop-blur-sm">
          <TableRow className="border-border/40 hover:bg-transparent">
            <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground" dir="auto">{tt("market.protocol", "Protocol")}</TableHead>
            <TableHead className="text-right text-[11px] uppercase tracking-wider text-muted-foreground" dir="auto">{tt("market.tvl", "TVL")}</TableHead>
            <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground" dir="auto">{tt("market.chain", "Chain")}</TableHead>
            <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground" dir="auto">{tt("market.category", "Category")}</TableHead>
            <TableHead className="w-12 text-right text-[11px] uppercase tracking-wider text-muted-foreground" dir="auto">{tt("market.link", "Link")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {protocols.map((p, i) => (
            <DefiRow key={`${p.slug ?? p.name}-${i}`} p={p} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function FeesTable({ protocols }: { protocols: TopFeeProtocol[] }) {
  const tt = useTt();
  if (protocols.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
        {tt("market.noFeeData", "No fee data")}
      </div>
    );
  }
  return (
    <div className="max-h-[640px] overflow-auto rounded-md border border-border/40">
      <Table>
        <TableHeader className="sticky top-0 z-10 bg-muted/90 backdrop-blur-sm">
          <TableRow className="border-border/40 hover:bg-transparent">
            <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground" dir="auto">{tt("market.protocol", "Protocol")}</TableHead>
            <TableHead className="text-right text-[11px] uppercase tracking-wider text-muted-foreground" dir="auto">{tt("market.fees24h", "24h Fees")}</TableHead>
            <TableHead className="text-right text-[11px] uppercase tracking-wider text-muted-foreground" dir="auto">{tt("market.revenue24h", "24h Revenue")}</TableHead>
            <TableHead className="text-right text-[11px] uppercase tracking-wider text-muted-foreground" dir="auto">{tt("market.fees30d", "30d Fees")}</TableHead>
            <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground" dir="auto">{tt("market.category", "Category")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {protocols.map((p, i) => (
            <FeeRow key={`${p.id ?? p.slug ?? p.name}-${i}`} p={p} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Sub-component — Loading skeleton                                          */
/* -------------------------------------------------------------------------- */

function LoadingView() {
  return (
    <div className="space-y-5">
      {/* Stats grid skeleton */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i} className="border-border/60 bg-card/40 backdrop-blur-sm p-4 gap-3">
            <Skeleton className="h-7 w-7 rounded-md" />
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-3 w-16" />
          </Card>
        ))}
      </div>
      {/* Gauge + TVL skeleton */}
      <div className="grid gap-3 md:grid-cols-2">
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-40 rounded-xl" />
      </div>
      {/* Tabs skeleton */}
      <Skeleton className="h-9 w-full max-w-2xl rounded-lg" />
      <Card className="border-border/60 bg-card/40 backdrop-blur-sm p-0">
        <Skeleton className="h-10 w-full rounded-t-xl" />
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-none" />
        ))}
      </Card>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Sub-component — Error state                                               */
/* -------------------------------------------------------------------------- */

function ErrorView({ message, onRetry }: { message: string; onRetry: () => void }) {
  const tt = useTt();
  return (
    <Alert variant="destructive" className="border-rose-500/40 bg-rose-500/5">
      <AlertCircle className="size-4" />
      <AlertTitle dir="auto">{tt("market.errorTitle", "Failed to load market data")}</AlertTitle>
      <AlertDescription>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-xs" dir="auto">{message}</span>
          <Button size="sm" variant="outline" onClick={onRetry} className="w-fit">
            <RefreshCw className="size-3.5" />
            {tt("market.retry", "Retry")}
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}

/* -------------------------------------------------------------------------- */
/*  CMC Pro exclusive — Airdrops & Categories (require API key)               */
/* -------------------------------------------------------------------------- */

/** Upgrade card shown when CMC Pro API key is not configured. */
function CmcProRequired({ title, description }: { title: string; description: string }) {
  const tt = useTt();
  return (
    <Card className="border-amber-500/30 bg-amber-500/5">
      <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-amber-500/15 text-amber-500">
          <KeyRound className="size-6" />
        </div>
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-foreground" dir="auto">{title}</h3>
          <p className="mx-auto max-w-md text-xs text-muted-foreground" dir="auto">{description}</p>
        </div>
        <div className="rounded-md border border-amber-500/20 bg-amber-500/10 px-3 py-1.5 text-[11px] text-amber-600 dark:text-amber-400" dir="auto">
          {tt("market.setCmcKey", "Set {env} env var to unlock this data", { env: "CMC_API_KEY" })}
        </div>
      </CardContent>
    </Card>
  );
}

/** Airdrops table — CMC Pro exclusive. */
function AirdropsTable({ airdrops }: { airdrops: CmcAirdrop[] }) {
  const tt = useTt();
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="text-xs" dir="auto">{tt("market.colProject", "Project")}</TableHead>
            <TableHead className="text-xs" dir="auto">{tt("market.colStatus", "Status")}</TableHead>
            <TableHead className="text-right text-xs" dir="auto">{tt("market.colValue", "Total Value")}</TableHead>
            <TableHead className="text-right text-xs" dir="auto">{tt("market.colParticipants", "Participants")}</TableHead>
            <TableHead className="text-xs" dir="auto">{tt("market.colStart", "Start")}</TableHead>
            <TableHead className="text-xs" dir="auto">{tt("market.colEnd", "End")}</TableHead>
            <TableHead className="text-xs" dir="auto">{tt("market.colLink", "Link")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {airdrops.map((a) => (
            <TableRow key={a.id} className="text-xs">
              <TableCell className="font-medium">
                <div className="flex items-center gap-2">
                  {a.logo && (
                    <img src={a.logo} alt={a.name} className="size-5 rounded-full" loading="lazy" />
                  )}
                  <div className="flex flex-col">
                    <span>{a.name}</span>
                    {a.symbol && <span className="text-[10px] text-muted-foreground">{a.symbol}</span>}
                  </div>
                </div>
              </TableCell>
              <TableCell>
                <Badge
                  variant="outline"
                  className={
                    a.status === "ONGOING"
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-500"
                      : a.status === "UPCOMING"
                        ? "border-sky-500/30 bg-sky-500/10 text-sky-500"
                        : "border-muted text-muted-foreground"
                  }
                >
                  {a.status}
                </Badge>
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {a.total_value_usd != null ? `$${(a.total_value_usd / 1000).toFixed(1)}K` : "—"}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {a.participants != null ? a.participants.toLocaleString() : "—"}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {a.start_date ? new Date(a.start_date).toLocaleDateString("en", { month: "short", day: "numeric" }) : "—"}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {a.end_date ? new Date(a.end_date).toLocaleDateString("en", { month: "short", day: "numeric" }) : "—"}
              </TableCell>
              <TableCell>
                {a.website && (
                  <a href={a.website} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground">
                    <ExternalLink className="size-3.5" />
                  </a>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/** Categories table — CMC Pro exclusive. */
function CategoriesTable({ categories }: { categories: CmcCategory[] }) {
  const tt = useTt();
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="text-xs" dir="auto">{tt("market.category", "Category")}</TableHead>
            <TableHead className="text-right text-xs" dir="auto">{tt("market.colTokens", "Tokens")}</TableHead>
            <TableHead className="text-right text-xs" dir="auto">{tt("market.colMarketCap", "Market Cap")}</TableHead>
            <TableHead className="text-right text-xs" dir="auto">{tt("market.col24h", "24h %")}</TableHead>
            <TableHead className="text-right text-xs" dir="auto">{tt("market.colVolume24h", "Volume 24h")}</TableHead>
            <TableHead className="text-xs" dir="auto">{tt("market.colTopCoins", "Top Coins")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {categories.map((c) => (
            <TableRow key={c.id} className="text-xs">
              <TableCell className="font-medium" dir="auto">{c.name}</TableCell>
              <TableCell className="text-right tabular-nums text-muted-foreground">{c.num_tokens}</TableCell>
              <TableCell className="text-right tabular-nums">
                {c.market_cap != null ? `$${(c.market_cap / 1e9).toFixed(2)}B` : "—"}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {c.market_cap_change_24h != null ? (
                  <span className={c.market_cap_change_24h >= 0 ? "text-emerald-500" : "text-rose-500"}>
                    {c.market_cap_change_24h >= 0 ? "+" : ""}{c.market_cap_change_24h.toFixed(2)}%
                  </span>
                ) : "—"}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {c.volume_24h != null ? `$${(c.volume_24h / 1e6).toFixed(1)}M` : "—"}
              </TableCell>
              <TableCell className="text-muted-foreground">
                <span className="truncate">{c.top_coins.join(", ") || "—"}</span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Main component                                                            */
/* -------------------------------------------------------------------------- */

export function MarketIntelligenceView({ onAnalyzeCoin }: MarketIntelligenceViewProps) {
  const { t } = useLanguage();
  const { data, loading, refreshing, error, refresh } = useMarketOverview();
  const cacheAge = useCacheAge(data?.cached_at);

  /* ----- CMC Pro exclusive data (airdrops + categories) — lazy-loaded on tab click ----- */
  const [airdropsData, setAirdropsData] = React.useState<CmcAirdropsResponse | null>(null);
  const [airdropsLoading, setAirdropsLoading] = React.useState(false);
  const [airdropsFetched, setAirdropsFetched] = React.useState(false);
  const [categoriesData, setCategoriesData] = React.useState<CmcCategoriesResponse | null>(null);
  const [categoriesLoading, setCategoriesLoading] = React.useState(false);
  const [categoriesFetched, setCategoriesFetched] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState("top");

  const fetchAirdrops = React.useCallback(async () => {
    setAirdropsLoading(true);
    try {
      const res = await fetch("/api/scanner/cmc/airdrops?limit=50&status=ONGOING");
      if (res.ok) setAirdropsData(await res.json());
    } catch {
      /* non-critical */
    } finally {
      setAirdropsLoading(false);
      setAirdropsFetched(true);
    }
  }, []);

  const fetchCategories = React.useCallback(async () => {
    setCategoriesLoading(true);
    try {
      const res = await fetch("/api/scanner/cmc/categories");
      if (res.ok) setCategoriesData(await res.json());
    } catch {
      /* non-critical */
    } finally {
      setCategoriesLoading(false);
      setCategoriesFetched(true);
    }
  }, []);

  // Lazy-load CMC Pro data when the user first clicks the Airdrops or Categories tab
  React.useEffect(() => {
    if (activeTab === "airdrops" && !airdropsFetched) fetchAirdrops();
    if (activeTab === "categories" && !categoriesFetched) fetchCategories();
  }, [activeTab, airdropsFetched, categoriesFetched, fetchAirdrops, fetchCategories]);

  /* Translation helper with English fallback — `t()` returns the key itself
     when the translation is missing, so we fall back to the provided English
     string in that case (translations will be added later under `market.*`). */
  const tt = React.useCallback(
    (key: string, fallback: string, vars?: Record<string, string | number>): string => {
      const v = t(key, vars);
      return typeof v === "string" && v !== key ? v : fallback;
    },
    [t],
  );

  const g: GlobalMarketData | null = data?.global ?? null;
  const mcapChange = g?.market_cap_change_percentage_24h_usd ?? null;

  /* Tab counts */
  const counts = React.useMemo(
    () => ({
      top: data?.top_coins?.length ?? 0,
      gainers: data?.gainers?.length ?? 0,
      losers: data?.losers?.length ?? 0,
      trending: data?.trending?.length ?? 0,
      defi: data?.top_defi?.length ?? 0,
      fees: data?.top_fees?.length ?? 0,
      sectors: data?.sectors?.length ?? 0,
    }),
    [data],
  );

  return (
    <TooltipProvider>
      <div className="space-y-5">
        {/* ---------- Header ---------- */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-teal-500/10 text-teal-500">
              <Globe className="size-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold leading-tight">
                {tt("market.title", "Market Intelligence")}
              </h2>
              <p className="text-xs text-muted-foreground">
                {tt("market.subtitle", "CoinMarketCap + DeFiLlama, unified.")}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {cacheAge != null && (
              <span className="text-[11px] text-muted-foreground tabular-nums" dir="auto">
                {tt("market.updated", "Updated")} {formatAge(cacheAge)}
              </span>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={refresh}
                  disabled={refreshing}
                  className="gap-2"
                >
                  <RefreshCw className={`size-3.5 ${refreshing ? "animate-spin" : ""}`} />
                  {refreshing ? tt("market.refreshing", "Refreshing…") : tt("market.refresh", "Refresh")}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{tt("market.forceRefresh", "Force re-fetch from upstream")}</TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* ---------- Error ---------- */}
        {error && !loading && <ErrorView message={error} onRetry={refresh} />}

        {/* ---------- Loading skeleton ---------- */}
        {loading && <LoadingView />}

        {/* ---------- Main content ---------- */}
        {!loading && !error && data && (
          <>
            {/* ---------- Global market banner ---------- */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <StatCard
                icon={<DollarSign className="size-4" />}
                label={tt("market.totalMarketCap", "TOTAL MARKET CAP")}
                value={fmtUsd(g?.total_market_cap_usd ?? null)}
                accent="teal"
                sub={
                  <span className={pctColor(mcapChange)} dir="auto">
                    {fmtPct(mcapChange)} (24h)
                  </span>
                }
              />
              <StatCard
                icon={mcapChange != null && mcapChange >= 0 ? <TrendingUp className="size-4" /> : <TrendingDown className="size-4" />}
                label={tt("market.change24h", "24H CHANGE")}
                value={
                  <span className={pctColor(mcapChange)}>{fmtPct(mcapChange)}</span>
                }
                accent={mcapChange != null && mcapChange >= 0 ? "emerald" : "rose"}
                sub={tt("market.marketCapDelta", "Market cap Δ")}
              />
              <StatCard
                icon={<Coins className="size-4" />}
                label={tt("market.btcDominance", "BTC DOMINANCE")}
                value={
                  g?.btc_dominance != null
                    ? `${g.btc_dominance.toFixed(2)}%`
                    : "—"
                }
                accent="amber"
                sub={
                  g?.eth_dominance != null
                    ? `ETH ${g.eth_dominance.toFixed(2)}%`
                    : undefined
                }
              />
              <StatCard
                icon={<Activity className="size-4" />}
                label={tt("market.volume24h", "24H VOLUME")}
                value={fmtUsd(g?.total_volume_usd ?? null)}
                accent="sky"
                sub={tt("market.totalSpotVolume", "Total spot volume")}
              />
              <StatCard
                icon={<Boxes className="size-4" />}
                label={tt("market.activeCoins", "ACTIVE COINS")}
                value={fmtNum(g?.active_cryptocurrencies ?? null)}
                accent="violet"
                sub={`${fmtNum(data.coin_count)} ${tt("market.tracked", "tracked")}`}
              />
              <StatCard
                icon={<Building2 className="size-4" />}
                label={tt("market.markets", "MARKETS")}
                value={fmtNum(g?.markets ?? null)}
                accent="default"
                sub={`${fmtNum(data.defi_protocol_count)} ${tt("market.defiProtocols", "DeFi protocols")}`}
              />
            </div>

            {/* ---------- Fear & Greed + DeFi TVL ---------- */}
            <div className="grid gap-3 md:grid-cols-2">
              <FearGreedGauge fg={data.fear_greed} />
              <DefiTvlPanel
                total={data.defi_tvl_total}
                protocolCount={data.defi_protocol_count}
              />
            </div>

            {/* ---------- Tabbed tables ---------- */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="gap-3">
              <TabsList className="flex h-auto w-full flex-wrap gap-1 bg-muted/60 p-1 sm:w-fit">
                <TabsTrigger value="top" className="gap-1.5 text-xs">
                  <BarChart3 className="size-3.5" />
                  <span dir="auto">{tt("market.topCoins", "Top Coins")}</span>
                  <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">{counts.top}</Badge>
                </TabsTrigger>
                <TabsTrigger value="gainers" className="gap-1.5 text-xs">
                  <TrendingUp className="size-3.5 text-emerald-500" />
                  <span dir="auto">{tt("market.gainers", "Gainers")}</span>
                  <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">{counts.gainers}</Badge>
                </TabsTrigger>
                <TabsTrigger value="losers" className="gap-1.5 text-xs">
                  <TrendingDown className="size-3.5 text-rose-500" />
                  <span dir="auto">{tt("market.losers", "Losers")}</span>
                  <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">{counts.losers}</Badge>
                </TabsTrigger>
                <TabsTrigger value="trending" className="gap-1.5 text-xs">
                  <Flame className="size-3.5 text-orange-500" />
                  <span dir="auto">{tt("market.trending", "Trending")}</span>
                  <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">{counts.trending}</Badge>
                </TabsTrigger>
                <TabsTrigger value="defi" className="gap-1.5 text-xs">
                  <Layers className="size-3.5 text-teal-500" />
                  <span dir="auto">{tt("market.topDefi", "Top DeFi")}</span>
                  <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">{counts.defi}</Badge>
                </TabsTrigger>
                <TabsTrigger value="fees" className="gap-1.5 text-xs">
                  <Wallet className="size-3.5 text-amber-500" />
                  <span dir="auto">{tt("market.topFees", "Top Fees")}</span>
                  <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">{counts.fees}</Badge>
                </TabsTrigger>
                <TabsTrigger value="sectors" className="gap-1.5 text-xs">
                  <Sparkles className="size-3.5 text-violet-500" />
                  <span dir="auto">{tt("market.sectors", "Sectors")}</span>
                  <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">{counts.sectors}</Badge>
                </TabsTrigger>
                {/* CMC Pro exclusive tabs — marked with key icon */}
                <TabsTrigger value="airdrops" className="gap-1.5 text-xs">
                  <Gift className="size-3.5 text-amber-500" />
                  <span dir="auto">{tt("market.airdrops", "Airdrops")}</span>
                  <Badge variant="outline" className="ml-1 h-4 gap-0.5 border-amber-500/30 px-1 text-[9px] text-amber-500">
                    <KeyRound className="size-2.5" />{tt("market.pro", "PRO")}
                  </Badge>
                </TabsTrigger>
                <TabsTrigger value="categories" className="gap-1.5 text-xs">
                  <Boxes className="size-3.5 text-cyan-500" />
                  <span dir="auto">{tt("market.categories", "Categories")}</span>
                  <Badge variant="outline" className="ml-1 h-4 gap-0.5 border-amber-500/30 px-1 text-[9px] text-amber-500">
                    <KeyRound className="size-2.5" />{tt("market.pro", "PRO")}
                  </Badge>
                </TabsTrigger>
              </TabsList>

              {/* Top Coins */}
              <TabsContent value="top">
                <Card className="border-border/60 bg-card/40 backdrop-blur-sm p-0">
                  <CardHeader className="px-4 py-3">
                    <CardTitle className="text-sm" dir="auto">
                      {tt("market.topCoinsTitle", "Top {n} Coins by Market Cap", { n: counts.top })}
                    </CardTitle>
                    <CardDescription className="text-xs" dir="auto">
                      {tt("market.clickToAnalyze", "Click any row to run the framework analysis in the Coin Explorer.")}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="px-4 pb-4">
                    <CoinTable coins={data.top_coins} onAnalyze={onAnalyzeCoin} />
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Gainers */}
              <TabsContent value="gainers">
                <Card className="border-border/60 bg-card/40 backdrop-blur-sm p-0">
                  <CardHeader className="px-4 py-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <TrendingUp className="size-4 text-emerald-500" />
                      <span dir="auto">{tt("market.gainersTitle", "Top {n} Gainers (24h)", { n: counts.gainers })}</span>
                    </CardTitle>
                    <CardDescription className="text-xs" dir="auto">
                      {tt("market.gainersDescLong", "Biggest 24h price increases across tracked coins.")}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="px-4 pb-4">
                    <CoinTable coins={data.gainers} onAnalyze={onAnalyzeCoin} />
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Losers */}
              <TabsContent value="losers">
                <Card className="border-border/60 bg-card/40 backdrop-blur-sm p-0">
                  <CardHeader className="px-4 py-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <TrendingDown className="size-4 text-rose-500" />
                      <span dir="auto">{tt("market.losersTitle", "Top {n} Losers (24h)", { n: counts.losers })}</span>
                    </CardTitle>
                    <CardDescription className="text-xs" dir="auto">
                      {tt("market.losersDescLong", "Biggest 24h price decreases across tracked coins.")}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="px-4 pb-4">
                    <CoinTable coins={data.losers} onAnalyze={onAnalyzeCoin} />
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Trending */}
              <TabsContent value="trending">
                <Card className="border-border/60 bg-card/40 backdrop-blur-sm p-0">
                  <CardHeader className="px-4 py-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Flame className="size-4 text-orange-500" />
                      <span dir="auto">{tt("market.trendingTitle", "Top {n} Trending Searches", { n: counts.trending })}</span>
                    </CardTitle>
                    <CardDescription className="text-xs" dir="auto">
                      {tt("market.trendingDescLong", "Most-searched coins on CoinGecko in the last 24h.")}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="px-4 pb-4">
                    <TrendingTable coins={data.trending} onAnalyze={onAnalyzeCoin} />
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Top DeFi */}
              <TabsContent value="defi">
                <Card className="border-border/60 bg-card/40 backdrop-blur-sm p-0">
                  <CardHeader className="px-4 py-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Layers className="size-4 text-teal-500" />
                      <span dir="auto">{tt("market.topDefiTitle", "Top {n} DeFi Protocols by TVL", { n: counts.defi })}</span>
                    </CardTitle>
                    <CardDescription className="text-xs" dir="auto">
                      {tt("market.topDefiDescLong", "Live TVL across chains — DeFiLlama's headline table.")}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="px-4 pb-4">
                    <DefiTable protocols={data.top_defi} />
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Top Fees */}
              <TabsContent value="fees">
                <Card className="border-border/60 bg-card/40 backdrop-blur-sm p-0">
                  <CardHeader className="px-4 py-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Wallet className="size-4 text-amber-500" />
                      <span dir="auto">{tt("market.topFeesTitle", "Top {n} Fee Generators", { n: counts.fees })}</span>
                    </CardTitle>
                    <CardDescription className="text-xs" dir="auto">
                      {tt("market.topFeesDescLong", "Protocols ranked by 24h fees & revenue — DeFiLlama fees.")}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="px-4 pb-4">
                    <FeesTable protocols={data.top_fees} />
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Sectors */}
              <TabsContent value="sectors">
                <Card className="border-border/60 bg-card/40 backdrop-blur-sm p-0">
                  <CardHeader className="px-4 py-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Sparkles className="size-4 text-violet-500" />
                      <span dir="auto">{tt("market.sectorsTitle", "Sector Breakdown ({n})", { n: counts.sectors })}</span>
                    </CardTitle>
                    <CardDescription className="text-xs" dir="auto">
                      {tt("market.sectorsDescLong", "Market cap distribution across crypto sectors.")}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="px-4 pb-4">
                    <SectorsChart sectors={data.sectors} />
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Airdrops — CMC Pro exclusive */}
              <TabsContent value="airdrops">
                <Card className="border-border/60 bg-card/40 backdrop-blur-sm p-0">
                  <CardHeader className="px-4 py-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Gift className="size-4 text-amber-500" />
                      <span dir="auto">{tt("market.cryptoAirdrops", "Crypto Airdrops")}</span>
                      <Badge variant="outline" className="gap-0.5 border-amber-500/30 text-[10px] text-amber-500">
                        <KeyRound className="size-3" />{tt("market.cmcPro", "CMC PRO")}
                      </Badge>
                    </CardTitle>
                    <CardDescription className="text-xs" dir="auto">
                      {tt("market.airdropsDesc", "Active airdrops — total value, participants, requirements. Exclusive to CoinMarketCap Pro API.")}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="px-4 pb-4">
                    {airdropsLoading && <Skeleton className="h-64 w-full" />}
                    {!airdropsLoading && airdropsData?.cmc_pro_required && (
                      <CmcProRequired
                        title={tt("market.airdropsRequireCmcPro", "Airdrops require CMC Pro API key")}
                        description={tt("market.airdropsRequireCmcProDesc", "Airdrop data (total value, participants, requirements, dates) is exclusively available through the CoinMarketCap Pro API — no free source provides this structured data.")}
                      />
                    )}
                    {!airdropsLoading && airdropsData?.plan_not_supported && (
                      <CmcProRequired
                        title={tt("market.airdropsNotAvailablePlan", "Airdrops not available on your CMC plan")}
                        description={tt("market.airdropsNotAvailablePlanDesc", "Your CoinMarketCap API key is active but its subscription plan doesn't include the airdrops endpoint. Upgrade to a higher tier (Professional or above) to unlock airdrop data.")}
                      />
                    )}
                    {!airdropsLoading && airdropsData && !airdropsData.cmc_pro_required && !airdropsData.plan_not_supported && (
                      <>
                        <p className="mb-3 text-xs text-muted-foreground" dir="auto">
                          {tt("market.showingAirdrops", "Showing {count} ongoing airdrops", { count: airdropsData.count })}
                        </p>
                        <AirdropsTable airdrops={airdropsData.airdrops} />
                      </>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Categories — CMC Pro exclusive */}
              <TabsContent value="categories">
                <Card className="border-border/60 bg-card/40 backdrop-blur-sm p-0">
                  <CardHeader className="px-4 py-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Boxes className="size-4 text-cyan-500" />
                      <span dir="auto">{tt("market.cmcCategories", "CMC Categories")}</span>
                      <Badge variant="outline" className="gap-0.5 border-amber-500/30 text-[10px] text-amber-500">
                        <KeyRound className="size-3" />{tt("market.cmcPro", "CMC PRO")}
                      </Badge>
                    </CardTitle>
                    <CardDescription className="text-xs" dir="auto">
                      {tt("market.categoriesDescLong", "Market cap & volume by CoinMarketCap category — richer than inferred sectors, with 24h/7d changes.")}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="px-4 pb-4">
                    {categoriesLoading && <Skeleton className="h-64 w-full" />}
                    {!categoriesLoading && categoriesData?.cmc_pro_required && (
                      <CmcProRequired
                        title={tt("market.categoriesRequireCmcPro", "Categories require CMC Pro API key")}
                        description={tt("market.categoriesRequireCmcProDesc", "CoinMarketCap's category taxonomy includes per-category market cap, 24h/7d changes, volume, and top 3 coins — data not available from free sources.")}
                      />
                    )}
                    {!categoriesLoading && categoriesData && !categoriesData.cmc_pro_required && (
                      <>
                        <p className="mb-3 text-xs text-muted-foreground" dir="auto">
                          {tt("market.showingCategories", "Showing {count} categories", { count: categoriesData.count })}
                        </p>
                        <CategoriesTable categories={categoriesData.categories} />
                      </>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>
    </TooltipProvider>
  );
}

export default MarketIntelligenceView;
