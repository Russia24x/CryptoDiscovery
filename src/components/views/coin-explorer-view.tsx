"use client";

/* ========================================================================== */
/*  Coin Explorer View                                                        */
/*  ------------------------------------------------------------------------  */
/*  Standalone React component that lets the user search for any crypto-      */
/*  currency, pick a persona, and run the full 8-phase framework analysis on  */
/*  that single coin.                                                         */
/*                                                                            */
/*  Endpoints (already built & verified — do NOT modify backend):             */
/*    GET  /api/scanner/search?q=<query>   → CoinSearchResult[]               */
/*    POST /api/scanner/analyze            → FullReport                       */
/*                                                                            */
/*  Props:                                                                    */
/*    initialGeckoId?: string | null                                          */
/*        When set on mount, auto-selects that coin (performs a search using  */
/*        the gecko_id as the query and picks the exact id match if found).   */
/*    onClearInitial?: () => void                                             */
/*        Called once after the initial coin has been consumed.               */
/*    onReport?: (report: FullReport) => void                                 */
/*        Passes the completed report up to the parent (e.g. to open it in    */
/*        an existing report Sheet).                                          */
/* ========================================================================== */

import * as React from "react";
import {
  Search,
  Loader2,
  Zap,
  Target,
  Globe,
  Twitter,
  Github,
  AlertCircle,
  RotateCcw,
  X,
  Sparkles,
  Crosshair,
  Brain,
  TrendingUp,
  ShieldAlert,
  Quote,
  ArrowUpRight,
  Frown,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { ScoreRadial } from "@/components/dashboard/score-radial";
import type { FullReport, CoinSearchResult, Persona } from "@/lib/scanner-types";

// --------------------------------------------------------------------------- //
//  Props
// --------------------------------------------------------------------------- //

export interface CoinExplorerViewProps {
  initialGeckoId?: string | null;
  onClearInitial?: () => void;
  onReport?: (report: FullReport) => void;
}

// --------------------------------------------------------------------------- //
//  Static data — persona catalog & loading phase messages
// --------------------------------------------------------------------------- //

const PERSONAS: { value: Persona; label: string; desc: string }[] = [
  { value: "investor", label: "Investor", desc: "Revenue & valuation focus" },
  { value: "institutional", label: "Institutional", desc: "Risk, legal & moat focus" },
  { value: "researcher", label: "Researcher", desc: "Tech & architecture focus" },
  { value: "developer", label: "Developer", desc: "Integration & DX focus" },
  { value: "trader", label: "Trader", desc: "Momentum & catalysts focus" },
  { value: "comprehensive", label: "Comprehensive", desc: "Balanced across all axes" },
];

const ANALYZE_PHASE_MESSAGES: { key: string; fallback: string }[] = [
  { key: "explorer.phaseMessage1", fallback: "Collecting evidence from CoinGecko, DeFiLlama & CoinMarketCap…" },
  { key: "explorer.phaseMessage2", fallback: "Screening candidate against persona criteria…" },
  { key: "explorer.phaseMessage3", fallback: "Cross-verifying TVL, market cap & fees across sources…" },
  { key: "explorer.phaseMessage4", fallback: "Evaluating the 5 fundamental axes…" },
  { key: "explorer.phaseMessage5", fallback: "Computing valuation multiples (P/R, P/F, P/T)…" },
  { key: "explorer.phaseMessage6", fallback: "Running veto & severe-risk checks…" },
  { key: "explorer.phaseMessage7", fallback: "Synthesizing final thesis & decision…" },
  { key: "explorer.phaseMessage8", fallback: "Formatting report…" },
];

// --------------------------------------------------------------------------- //
//  Number / colour helpers (local — kept self-contained)
// --------------------------------------------------------------------------- //

/** Format a USD amount using K/M/B/T suffixes. e.g. $1.2B, $340M, $0.034 */
function fmtUsd(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  if (abs >= 1) return `$${n.toFixed(2)}`;
  return `$${n.toFixed(4)}`;
}

/** Format a percentage. Optionally prefix '+' on positive values. */
function fmtPct(n: number | null | undefined, withSign = false): string {
  if (n == null || Number.isNaN(n)) return "—";
  const sign = withSign && n > 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}%`;
}

/** Tailwind text colour class for a 0–100 score. */
function scoreTextClass(score: number): string {
  if (score >= 70) return "text-emerald-400";
  if (score >= 55) return "text-lime-400";
  if (score >= 50) return "text-amber-400";
  if (score >= 40) return "text-orange-400";
  return "text-rose-400";
}

/** Tailwind bg/border classes for the action label badge (mirrors page.tsx). */
function actionBadgeClass(actionLabel: string): string {
  const a = (actionLabel || "").toLowerCase();
  if (a.includes("high conviction")) return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
  if (a.includes("core")) return "bg-lime-500/15 text-lime-400 border-lime-500/30";
  if (a.includes("small")) return "bg-amber-500/15 text-amber-400 border-amber-500/30";
  if (a.includes("deep research") || a.includes("research")) return "bg-sky-500/15 text-sky-400 border-sky-500/30";
  if (a.includes("watch")) return "bg-slate-500/15 text-slate-300 border-slate-500/30";
  return "bg-rose-500/15 text-rose-400 border-rose-500/30";
}

/** Inline hex colour for an axis bar (0–10 scale → 0–100 normalised). */
function axisBarColor(score: number): string {
  const ratio = score / 10;
  if (ratio >= 0.85) return "#10b981"; // emerald
  if (ratio >= 0.70) return "#84cc16"; // lime
  if (ratio >= 0.55) return "#f59e0b"; // amber
  if (ratio >= 0.40) return "#f97316"; // orange
  return "#f43f5e"; // rose
}

// --------------------------------------------------------------------------- //
//  Component
// --------------------------------------------------------------------------- //

export function CoinExplorerView({
  initialGeckoId,
  onClearInitial,
  onReport,
}: CoinExplorerViewProps) {
  const { t, lang } = useLanguage();

  // Translate-with-fallback: returns `fallback` if the i18n key is missing.
  // The LanguageProvider returns the raw key path when no translation is
  // found, so we detect that case and substitute the English fallback.
  const tf = React.useCallback(
    (key: string, fallback: string, vars?: Record<string, string | number>): string => {
      const val = t(key, vars);
      if (typeof val !== "string") return fallback;
      return val === key ? fallback : val;
    },
    [t],
  );

  // ----- search state -----
  const [query, setQuery] = React.useState("");
  const [debouncedQuery, setDebouncedQuery] = React.useState("");
  const [results, setResults] = React.useState<CoinSearchResult[]>([]);
  const [searching, setSearching] = React.useState(false);
  const [showResults, setShowResults] = React.useState(false);
  const [searchError, setSearchError] = React.useState<string | null>(null);
  const searchInputRef = React.useRef<HTMLInputElement | null>(null);
  const resultsContainerRef = React.useRef<HTMLDivElement | null>(null);

  // ----- selection / persona / analysis state -----
  const [selected, setSelected] = React.useState<CoinSearchResult | null>(null);
  const [persona, setPersona] = React.useState<Persona>("investor");
  const [analyzing, setAnalyzing] = React.useState(false);
  const [phaseIdx, setPhaseIdx] = React.useState(0);
  const [report, setReport] = React.useState<FullReport | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const initialConsumedRef = React.useRef(false);
  const onClearInitialRef = React.useRef(onClearInitial);
  const analyzeAbortRef = React.useRef<AbortController | null>(null);

  // ----------------------------------------------------------------------- //
  //  Debounced search query (300 ms)
  // ----------------------------------------------------------------------- //
  React.useEffect(() => {
    const handle = window.setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => window.clearTimeout(handle);
  }, [query]);

  // ----------------------------------------------------------------------- //
  //  Trigger search whenever debounced query changes
  // ----------------------------------------------------------------------- //
  React.useEffect(() => {
    const q = debouncedQuery;
    if (q.length < 1) {
      setResults([]);
      setSearching(false);
      setSearchError(null);
      return;
    }
    let cancelled = false;
    setSearching(true);
    setSearchError(null);

    (async () => {
      try {
        const res = await fetch(`/api/scanner/search?q=${encodeURIComponent(q)}`, {
          method: "GET",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as {
          results?: CoinSearchResult[];
          error?: string;
        };
        if (cancelled) return;
        setResults(Array.isArray(data.results) ? data.results : []);
      } catch (e) {
        if (cancelled) return;
        setSearchError(e instanceof Error ? e.message : tf("explorer.searchFailed", "Search failed"));
        setResults([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [debouncedQuery]);

  // ----------------------------------------------------------------------- //
  //  Cycle the loading phase message while analysis is in flight
  // ----------------------------------------------------------------------- //
  React.useEffect(() => {
    if (!analyzing) return;
    setPhaseIdx(0);
    const id = window.setInterval(() => {
      setPhaseIdx((i) => (i + 1) % ANALYZE_PHASE_MESSAGES.length);
    }, 2200);
    return () => window.clearInterval(id);
  }, [analyzing]);

  // ----------------------------------------------------------------------- //
  //  Auto-select a coin when initialGeckoId is provided
  // ----------------------------------------------------------------------- //
  // Reset the consumed flag whenever initialGeckoId changes, so deep-linking
  // works repeatedly (e.g. user clicks coin A in Market Intelligence, goes
  // back, clicks coin B). The old code set initialConsumedRef=true and never
  // reset it, so only the FIRST coin ever auto-selected.
  React.useEffect(() => {
    initialConsumedRef.current = false;
  }, [initialGeckoId]);

  React.useEffect(() => {
    if (initialConsumedRef.current) return;
    if (!initialGeckoId) return;
    initialConsumedRef.current = true;

    let cancelled = false;
    const geckoId = initialGeckoId;
    // Capture onClearInitial in a ref so it doesn't cause effect re-runs.
    // The old code had onClearInitial in the dep array, which meant any
    // parent passing an inline arrow (new function ref each render) would
    // tear down and restart the effect, killing the in-flight fetch.
    onClearInitialRef.current = onClearInitial;

    (async () => {
      try {
        // Search using the gecko_id as the query — CoinGecko's search returns
        // the exact-match coin at the top of the list in the vast majority of
        // cases (e.g. "bitcoin" → "Bitcoin" #1).
        const res = await fetch(
          `/api/scanner/search?q=${encodeURIComponent(geckoId)}`,
          { method: "GET" },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { results?: CoinSearchResult[] };
        if (cancelled) return;
        const list = Array.isArray(data.results) ? data.results : [];
        const match =
          list.find((r) => r.id === geckoId) || list[0] || null;
        if (match) {
          setSelected(match);
        } else {
          // Fallback: synthesise a minimal CoinSearchResult so the persona
          // panel can still be shown.
          setSelected({
            id: geckoId,
            name: geckoId,
            symbol: geckoId.toUpperCase().slice(0, 6),
            market_cap_rank: null,
            thumb: null,
            large: null,
            api_symbol: geckoId,
          });
        }
      } catch {
        if (cancelled) return;
        // Last-resort fallback so the user can still trigger an analysis.
        setSelected({
          id: geckoId,
          name: geckoId,
          symbol: geckoId.toUpperCase().slice(0, 6),
          market_cap_rank: null,
          thumb: null,
          large: null,
          api_symbol: geckoId,
        });
      } finally {
        if (!cancelled && onClearInitialRef.current) onClearInitialRef.current();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [initialGeckoId]);

  // ----------------------------------------------------------------------- //
  //  Close search results dropdown on outside click / Escape
  // ----------------------------------------------------------------------- //
  React.useEffect(() => {
    if (!showResults) return;
    const onPointerDown = (e: MouseEvent) => {
      if (
        resultsContainerRef.current &&
        !resultsContainerRef.current.contains(e.target as Node)
      ) {
        setShowResults(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowResults(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [showResults]);

  // ----------------------------------------------------------------------- //
  //  Cleanup: abort any in-flight analysis on unmount
  // ----------------------------------------------------------------------- //
  React.useEffect(() => {
    return () => {
      analyzeAbortRef.current?.abort();
    };
  }, []);

  // ----------------------------------------------------------------------- //
  //  Handlers
  // ----------------------------------------------------------------------- //

  const handleSelectCoin = React.useCallback((coin: CoinSearchResult) => {
    setSelected(coin);
    setShowResults(false);
    setQuery("");
    setResults([]);
    setReport(null);
    setError(null);
    searchInputRef.current?.blur();
  }, []);

  const handleClearCoin = React.useCallback(() => {
    setSelected(null);
    setReport(null);
    setError(null);
    setPersona("investor");
    analyzeAbortRef.current?.abort();
    setAnalyzing(false);
  }, []);

  const runAnalyze = React.useCallback(async () => {
    if (!selected) return;
    // Abort any previous in-flight request.
    analyzeAbortRef.current?.abort();
    const ctrl = new AbortController();
    analyzeAbortRef.current = ctrl;

    setAnalyzing(true);
    setError(null);
    setReport(null);

    try {
      const res = await fetch("/api/scanner/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gecko_id: selected.id,
          persona,
          lang,
        }),
        signal: ctrl.signal,
      });

      if (!res.ok) {
        let detail = `HTTP ${res.status}`;
        try {
          const data = await res.json();
          if (data?.error) detail = data.error;
          if (data?.detail) detail = `${detail} — ${data.detail}`;
        } catch {
          /* ignore JSON parse failure */
        }
        throw new Error(detail);
      }

      const data = (await res.json()) as FullReport | { error?: string };
      if (data && typeof data === "object" && "error" in data && data.error) {
        throw new Error(data.error);
      }
      setReport(data as FullReport);
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return; // user cancelled
      setError(e instanceof Error ? e.message : tf("explorer.errorTitle", "Analysis failed"));
    } finally {
      if (analyzeAbortRef.current === ctrl) {
        analyzeAbortRef.current = null;
        setAnalyzing(false);
      }
    }
  }, [selected, persona, lang]);

  const handleViewFullReport = React.useCallback(() => {
    if (report && onReport) onReport(report);
  }, [report, onReport]);

  // ----------------------------------------------------------------------- //
  //  Render
  // ----------------------------------------------------------------------- //

  return (
    <div className="flex flex-col gap-6 w-full">
      {/* ----------------------------------------------------------------- */}
      {/*  Search bar (always visible at the top)                            */}
      {/* ----------------------------------------------------------------- */}
      <Card className="border-border/60 bg-card/40 backdrop-blur-sm shadow-lg shadow-black/20">
        <CardContent className="pt-0">
          <div className="relative" ref={resultsContainerRef}>
            <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-input/30 px-3 py-2 transition-all focus-within:border-emerald-500/50 focus-within:ring-2 focus-within:ring-emerald-500/20">
              <Search className="size-5 text-muted-foreground shrink-0" />
              <input
                ref={searchInputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => setShowResults(true)}
                placeholder={
                  tf("explorer.searchPlaceholder", "Search any coin by name or symbol…")
                }
                className="flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground text-foreground"
                aria-label={tf("explorer.searchAria", "Search cryptocurrencies")}
                autoComplete="off"
                spellCheck={false}
              />
              {searching && (
                <Loader2 className="size-4 animate-spin text-muted-foreground shrink-0" />
              )}
              {!searching && query && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    setResults([]);
                    searchInputRef.current?.focus();
                  }}
                  className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                  aria-label={tf("explorer.clearSearch", "Clear search")}
                >
                  <X className="size-4" />
                </button>
              )}
            </div>

            {/* Search results dropdown */}
            {showResults && debouncedQuery && (
              <div className="absolute left-0 right-0 top-full z-30 mt-2">
                <Card className="border-border/60 bg-popover/95 backdrop-blur-md shadow-2xl shadow-black/40 overflow-hidden">
                  <CardContent className="p-0">
                    {searchError && (
                      <div className="p-3 text-sm text-rose-400 flex items-center gap-2">
                        <AlertCircle className="size-4" />
                        {tf("explorer.searchFailed", "Search failed")} — {searchError}
                      </div>
                    )}
                    {!searchError && !searching && results.length === 0 && (
                      <div className="flex flex-col items-center gap-2 py-8 px-4 text-center">
                        <Frown className="size-6 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">
                          {tf("explorer.noResults", "No coins found for")}{" "}
                          <span className="font-medium text-foreground">
                            “{debouncedQuery}”
                          </span>
                        </p>
                      </div>
                    )}
                    {results.length > 0 && (
                      <ScrollArea className="max-h-96 overflow-y-auto">
                        <ul className="py-1">
                          {results.slice(0, 25).map((coin) => (
                            <SearchResultRow
                              key={coin.id}
                              coin={coin}
                              onSelect={handleSelectCoin}
                              tf={tf}
                            />
                          ))}
                        </ul>
                      </ScrollArea>
                    )}
                    {searching && results.length === 0 && (
                      <div className="p-3 space-y-2">
                        {[0, 1, 2].map((i) => (
                          <div key={i} className="flex items-center gap-3">
                            <Skeleton className="size-8 rounded-full" />
                            <div className="flex-1 space-y-1.5">
                              <Skeleton className="h-3 w-1/3" />
                              <Skeleton className="h-2 w-1/4" />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ----------------------------------------------------------------- */}
      {/*  Main panel — selected coin / persona / analyze / result           */}
      {/* ----------------------------------------------------------------- */}
      {!selected && !analyzing && !report && !error && <EmptyState tf={tf} />}

      {selected && (
        <div className="flex flex-col gap-6">
          <SelectedCoinPanel
            coin={selected}
            persona={persona}
            onPersonaChange={setPersona}
            onAnalyze={runAnalyze}
            onClear={handleClearCoin}
            analyzing={analyzing}
            tf={tf}
          />

          {analyzing && (
            <AnalyzingCard phaseIdx={phaseIdx} tf={tf} />
          )}

          {!analyzing && error && (
            <ErrorCard
              message={error}
              onRetry={runAnalyze}
              tf={tf}
            />
          )}

          {!analyzing && !error && report && (
            <ReportCard
              report={report}
              onViewFull={handleViewFullReport}
              onReportProvided={!!onReport}
              tf={tf}
            />
          )}

          {!analyzing && !error && !report && (
            <Card className="border-dashed border-border/60 bg-card/20">
              <CardContent className="py-10 flex flex-col items-center text-center gap-2">
                <Crosshair className="size-8 text-emerald-500/60" />
                <p className="text-sm text-muted-foreground max-w-md">
                  {tf(
                    "explorer.readyToAnalyze",
                    "Ready to run the 8-phase framework analysis. Pick a persona above and hit Analyze.",
                  )}
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

export default CoinExplorerView;

// ========================================================================== //
//  Sub-components
// ========================================================================== //

// --------------------------------------------------------------------------- //
//  Search result row
// --------------------------------------------------------------------------- //

function SearchResultRow({
  coin,
  onSelect,
  tf,
}: {
  coin: CoinSearchResult;
  onSelect: (coin: CoinSearchResult) => void;
  tf: (key: string, fallback: string, vars?: Record<string, string | number>) => string;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(coin)}
        className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-accent/60 focus:bg-accent/60 focus:outline-none"
      >
        {coin.thumb ? (
          <img
            src={coin.thumb}
            alt={`${coin.name} logo`}
            className="size-8 rounded-full bg-muted/40 shrink-0"
            loading="lazy"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.visibility = "hidden";
            }}
          />
        ) : (
          <div className="size-8 rounded-full bg-muted/40 flex items-center justify-center text-xs font-bold text-muted-foreground shrink-0">
            {coin.symbol?.slice(0, 2) || "?"}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground truncate">
              {coin.name}
            </span>
            <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
              {coin.symbol}
            </Badge>
          </div>
          <div className="text-xs text-muted-foreground truncate">
            {coin.market_cap_rank != null
              ? tf("explorer.rank", "Rank") + ` #${coin.market_cap_rank}`
              : tf("explorer.notRanked", "Not ranked")}
          </div>
        </div>
        <ArrowUpRight className="size-4 text-muted-foreground/60 shrink-0" />
      </button>
    </li>
  );
}

