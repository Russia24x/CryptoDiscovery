"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  Brain,
  ChartNoAxesColumn,
  CircleDollarSign,
  Clock,
  Crosshair,
  Filter,
  FlaskConical,
  Gauge,
  Layers,
  Loader2,
  Radar,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Zap,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

// --------------------------------------------------------------------------- //
//  Types (mirror the Python schemas)
// --------------------------------------------------------------------------- //
type Persona = "researcher" | "investor" | "institutional" | "developer" | "trader";

interface ScanSummaryItem {
  id: string;
  name: string;
  symbol: string;
  project_quality: number;
  token_quality: number | null;
  action: string;
  confidence: number;
  image: string | null;
  veto: boolean;
  category: string;
  sector: string;
}

interface ScanStatus {
  scan_id: string;
  status: "queued" | "running" | "completed" | "failed";
  current_phase: string;
  progress_pct: number;
  phase_log: string[];
  total_candidates: number;
  processed: number;
  started_at: string;
  finished_at: string | null;
  error: string | null;
  reports: ScanSummaryItem[];
  config: { persona: Persona; market_cap_min: number; market_cap_max: number; sectors: string[]; max_projects: number };
}

interface ScanListItem {
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

interface FullReport {
  id: string;
  candidate: {
    name: string;
    symbol: string;
    category: string;
    sector: string;
    description: string;
    key_signal: string;
    initial_priority: string;
    image: string | null;
    website: string | null;
  };
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
}

// --------------------------------------------------------------------------- //
//  Helpers
// --------------------------------------------------------------------------- //
function fmtUsd(v: number | null | undefined): string {
  if (v == null || isNaN(v)) return "—";
  const abs = Math.abs(v);
  if (abs >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${v.toFixed(2)}`;
}

function fmtPct(v: number | null | undefined, digits = 1): string {
  if (v == null || isNaN(v)) return "—";
  return `${v.toFixed(digits)}%`;
}

function scoreColor(score: number, max = 100): string {
  const ratio = score / max;
  if (ratio >= 0.85) return "text-emerald-500";
  if (ratio >= 0.70) return "text-lime-500";
  if (ratio >= 0.55) return "text-amber-500";
  if (ratio >= 0.40) return "text-orange-500";
  return "text-rose-500";
}

function scoreBg(score: number, max = 100): string {
  const ratio = score / max;
  if (ratio >= 0.85) return "bg-emerald-500";
  if (ratio >= 0.70) return "bg-lime-500";
  if (ratio >= 0.55) return "bg-amber-500";
  if (ratio >= 0.40) return "bg-orange-500";
  return "bg-rose-500";
}

function actionBadge(action: string): { label: string; cls: string } {
  const a = action.toLowerCase();
  if (a.includes("high conviction")) return { label: action, cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" };
  if (a.includes("core")) return { label: action, cls: "bg-lime-500/15 text-lime-400 border-lime-500/30" };
  if (a.includes("small")) return { label: action, cls: "bg-amber-500/15 text-amber-400 border-amber-500/30" };
  if (a.includes("deep research") || a.includes("research")) return { label: action, cls: "bg-sky-500/15 text-sky-400 border-sky-500/30" };
  if (a.includes("watch")) return { label: action, cls: "bg-slate-500/15 text-slate-300 border-slate-500/30" };
  return { label: action, cls: "bg-rose-500/15 text-rose-400 border-rose-500/30" };
}

const AXIS_ICONS: Record<string, typeof Brain> = {
  "Invisible Utility": Radar,
  "Economic Engine": CircleDollarSign,
  "Moat": ShieldCheck,
  "Token & Market Structure": Layers,
  "Governance / Legal / Security": ShieldAlert,
};

const PERSONAS: { value: Persona; label: string; desc: string }[] = [
  { value: "investor", label: "Investor", desc: "Revenue & valuation focus" },
  { value: "institutional", label: "Institutional", desc: "Risk, legal & moat focus" },
  { value: "researcher", label: "Researcher", desc: "Tech & architecture focus" },
  { value: "developer", label: "Developer", desc: "Integration & DX focus" },
  { value: "trader", label: "Trader", desc: "Momentum & catalysts focus" },
];

const SECTOR_OPTIONS = [
  "DeFi", "Infrastructure", "RWA", "DePIN", "L1 / L2", "Payments / Stablecoins", "Other",
];

// --------------------------------------------------------------------------- //
//  Main page
// --------------------------------------------------------------------------- //
export default function Home() {
  const [persona, setPersona] = useState<Persona>("investor");
  const [mcMin, setMcMin] = useState("100");
  const [mcMax, setMcMax] = useState("50000");
  const [maxProjects, setMaxProjects] = useState("12");
  const [sectors, setSectors] = useState<string[]>([]);

  const [activeScan, setActiveScan] = useState<ScanStatus | null>(null);
  const [scans, setScans] = useState<ScanListItem[]>([]);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedReport, setSelectedReport] = useState<FullReport | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  // load scan list on mount
  const refreshScans = useCallback(async () => {
    try {
      const r = await fetch("/api/scanner/scans");
      if (r.ok) setScans(await r.json());
    } catch {}
  }, []);

  useEffect(() => {
    refreshScans();
  }, [refreshScans]);

  // poll active scan
  useEffect(() => {
    if (!activeScan || activeScan.status === "completed" || activeScan.status === "failed") {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }
    pollRef.current = setInterval(async () => {
      try {
        const r = await fetch(`/api/scanner/scan/${activeScan.scan_id}`);
        if (r.ok) {
          const data: ScanStatus = await r.json();
          setActiveScan(data);
          if (data.status === "completed" || data.status === "failed") {
            refreshScans();
            setScanning(false);
          }
        }
      } catch {}
    }, 2000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [activeScan, refreshScans]);

  const startScan = async () => {
    setError(null);
    setScanning(true);
    try {
      const r = await fetch("/api/scanner/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          persona,
          market_cap_min: Number(mcMin) || 0,
          market_cap_max: Number(mcMax) || 1_000_000,
          sectors,
          max_projects: Number(maxProjects) || 12,
        }),
      });
      if (!r.ok) throw new Error(`scan start failed: ${r.status}`);
      const data = await r.json();
      // immediately fetch to seed polling
      const r2 = await fetch(`/api/scanner/scan/${data.scan_id}`);
      if (r2.ok) setActiveScan(await r2.json());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "scan failed");
      setScanning(false);
    }
  };

  const loadReport = async (id: string) => {
    setReportLoading(true);
    try {
      const r = await fetch(`/api/scanner/project/${id}`);
      if (r.ok) setSelectedReport(await r.json());
    } catch {
    } finally {
      setReportLoading(false);
    }
  };

  const toggleSector = (s: string) => {
    setSectors((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));
  };

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      {/* ----------------------------------------------------------------- */}
      {/*  Header                                                            */}
      {/* ----------------------------------------------------------------- */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-lg shadow-emerald-500/20">
                <Radar className="h-5 w-5 text-white" />
                <div className="absolute -inset-0.5 rounded-xl bg-emerald-500/20 blur-sm -z-10" />
              </div>
              <div>
                <h1 className="text-base font-bold tracking-tight sm:text-lg">
                  Crypto Discovery Framework
                </h1>
                <p className="text-[11px] text-muted-foreground hidden sm:block">
                  Evidence-first market scanning · v1.0
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <HealthDot />
              <Badge variant="outline" className="hidden md:flex gap-1.5 font-mono text-[11px]">
                <Activity className="h-3 w-3 text-emerald-500" />
                {scans.length} scans
              </Badge>
            </div>
          </div>
        </div>
      </header>

      {/* ----------------------------------------------------------------- */}
      {/*  Main                                                              */}
      {/* ----------------------------------------------------------------- */}
      <main className="flex-1 mx-auto w-full max-w-[1600px] px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-6">
          {/* ============ Config sidebar ============ */}
          <aside className="lg:sticky lg:top-[88px] lg:self-start space-y-4">
            <Card className="border-border/60 bg-card/40 backdrop-blur-sm">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Crosshair className="h-4 w-4 text-emerald-500" />
                  Scan Configuration
                </CardTitle>
                <CardDescription className="text-xs">
                  Configure discovery lenses & persona weights
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Persona */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Persona</Label>
                  <Select value={persona} onValueChange={(v) => setPersona(v as Persona)}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PERSONAS.map((p) => (
                        <SelectItem key={p.value} value={p.value}>
                          <div className="flex flex-col">
                            <span className="text-sm font-medium">{p.label}</span>
                            <span className="text-[10px] text-muted-foreground">{p.desc}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Market cap range */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">MC Min ($M)</Label>
                    <Input
                      value={mcMin}
                      onChange={(e) => setMcMin(e.target.value)}
                      className="h-9 font-mono text-xs"
                      placeholder="100"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">MC Max ($M)</Label>
                    <Input
                      value={mcMax}
                      onChange={(e) => setMcMax(e.target.value)}
                      className="h-9 font-mono text-xs"
                      placeholder="50000"
                    />
                  </div>
                </div>

                {/* Max projects */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Max projects</Label>
                  <Input
                    type="number"
                    min={3}
                    max={30}
                    value={maxProjects}
                    onChange={(e) => setMaxProjects(e.target.value)}
                    className="h-9 font-mono text-xs"
                  />
                </div>

                {/* Sectors */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium flex items-center gap-1.5">
                    <Filter className="h-3 w-3" /> Sectors {sectors.length > 0 && <span className="text-emerald-500">({sectors.length})</span>}
                  </Label>
                  <div className="flex flex-wrap gap-1.5">
                    {SECTOR_OPTIONS.map((s) => (
                      <button
                        key={s}
                        onClick={() => toggleSector(s)}
                        className={cn(
                          "px-2 py-1 rounded-md text-[11px] font-medium transition-colors border",
                          sectors.includes(s)
                            ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                            : "bg-muted/40 text-muted-foreground border-border/40 hover:border-border",
                        )}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>

                <Separator />

                <Button
                  onClick={startScan}
                  disabled={scanning}
                  className="w-full h-10 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white shadow-lg shadow-emerald-500/20"
                >
                  {scanning ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Scanning…
                    </>
                  ) : (
                    <>
                      <Zap className="h-4 w-4 mr-2" /> Scan Market
                    </>
                  )}
                </Button>
                {error && (
                  <p className="text-xs text-rose-400 flex items-center gap-1.5">
                    <AlertTriangle className="h-3 w-3" /> {error}
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Recent scans */}
            <Card className="border-border/60 bg-card/40 backdrop-blur-sm">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  Recent Scans
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[260px] px-6 pb-4">
                  {scans.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-4">No scans yet. Run one to see results.</p>
                  ) : (
                    <div className="space-y-2">
                      {scans.map((s) => (
                        <button
                          key={s.scan_id}
                          onClick={async () => {
                            const r = await fetch(`/api/scanner/scan/${s.scan_id}`);
                            if (r.ok) {
                              const d: ScanStatus = await r.json();
                              setActiveScan(d);
                              setScanning(d.status === "running" || d.status === "queued");
                            }
                          }}
                          className="w-full text-left p-2.5 rounded-lg border border-border/40 bg-muted/20 hover:bg-muted/40 hover:border-border transition-colors group"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-[11px] text-muted-foreground group-hover:text-foreground">
                              {s.scan_id.slice(0, 12)}
                            </span>
                            <ScanStatusBadge status={s.status} />
                          </div>
                          <div className="flex items-center justify-between mt-1.5">
                            <span className="text-[11px] capitalize">{s.persona}</span>
                            <span className="text-[11px] text-muted-foreground">{s.processed}/{s.total}</span>
                          </div>
                          <Progress value={s.progress} className="h-1 mt-1.5" />
                        </button>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </aside>

          {/* ============ Results area ============ */}
          <section className="min-w-0 space-y-6">
            {/* Hero / scan progress */}
            {!activeScan && scans.length === 0 && <EmptyState />}

            {activeScan && (
              <ScanProgressCard scan={activeScan} />
            )}

            {/* Reports grid */}
            {activeScan && activeScan.reports.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold flex items-center gap-2">
                    <ChartNoAxesColumn className="h-4 w-4 text-emerald-500" />
                    Ranked Candidates
                    <Badge variant="secondary" className="font-mono text-[10px]">
                      {activeScan.reports.length}
                    </Badge>
                  </h2>
                  <p className="text-[11px] text-muted-foreground">
                    Sorted by project quality score
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {activeScan.reports
                    .slice()
                    .sort((a, b) => b.project_quality - a.project_quality)
                    .map((r) => (
                      <ProjectCard
                        key={r.id}
                        report={r}
                        onSelect={() => loadReport(r.id)}
                      />
                    ))}
                </div>
              </div>
            )}
          </section>
        </div>
      </main>

      {/* ----------------------------------------------------------------- */}
      {/*  Footer                                                            */}
      {/* ----------------------------------------------------------------- */}
      <footer className="mt-auto border-t border-border/60 bg-background/60 backdrop-blur-sm">
        <div className="mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-8 py-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p className="text-[11px] text-muted-foreground">
            Crypto Discovery Framework · Evidence &gt; Narrative · Data from CoinGecko + DeFiLlama (public APIs)
          </p>
          <p className="text-[11px] text-muted-foreground">
            Not personalized financial advice · For research only
          </p>
        </div>
      </footer>

      {/* ----------------------------------------------------------------- */}
      {/*  Detail drawer                                                     */}
      {/* ----------------------------------------------------------------- */}
      <Sheet open={!!selectedReport} onOpenChange={(o) => !o && setSelectedReport(null)}>
        <SheetContent side="right" className="w-full sm:max-w-2xl lg:max-w-3xl p-0 overflow-y-auto">
          {selectedReport ? (
            <ReportDetail report={selectedReport} />
          ) : reportLoading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}

// --------------------------------------------------------------------------- //
//  Sub-components
// --------------------------------------------------------------------------- //
function HealthDot() {
  const [ok, setOk] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    const check = async () => {
      try {
        const r = await fetch("/api/scanner/health");
        setOk(alive && r.ok);
      } catch {
        setOk(false);
      }
    };
    check();
    const t = setInterval(check, 15000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-md border border-border/40 bg-muted/20">
            <span
              className={cn(
                "h-2 w-2 rounded-full",
                ok === null ? "bg-slate-400 animate-pulse" : ok ? "bg-emerald-500" : "bg-rose-500",
              )}
            />
            <span className="text-[10px] font-mono text-muted-foreground hidden sm:inline">
              {ok === null ? "checking" : ok ? "scanner online" : "offline"}
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          Python scanner service on :3003
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function ScanStatusBadge({ status }: { status: string }) {
  const map: Record<string, { cls: string; icon: typeof Loader2 }> = {
    completed: { cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", icon: BadgeCheck },
    running: { cls: "bg-sky-500/15 text-sky-400 border-sky-500/30", icon: Loader2 },
    queued: { cls: "bg-slate-500/15 text-slate-300 border-slate-500/30", icon: Clock },
    failed: { cls: "bg-rose-500/15 text-rose-400 border-rose-500/30", icon: AlertTriangle },
  };
  const m = map[status] || map.queued;
  const Icon = m.icon;
  return (
    <Badge variant="outline" className={cn("text-[10px] gap-1 py-0 h-5", m.cls)}>
      <Icon className={cn("h-2.5 w-2.5", status === "running" && "animate-spin")} />
      {status}
    </Badge>
  );
}

function EmptyState() {
  return (
    <Card className="border-dashed border-2 border-border/60 bg-card/20">
      <CardContent className="flex flex-col items-center justify-center text-center py-16 px-6">
        <div className="relative mb-6">
          <div className="absolute inset-0 bg-emerald-500/20 blur-2xl rounded-full" />
          <div className="relative flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-emerald-500/20 to-teal-600/20 border border-emerald-500/30">
            <Radar className="h-10 w-10 text-emerald-400" />
          </div>
        </div>
        <h2 className="text-xl font-bold mb-2">Ready to scan the market</h2>
        <p className="text-sm text-muted-foreground max-w-md mb-6">
          Configure your discovery lenses and persona on the left, then trigger a market scan.
          The framework will discover, screen, evaluate and rank crypto projects by real evidence
          — not narratives.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-2xl w-full">
          {[
            { icon: Crosshair, label: "5 Discovery Lenses", color: "text-sky-400" },
            { icon: ShieldAlert, label: "Hard Veto Gates", color: "text-rose-400" },
            { icon: Gauge, label: "5 Fundamental Axes", color: "text-emerald-400" },
            { icon: Target, label: "Decision & Kill Rules", color: "text-amber-400" },
          ].map((f) => (
            <div key={f.label} className="flex flex-col items-center gap-2 p-3 rounded-lg border border-border/40 bg-muted/20">
              <f.icon className={cn("h-5 w-5", f.color)} />
              <span className="text-[11px] text-muted-foreground text-center">{f.label}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function ScanProgressCard({ scan }: { scan: ScanStatus }) {
  const phaseIndex = useMemo(() => {
    const phases = [
      "PHASE 1",
      "PHASE 2",
      "PHASE 3",
      "PHASE 4",
      "PHASE 5",
      "PHASE 6",
      "PHASE 7",
      "PHASE 8",
      "Completed",
    ];
    return phases.findIndex((p) => scan.current_phase.startsWith(p));
  }, [scan.current_phase]);

  const phases = ["Discovery", "Screening", "Evidence", "Evaluation", "Scoring", "Investment", "Decision", "Output"];

  return (
    <Card className="border-border/60 bg-card/40 backdrop-blur-sm overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-sm">
              <FlaskConical className="h-4 w-4 text-emerald-500" />
              Scan {scan.scan_id.slice(0, 12)}
              <Badge variant="outline" className="ml-1 text-[10px] capitalize">{scan.config.persona}</Badge>
            </CardTitle>
            <CardDescription className="text-xs mt-1 font-mono">
              {scan.current_phase} · {scan.processed}/{scan.total_candidates} processed
            </CardDescription>
          </div>
          <ScanStatusBadge status={scan.status} />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <Progress value={scan.progress_pct} className="h-2" />

        {/* Phase stepper */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1">
          {phases.map((p, i) => {
            const done = phaseIndex > i || scan.status === "completed";
            const current = phaseIndex === i && scan.status !== "completed";
            return (
              <div key={p} className="flex items-center gap-1 flex-shrink-0">
                <div
                  className={cn(
                    "flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-medium border transition-colors",
                    done && "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
                    current && "bg-sky-500/15 text-sky-400 border-sky-500/40",
                    !done && !current && "bg-muted/30 text-muted-foreground border-border/40",
                  )}
                >
                  {done ? (
                    <BadgeCheck className="h-3 w-3" />
                  ) : current ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <span className="h-1.5 w-1.5 rounded-full bg-current opacity-50" />
                  )}
                  {p}
                </div>
                {i < phases.length - 1 && <ArrowRight className="h-3 w-3 text-muted-foreground/50" />}
              </div>
            );
          })}
        </div>

        {/* Phase log */}
        {scan.phase_log.length > 0 && (
          <div className="bg-muted/20 rounded-lg border border-border/40 p-2.5 max-h-32 overflow-y-auto">
            <div className="font-mono text-[10px] space-y-0.5">
              {scan.phase_log.slice(-8).map((l, i) => (
                <div key={i} className="text-muted-foreground flex gap-2">
                  <span className="text-emerald-500/70">›</span>
                  <span className="truncate">{l}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {scan.error && (
          <p className="text-xs text-rose-400 flex items-center gap-1.5">
            <AlertTriangle className="h-3 w-3" /> {scan.error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function ProjectCard({ report, onSelect }: { report: ScanSummaryItem; onSelect: () => void }) {
  const ab = actionBadge(report.action);
  return (
    <button
      onClick={onSelect}
      className="group text-left p-4 rounded-xl border border-border/50 bg-card/40 hover:bg-card/80 hover:border-emerald-500/40 transition-all relative overflow-hidden"
    >
      {/* score accent bar */}
      <div
        className={cn("absolute top-0 left-0 right-0 h-0.5", scoreBg(report.project_quality))}
      />

      <div className="flex items-start gap-3 mb-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted/40 border border-border/40 overflow-hidden flex-shrink-0">
          {report.image ? (
            <img src={report.image} alt={report.symbol} className="h-full w-full object-cover" />
          ) : (
            <span className="text-xs font-bold text-muted-foreground">
              {report.symbol.slice(0, 3)}
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h3 className="font-semibold text-sm truncate">{report.name}</h3>
            {report.veto && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <ShieldAlert className="h-3.5 w-3.5 text-rose-500 flex-shrink-0" />
                  </TooltipTrigger>
                  <TooltipContent>Hard veto triggered</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground font-mono">${report.symbol}</p>
        </div>
        <div className="text-right flex-shrink-0">
          <div className={cn("text-xl font-bold tabular-nums", scoreColor(report.project_quality))}>
            {report.project_quality.toFixed(0)}
          </div>
          <div className="text-[10px] text-muted-foreground">/ 100</div>
        </div>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap mb-3">
        <Badge variant="outline" className={cn("text-[10px] gap-1", ab.cls)}>
          {ab.label}
        </Badge>
        <Badge variant="outline" className="text-[10px] text-muted-foreground">
          {report.category}
        </Badge>
      </div>

      {/* mini metrics */}
      <div className="grid grid-cols-3 gap-2 text-[10px]">
        <div className="flex flex-col">
          <span className="text-muted-foreground">Token Q</span>
          <span className={cn("font-mono font-semibold", report.token_quality != null ? scoreColor(report.token_quality) : "text-muted-foreground")}>
            {report.token_quality != null ? report.token_quality.toFixed(0) : "—"}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-muted-foreground">Confidence</span>
          <span className="font-mono font-semibold text-foreground">{report.confidence.toFixed(0)}%</span>
        </div>
        <div className="flex flex-col items-end justify-end">
          <span className="text-muted-foreground group-hover:text-emerald-400 transition-colors flex items-center gap-0.5">
            Details <ArrowRight className="h-2.5 w-2.5" />
          </span>
        </div>
      </div>
    </button>
  );
}

function ReportDetail({ report }: { report: FullReport }) {
  const ab = actionBadge(report.decision.action_label);
  return (
    <div>
      <SheetHeader className="px-6 pt-6 pb-4 border-b border-border/60 sticky top-0 bg-background/95 backdrop-blur z-10">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted/40 border border-border/40 overflow-hidden flex-shrink-0">
            {report.candidate.image ? (
              <img src={report.candidate.image} alt={report.candidate.symbol} className="h-full w-full object-cover" />
            ) : (
              <span className="text-sm font-bold">{report.candidate.symbol.slice(0, 3)}</span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <SheetTitle className="flex items-center gap-2 text-base">
              {report.candidate.name}
              <span className="font-mono text-xs text-muted-foreground">${report.candidate.symbol}</span>
              {report.veto.triggered && (
                <Badge className="bg-rose-500/15 text-rose-400 border-rose-500/30 text-[10px]">
                  <ShieldAlert className="h-3 w-3 mr-1" /> VETO
                </Badge>
              )}
            </SheetTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              {report.candidate.category} · {report.candidate.sector}
            </p>
          </div>
          <div className="text-right flex-shrink-0">
            <div className={cn("text-2xl font-bold tabular-nums", scoreColor(report.project_quality_score))}>
              {report.project_quality_score.toFixed(1)}
            </div>
            <div className="text-[10px] text-muted-foreground">Project Quality / 100</div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap mt-3">
          <Badge className={cn("text-[10px]", ab.cls)}>{report.decision.action_label}</Badge>
          <Badge variant="outline" className="text-[10px]">
            <Gauge className="h-3 w-3 mr-1" />
            Risk-adj {report.decision.risk_adjusted_score.toFixed(0)}
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            Confidence {report.confidence.toFixed(0)}%
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            Evidence {report.evidence_grade.split(" - ")[0]}
          </Badge>
        </div>
      </SheetHeader>

      <div className="px-6 py-5 space-y-6">
        {/* Verdict */}
        <section>
          <SectionTitle icon={Sparkles} title="Executive Verdict" />
          <p className="text-sm leading-relaxed text-foreground/90 bg-muted/20 rounded-lg p-3 border border-border/40">
            {report.executive_verdict}
          </p>
        </section>

        {/* 5 Fundamental Axes */}
        <section>
          <SectionTitle icon={Gauge} title="Five Fundamental Axes" />
          <div className="space-y-2.5">
            {report.axes.map((ax) => {
              const Icon = AXIS_ICONS[ax.name] || Brain;
              return (
                <div key={ax.name} className="border border-border/40 rounded-lg p-3 bg-card/30">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Icon className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                      <span className="text-xs font-semibold truncate">{ax.name}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-[10px] text-muted-foreground font-mono">conf {ax.confidence.toFixed(0)}%</span>
                      <span className={cn("text-lg font-bold tabular-nums", scoreColor(ax.score, 10))}>
                        {ax.score.toFixed(1)}
                      </span>
                      <span className="text-[10px] text-muted-foreground">/10</span>
                    </div>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted/40 overflow-hidden mb-2">
                    <div
                      className={cn("h-full rounded-full transition-all", scoreBg(ax.score, 10))}
                      style={{ width: `${(ax.score / 10) * 100}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground mb-2">{ax.key_reason}</p>
                  {Object.keys(ax.sub_factors).length > 0 && (
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                      {Object.entries(ax.sub_factors).map(([k, v]) => (
                        <div key={k} className="flex items-center justify-between gap-1 text-[10px]">
                          <span className="text-muted-foreground truncate">{k}</span>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <div className="w-10 h-1 rounded-full bg-muted/40 overflow-hidden">
                              <div
                                className={cn("h-full", scoreBg(v, 10))}
                                style={{ width: `${(v / 10) * 100}%` }}
                              />
                            </div>
                            <span className="font-mono text-muted-foreground w-6 text-right">{v.toFixed(1)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Economic Engine */}
        <section>
          <SectionTitle icon={CircleDollarSign} title="Economic Engine" />
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            <Metric label="Fees (24h)" value={fmtUsd(report.economic_engine.fees)} />
            <Metric label="Revenue (24h)" value={fmtUsd(report.economic_engine.revenue)} />
            <Metric label="Net Rev (30d avg)" value={fmtUsd(report.economic_engine.net_revenue)} />
            <Metric label="TVL" value={fmtUsd(report.economic_engine.tvl)} />
            <Metric label="AUM" value={fmtUsd(report.economic_engine.aum)} />
            <Metric
              label="Growth WoW"
              value={fmtPct(report.economic_engine.revenue_growth_pct)}
              tone={report.economic_engine.revenue_growth_pct != null && report.economic_engine.revenue_growth_pct < 0 ? "neg" : "pos"}
            />
            <Metric label="Recurrence" value={report.economic_engine.recurrence || "—"} />
            <Metric label="Cust. Concentration" value={report.economic_engine.customer_concentration || "—"} />
          </div>
        </section>

        {/* Tokenomics & Market */}
        <section>
          <SectionTitle icon={Layers} title="Tokenomics & Market Structure" />
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-2">
            <Metric label="Market Cap" value={fmtUsd(report.tokenomics.market_cap)} />
            <Metric label="FDV" value={fmtUsd(report.tokenomics.fdv)} />
            <Metric label="Supply Growth" value={fmtPct(report.tokenomics.supply_growth_pct)} tone={report.tokenomics.supply_growth_pct != null && report.tokenomics.supply_growth_pct > 6 ? "neg" : "neutral"} />
            <Metric label="Insider Alloc." value={fmtPct(report.tokenomics.insider_allocation_pct)} />
            <Metric label="Daily Volume" value={fmtUsd(report.market_structure.daily_volume)} />
            <Metric label="Holder Conc." value={report.market_structure.holder_concentration != null ? fmtPct(report.market_structure.holder_concentration * 100) : "—"} />
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <Badge variant="outline" className="text-[10px]">
              Utility Level {report.tokenomics.utility_level}/4
            </Badge>
            <Badge variant="outline" className="text-[10px]">
              Value Capture: {report.tokenomics.value_capture || "—"}
            </Badge>
            {report.tokenomics.buyback && <Badge className="bg-emerald-500/15 text-emerald-400 text-[10px]">Buyback</Badge>}
            {report.tokenomics.burn && <Badge className="bg-orange-500/15 text-orange-400 text-[10px]">Burn</Badge>}
            {report.tokenomics.unlock_risk && (
              <Badge variant="outline" className="text-[10px]">
                Unlock: {report.tokenomics.unlock_risk}
              </Badge>
            )}
          </div>
        </section>

        {/* Institutional adoption & moat */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <SectionTitle icon={BadgeCheck} title="Institutional Adoption" />
            <p className="text-xs text-muted-foreground leading-relaxed bg-muted/20 rounded-lg p-3 border border-border/40">
              {report.institutional_adoption}
            </p>
          </div>
          <div>
            <SectionTitle icon={ShieldCheck} title="Competitive Moat" />
            <p className="text-xs text-muted-foreground leading-relaxed bg-muted/20 rounded-lg p-3 border border-border/40">
              {report.competitive_moat}
            </p>
          </div>
        </section>

        {/* Cycle & Peer */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="border border-border/40 rounded-lg p-3 bg-card/30">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Cycle Phase</div>
            <div className="text-sm font-semibold flex items-center gap-2">
              <Activity className="h-4 w-4 text-emerald-500" />
              {report.cycle_phase}
            </div>
          </div>
          <div className="border border-border/40 rounded-lg p-3 bg-card/30">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Peer Benchmark</div>
            <div className="text-sm font-semibold">
              Percentile {report.peer_benchmark.peer_percentile?.toFixed(0) || "—"}% · Rank {report.peer_benchmark.category_rank || "—"}
            </div>
            {report.peer_benchmark.closest_comparables.length > 0 && (
              <div className="flex items-center gap-1 flex-wrap mt-1.5">
                {report.peer_benchmark.closest_comparables.map((c) => (
                  <Badge key={c} variant="outline" className="text-[10px]">{c}</Badge>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Catalysts */}
        <section>
          <SectionTitle icon={Zap} title="Catalyst Matrix" />
          <div className="space-y-1.5">
            {report.catalysts.map((c, i) => (
              <div
                key={i}
                className={cn(
                  "flex items-start gap-2 p-2 rounded-lg border text-xs",
                  c.positive
                    ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-300"
                    : "bg-rose-500/5 border-rose-500/20 text-rose-300",
                )}
              >
                {c.positive ? <TrendingUp className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" /> : <TrendingDown className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />}
                <span className="flex-1">{c.description}</span>
                {c.eta && <span className="text-[10px] opacity-70 font-mono">{c.eta}</span>}
              </div>
            ))}
          </div>
        </section>

        {/* Thesis */}
        <section>
          <SectionTitle icon={Target} title="Investment Thesis" />
          <div className="bg-gradient-to-br from-emerald-500/10 to-teal-600/5 border border-emerald-500/20 rounded-lg p-3">
            <p className="text-sm italic text-foreground/90 leading-relaxed">
              &ldquo;{report.final_thesis}&rdquo;
            </p>
          </div>
        </section>

        {/* Kill conditions */}
        <section>
          <SectionTitle icon={ShieldAlert} title="Thesis Kill Conditions" />
          <div className="space-y-1">
            {report.thesis_kill_conditions.map((k, i) => (
              <div key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                <span className="text-rose-500 font-mono mt-0.5">{i + 1}.</span>
                <span>{k}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Severe risks */}
        {report.severe_risks.some((r) => r.present) && (
          <section>
            <SectionTitle icon={AlertTriangle} title="Severe Risks Detected" />
            <div className="flex flex-wrap gap-1.5">
              {report.severe_risks.filter((r) => r.present).map((r) => (
                <Badge key={r.name} className="bg-rose-500/15 text-rose-400 border-rose-500/30 text-[10px]">
                  {r.name}
                </Badge>
              ))}
            </div>
          </section>
        )}

        {/* Five final answers */}
        <section>
          <SectionTitle icon={Brain} title="Five Final Questions" />
          <div className="space-y-2">
            {report.five_final_answers.map((a, i) => (
              <div key={i} className="flex gap-2.5 text-xs">
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400 text-[10px] font-bold flex-shrink-0">
                  {i + 1}
                </div>
                <p className="text-muted-foreground leading-relaxed pt-0.5">{a}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Data to verify */}
        {report.data_needing_verification.length > 0 && (
          <section>
            <SectionTitle icon={FlaskConical} title="Data Requiring Verification" />
            <div className="space-y-1">
              {report.data_needing_verification.map((d, i) => (
                <div key={i} className="flex items-start gap-2 text-[11px] text-muted-foreground">
                  <span className="text-amber-500">›</span>
                  <span>{d}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        <div className="pt-2 border-t border-border/40 text-[10px] text-muted-foreground font-mono">
          Data cutoff: {new Date(report.data_cutoff).toISOString().slice(0, 16).replace("T", " ")} UTC ·
          Report ID: {report.id}
        </div>
      </div>
    </div>
  );
}

function SectionTitle({ icon: Icon, title }: { icon: typeof Brain; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <Icon className="h-3.5 w-3.5 text-emerald-500" />
      <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground/80">{title}</h3>
    </div>
  );
}

function Metric({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "pos" | "neg" | "neutral";
}) {
  return (
    <div className="border border-border/40 rounded-lg p-2.5 bg-card/30">
      <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</div>
      <div
        className={cn(
          "text-sm font-mono font-semibold mt-0.5",
          tone === "pos" && "text-emerald-400",
          tone === "neg" && "text-rose-400",
          tone === "neutral" && "text-foreground",
        )}
      >
        {value}
      </div>
    </div>
  );
}
