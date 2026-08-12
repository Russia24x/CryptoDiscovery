"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  ArrowUpDown,
  BadgeCheck,
  Brain,
  ChartNoAxesColumn,
  CircleDollarSign,
  Clock,
  Crosshair,
  Download,
  Filter,
  FlaskConical,
  Gauge,
  GitCompare,
  Grid3x3,
  Layers,
  ListFilter,
  Loader2,
  Moon,
  PieChart,
  Radar,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Sun,
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
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ScoreRadial } from "@/components/dashboard/score-radial";
import { AxisRadarChart } from "@/components/dashboard/axis-radar-chart";
import { SectorDonut } from "@/components/dashboard/sector-donut";
import { RiskHeatmap } from "@/components/dashboard/risk-heatmap";
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
  // new: sorting & filtering
  const [sortBy, setSortBy] = useState<"quality" | "token" | "confidence" | "action">("quality");
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [sectorFilter, setSectorFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  // new: comparison mode
  const [compareMode, setCompareMode] = useState(false);
  const [compareIds, setCompareIds] = useState<Set<string>>(new Set());
  const [compareReports, setCompareReports] = useState<FullReport[]>([]);
  const [compareLoading, setCompareLoading] = useState(false);
  // view mode: grid or analytics
  const [viewMode, setViewMode] = useState<"grid" | "analytics">("grid");
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

  // --- new: comparison & export helpers ---
  const toggleCompare = (id: string) => {
    setCompareIds((cur) => {
      const next = new Set(cur);
      if (next.has(id)) {
        next.delete(id);
      } else {
        if (next.size >= 4) return cur; // max 4 for comparison
        next.add(id);
      }
      return next;
    });
  };

  const runComparison = async () => {
    if (compareIds.size < 2) return;
    setCompareLoading(true);
    try {
      const reports = await Promise.all(
        Array.from(compareIds).map(async (id) => {
          const r = await fetch(`/api/scanner/project/${id}`);
          return r.ok ? ((await r.json()) as FullReport) : null;
        }),
      );
      setCompareReports(reports.filter(Boolean) as FullReport[]);
    } catch {
    } finally {
      setCompareLoading(false);
    }
  };

  const exportReport = (report: FullReport, format: "json" | "markdown") => {
    let content: string;
    let mime: string;
    let ext: string;
    if (format === "json") {
      content = JSON.stringify(report, null, 2);
      mime = "application/json";
      ext = "json";
    } else {
      content = reportToMarkdown(report);
      mime = "text/markdown";
      ext = "md";
    }
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${report.candidate.symbol.toLowerCase()}-analysis.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggleSector = (s: string) => {
    setSectors((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));
  };

  // --- filtered & sorted reports ---
  const filteredReports = useMemo(() => {
    if (!activeScan?.reports) return [];
    let list = activeScan.reports.slice();
    if (actionFilter !== "all") {
      list = list.filter((r) => r.action.toLowerCase().includes(actionFilter));
    }
    if (sectorFilter !== "all") {
      list = list.filter((r) => r.sector === sectorFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.symbol.toLowerCase().includes(q) ||
          r.category.toLowerCase().includes(q),
      );
    }
    list.sort((a, b) => {
      switch (sortBy) {
        case "token":
          return (b.token_quality ?? 0) - (a.token_quality ?? 0);
        case "confidence":
          return b.confidence - a.confidence;
        case "action":
          return a.action.localeCompare(b.action);
        default:
          return b.project_quality - a.project_quality;
      }
    });
    return list;
  }, [activeScan?.reports, actionFilter, sectorFilter, searchQuery, sortBy]);

  // --- market overview stats ---
  const marketStats = useMemo(() => {
    if (!activeScan?.reports || activeScan.reports.length === 0) return null;
    const reports = activeScan.reports;
    const total = reports.length;
    const avgQ = reports.reduce((s, r) => s + r.project_quality, 0) / total;
    const avgConf = reports.reduce((s, r) => s + r.confidence, 0) / total;
    const highCount = reports.filter((r) => r.project_quality >= 70).length;
    const vetoCount = reports.filter((r) => r.veto).length;
    const sectorCounts: Record<string, number> = {};
    reports.forEach((r) => {
      sectorCounts[r.sector] = (sectorCounts[r.sector] ?? 0) + 1;
    });
    const topSector = Object.entries(sectorCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";
    return { total, avgQ, avgConf, highCount, vetoCount, topSector };
  }, [activeScan?.reports]);

  // unique sectors & actions for filter dropdowns
  const availableSectors = useMemo(() => {
    if (!activeScan?.reports) return [];
    return Array.from(new Set(activeScan.reports.map((r) => r.sector))).sort();
  }, [activeScan?.reports]);
  const availableActions = useMemo(() => {
    if (!activeScan?.reports) return [];
    const set = new Set<string>();
    activeScan.reports.forEach((r) => {
      const a = r.action.toLowerCase();
      if (a.includes("high conviction")) set.add("High Conviction");
      else if (a.includes("core")) set.add("Core");
      else if (a.includes("small")) set.add("Small");
      else if (a.includes("research")) set.add("Research");
      else if (a.includes("watch")) set.add("Watch");
      else set.add("Ignore");
    });
    return Array.from(set).sort();
  }, [activeScan?.reports]);

  // --- sector distribution data for donut chart ---
  const sectorDonutData = useMemo(() => {
    if (!activeScan?.reports) return [];
    const counts: Record<string, number> = {};
    activeScan.reports.forEach((r) => {
      counts[r.sector] = (counts[r.sector] ?? 0) + 1;
    });
    return Object.entries(counts)
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value);
  }, [activeScan?.reports]);

  // --- risk heatmap data ---
  const riskHeatmapData = useMemo(() => {
    if (!activeScan?.reports) return [];
    return activeScan.reports.map((r) => ({
      name: r.name,
      symbol: r.symbol,
      project_quality: r.project_quality,
      risks: [], // will be populated when full report is loaded
    }));
  }, [activeScan?.reports]);

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

            {/* Market Overview Stats */}
            {marketStats && (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <StatCard
                  icon={ChartNoAxesColumn}
                  label="Total Scanned"
                  value={marketStats.total.toString()}
                  color="text-sky-400"
                />
                <StatCard
                  icon={Gauge}
                  label="Avg Quality"
                  value={marketStats.avgQ.toFixed(1)}
                  color={scoreColor(marketStats.avgQ)}
                />
                <StatCard
                  icon={BadgeCheck}
                  label="Avg Confidence"
                  value={`${marketStats.avgConf.toFixed(0)}%`}
                  color="text-emerald-400"
                />
                <StatCard
                  icon={Target}
                  label="High Score (70+)"
                  value={marketStats.highCount.toString()}
                  color="text-lime-400"
                />
                <StatCard
                  icon={ShieldAlert}
                  label="Vetoed"
                  value={marketStats.vetoCount.toString()}
                  color={marketStats.vetoCount > 0 ? "text-rose-400" : "text-muted-foreground"}
                />
                <StatCard
                  icon={Layers}
                  label="Top Sector"
                  value={marketStats.topSector}
                  color="text-amber-400"
                />
              </div>
            )}

            {/* Reports grid with filtering */}
            {activeScan && activeScan.reports.length > 0 && (
              <div className="space-y-4">
                {/* Filter & sort toolbar */}
                <div className="flex flex-col gap-3 p-3 rounded-xl border border-border/50 bg-card/30 backdrop-blur-sm">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <h2 className="text-sm font-semibold flex items-center gap-2">
                      <ChartNoAxesColumn className="h-4 w-4 text-emerald-500" />
                      Ranked Candidates
                      <Badge variant="secondary" className="font-mono text-[10px]">
                        {filteredReports.length}
                        {filteredReports.length !== activeScan.reports.length && (
                          <span className="text-muted-foreground">/{activeScan.reports.length}</span>
                        )}
                      </Badge>
                    </h2>
                    <div className="flex items-center gap-2">
                      {/* View mode toggle */}
                      <div className="flex items-center rounded-lg border border-border/50 bg-muted/20 p-0.5">
                        <button
                          onClick={() => setViewMode("grid")}
                          className={cn(
                            "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-all",
                            viewMode === "grid"
                              ? "bg-emerald-500/15 text-emerald-400"
                              : "text-muted-foreground hover:text-foreground",
                          )}
                        >
                          <Grid3x3 className="h-3.5 w-3.5" />
                          Grid
                        </button>
                        <button
                          onClick={() => setViewMode("analytics")}
                          className={cn(
                            "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-all",
                            viewMode === "analytics"
                              ? "bg-emerald-500/15 text-emerald-400"
                              : "text-muted-foreground hover:text-foreground",
                          )}
                        >
                          <PieChart className="h-3.5 w-3.5" />
                          Analytics
                        </button>
                      </div>
                      {/* Compare mode toggle */}
                      <Button
                        variant={compareMode ? "default" : "outline"}
                        size="sm"
                        onClick={() => {
                          setCompareMode(!compareMode);
                          if (compareMode) setCompareIds(new Set());
                        }}
                        className={cn(
                          "h-8 text-xs gap-1.5",
                          compareMode && "bg-gradient-to-r from-violet-500 to-purple-600 text-white border-transparent",
                        )}
                      >
                        <GitCompare className="h-3.5 w-3.5" />
                        Compare
                        {compareIds.size > 0 && (
                          <Badge className="ml-1 bg-white/20 text-white text-[9px] px-1.5 py-0">
                            {compareIds.size}
                          </Badge>
                        )}
                      </Button>
                      {compareMode && compareIds.size >= 2 && (
                        <Button
                          size="sm"
                          onClick={runComparison}
                          disabled={compareLoading}
                          className="h-8 text-xs bg-gradient-to-r from-violet-500 to-purple-600 text-white"
                        >
                          {compareLoading ? (
                            <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                          ) : (
                            <GitCompare className="h-3.5 w-3.5 mr-1" />
                          )}
                          View ({compareIds.size})
                        </Button>
                      )}
                    </div>
                  </div>
                  {viewMode === "grid" && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="relative flex-1 min-w-[160px]">
                        <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <Input
                          placeholder="Search name, symbol, category..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="h-8 pl-8 text-xs"
                        />
                      </div>
                      <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
                        <SelectTrigger className="h-8 w-[140px] text-xs">
                          <ArrowUpDown className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="quality">Project Quality</SelectItem>
                          <SelectItem value="token">Token Quality</SelectItem>
                          <SelectItem value="confidence">Confidence</SelectItem>
                          <SelectItem value="action">Action</SelectItem>
                        </SelectContent>
                      </Select>
                      <Select value={actionFilter} onValueChange={setActionFilter}>
                        <SelectTrigger className="h-8 w-[130px] text-xs">
                          <SelectValue placeholder="Action" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Actions</SelectItem>
                          {availableActions.map((a) => (
                            <SelectItem key={a} value={a.toLowerCase()}>{a}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {availableSectors.length > 0 && (
                        <Select value={sectorFilter} onValueChange={setSectorFilter}>
                          <SelectTrigger className="h-8 w-[130px] text-xs">
                            <SelectValue placeholder="Sector" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All Sectors</SelectItem>
                            {availableSectors.map((s) => (
                              <SelectItem key={s} value={s}>{s}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      {(actionFilter !== "all" || sectorFilter !== "all" || searchQuery || sortBy !== "quality") && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setActionFilter("all");
                            setSectorFilter("all");
                            setSearchQuery("");
                            setSortBy("quality");
                          }}
                          className="h-8 text-xs text-muted-foreground hover:text-foreground"
                        >
                          Reset
                        </Button>
                      )}
                    </div>
                  )}
                </div>

                {/* Grid view */}
                {viewMode === "grid" && (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                    {filteredReports.map((r) => (
                      <ProjectCard
                        key={r.id}
                        report={r}
                        onSelect={() => loadReport(r.id)}
                        compareMode={compareMode}
                        compareSelected={compareIds.has(r.id)}
                        onToggleCompare={() => toggleCompare(r.id)}
                      />
                    ))}
                    {filteredReports.length === 0 && (
                      <div className="col-span-full flex flex-col items-center justify-center py-12 text-center">
                        <ListFilter className="h-8 w-8 text-muted-foreground/50 mb-2" />
                        <p className="text-sm text-muted-foreground">No projects match your filters</p>
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-3 h-8 text-xs"
                          onClick={() => {
                            setActionFilter("all");
                            setSectorFilter("all");
                            setSearchQuery("");
                            setSortBy("quality");
                          }}
                        >
                          Clear filters
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                {/* Analytics view */}
                {viewMode === "analytics" && (
                  <div className="space-y-4">
                    {/* Sector distribution + action distribution */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      <Card className="border-border/50 bg-card/30 backdrop-blur-sm">
                        <CardHeader className="pb-2">
                          <CardTitle className="flex items-center gap-2 text-sm">
                            <PieChart className="h-4 w-4 text-emerald-500" />
                            Sector Distribution
                          </CardTitle>
                          <CardDescription className="text-xs">
                            Projects by sector category
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="flex justify-center pt-2">
                          {sectorDonutData.length > 0 ? (
                            <SectorDonut
                              data={sectorDonutData}
                              centerLabel="Projects"
                              centerValue={sectorDonutData.reduce((s, d) => s + d.value, 0)}
                              size={200}
                            />
                          ) : (
                            <p className="text-xs text-muted-foreground py-12">No sector data</p>
                          )}
                        </CardContent>
                      </Card>

                      <Card className="border-border/50 bg-card/30 backdrop-blur-sm">
                        <CardHeader className="pb-2">
                          <CardTitle className="flex items-center gap-2 text-sm">
                            <Target className="h-4 w-4 text-emerald-500" />
                            Action Distribution
                          </CardTitle>
                          <CardDescription className="text-xs">
                            Investment recommendations breakdown
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="pt-2">
                          <ActionDistribution reports={activeScan.reports} />
                        </CardContent>
                      </Card>
                    </div>

                    {/* Quality score distribution */}
                    <Card className="border-border/50 bg-card/30 backdrop-blur-sm">
                      <CardHeader className="pb-2">
                        <CardTitle className="flex items-center gap-2 text-sm">
                          <Gauge className="h-4 w-4 text-emerald-500" />
                          Quality Score Distribution
                        </CardTitle>
                        <CardDescription className="text-xs">
                          Histogram of project quality scores
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="pt-2">
                        <ScoreHistogram reports={activeScan.reports} />
                      </CardContent>
                    </Card>
                  </div>
                )}
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
          <SheetDescription className="sr-only">
            Detailed project analysis report with all framework sections
          </SheetDescription>
          {selectedReport ? (
            <ReportDetail report={selectedReport} onExport={exportReport} />
          ) : reportLoading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      {/* ----------------------------------------------------------------- */}
      {/*  Comparison dialog                                                 */}
      {/* ----------------------------------------------------------------- */}
      <Sheet
        open={compareReports.length > 0}
        onOpenChange={(o) => !o && setCompareReports([])}
      >
        <SheetContent side="right" className="w-full sm:max-w-5xl lg:max-w-6xl p-0 overflow-y-auto">
          <SheetDescription className="sr-only">
            Side-by-side comparison of selected projects
          </SheetDescription>
          <ComparisonView reports={compareReports} />
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
        <div className="flex items-center gap-1 flex-wrap">
          {phases.map((p, i) => {
            const done = phaseIndex > i || scan.status === "completed";
            const current = phaseIndex === i && scan.status !== "completed";
            return (
              <div key={p} className="flex items-center gap-1 flex-shrink-0">
                <div
                  className={cn(
                    "flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-medium border transition-all",
                    done && "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
                    current && "bg-sky-500/15 text-sky-400 border-sky-500/40 shadow-sm shadow-sky-500/20",
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
                {i < phases.length - 1 && (
                  <ArrowRight className="h-3 w-3 text-muted-foreground/30 flex-shrink-0" />
                )}
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

function ProjectCard({
  report,
  onSelect,
  compareMode = false,
  compareSelected = false,
  onToggleCompare,
}: {
  report: ScanSummaryItem;
  onSelect: () => void;
  compareMode?: boolean;
  compareSelected?: boolean;
  onToggleCompare?: () => void;
}) {
  const ab = actionBadge(report.action);
  return (
    <div
      className={cn(
        "group relative text-left p-4 rounded-xl border bg-card/40 hover:bg-card/80 transition-all overflow-hidden",
        compareSelected
          ? "border-violet-500/60 ring-2 ring-violet-500/20"
          : "border-border/50 hover:border-emerald-500/40",
      )}
    >
      {/* score accent bar */}
      <div className={cn("absolute top-0 left-0 right-0 h-0.5", scoreBg(report.project_quality))} />

      {compareMode && (
        <div className="absolute top-2 right-2 z-10">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleCompare?.();
            }}
            className={cn(
              "flex h-5 w-5 items-center justify-center rounded border transition-all",
              compareSelected
                ? "bg-violet-500 border-violet-500 text-white"
                : "bg-background/60 border-border hover:border-violet-500/50",
            )}
          >
            {compareSelected && <BadgeCheck className="h-3.5 w-3.5" />}
          </button>
        </div>
      )}

      <button onClick={onSelect} className="w-full text-left">
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
    </div>
  );
}

function ReportDetail({
  report,
  onExport,
}: {
  report: FullReport;
  onExport?: (r: FullReport, format: "json" | "markdown") => void;
}) {
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
          <div className="flex items-center gap-3 flex-shrink-0">
            {onExport && (
              <div className="flex items-center gap-1">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => onExport(report, "markdown")}
                      >
                        <Download className="h-3.5 w-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Export as Markdown</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-[11px]"
                  onClick={() => onExport(report, "json")}
                >
                  JSON
                </Button>
              </div>
            )}
            <ScoreRadial
              score={report.project_quality_score}
              label="Quality"
              size={64}
              strokeWidth={5}
            />
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
          <div className={cn(
            "relative rounded-lg p-4 border overflow-hidden",
            report.veto.triggered
              ? "bg-gradient-to-br from-rose-500/10 to-rose-600/5 border-rose-500/30"
              : report.project_quality_score >= 70
              ? "bg-gradient-to-br from-emerald-500/10 to-teal-600/5 border-emerald-500/30"
              : report.project_quality_score >= 50
              ? "bg-gradient-to-br from-amber-500/10 to-orange-600/5 border-amber-500/30"
              : "bg-gradient-to-br from-muted/40 to-muted/10 border-border/40",
          )}>
            <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-emerald-500/50 to-transparent" />
            <p className="text-sm leading-relaxed text-foreground/90 pl-2">
              {report.executive_verdict}
            </p>
          </div>
        </section>

        {/* 5 Fundamental Axes */}
        <section>
          <div className="flex items-center justify-between gap-2 mb-2">
            <SectionTitle icon={Gauge} title="Five Fundamental Axes" />
          </div>
          {/* Radar chart visualization */}
          <div className="flex justify-center mb-4 p-3 rounded-lg border border-border/40 bg-card/20">
            <AxisRadarChart axes={report.axes} size={260} />
          </div>
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

// --------------------------------------------------------------------------- //
//  StatCard — small KPI tile for the market overview bar
// --------------------------------------------------------------------------- //
function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: typeof Brain;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="flex items-center gap-2.5 p-3 rounded-xl border border-border/50 bg-card/40 backdrop-blur-sm">
      <div className={cn("flex h-9 w-9 items-center justify-center rounded-lg bg-muted/30 flex-shrink-0", color)}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <div className="text-[10px] text-muted-foreground uppercase tracking-wide truncate">{label}</div>
        <div className={cn("text-sm font-bold tabular-nums truncate", color)}>{value}</div>
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------- //
//  ComparisonView — side-by-side project comparison
// --------------------------------------------------------------------------- //
function ComparisonView({ reports }: { reports: FullReport[] }) {
  if (reports.length === 0) return null;

  const rows: { label: string; getValue: (r: FullReport) => string; getColor?: (r: FullReport) => string }[] = [
    { label: "Project Quality", getValue: (r) => r.project_quality_score.toFixed(1), getColor: (r) => scoreColor(r.project_quality_score) },
    { label: "Token Quality", getValue: (r) => r.token_quality_score?.toFixed(1) ?? "—", getColor: (r) => (r.token_quality_score != null ? scoreColor(r.token_quality_score) : "text-muted-foreground") },
    { label: "Confidence", getValue: (r) => `${r.confidence.toFixed(0)}%` },
    { label: "Risk-Adjusted", getValue: (r) => r.decision.risk_adjusted_score.toFixed(0) },
    { label: "Action", getValue: (r) => r.decision.action_label },
    { label: "Valuation", getValue: (r) => r.valuation_label },
    { label: "Investment Attr.", getValue: (r) => r.investment_attractiveness_score?.toFixed(0) ?? "—" },
    { label: "Evidence Grade", getValue: (r) => r.evidence_grade.split(" - ")[0] },
    { label: "Cycle Phase", getValue: (r) => r.cycle_phase.replace("Phase ", "P") },
    { label: "Category", getValue: (r) => r.candidate.category },
    { label: "Sector", getValue: (r) => r.candidate.sector },
    { label: "TVL", getValue: (r) => fmtUsd(r.economic_engine.tvl) },
    { label: "Revenue (24h)", getValue: (r) => fmtUsd(r.economic_engine.revenue) },
    { label: "Fees (24h)", getValue: (r) => fmtUsd(r.economic_engine.fees) },
    { label: "Market Cap", getValue: (r) => fmtUsd(r.tokenomics.market_cap) },
    { label: "FDV", getValue: (r) => fmtUsd(r.tokenomics.fdv) },
    { label: "Supply Growth", getValue: (r) => fmtPct(r.tokenomics.supply_growth_pct) },
    { label: "Utility Level", getValue: (r) => `${r.tokenomics.utility_level}/4` },
    { label: "Peer Percentile", getValue: (r) => r.peer_benchmark.peer_percentile?.toFixed(0) + "%" ?? "—" },
  ];

  const axisRows = reports[0]?.axes.map((ax) => ax.name) ?? [];

  return (
    <div>
      <SheetHeader className="px-6 pt-6 pb-4 border-b border-border/60 sticky top-0 bg-background/95 backdrop-blur z-10">
        <SheetTitle className="flex items-center gap-2 text-base">
          <GitCompare className="h-5 w-5 text-violet-400" />
          Project Comparison
          <Badge variant="secondary" className="font-mono text-[10px]">{reports.length}</Badge>
        </SheetTitle>
        <p className="text-xs text-muted-foreground">
          Side-by-side comparison across {rows.length + axisRows.length} metrics
        </p>
      </SheetHeader>

      <div className="px-6 py-5">
        {/* Project headers */}
        <div
          className="grid gap-3 mb-4 sticky top-[88px] bg-background/80 backdrop-blur z-10 py-2"
          style={{ gridTemplateColumns: `140px repeat(${reports.length}, minmax(0, 1fr))` }}
        >
          <div></div>
          {reports.map((r) => (
            <div key={r.id} className="flex items-center gap-2 p-2 rounded-lg border border-border/40 bg-card/40">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted/40 border border-border/40 overflow-hidden flex-shrink-0">
                {r.candidate.image ? (
                  <img src={r.candidate.image} alt={r.candidate.symbol} className="h-full w-full object-cover" />
                ) : (
                  <span className="text-[10px] font-bold">{r.candidate.symbol.slice(0, 3)}</span>
                )}
              </div>
              <div className="min-w-0">
                <div className="text-xs font-semibold truncate">{r.candidate.name}</div>
                <div className="text-[10px] text-muted-foreground font-mono">${r.candidate.symbol}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Comparison rows */}
        <div className="space-y-0.5">
          {/* Core metrics */}
          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground py-1.5">
            Core Metrics
          </div>
          {rows.map((row, i) => {
            const values = reports.map(row.getValue);
            const maxIdx = values.reduce((best, v, idx) => {
              const num = parseFloat(v.replace(/[^0-9.-]/g, ""));
              const bestNum = parseFloat(values[best].replace(/[^0-9.-]/g, ""));
              if (isNaN(num) || isNaN(bestNum)) return best;
              return num > bestNum ? idx : best;
            }, 0);
            return (
              <div
                key={row.label}
                className={cn(
                  "grid gap-3 py-1.5 px-2 rounded items-center",
                  i % 2 === 0 ? "bg-muted/10" : "",
                  "hover:bg-emerald-500/5 transition-colors",
                )}
                style={{ gridTemplateColumns: `140px repeat(${reports.length}, minmax(0, 1fr))` }}
              >
                <div className="text-[11px] text-muted-foreground font-medium">{row.label}</div>
                {reports.map((r, idx) => (
                  <div
                    key={r.id}
                    className={cn(
                      "text-xs font-mono font-semibold",
                      row.getColor?.(r) ?? "text-foreground",
                      idx === maxIdx && !isNaN(parseFloat(values[idx].replace(/[^0-9.-]/g, ""))) && "flex items-center gap-1",
                    )}
                  >
                    {row.getValue(r)}
                    {idx === maxIdx && !isNaN(parseFloat(values[idx].replace(/[^0-9.-]/g, ""))) && values.length > 1 && (
                      <BadgeCheck className="h-3 w-3 text-emerald-400" />
                    )}
                  </div>
                ))}
              </div>
            );
          })}

          {/* Axis breakdown */}
          {axisRows.length > 0 && (
            <>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground py-1.5 pt-4">
                Fundamental Axes (0-10)
              </div>
              {axisRows.map((axisName, i) => {
                const axisValues = reports.map((r) => r.axes.find((a) => a.name === axisName));
                const scores = axisValues.map((a) => a?.score ?? 0);
                const maxScore = Math.max(...scores);
                return (
                  <div
                    key={axisName}
                    className={cn(
                      "grid gap-3 py-1.5 px-2 rounded items-center",
                      i % 2 === 0 ? "bg-muted/10" : "",
                    )}
                    style={{ gridTemplateColumns: `140px repeat(${reports.length}, minmax(0, 1fr))` }}
                  >
                    <div className="text-[11px] text-muted-foreground font-medium truncate">{axisName}</div>
                    {axisValues.map((ax, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <span className={cn("text-xs font-mono font-semibold w-8", scoreColor(ax?.score ?? 0, 10))}>
                          {ax?.score.toFixed(1) ?? "—"}
                        </span>
                        <div className="flex-1 h-1.5 rounded-full bg-muted/40 overflow-hidden">
                          <div
                            className={cn("h-full rounded-full", scoreBg(ax?.score ?? 0, 10))}
                            style={{ width: `${((ax?.score ?? 0) / 10) * 100}%` }}
                          />
                        </div>
                        {(ax?.score ?? 0) === maxScore && reports.length > 1 && (
                          <BadgeCheck className="h-3 w-3 text-emerald-400 flex-shrink-0" />
                        )}
                      </div>
                    ))}
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------- //
//  reportToMarkdown — serialize a FullReport to Markdown for export
// --------------------------------------------------------------------------- //
function reportToMarkdown(r: FullReport): string {
  const lines: string[] = [];
  lines.push(`# ${r.candidate.name} (${r.candidate.symbol})`);
  lines.push("");
  lines.push(`> ${r.final_thesis}`);
  lines.push("");
  lines.push(`**Data Cutoff:** ${new Date(r.data_cutoff).toISOString()}`);
  lines.push(`**Evidence Grade:** ${r.evidence_grade}`);
  lines.push("");

  lines.push("## Executive Verdict");
  lines.push(r.executive_verdict);
  lines.push("");

  lines.push("## Scores");
  lines.push(`- **Project Quality:** ${r.project_quality_score}/100`);
  lines.push(`- **Token Quality:** ${r.token_quality_score ?? "N/A"}/100`);
  lines.push(`- **Investment Attractiveness:** ${r.investment_attractiveness_score ?? "N/A"}/100`);
  lines.push(`- **Confidence:** ${r.confidence}%`);
  lines.push(`- **Risk-Adjusted Score:** ${r.decision.risk_adjusted_score}`);
  lines.push(`- **Action:** ${r.decision.action_label}`);
  lines.push(`- **Valuation:** ${r.valuation_label}`);
  lines.push("");

  lines.push("## Five Fundamental Axes");
  lines.push("| Axis | Score | Confidence | Key Reason |");
  lines.push("|------|-------|------------|------------|");
  r.axes.forEach((ax) => {
    lines.push(`| ${ax.name} | ${ax.score.toFixed(1)}/10 | ${ax.confidence.toFixed(0)}% | ${ax.key_reason} |`);
  });
  lines.push("");

  lines.push("## Economic Engine");
  const e = r.economic_engine;
  lines.push(`- TVL: ${fmtUsd(e.tvl)}`);
  lines.push(`- Fees (24h): ${fmtUsd(e.fees)}`);
  lines.push(`- Revenue (24h): ${fmtUsd(e.revenue)}`);
  lines.push(`- Net Revenue: ${fmtUsd(e.net_revenue)}`);
  lines.push(`- Revenue Growth: ${fmtPct(e.revenue_growth_pct)}`);
  lines.push(`- AUM: ${fmtUsd(e.aum)}`);
  lines.push(`- Recurrence: ${e.recurrence ?? "—"}`);
  lines.push("");

  lines.push("## Tokenomics");
  const t = r.tokenomics;
  lines.push(`- Market Cap: ${fmtUsd(t.market_cap)}`);
  lines.push(`- FDV: ${fmtUsd(t.fdv)}`);
  lines.push(`- Supply Growth: ${fmtPct(t.supply_growth_pct)}`);
  lines.push(`- Insider Allocation: ${fmtPct(t.insider_allocation_pct)}`);
  lines.push(`- Utility Level: ${t.utility_level}/4`);
  lines.push(`- Value Capture: ${t.value_capture ?? "—"}`);
  lines.push(`- Buyback: ${t.buyback ?? "—"}`);
  lines.push(`- Burn: ${t.burn ?? "—"}`);
  lines.push("");

  lines.push("## Institutional Adoption");
  lines.push(r.institutional_adoption);
  lines.push("");

  lines.push("## Competitive Moat");
  lines.push(r.competitive_moat);
  lines.push("");

  lines.push("## Cycle Phase");
  lines.push(r.cycle_phase);
  lines.push("");

  lines.push("## Peer Benchmark");
  lines.push(`- Percentile: ${r.peer_benchmark.peer_percentile?.toFixed(0) ?? "—"}%`);
  lines.push(`- Rank: ${r.peer_benchmark.category_rank ?? "—"}`);
  lines.push(`- Comparables: ${r.peer_benchmark.closest_comparables.join(", ") || "—"}`);
  lines.push("");

  lines.push("## Catalysts");
  r.catalysts.forEach((c) => {
    lines.push(`- ${c.positive ? "✅" : "⚠️"} ${c.description}${c.eta ? ` _(${c.eta})_` : ""}`);
  });
  lines.push("");

  lines.push("## Thesis Kill Conditions");
  r.thesis_kill_conditions.forEach((k, i) => {
    lines.push(`${i + 1}. ${k}`);
  });
  lines.push("");

  if (r.severe_risks.some((sr) => sr.present)) {
    lines.push("## Severe Risks");
    r.severe_risks.filter((sr) => sr.present).forEach((sr) => {
      lines.push(`- ${sr.name}`);
    });
    lines.push("");
  }

  lines.push("## Five Final Questions");
  r.five_final_answers.forEach((a, i) => {
    lines.push(`${i + 1}. ${a}`);
  });
  lines.push("");

  if (r.data_needing_verification.length > 0) {
    lines.push("## Data Requiring Verification");
    r.data_needing_verification.forEach((d) => {
      lines.push(`- ${d}`);
    });
    lines.push("");
  }

  lines.push("---");
  lines.push("*Generated by Crypto Discovery Framework v1.0 · Not personalized financial advice*");

  return lines.join("\n");
}

// --------------------------------------------------------------------------- //
//  ActionDistribution — horizontal bar chart of action recommendations
// --------------------------------------------------------------------------- //
function ActionDistribution({ reports }: { reports: ScanSummaryItem[] }) {
  const counts: Record<string, { count: number; cls: string }> = {};
  reports.forEach((r) => {
    const a = r.action.toLowerCase();
    let key: string;
    let cls: string;
    if (a.includes("high conviction")) { key = "High Conviction"; cls = "bg-emerald-500"; }
    else if (a.includes("core")) { key = "Core Candidate"; cls = "bg-lime-500"; }
    else if (a.includes("small")) { key = "Small Position"; cls = "bg-amber-500"; }
    else if (a.includes("research")) { key = "Deep Research"; cls = "bg-sky-500"; }
    else if (a.includes("watch")) { key = "Watch"; cls = "bg-slate-400"; }
    else { key = "Ignore"; cls = "bg-rose-500"; }
    if (!counts[key]) counts[key] = { count: 0, cls };
    counts[key].count++;
  });

  const entries = Object.entries(counts).sort((a, b) => b[1].count - a[1].count);
  const max = Math.max(...entries.map(([, v]) => v.count), 1);
  const total = reports.length;

  if (entries.length === 0) {
    return <p className="text-xs text-muted-foreground py-8 text-center">No data</p>;
  }

  return (
    <div className="space-y-2.5">
      {entries.map(([label, { count, cls }]) => (
        <div key={label} className="space-y-1">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-medium">{label}</span>
            <span className="text-muted-foreground font-mono">
              {count} <span className="opacity-60">({((count / total) * 100).toFixed(0)}%)</span>
            </span>
          </div>
          <div className="h-2.5 rounded-full bg-muted/30 overflow-hidden">
            <div
              className={cn("h-full rounded-full transition-all duration-700", cls)}
              style={{ width: `${(count / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

// --------------------------------------------------------------------------- //
//  ScoreHistogram — vertical bar histogram of quality scores
// --------------------------------------------------------------------------- //
function ScoreHistogram({ reports }: { reports: ScanSummaryItem[] }) {
  const buckets = [
    { label: "0-20", min: 0, max: 20, color: "bg-rose-500" },
    { label: "20-40", min: 20, max: 40, color: "bg-orange-500" },
    { label: "40-55", min: 40, max: 55, color: "bg-amber-500" },
    { label: "55-70", min: 55, max: 70, color: "bg-lime-500" },
    { label: "70-85", min: 70, max: 85, color: "bg-emerald-500" },
    { label: "85-100", min: 85, max: 101, color: "bg-teal-500" },
  ];

  const counts = buckets.map((b) => ({
    ...b,
    count: reports.filter((r) => r.project_quality >= b.min && r.project_quality < b.max).length,
  }));
  const max = Math.max(...counts.map((c) => c.count), 1);

  return (
    <div className="flex items-end justify-between gap-2 h-40 px-2">
      {counts.map((b) => (
        <div key={b.label} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end">
          <span className="text-xs font-mono font-semibold text-foreground">{b.count > 0 ? b.count : ""}</span>
          <div className="w-full flex-1 flex items-end">
            <div
              className={cn("w-full rounded-t-md transition-all duration-700 min-h-[2px]", b.color)}
              style={{ height: `${(b.count / max) * 100}%`, opacity: b.count > 0 ? 1 : 0.15 }}
            />
          </div>
          <span className="text-[10px] text-muted-foreground font-mono">{b.label}</span>
        </div>
      ))}
    </div>
  );
}