// --------------------------------------------------------------------------- //
//  Empty state (no coin selected yet)
// --------------------------------------------------------------------------- //

function EmptyState({
  tf,
}: {
  tf: (key: string, fallback: string, vars?: Record<string, string | number>) => string;
}) {
  return (
    <Card className="border-dashed border-border/60 bg-card/20">
      <CardContent className="py-16 flex flex-col items-center text-center gap-4">
        <div className="relative">
          <div className="absolute inset-0 blur-2xl bg-emerald-500/20 rounded-full" />
          <div className="relative size-16 rounded-full bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border border-emerald-500/30 flex items-center justify-center">
            <Sparkles className="size-7 text-emerald-400" />
          </div>
        </div>
        <div className="space-y-1.5 max-w-md">
          <h3 className="text-lg font-semibold text-foreground">
            {tf("explorer.emptyTitle", "Explore any cryptocurrency")}
          </h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {tf(
              "explorer.emptyDesc",
              "Search for a coin above, choose an analysis persona, and run the full 8-phase framework to get a complete evidence-first report.",
            )}
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2 mt-2 text-[10px] uppercase tracking-wide text-muted-foreground/80">
          <div className="flex flex-col items-center gap-1">
            <Search className="size-4" />
            <span>{tf("explorer.step1", "Search")}</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <Target className="size-4" />
            <span>{tf("explorer.step2", "Persona")}</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <Zap className="size-4" />
            <span>{tf("explorer.step3", "Analyze")}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// --------------------------------------------------------------------------- //
//  Selected coin panel + persona selector + Analyze button
// --------------------------------------------------------------------------- //

function SelectedCoinPanel({
  coin,
  persona,
  onPersonaChange,
  onAnalyze,
  onClear,
  analyzing,
  tf,
}: {
  coin: CoinSearchResult;
  persona: Persona;
  onPersonaChange: (p: Persona) => void;
  onAnalyze: () => void;
  onClear: () => void;
  analyzing: boolean;
  tf: (key: string, fallback: string, vars?: Record<string, string | number>) => string;
}) {
  return (
    <Card className="border-border/60 bg-card/40 backdrop-blur-sm shadow-lg shadow-black/20">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Crosshair className="size-4 text-emerald-400" />
            {tf("explorer.selectedCoin", "Selected Coin")}
          </CardTitle>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={onClear}
                className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                aria-label={tf("explorer.deselectCoin", "Deselect coin")}
              >
                <X className="size-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              {tf("explorer.deselectCoin", "Deselect coin")}
            </TooltipContent>
          </Tooltip>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* Coin identity row */}
        <div className="flex items-center gap-4">
          {coin.large ? (
            <img
              src={coin.large}
              alt={`${coin.name} logo`}
              className="size-14 rounded-full bg-muted/40 shrink-0 ring-2 ring-emerald-500/20"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.visibility = "hidden";
              }}
            />
          ) : (
            <div className="size-14 rounded-full bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border border-emerald-500/30 flex items-center justify-center text-lg font-bold text-emerald-300 shrink-0">
              {coin.symbol?.slice(0, 2) || "?"}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xl font-semibold text-foreground truncate">
                {coin.name}
              </h2>
              <Badge variant="outline" className="uppercase tracking-wide">
                {coin.symbol}
              </Badge>
            </div>
            <div className="text-sm text-muted-foreground mt-0.5">
              {coin.market_cap_rank != null
                ? tf("explorer.marketCapRank", "Market cap rank") + ` #${coin.market_cap_rank}`
                : tf("explorer.unrankedCoin", "Unranked coin")}
            </div>
          </div>
        </div>

        <Separator className="bg-border/40" />

        {/* Persona selector */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Target className="size-4 text-emerald-400" />
            <span className="text-sm font-medium text-foreground">
              {tf("explorer.personaTitle", "Analysis Persona")}
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {PERSONAS.map((p) => {
              const isActive = persona === p.value;
              const label = tf(`personas.${p.value}`, p.label);
              const desc = tf(`personas.${p.value}Desc`, p.desc);
              return (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => onPersonaChange(p.value)}
                  aria-pressed={isActive}
                  className={cn(
                    "group relative flex flex-col gap-0.5 rounded-lg border p-3 text-left transition-all",
                    isActive
                      ? "border-emerald-500/60 bg-emerald-500/10 shadow-md shadow-emerald-500/10"
                      : "border-border/60 bg-input/20 hover:bg-accent/40 hover:border-border",
                  )}
                >
                  <span
                    className={cn(
                      "text-sm font-medium leading-tight",
                      isActive ? "text-emerald-300" : "text-foreground",
                    )}
                    dir="auto"
                  >
                    {label}
                  </span>
                  <span className="text-[11px] leading-snug text-muted-foreground" dir="auto">
                    {desc}
                  </span>
                  {isActive && (
                    <span className="absolute right-2 top-2 size-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px] shadow-emerald-400/60" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Analyze button */}
        <Button
          type="button"
          onClick={onAnalyze}
          disabled={analyzing}
          className="w-full h-12 text-base font-semibold bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white border-0 shadow-lg shadow-emerald-500/30 transition-all hover:shadow-emerald-500/40 disabled:opacity-60"
        >
          {analyzing ? (
            <>
              <Loader2 className="size-5 animate-spin" />
              {tf("explorer.analyzing", "Analyzing…")}
            </>
          ) : (
            <>
              <Zap className="size-5" />
              {tf("explorer.runAnalysis", "Run 8-Phase Analysis")}
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}

// --------------------------------------------------------------------------- //
//  Analyzing card — full-card loading state with cycling phase messages
// --------------------------------------------------------------------------- //

function AnalyzingCard({
  phaseIdx,
  tf,
}: {
  phaseIdx: number;
  tf: (key: string, fallback: string, vars?: Record<string, string | number>) => string;
}) {
  // Fake progress that asymptotically approaches 90% — gives the user a sense
  // of forward motion without lying about the actual completion %.
  const [progress, setProgress] = React.useState(2);
  React.useEffect(() => {
    const id = window.setInterval(() => {
      setProgress((p) => {
        if (p >= 92) return p;
        // Decelerating curve: the closer we get to 92, the slower we move.
        const remaining = 92 - p;
        const step = Math.max(0.4, remaining * 0.06);
        return Math.min(92, p + step);
      });
    }, 400);
    return () => window.clearInterval(id);
  }, []);

  return (
    <Card className="border-emerald-500/30 bg-card/40 backdrop-blur-sm shadow-xl shadow-emerald-500/10 overflow-hidden">
      <div className="relative">
        {/* Top accent bar */}
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-400/80 to-transparent" />
        <CardContent className="py-12 flex flex-col items-center text-center gap-6">
          {/* Animated radar-like spinner */}
          <div className="relative size-20">
            <div className="absolute inset-0 rounded-full border-2 border-emerald-500/20" />
            <div className="absolute inset-0 rounded-full border-t-2 border-emerald-400 animate-spin" style={{ animationDuration: "1.4s" }} />
            <div className="absolute inset-2 rounded-full border-2 border-teal-500/10" />
            <div className="absolute inset-2 rounded-full border-b-2 border-teal-400 animate-spin" style={{ animationDuration: "2s", animationDirection: "reverse" }} />
            <div className="absolute inset-0 flex items-center justify-center">
              <Brain className="size-7 text-emerald-400" />
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-foreground flex items-center justify-center gap-2">
              <Loader2 className="size-4 animate-spin text-emerald-400" />
              {tf("explorer.analyzingTitle", "Running framework analysis")}
            </h3>
            <p
              key={phaseIdx}
              dir="auto"
              className="text-sm text-muted-foreground transition-opacity duration-300 max-w-md"
            >
              {tf(ANALYZE_PHASE_MESSAGES[phaseIdx].key, ANALYZE_PHASE_MESSAGES[phaseIdx].fallback)}
            </p>
          </div>

          {/* Phase dots */}
          <div className="flex items-center gap-1.5">
            {ANALYZE_PHASE_MESSAGES.map((_, i) => (
              <span
                key={i}
                className={cn(
                  "h-1.5 rounded-full transition-all duration-300",
                  i === phaseIdx
                    ? "w-6 bg-emerald-400"
                    : i < phaseIdx
                      ? "w-1.5 bg-emerald-500/50"
                      : "w-1.5 bg-muted",
                )}
              />
            ))}
          </div>

          {/* Progress bar */}
          <div className="w-full max-w-md space-y-1.5">
            <Progress
              value={progress}
              className="h-1.5 bg-muted/40 [&_[data-slot=progress-indicator]]:bg-gradient-to-r [&_[data-slot=progress-indicator]]:from-emerald-500 [&_[data-slot=progress-indicator]]:to-teal-400"
            />
            <div className="flex items-center justify-between text-[10px] uppercase tracking-wide text-muted-foreground/70">
              <span>{tf("explorer.phase", "Phase")} {phaseIdx + 1}/{ANALYZE_PHASE_MESSAGES.length}</span>
              <span>{tf("explorer.takesSeconds", "usually 5–30s")}</span>
            </div>
          </div>
        </CardContent>
      </div>
    </Card>
  );
}

// --------------------------------------------------------------------------- //
//  Error card
// --------------------------------------------------------------------------- //

function ErrorCard({
  message,
  onRetry,
  tf,
}: {
  message: string;
  onRetry: () => void;
  tf: (key: string, fallback: string, vars?: Record<string, string | number>) => string;
}) {
  const isTimeout = /timeout|abort|504|rate.?limit/i.test(message);
  return (
    <Alert variant="destructive" className="border-rose-500/40 bg-rose-500/10">
      <AlertCircle className="size-4 text-rose-400" />
      <AlertTitle className="text-rose-300">
        {isTimeout
          ? tf("explorer.errorTimeoutTitle", "Analysis timed out")
          : tf("explorer.errorTitle", "Analysis failed")}
      </AlertTitle>
      <AlertDescription className="text-rose-200/80">
        <p className="mb-3">
          {isTimeout
            ? tf(
                "explorer.errorTimeoutDesc",
                "The upstream API may be rate-limited or slow. Please wait a few seconds and try again.",
              )
            : message}
        </p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onRetry}
          className="border-rose-500/40 text-rose-200 hover:bg-rose-500/15 hover:text-rose-100"
        >
          <RotateCcw className="size-3.5" />
          {tf("explorer.retry", "Retry analysis")}
        </Button>
      </AlertDescription>
    </Alert>
  );
}

// --------------------------------------------------------------------------- //
//  Report card — rich summary of the resulting FullReport
// --------------------------------------------------------------------------- //

function ReportCard({
  report,
  onViewFull,
  onReportProvided,
  tf,
}: {
  report: FullReport;
  onViewFull: () => void;
  onReportProvided: boolean;
  tf: (key: string, fallback: string, vars?: Record<string, string | number>) => string;
}) {
  // Keep pqScore/confidence as null when the backend omits them (malformed
  // report, partial backend failure). The old `?? 0` defaults painted a
  // red "0/100" radial — visually identical to a genuine 0/100 score —
  // misleading the user into thinking the project scored terribly when
  // actually the backend just failed to score it.
  const pqScore = report.project_quality_score ?? null;
  const tqScore = report.token_quality_score;
  const confidence = report.confidence ?? null;
  const veto = report.veto;
  const decision = report.decision ?? { action_label: "—" };
  const candidate = report.candidate ?? { name: report.candidate?.name ?? "—", symbol: "—" };

  return (
    <Card className="border-border/60 bg-card/40 backdrop-blur-sm shadow-xl shadow-black/30 overflow-hidden">
      {/* Top accent bar — neutral (slate) when score is missing */}
      <div className={cn(
        "h-1 w-full",
        pqScore == null ? "bg-slate-500/60"
        : pqScore >= 70 ? "bg-emerald-500/60"
        : pqScore >= 50 ? "bg-amber-500/60"
        : "bg-rose-500/60",
      )} />

      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="size-4 text-emerald-400" />
            {tf("explorer.reportTitle", "Analysis Report")}
          </CardTitle>
          {veto?.triggered && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge className="bg-rose-500/20 text-rose-300 border-rose-500/40 gap-1">
                  <ShieldAlert className="size-3" />
                  {tf("explorer.vetoTriggered", "Veto triggered")}
                </Badge>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                {veto.reason || veto.veto_type || "Veto"}
              </TooltipContent>
            </Tooltip>
          )}
        </div>
        <CardDescription className="sr-only">
          {tf("explorer.reportDesc", "Full framework analysis report for")} {candidate.name}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* ----------------------------------------------------------- */}
        {/*  Header row: score radial + action/confidence/token info     */}
        {/* ----------------------------------------------------------- */}
        <div className="flex flex-col sm:flex-row gap-5 sm:items-center">
          {/* Score radial */}
          <div className="flex flex-col items-center gap-1.5 shrink-0 mx-auto sm:mx-0">
            {pqScore == null ? (
              <div className="flex h-[132px] w-[132px] items-center justify-center rounded-full border-8 border-slate-500/30 bg-slate-500/10">
                <span className="text-2xl font-bold text-slate-500">—</span>
              </div>
            ) : (
              <ScoreRadial
                score={pqScore}
                max={100}
                size={132}
                strokeWidth={10}
                label={tf("explorer.projectQuality", "Project Quality")}
                sublabel={tf("explorer.outOf100", "out of 100")}
              />
            )}
          </div>

          {/* Action + confidence + token quality */}
          <div className="flex-1 space-y-3 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className={cn("gap-1", actionBadgeClass(decision.action_label))}>
                <TrendingUp className="size-3" />
                {decision.action_label}
              </Badge>
              {confidence != null && (
                <Badge variant="outline" className="gap-1">
                  <Target className="size-3" />
                  {tf("explorer.confidence", "Confidence")}: {fmtPct(confidence)}
                </Badge>
              )}
              {tqScore != null && (
                <Badge variant="outline" className="gap-1">
                  <Zap className="size-3" />
                  {tf("explorer.tokenQuality", "Token")}: {tqScore.toFixed(0)}/100
                </Badge>
              )}
              {report.evidence_grade && (
                <Badge variant="outline">
                  {tf("explorer.evidenceGrade", "Evidence")}: {report.evidence_grade}
                </Badge>
              )}
            </div>

            {/* Key links */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <KeyLinkIcon
                href={candidate.website}
                icon={<Globe className="size-4" />}
                label={tf("explorer.website", "Website")}
              />
              <KeyLinkIcon
                href={candidate.twitter}
                icon={<Twitter className="size-4" />}
                label={tf("explorer.twitter", "Twitter / X")}
              />
              <KeyLinkIcon
                href={candidate.github}
                icon={<Github className="size-4" />}
                label={tf("explorer.github", "GitHub")}
              />
              <KeyLinkIcon
                href={candidate.blockchain_explorer}
                icon={<Crosshair className="size-4" />}
                label={tf("explorer.explorerBlock", "Block explorer")}
              />
            </div>

            {/* Valuation multiples (if present) */}
            {report.valuation_multiples && (
              <div className="grid grid-cols-3 gap-2 pt-1">
                <MultipleTile
                  label="P/R"
                  value={report.valuation_multiples.p_r}
                />
                <MultipleTile
                  label="P/F"
                  value={report.valuation_multiples.p_f}
                />
                <MultipleTile
                  label="P/T"
                  value={report.valuation_multiples.p_t}
                />
              </div>
            )}
          </div>
        </div>

        <Separator className="bg-border/40" />

        {/* ----------------------------------------------------------- */}
        {/*  5 fundamental axes                                          */}
        {/* ----------------------------------------------------------- */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-foreground flex items-center gap-2">
            <Crosshair className="size-4 text-emerald-400" />
            {tf("explorer.fiveAxes", "5 Fundamental Axes")}
          </h4>
          <div className="space-y-2.5">
            {(Array.isArray(report.axes) ? report.axes : []).map((ax, i) => (
              <AxisRow key={`${ax.name}-${i}`} name={ax.name} score={ax.score} reason={ax.key_reason} />
            ))}
          </div>
        </div>

        <Separator className="bg-border/40" />

        {/* ----------------------------------------------------------- */}
        {/*  Executive verdict                                           */}
        {/* ----------------------------------------------------------- */}
        {report.executive_verdict && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-foreground flex items-center gap-2">
              <Target className="size-4 text-emerald-400" />
              {tf("explorer.executiveVerdict", "Executive Verdict")}
            </h4>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {report.executive_verdict}
            </p>
          </div>
        )}

        {/* ----------------------------------------------------------- */}
        {/*  Final thesis (highlighted blockquote)                       */}
        {/* ----------------------------------------------------------- */}
        {report.final_thesis && (
          <blockquote className="relative rounded-lg border border-emerald-500/30 bg-emerald-500/[0.06] px-4 py-3 pl-9">
            <Quote className="absolute left-2.5 top-3 size-4 text-emerald-400/70" />
            <p className="text-sm text-foreground/90 leading-relaxed italic">
              {report.final_thesis}
            </p>
          </blockquote>
        )}

        {/* ----------------------------------------------------------- */}
        {/*  Severe risks (if any)                                       */}
        {/* ----------------------------------------------------------- */}
        {Array.isArray(report.severe_risks) && report.severe_risks.some((r) => r.present) && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-rose-300 flex items-center gap-2">
              <ShieldAlert className="size-4" />
              {tf("explorer.severeRisks", "Severe Risks Detected")}
            </h4>
            <ul className="flex flex-wrap gap-1.5">
              {report.severe_risks.filter((r) => r.present).map((r, i) => (
                <Badge key={i} variant="outline" className="border-rose-500/40 text-rose-300 bg-rose-500/10 text-[11px]">
                  {r.name}
                </Badge>
              ))}
            </ul>
          </div>
        )}

        {/* ----------------------------------------------------------- */}
        {/*  Catalysts (if any, positive only for brevity)               */}
        {/* ----------------------------------------------------------- */}
        {Array.isArray(report.catalysts) && report.catalysts.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-foreground flex items-center gap-2">
              <Zap className="size-4 text-emerald-400" />
              {tf("explorer.catalysts", "Key Catalysts")}
            </h4>
            <ul className="space-y-1.5">
              {report.catalysts.slice(0, 3).map((c, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <span className={cn(
                    "mt-1 size-1.5 rounded-full shrink-0",
                    c.positive ? "bg-emerald-400" : "bg-rose-400",
                  )} />
                  <span className="leading-relaxed">
                    {c.description}
                    {c.eta && (
                      <span className="text-muted-foreground/70 ml-1">({c.eta})</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <Separator className="bg-border/40" />

        {/* ----------------------------------------------------------- */}
        {/*  Footer: view-full-report button                             */}
        {/* ----------------------------------------------------------- */}
        {onReportProvided && (
          <Button
            type="button"
            onClick={onViewFull}
            variant="outline"
            className="w-full border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10 hover:text-emerald-200"
          >
            <ArrowUpRight className="size-4" />
            {tf("explorer.viewFullReport", "View Full Report")}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

// --------------------------------------------------------------------------- //
//  Helpers: KeyLinkIcon, MultipleTile, AxisRow
// --------------------------------------------------------------------------- //

function KeyLinkIcon({
  href,
  icon,
  label,
}: {
  href: string | null | undefined;
  icon: React.ReactNode;
  label: string;
}) {
  if (!href) return null;
  let safeHref = href;
  try {
    // Ensure protocol-relative or bare URLs become absolute & https.
    if (!/^https?:\/\//i.test(href)) safeHref = `https://${href}`;
  } catch {
    /* ignore */
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <a
          href={safeHref}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={label}
          className="inline-flex size-8 items-center justify-center rounded-md border border-border/60 bg-input/20 text-muted-foreground transition-all hover:bg-accent/60 hover:text-foreground hover:border-border"
        >
          {icon}
        </a>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function MultipleTile({
  label,
  value,
}: {
  label: string;
  value: number | null | undefined;
}) {
  const display = value == null || Number.isNaN(value)
    ? "N/A"
    : value >= 100
      ? value.toFixed(0)
      : value.toFixed(2);
  const tone =
    value == null
      ? "text-muted-foreground"
      : value > 50
        ? "text-rose-300"
        : value > 20
          ? "text-amber-300"
          : "text-emerald-300";
  return (
    <div className="rounded-md border border-border/60 bg-input/20 px-2 py-1.5 text-center">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("text-sm font-semibold tabular-nums", tone)}>{display}</div>
    </div>
  );
}

function AxisRow({
  name,
  score,
  reason,
}: {
  name: string;
  score: number;
  reason?: string;
}) {
  // Axis scores are 0–10 → normalise to 0–100 for the progress bar.
  const pct = Math.max(0, Math.min(100, (score / 10) * 100));
  const color = axisBarColor(score);
  const scoreText =
    score >= 0 ? (score >= 10 ? score.toFixed(0) : score.toFixed(1)) : "—";
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-foreground truncate">{name}</span>
        <span
          className="text-xs font-semibold tabular-nums shrink-0"
          style={{ color }}
        >
          {scoreText}/10
        </span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted/40 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{
            width: `${pct}%`,
            backgroundColor: color,
            boxShadow: `0 0 6px ${color}55`,
          }}
        />
      </div>
      {reason && (
        <p className="text-[11px] text-muted-foreground/80 leading-relaxed line-clamp-2">
          {reason}
        </p>
      )}
    </div>
  );
}
