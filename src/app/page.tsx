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
  Copy,
  Crosshair,
  Download,
  ExternalLink,
  Filter,
  FlaskConical,
  Gauge,
  GitCompare,
  Github,
  Globe,
  Grid3x3,
  History,
  Layers,
  LayoutGrid,
  ListFilter,
  Loader2,
  MessageCircle,
  Moon,
  Newspaper,
  PieChart,
  Radar,
  Search,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Star,
  Sun,
  Target,
  HelpCircle,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Twitter,
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
import { CoinExplorerView } from "@/components/views/coin-explorer-view";
import { MarketIntelligenceView } from "@/components/views/market-intelligence-view";
import { NewsFeedView } from "@/components/views/news-feed-view";
import { HubView } from "@/components/views/hub-view";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageToggle } from "@/components/language-toggle";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import {
  fmtUsd,
  fmtPct,
  scoreColor,
  scoreBg,
  actionBadge,
  translateAxisName,
  translateSubFactor,
} from "@/lib/format-utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useIndexedDBSet, useIndexedDBList } from "@/lib/use-indexed-db";
import { cn } from "@/lib/utils";

// --------------------------------------------------------------------------- //
//  Types (mirror the Python schemas)
// --------------------------------------------------------------------------- //
type Persona = "researcher" | "investor" | "institutional" | "developer" | "trader" | "comprehensive";

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
  website?: string | null;
  twitter?: string | null;
  github?: string | null;
  gecko_id?: string | null;
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
    twitter: string | null;
    github: string | null;
    discord: string | null;
    blockchain_explorer: string | null;
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
  // Framework 3.0 additions
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
//  Helpers
// --------------------------------------------------------------------------- //
const AXIS_ICONS: Record<string, typeof Brain> = {
  "Invisible Utility": Radar,
  "Economic Engine": CircleDollarSign,
  "Moat": ShieldCheck,
  "Token & Market Structure": Layers,
  "Governance / Legal / Security": ShieldAlert,
};

const PERSONAS: { value: Persona; label: string; desc: string }[] = [
  { value: "comprehensive", label: "Comprehensive", desc: "Balanced across all axes" },
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
  const { t, lang, dir } = useLanguage();
  const [persona, setPersona] = useState<Persona>("investor");
  const [mcMin, setMcMin] = useState("100");
  const [mcMax, setMcMax] = useState("50000");
  const [maxProjects, setMaxProjects] = useState("12");
  const [sectors, setSectors] = useState<string[]>([]);
  // Custom persona weights (0-100 each, normalized to 1.0 before sending)
  const [useCustomWeights, setUseCustomWeights] = useState(false);
  const [customWeights, setCustomWeights] = useState({
    "Invisible Utility": 20,
    "Economic Engine": 30,
    "Moat": 20,
    "Token & Market Structure": 15,
    "Governance / Legal / Security": 15,
  });

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
  // risk heatmap data (full reports fetched on demand)
  const [riskReports, setRiskReports] = useState<FullReport[]>([]);
  const [riskLoading, setRiskLoading] = useState(false);
  // watchlist (persisted to IndexedDB with localStorage fallback)
  const watchlistDB = useIndexedDBSet("watchlist");
  const watchlist = watchlistDB.items;
  const [showWatchlist, setShowWatchlist] = useState(false);
  // recently viewed projects (persisted to IndexedDB with localStorage fallback)
  const recentlyViewedDB = useIndexedDBList("recentlyViewed", 5);
  const recentlyViewed = recentlyViewedDB.items;
  // toast notifications
  const { toast } = useToast();
  // scan history comparison
  const [showHistory, setShowHistory] = useState(false);
  const [historyScans, setHistoryScans] = useState<ScanStatus[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  // global search across all scans
  const [showGlobalSearch, setShowGlobalSearch] = useState(false);
  const [globalSearchQuery, setGlobalSearchQuery] = useState("");
  const [globalSearchResults, setGlobalSearchResults] = useState<{ scan: ScanListItem; report: ScanSummaryItem }[]>([]);
  const [globalSearchLoading, setGlobalSearchLoading] = useState(false);
  // scan diff view
  const [showScanDiff, setShowScanDiff] = useState(false);
  const [diffScanA, setDiffScanA] = useState<ScanStatus | null>(null);
  const [diffScanB, setDiffScanB] = useState<ScanStatus | null>(null);
  // help dialog
  const [showHelp, setShowHelp] = useState(false);
  // main view tab: hub (landing) | discovery (scan) | explorer (manual coin analysis) | market (intelligence) | news (feed)
  const [mainView, setMainView] = useState<"hub" | "discovery" | "explorer" | "market" | "news">("hub");
  // when set, Coin Explorer auto-loads this coin (triggered from Market Intelligence click)
  const [explorerInitialId, setExplorerInitialId] = useState<string | null>(null);
  // search input ref for keyboard shortcut
  const searchInputRef = useRef<HTMLInputElement>(null);
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
    // Check for shared scan in URL (?scan=xxx)
    const params = new URLSearchParams(window.location.search);
    const sharedScanId = params.get("scan");
    if (sharedScanId) {
      setMainView("discovery");
      fetch(`/api/scanner/scan/${sharedScanId}`)
        .then((r) => r.ok ? r.json() : null)
        .then((data) => {
          if (data) {
            setActiveScan(data);
            setScanning(data.status === "running" || data.status === "queued");
          }
        })
        .catch(() => {});
    }
  }, [refreshScans]);

  // Alert system — poll for score changes every 60s and show browser notifications
  const lastAlertKey = useRef<string>("");
  useEffect(() => {
    const checkAlerts = async () => {
      try {
        const res = await fetch("/api/scanner/alerts?threshold=10");
        if (!res.ok) return;
        const data = await res.json();
        if (data.alerts && data.alerts.length > 0) {
          // Use the most recent alert as the key to avoid duplicate notifications
          const latest = data.alerts[0];
          const key = `${latest.symbol}-${latest.timestamp}`;
          if (key !== lastAlertKey.current) {
            lastAlertKey.current = key;
            // Show toast notification
            toast({
              title: `📊 ${latest.symbol} Score Alert`,
              description: latest.message,
              variant: latest.type === "score_increase" ? "default" : "destructive",
            });
            // Show browser notification if permitted
            if (typeof Notification !== "undefined" && Notification.permission === "granted") {
              new Notification(`📊 ${latest.symbol} Score Alert`, { body: latest.message });
            }
          }
        }
      } catch {}
    };
    // Check immediately, then every 60s
    checkAlerts();
    const id = setInterval(checkAlerts, 60_000);
    return () => clearInterval(id);
  }, [toast]);

  // Request notification permission on first user interaction
  const requestNotificationPermission = useCallback(() => {
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);
  useEffect(() => {
    const handler = () => { requestNotificationPermission(); document.removeEventListener("click", handler); };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [requestNotificationPermission]);

  // Ref to always have latest startScan (avoids stale closure in keyboard handler)
  const startScanRef = useRef<() => void>(() => {});

  // keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // don't trigger when typing in inputs (except for Escape and Ctrl+K)
      const tag = (e.target as HTMLElement)?.tagName;
      const isInput = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
      if (isInput && e.key !== "Escape" && !(e.key === "k" && (e.ctrlKey || e.metaKey))) return;

      // Ctrl+K / Cmd+K = global search
      if (e.key === "k" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setShowGlobalSearch((s) => !s);
        return;
      }

      if (e.key === "s" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        if (!scanning) startScanRef.current();
      } else if (e.key === "/" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.key === "g" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setViewMode("grid");
      } else if (e.key === "a" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setViewMode("analytics");
      } else if (e.key === "c" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setCompareMode((m) => !m);
      } else if (e.key === "w" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setShowWatchlist((w) => !w);
      } else if (e.key === "Escape") {
        if (selectedReport) {
          setSelectedReport(null);
        } else if (compareReports.length > 0) {
          setCompareReports([]);
        } else if (showGlobalSearch) {
          setShowGlobalSearch(false);
          setGlobalSearchQuery("");
          setGlobalSearchResults([]);
        } else if (showWatchlist) {
          setShowWatchlist(false);
        } else if (showHistory) {
          setShowHistory(false);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [scanning, selectedReport, compareReports.length, showWatchlist, showGlobalSearch, showHistory]);

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
            // Show completion toast
            if (data.status === "completed" && data.reports.length > 0) {
              const reports = data.reports;
              const avgQ = reports.reduce((s, r) => s + r.project_quality, 0) / reports.length;
              const topProject = reports.reduce((best, r) => r.project_quality > best.project_quality ? r : best, reports[0]);
              toast({
                title: t("toast.scanCompleted"),
                description: t("toast.scanCompletedDesc", { count: reports.length, q: avgQ.toFixed(1), name: topProject.name, score: topProject.project_quality.toFixed(0) }),
              });
            } else if (data.status === "failed") {
              toast({
                title: t("toast.scanFailed"),
                description: data.error || t("toast.unknownError"),
                variant: "destructive",
              });
            }
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
          lang,
          ...(useCustomWeights ? {
            custom_weights: {
              "Invisible Utility": customWeights["Invisible Utility"] / 100,
              "Economic Engine": customWeights["Economic Engine"] / 100,
              "Moat": customWeights["Moat"] / 100,
              "Token & Market Structure": customWeights["Token & Market Structure"] / 100,
              "Governance / Legal / Security": customWeights["Governance / Legal / Security"] / 100,
            }
          } : {}),
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

  // Keep ref updated so keyboard shortcut always uses latest config
  startScanRef.current = startScan;

  // --- refresh scan: re-run with the same config as active scan ---
  const refreshScan = async () => {
    if (!activeScan || scanning) return;
    // Apply the active scan's config to the form
    const config = activeScan.config;
    if (config) {
      setPersona(config.persona);
      setMcMin(String(config.market_cap_min));
      setMcMax(String(config.market_cap_max));
      setSectors(config.sectors || []);
      setMaxProjects(String(config.max_projects));
    }
    // Start a new scan
    await startScan();
  };

  const loadReport = async (id: string) => {
    setReportLoading(true);
    try {
      const r = await fetch(`/api/scanner/project/${id}`);
      if (r.ok) {
        const report = await r.json();
        setSelectedReport(report);
        // fetch score history for this project
        if (report.candidate?.symbol) {
          fetchProjectScoreHistory(report.candidate.symbol);
        }
        // track recently viewed in IndexedDB
        recentlyViewedDB.add(id);
      }
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
        if (next.size >= 4) return cur;
        next.add(id);
      }
      return next;
    });
  };

  // --- watchlist toggle ---
  const toggleWatchlist = (id: string) => {
    watchlistDB.toggle(id);
  };

  // --- scan presets ---
  const applyPreset = (preset: "defi" | "largecap" | "emerging" | "infrastructure") => {
    switch (preset) {
      case "defi":
        setPersona("investor");
        setMcMin("500");
        setMcMax("50000");
        setSectors(["DeFi"]);
        setMaxProjects("15");
        break;
      case "largecap":
        setPersona("institutional");
        setMcMin("5000");
        setMcMax("50000");
        setSectors([]);
        setMaxProjects("10");
        break;
      case "emerging":
        setPersona("researcher");
        setMcMin("50");
        setMcMax("500");
        setSectors([]);
        setMaxProjects("20");
        break;
      case "infrastructure":
        setPersona("developer");
        setMcMin("200");
        setMcMax("50000");
        setSectors(["Infrastructure"]);
        setMaxProjects("12");
        break;
    }
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

  // --- scan history comparison ---
  const loadHistory = async () => {
    setHistoryLoading(true);
    try {
      const completedScans = scans.filter((s) => s.status === "completed").slice(0, 5);
      const fullScans = await Promise.all(
        completedScans.map(async (s) => {
          const r = await fetch(`/api/scanner/scan/${s.scan_id}`);
          return r.ok ? ((await r.json()) as ScanStatus) : null;
        }),
      );
      setHistoryScans(fullScans.filter(Boolean) as ScanStatus[]);
    } catch {
    } finally {
      setHistoryLoading(false);
    }
  };

  // --- global search across all scans ---
  const searchDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const performGlobalSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      setGlobalSearchResults([]);
      return;
    }
    setGlobalSearchLoading(true);
    try {
      const completedScans = scans.filter((s) => s.status === "completed");
      const fullScans = await Promise.all(
        completedScans.map(async (s) => {
          const r = await fetch(`/api/scanner/scan/${s.scan_id}`);
          return r.ok ? ((await r.json()) as ScanStatus) : null;
        }),
      );
      const results: { scan: ScanListItem; report: ScanSummaryItem }[] = [];
      const q = query.toLowerCase().trim();
      fullScans.filter(Boolean).forEach((scan) => {
        if (!scan) return;
        scan.reports.forEach((report) => {
          if (
            report.name.toLowerCase().includes(q) ||
            report.symbol.toLowerCase().includes(q) ||
            report.category.toLowerCase().includes(q) ||
            report.sector.toLowerCase().includes(q)
          ) {
            const scanListItem = scans.find((s) => s.scan_id === scan.scan_id);
            if (scanListItem) results.push({ scan: scanListItem, report });
          }
        });
      });
      setGlobalSearchResults(results);
    } catch {
    } finally {
      setGlobalSearchLoading(false);
    }
  }, [scans]);

  // fetch full reports for risk heatmap when entering analytics view
  const fetchRiskReports = useCallback(async () => {
    if (!activeScan?.reports || riskReports.length > 0) return;
    setRiskLoading(true);
    try {
      const reports = await Promise.all(
        activeScan.reports.map(async (r) => {
          const resp = await fetch(`/api/scanner/project/${r.id}`);
          return resp.ok ? ((await resp.json()) as FullReport) : null;
        }),
      );
      setRiskReports(reports.filter(Boolean) as FullReport[]);
    } catch {
    } finally {
      setRiskLoading(false);
    }
  }, [activeScan?.reports, riskReports.length]);

  // Reset riskReports when activeScan changes (prevents stale data from previous scan)
  useEffect(() => {
    setRiskReports([]);
  }, [activeScan?.scan_id]);

  // auto-fetch when switching to analytics view
  useEffect(() => {
    if (viewMode === "analytics" && activeScan?.reports?.length) {
      fetchRiskReports();
    }
  }, [viewMode, activeScan?.reports, fetchRiskReports]);

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

  // --- CSV export for all projects in a scan ---
  const exportScanCSV = () => {
    if (!activeScan?.reports || activeScan.reports.length === 0) return;
    const headers = [
      "Name", "Symbol", "Category", "Sector", "Project Quality", "Token Quality",
      "Confidence", "Action", "Vetoed", "Image URL",
    ];
    const rows = activeScan.reports.map((r) => [
      r.name,
      r.symbol,
      r.category,
      r.sector,
      r.project_quality.toFixed(1),
      r.token_quality != null ? r.token_quality.toFixed(1) : "",
      r.confidence.toFixed(0),
      r.action,
      r.veto ? "Yes" : "No",
      r.image || "",
    ]);
    // Escape CSV cells: prevent formula injection (= + - @) and quote escaping
    const escapeCsvCell = (val: unknown): string => {
      let s = String(val ?? "");
      // Prevent formula injection: prefix dangerous chars with single quote
      if (/^[=+\-@]/.test(s)) {
        s = "'" + s;
      }
      // Escape double quotes by doubling them
      s = s.replace(/"/g, '""');
      return `"${s}"`;
    };
    const csv = [headers, ...rows]
      .map((row) => row.map(escapeCsvCell).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `scan-${activeScan.scan_id.slice(0, 12)}-results.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: t("toast.csvExported"), description: t("toast.csvExportedDesc", { count: activeScan.reports.length }) });
  };

  // --- copy report summary to clipboard ---
  const copyReportSummary = (report: FullReport) => {
    const summary = [
      `${report.candidate.name} ($${report.candidate.symbol})`,
      `Quality: ${report.project_quality_score}/100 | Token: ${report.token_quality_score ?? "N/A"} | Confidence: ${report.confidence}%`,
      `Action: ${report.decision.action_label}`,
      `Verdict: ${report.executive_verdict}`,
      `Thesis: ${report.final_thesis}`,
    ].join("\n");
    if (!navigator?.clipboard?.writeText) {
      toast({ title: t("toast.copyFailed"), description: t("toast.clipboardNotAvailable"), variant: "destructive" });
      return;
    }
    navigator.clipboard.writeText(summary).then(() => {
      toast({ title: t("toast.copiedToClipboard"), description: t("toast.reportSummaryReady") });
    }).catch(() => {
      toast({ title: t("toast.copyFailed"), description: t("toast.couldNotCopy"), variant: "destructive" });
    });
  };

  // --- project score history across scans ---
  const [projectScoreHistory, setProjectScoreHistory] = useState<{ scanId: string; score: number; date: string }[]>([]);
  const fetchProjectScoreHistory = useCallback(async (symbol: string) => {
    try {
      const completedScans = scans.filter((s) => s.status === "completed");
      const fullScans = await Promise.all(
        completedScans.map(async (s) => {
          const r = await fetch(`/api/scanner/scan/${s.scan_id}`);
          return r.ok ? ((await r.json()) as ScanStatus) : null;
        }),
      );
      const history: { scanId: string; score: number; date: string }[] = [];
      fullScans.filter(Boolean).forEach((scan) => {
        if (!scan) return;
        const report = scan.reports.find((r) => r.symbol === symbol);
        if (report) {
          history.push({
            scanId: scan.scan_id,
            score: report.project_quality,
            date: scan.started_at,
          });
        }
      });
      setProjectScoreHistory(history);
    } catch {}
  }, [scans]);

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
    // Use a Map keyed by `value` to deduplicate — Set uses reference equality
    // for objects, so identical {value, labelKey} pairs would be added multiple times.
    const map = new Map<string, { value: string; labelKey: string }>();
    activeScan.reports.forEach((r) => {
      const a = r.action.toLowerCase();
      if (a.includes("high conviction")) map.set("high conviction", { value: "high conviction", labelKey: "actions.highConviction" });
      else if (a.includes("core")) map.set("core", { value: "core", labelKey: "actions.coreCandidate" });
      else if (a.includes("small")) map.set("small", { value: "small", labelKey: "actions.smallPosition" });
      else if (a.includes("research")) map.set("research", { value: "research", labelKey: "actions.deepResearch" });
      else if (a.includes("watch")) map.set("watch", { value: "watch", labelKey: "actions.watch" });
      else map.set("ignore", { value: "ignore", labelKey: "actions.ignore" });
    });
    return Array.from(map.values()).sort((a, b) => a.value.localeCompare(b.value));
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
                  {t("header.title")}
                </h1>
                <p className="text-[11px] text-muted-foreground hidden sm:block">
                  {t("header.subtitle")}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <HealthDot />
              <Badge variant="outline" className="hidden md:flex gap-1.5 font-mono text-[11px]">
                <Activity className="h-3 w-3 text-emerald-500" />
                {scans.length} {t("header.scans")}
              </Badge>
              {/* Global search button */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowGlobalSearch(true)}
                className="h-9 gap-1.5"
              >
                <Search className="h-4 w-4 text-muted-foreground" />
                <span className="hidden lg:inline">{t("header.searchAll")}</span>
              </Button>
              {/* History button */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setShowHistory(true);
                  loadHistory();
                }}
                className="h-9 gap-1.5"
              >
                <History className="h-4 w-4 text-sky-400" />
                <span className="hidden sm:inline">{t("header.history")}</span>
              </Button>
              {/* Watchlist button */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowWatchlist(true)}
                className="h-9 gap-1.5"
              >
                <Star className="h-4 w-4 text-amber-400" />
                <span className="hidden sm:inline">{t("header.watchlist")}</span>
                {watchlist.size > 0 && (
                  <Badge className="ml-0.5 bg-amber-500/20 text-amber-400 text-[9px] px-1.5 py-0">
                    {watchlist.size}
                  </Badge>
                )}
              </Button>
              {/* Help button */}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowHelp(true)}
                className="h-9 w-9 hover:bg-muted/40"
              >
                <HelpCircle className="h-4 w-4 text-muted-foreground" />
                <span className="sr-only">{t("header.help")}</span>
              </Button>
              <LanguageToggle />
              <ThemeToggle />
            </div>
          </div>
        </div>
      </header>

      {/* ----------------------------------------------------------------- */}
      {/*  Main                                                              */}
      {/* ----------------------------------------------------------------- */}
      <main className="flex-1 mx-auto w-full max-w-[1600px] px-4 sm:px-6 lg:px-8 py-6">
        {/* ============ Main view tab navigation ============ */}
        <div className="mb-6 flex items-center gap-1.5 rounded-xl border border-border/60 bg-card/40 backdrop-blur-sm p-1.5 overflow-x-auto">
          <button
            onClick={() => setMainView("hub")}
            className={cn(
              "flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium transition-all whitespace-nowrap",
              mainView === "hub"
                ? "bg-violet-500/15 text-violet-400 shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/40",
            )}
          >
            <LayoutGrid className="h-4 w-4" />
            <span>{t("nav.hub")}</span>
            {mainView === "hub" && (
              <span className="ml-1 h-1.5 w-1.5 rounded-full bg-violet-400 animate-pulse" />
            )}
          </button>
          <button
            onClick={() => setMainView("discovery")}
            className={cn(
              "flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium transition-all whitespace-nowrap",
              mainView === "discovery"
                ? "bg-emerald-500/15 text-emerald-400 shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/40",
            )}
          >
            <Radar className="h-4 w-4" />
            <span>{t("nav.discovery")}</span>
            {mainView === "discovery" && (
              <span className="ml-1 h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            )}
          </button>
          <button
            onClick={() => setMainView("explorer")}
            className={cn(
              "flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium transition-all whitespace-nowrap",
              mainView === "explorer"
                ? "bg-amber-500/15 text-amber-400 shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/40",
            )}
          >
            <Crosshair className="h-4 w-4" />
            <span>{t("nav.explorer")}</span>
          </button>
          <button
            onClick={() => setMainView("market")}
            className={cn(
              "flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium transition-all whitespace-nowrap",
              mainView === "market"
                ? "bg-sky-500/15 text-sky-400 shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/40",
            )}
          >
            <Globe className="h-4 w-4" />
            <span>{t("nav.market")}</span>
          </button>
          <button
            onClick={() => setMainView("news")}
            className={cn(
              "flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium transition-all whitespace-nowrap",
              mainView === "news"
                ? "bg-rose-500/15 text-rose-400 shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/40",
            )}
          >
            <Newspaper className="h-4 w-4" />
            <span>{t("nav.news")}</span>
          </button>
        </div>

        {/* ============ Hub view (default landing) ============ */}
        {mainView === "hub" && (
          <HubView
            onNavigate={(view) => setMainView(view)}
            onQuickScan={() => {
              setMainView("discovery");
              // Trigger scan after a brief delay to let the Discovery view mount
              setTimeout(() => startScanRef.current(), 200);
            }}
          />
        )}

        {/* ============ Coin Explorer view ============ */}
        {mainView === "explorer" && (
          <CoinExplorerView
            initialGeckoId={explorerInitialId}
            onClearInitial={() => setExplorerInitialId(null)}
            onReport={(report) => setSelectedReport(report)}
          />
        )}

        {/* ============ Market Intelligence view ============ */}
        {mainView === "market" && (
          <MarketIntelligenceView
            onAnalyzeCoin={(geckoId, _name) => {
              setExplorerInitialId(geckoId);
              setMainView("explorer");
            }}
          />
        )}

        {/* ============ News & Telegram Feed view ============ */}
        {mainView === "news" && <NewsFeedView />}

        {/* ============ Discovery view (default) ============ */}
        {mainView === "discovery" && (
        <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-6">
          {/* ============ Config sidebar ============ */}
          <aside className="lg:sticky lg:top-[88px] lg:self-start space-y-4">
            <Card className="border-border/60 bg-card/40 backdrop-blur-sm">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Crosshair className="h-4 w-4 text-emerald-500" />
                  {t("config.title")}
                </CardTitle>
                <CardDescription className="text-xs">
                  {t("config.description")}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Persona */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">{t("config.personaLabel")}</Label>
                  <Select value={persona} onValueChange={(v) => setPersona(v as Persona)}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PERSONAS.map((p) => (
                        <SelectItem key={p.value} value={p.value}>
                          <div className="flex flex-col">
                            <span className="text-sm font-medium">{t(`personas.${p.value}`)}</span>
                            <span className="text-[10px] text-muted-foreground">{t(`personas.${p.value}Desc`)}</span>
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
                  <Label className="text-xs font-medium">{t("config.maxProjectsLabel")}</Label>
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
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" /> {t("config.scanning")}
                    </>
                  ) : (
                    <>
                      <Zap className="h-4 w-4 mr-2" /> {t("config.scanMarket")}
                    </>
                  )}
                </Button>
                {error && (
                  <p className="text-xs text-rose-400 flex items-center gap-1.5">
                    <AlertTriangle className="h-3 w-3" /> {error}
                  </p>
                )}

                {/* Custom Persona Weights */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium flex items-center gap-1.5">
                      <SlidersHorizontal className="h-3 w-3 text-violet-400" /> Custom Weights
                    </Label>
                    <Switch
                      checked={useCustomWeights}
                      onCheckedChange={setUseCustomWeights}
                      className="scale-75"
                    />
                  </div>
                  {useCustomWeights && (
                    <div className="space-y-2 p-2 rounded-lg border border-violet-500/20 bg-violet-500/5">
                      {(Object.keys(customWeights) as (keyof typeof customWeights)[]).map((axis) => (
                        <div key={axis} className="space-y-0.5">
                          <div className="flex items-center justify-between text-[10px]">
                            <span className="text-muted-foreground truncate">{t(`axes.${axis === "Invisible Utility" ? "invisibleUtility" : axis === "Economic Engine" ? "economicEngine" : axis === "Moat" ? "moat" : axis === "Token & Market Structure" ? "tokenMarket" : "governance"}`)}</span>
                            <span className="font-mono font-semibold text-violet-400">{customWeights[axis]}%</span>
                          </div>
                          <Slider
                            value={[customWeights[axis]]}
                            onValueChange={(v) => setCustomWeights(prev => ({ ...prev, [axis]: v[0] }))}
                            min={0}
                            max={100}
                            step={5}
                            className="h-1.5"
                          />
                        </div>
                      ))}
                      <div className="flex items-center justify-between pt-1 border-t border-border/40">
                        <span className="text-[9px] text-muted-foreground">Total</span>
                        <span className={cn(
                          "text-[10px] font-mono font-bold",
                          Object.values(customWeights).reduce((a, b) => a + b, 0) === 100 ? "text-emerald-400" : "text-amber-400"
                        )}>
                          {Object.values(customWeights).reduce((a, b) => a + b, 0)}%
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Scan Presets */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium flex items-center gap-1.5">
                    <Zap className="h-3 w-3 text-amber-400" /> Quick Presets
                  </Label>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      onClick={() => applyPreset("defi")}
                      className="px-2 py-1.5 rounded-md text-[11px] font-medium bg-muted/30 hover:bg-emerald-500/10 hover:text-emerald-400 border border-border/40 hover:border-emerald-500/30 transition-all text-left"
                    >
                      <div className="font-semibold">{t("config.defiFocus")}</div>
                      <div className="text-[9px] text-muted-foreground">{t("config.defiFocusDesc")}</div>
                    </button>
                    <button
                      onClick={() => applyPreset("largecap")}
                      className="px-2 py-1.5 rounded-md text-[11px] font-medium bg-muted/30 hover:bg-sky-500/10 hover:text-sky-400 border border-border/40 hover:border-sky-500/30 transition-all text-left"
                    >
                      <div className="font-semibold">{t("config.largeCap")}</div>
                      <div className="text-[9px] text-muted-foreground">{t("config.largeCapDesc")}</div>
                    </button>
                    <button
                      onClick={() => applyPreset("emerging")}
                      className="px-2 py-1.5 rounded-md text-[11px] font-medium bg-muted/30 hover:bg-amber-500/10 hover:text-amber-400 border border-border/40 hover:border-amber-500/30 transition-all text-left"
                    >
                      <div className="font-semibold">{t("config.emerging")}</div>
                      <div className="text-[9px] text-muted-foreground">{t("config.emergingDesc")}</div>
                    </button>
                    <button
                      onClick={() => applyPreset("infrastructure")}
                      className="px-2 py-1.5 rounded-md text-[11px] font-medium bg-muted/30 hover:bg-violet-500/10 hover:text-violet-400 border border-border/40 hover:border-violet-500/30 transition-all text-left"
                    >
                      <div className="font-semibold">{t("config.infra")}</div>
                      <div className="text-[9px] text-muted-foreground">{t("config.infraDesc")}</div>
                    </button>
                  </div>
                </div>

                {/* Keyboard shortcuts hint */}
                <div className="pt-2 border-t border-border/30">
                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <kbd className="px-1.5 py-0.5 rounded bg-muted/40 border border-border/40 font-mono text-[9px]">S</kbd>
                    <span>scan</span>
                    <kbd className="px-1.5 py-0.5 rounded bg-muted/40 border border-border/40 font-mono text-[9px] ml-1">/</kbd>
                    <span>search</span>
                    <kbd className="px-1.5 py-0.5 rounded bg-muted/40 border border-border/40 font-mono text-[9px] ml-1">G/A</kbd>
                    <span>views</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Recently viewed projects */}
            {recentlyViewed.length > 0 && (
              <Card className="border-border/60 bg-card/40 backdrop-blur-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Clock className="h-4 w-4 text-violet-400" />
                    Recently Viewed
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="px-6 pb-4 space-y-1.5">
                    {recentlyViewed.map((id) => {
                      const report = activeScan?.reports?.find((r) => r.id === id);
                      if (!report) return null;
                      return (
                        <button
                          key={id}
                          onClick={() => loadReport(id)}
                          className="w-full flex items-center gap-2 p-2 rounded-lg border border-border/40 bg-muted/20 hover:bg-muted/40 hover:border-border transition-colors group"
                        >
                          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted/40 border border-border/40 overflow-hidden flex-shrink-0">
                            {report.image ? (
                              <img src={report.image} alt={report.symbol} className="h-full w-full object-cover" />
                            ) : (
                              <span className="text-[9px] font-bold text-muted-foreground">{report.symbol.slice(0, 3)}</span>
                            )}
                          </div>
                          <div className="min-w-0 flex-1 text-left">
                            <div className="text-xs font-semibold truncate">{report.name}</div>
                            <div className="text-[10px] text-muted-foreground font-mono">${report.symbol}</div>
                          </div>
                          <span className={cn("text-sm font-bold tabular-nums", scoreColor(report.project_quality))}>
                            {report.project_quality.toFixed(0)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Recent scans */}
            <Card className="border-border/60 bg-card/40 backdrop-blur-sm">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  Recent Scans
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[300px] px-6 pb-4">
                  {scans.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-4">{t("config.noScansYet")}</p>
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
                            <span className="text-[11px] capitalize">{t(`personas.${s.persona}`)}</span>
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

            {/* Backtest Results */}
            <BacktestView />
          </aside>

          {/* ============ Results area ============ */}
          <section className="min-w-0 space-y-6">
            {/* Hero / scan progress */}
            {!activeScan && scans.length === 0 && <EmptyState />}

            {activeScan && (
              <ScanProgressCard scan={activeScan} onRefresh={refreshScan} scanning={scanning} />
            )}

            {/* Market Overview Stats */}
            {marketStats && (
              <>
                {/* Market Sentiment Banner */}
                <MarketSentimentBanner stats={marketStats} />
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                  <StatCard
                    icon={ChartNoAxesColumn}
                    label={t("stats.totalScanned")}
                    value={marketStats.total.toString()}
                    color="text-sky-400"
                  />
                  <StatCard
                    icon={Gauge}
                    label={t("stats.avgQuality")}
                    value={marketStats.avgQ.toFixed(1)}
                    color={scoreColor(marketStats.avgQ)}
                  />
                  <StatCard
                    icon={BadgeCheck}
                    label={t("stats.avgConfidence")}
                    value={`${marketStats.avgConf.toFixed(0)}%`}
                    color="text-emerald-400"
                  />
                  <StatCard
                    icon={Target}
                    label={t("stats.highScore")}
                    value={marketStats.highCount.toString()}
                    color="text-lime-400"
                  />
                  <StatCard
                    icon={ShieldAlert}
                    label={t("stats.vetoed")}
                    value={marketStats.vetoCount.toString()}
                    color={marketStats.vetoCount > 0 ? "text-rose-400" : "text-muted-foreground"}
                  />
                  <StatCard
                    icon={Layers}
                    label={t("stats.topSector")}
                    value={marketStats.topSector}
                    color="text-amber-400"
                  />
                </div>
              </>
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
                      {/* CSV export */}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={exportScanCSV}
                        className="h-8 text-xs gap-1.5"
                      >
                        <Download className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">CSV</span>
                      </Button>
                      {/* Share scan */}
                      {activeScan && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const url = `${window.location.origin}/?scan=${activeScan.scan_id}`;
                            navigator.clipboard?.writeText(url).then(() => {
                              toast({ title: t("toast.scanShared") || "Scan link copied!", description: url });
                            }).catch(() => {
                              toast({ title: "Share URL", description: url });
                            });
                          }}
                          className="h-8 text-xs gap-1.5"
                        >
                          <Copy className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">Share</span>
                        </Button>
                      )}
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
                          {t("results.grid")}
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
                          {t("results.analytics")}
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
                        <Filter className="absolute start-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <Input
                          ref={searchInputRef}
                          placeholder={t("results.searchPlaceholder")}
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="h-8 ps-8 text-xs"
                        />
                      </div>
                      <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
                        <SelectTrigger className="h-8 w-[140px] text-xs">
                          <ArrowUpDown className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="quality">{t("results.projectQuality")}</SelectItem>
                          <SelectItem value="token">{t("results.tokenQuality")}</SelectItem>
                          <SelectItem value="confidence">{t("results.confidence")}</SelectItem>
                          <SelectItem value="action">{t("results.action")}</SelectItem>
                        </SelectContent>
                      </Select>
                      <Select value={actionFilter} onValueChange={setActionFilter}>
                        <SelectTrigger className="h-8 w-[130px] text-xs">
                          <SelectValue placeholder={t("results.action")} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">{t("results.allActions")}</SelectItem>
                          {availableActions.map((a) => {
                            const translated = t(a.labelKey);
                            const label = typeof translated === "string" && translated !== a.labelKey ? translated : a.value;
                            return (
                              <SelectItem key={a.value} value={a.value} dir="auto">{label}</SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                      {availableSectors.length > 0 && (
                        <Select value={sectorFilter} onValueChange={setSectorFilter}>
                          <SelectTrigger className="h-8 w-[130px] text-xs">
                            <SelectValue placeholder={t("results.allSectors")} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">{t("results.allSectors")}</SelectItem>
                            {availableSectors.map((s) => {
                              const translated = t(`sectors.${s}`);
                              const label = typeof translated === "string" && translated !== `sectors.${s}` ? translated : s;
                              return (
                                <SelectItem key={s} value={s} dir="auto">{label}</SelectItem>
                              );
                            })}
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
                  <>
                    {/* Top Performers banner (only when no filters active) */}
                    {filteredReports.length > 0 && !searchQuery && actionFilter === "all" && sectorFilter === "all" && (
                      <div className="mb-2">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-gradient-to-r from-amber-500/15 to-yellow-500/10 border border-amber-500/30">
                            <Sparkles className="h-3 w-3 text-amber-400" />
                            <span className="text-[11px] font-semibold text-amber-400">{t("results.topPerformers")}</span>
                          </div>
                          <span className="text-[11px] text-muted-foreground">{t("results.highestQuality")}</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                          {filteredReports
                            .filter((r) => r.project_quality >= 15)
                            .slice(0, 3)
                            .map((r) => (
                              <ProjectCard
                                key={r.id}
                                report={r}
                                onSelect={() => loadReport(r.id)}
                                compareMode={compareMode}
                                compareSelected={compareIds.has(r.id)}
                                onToggleCompare={() => toggleCompare(r.id)}
                                watchlisted={watchlist.has(r.id)}
                                onToggleWatchlist={() => toggleWatchlist(r.id)}
                              />
                            ))}
                        </div>
                      </div>
                    )}
                    {/* All candidates */}
                    <div>
                      {filteredReports.length > 0 && !searchQuery && actionFilter === "all" && sectorFilter === "all" && (
                        <div className="flex items-center gap-2 mb-3 mt-4">
                          <div className="flex-1 h-px bg-border/40" />
                          <span className="text-[11px] text-muted-foreground font-medium">{t("results.allCandidates")}</span>
                          <div className="flex-1 h-px bg-border/40" />
                        </div>
                      )}
                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                        {filteredReports.map((r) => (
                          <ProjectCard
                            key={r.id}
                            report={r}
                            onSelect={() => loadReport(r.id)}
                            compareMode={compareMode}
                            compareSelected={compareIds.has(r.id)}
                            onToggleCompare={() => toggleCompare(r.id)}
                            watchlisted={watchlist.has(r.id)}
                            onToggleWatchlist={() => toggleWatchlist(r.id)}
                          />
                        ))}
                      </div>
                    </div>
                    {filteredReports.length === 0 && (
                      <div className="col-span-full flex flex-col items-center justify-center py-12 text-center">
                        <ListFilter className="h-8 w-8 text-muted-foreground/50 mb-2" />
                        <p className="text-sm text-muted-foreground">{t("results.noProjectsMatch")}</p>
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
                          {t("results.clearFilters")}
                        </Button>
                      </div>
                    )}
                  </>
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
                            {t("analytics.sectorDistribution")}
                          </CardTitle>
                          <CardDescription className="text-xs">
                            {t("analytics.sectorDistributionDesc")}
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="flex justify-center pt-2">
                          {sectorDonutData.length > 0 ? (
                            <SectorDonut
                              data={sectorDonutData}
                              centerLabel={t("analytics.projects")}
                              centerValue={sectorDonutData.reduce((s, d) => s + d.value, 0)}
                              size={200}
                            />
                          ) : (
                            <p className="text-xs text-muted-foreground py-12">{t("analytics.noSectorData")}</p>
                          )}
                        </CardContent>
                      </Card>

                      <Card className="border-border/50 bg-card/30 backdrop-blur-sm">
                        <CardHeader className="pb-2">
                          <CardTitle className="flex items-center gap-2 text-sm">
                            <Target className="h-4 w-4 text-emerald-500" />
                            {t("analytics.actionDistribution")}
                          </CardTitle>
                          <CardDescription className="text-xs">
                            {t("analytics.actionDistributionDesc")}
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
                          {t("analytics.qualityScoreDistribution")}
                        </CardTitle>
                        <CardDescription className="text-xs">
                          {t("analytics.qualityScoreDistributionDesc")}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="pt-2">
                        <ScoreHistogram reports={activeScan.reports} />
                      </CardContent>
                    </Card>

                    {/* Risk Heatmap */}
                    <Card className="border-border/50 bg-card/30 backdrop-blur-sm">
                      <CardHeader className="pb-2">
                        <CardTitle className="flex items-center gap-2 text-sm">
                          <ShieldAlert className="h-4 w-4 text-rose-500" />
                          {t("analytics.riskHeatmap")}
                        </CardTitle>
                        <CardDescription className="text-xs">
                          {t("analytics.riskHeatmapDesc")}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="pt-2">
                        {riskLoading ? (
                          <div className="flex items-center justify-center py-12">
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                          </div>
                        ) : riskReports.length > 0 ? (
                          <RiskHeatmap
                            projects={riskReports.map((r) => ({
                              name: r.candidate.name,
                              symbol: r.candidate.symbol,
                              project_quality: r.project_quality_score,
                              risks: r.severe_risks,
                            }))}
                          />
                        ) : (
                          <p className="text-xs text-muted-foreground py-8 text-center">
                            {t("common.loading")}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
        )}
      </main>

      {/* ----------------------------------------------------------------- */}
      {/*  Footer                                                            */}
      {/* ----------------------------------------------------------------- */}
      <footer className="mt-auto border-t border-border/60 bg-background/60 backdrop-blur-sm">
        <div className="mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-8 py-3 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-4 flex-wrap">
            <p className="text-[11px] text-muted-foreground">
              {t("footer.evidenceNarrative")}
            </p>
            <div className="hidden md:flex items-center gap-2 text-[10px] text-muted-foreground">
              <kbd className="px-1.5 py-0.5 rounded bg-muted/40 border border-border/40 font-mono text-[9px]">S</kbd>
              <span>{t("footer.scan")}</span>
              <kbd className="px-1.5 py-0.5 rounded bg-muted/40 border border-border/40 font-mono text-[9px] ml-1">/</kbd>
              <span>{t("footer.search")}</span>
              <kbd className="px-1.5 py-0.5 rounded bg-muted/40 border border-border/40 font-mono text-[9px] ml-1">G</kbd>
              <kbd className="px-1.5 py-0.5 rounded bg-muted/40 border border-border/40 font-mono text-[9px]">A</kbd>
              <span>{t("footer.views")}</span>
              <kbd className="px-1.5 py-0.5 rounded bg-muted/40 border border-border/40 font-mono text-[9px] ml-1">C</kbd>
              <span>{t("footer.compare")}</span>
              <kbd className="px-1.5 py-0.5 rounded bg-muted/40 border border-border/40 font-mono text-[9px] ml-1">W</kbd>
              <span>{t("footer.watchlist")}</span>
              <kbd className="px-1.5 py-0.5 rounded bg-muted/40 border border-border/40 font-mono text-[9px] ml-1">⌘K</kbd>
              <span>{t("footer.search")}</span>
              <kbd className="px-1.5 py-0.5 rounded bg-muted/40 border border-border/40 font-mono text-[9px] ml-1">Esc</kbd>
              <span>{t("footer.close")}</span>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {t("footer.dataSources")}
          </p>
        </div>
      </footer>

      {/* ----------------------------------------------------------------- */}
      {/*  Detail drawer                                                     */}
      {/* ----------------------------------------------------------------- */}
      <Sheet open={!!selectedReport} onOpenChange={(o) => !o && setSelectedReport(null)}>
        <SheetContent side="right" className="w-full sm:max-w-2xl lg:max-w-3xl p-0 overflow-y-auto">
          <SheetDescription className="sr-only">
            {t("detail.srDescription")}
          </SheetDescription>
          {selectedReport ? (
            <ReportDetail
              report={selectedReport}
              onExport={exportReport}
              onCopy={copyReportSummary}
              scoreHistory={projectScoreHistory}
            />
          ) : reportLoading ? (
            <ReportSkeleton />
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
            {t("comparison.srDescription")}
          </SheetDescription>
          <ComparisonView reports={compareReports} />
        </SheetContent>
      </Sheet>

      {/* ----------------------------------------------------------------- */}
      {/*  Watchlist dialog                                                  */}
      {/* ----------------------------------------------------------------- */}
      <Sheet
        open={showWatchlist}
        onOpenChange={(o) => !o && setShowWatchlist(false)}
      >
        <SheetContent side="right" className="w-full sm:max-w-md lg:max-w-lg p-0 overflow-y-auto">
          <SheetDescription className="sr-only">
            {t("watchlist.srDescription")}
          </SheetDescription>
          <WatchlistView
            watchlist={watchlist}
            onRemove={toggleWatchlist}
            onSelect={async (id) => {
              setShowWatchlist(false);
              await loadReport(id);
            }}
            reports={activeScan?.reports || []}
          />
        </SheetContent>
      </Sheet>

      {/* ----------------------------------------------------------------- */}
      {/*  History dialog                                                    */}
      {/* ----------------------------------------------------------------- */}
      <Sheet
        open={showHistory}
        onOpenChange={(o) => !o && setShowHistory(false)}
      >
        <SheetContent side="right" className="w-full sm:max-w-2xl lg:max-w-3xl p-0 overflow-y-auto">
          <SheetDescription className="sr-only">
            Scan history comparison across recent scans
          </SheetDescription>
          <HistoryView
            scans={historyScans}
            loading={historyLoading}
            onSelectScan={(s) => {
              setShowHistory(false);
              setActiveScan(s);
            }}
            onCompareScans={() => {
              if (historyScans.length >= 2) {
                setDiffScanA(historyScans[0]);
                setDiffScanB(historyScans[1]);
                setShowHistory(false);
                setShowScanDiff(true);
              }
            }}
          />
        </SheetContent>
      </Sheet>

      {/* ----------------------------------------------------------------- */}
      {/*  Global search dialog                                              */}
      {/* ----------------------------------------------------------------- */}
      <Sheet
        open={showGlobalSearch}
        onOpenChange={(o) => {
          if (!o) {
            setShowGlobalSearch(false);
            setGlobalSearchQuery("");
            setGlobalSearchResults([]);
          }
        }}
      >
        <SheetContent side="right" className="w-full sm:max-w-lg lg:max-w-xl p-0 overflow-y-auto">
          <SheetDescription className="sr-only">
            Search across all completed scans
          </SheetDescription>
          <GlobalSearchView
            query={globalSearchQuery}
            onQueryChange={(q) => {
              setGlobalSearchQuery(q);
              // debounce search to avoid excessive API calls
              if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
              searchDebounceRef.current = setTimeout(() => {
                performGlobalSearch(q);
              }, 350);
            }}
            results={globalSearchResults}
            loading={globalSearchLoading}
            onSelect={async (reportId) => {
              setShowGlobalSearch(false);
              await loadReport(reportId);
            }}
          />
        </SheetContent>
      </Sheet>

      {/* ----------------------------------------------------------------- */}
      {/*  Scan diff dialog                                                  */}
      {/* ----------------------------------------------------------------- */}
      <Sheet
        open={showScanDiff}
        onOpenChange={(o) => !o && setShowScanDiff(false)}
      >
        <SheetContent side="right" className="w-full sm:max-w-3xl lg:max-w-4xl p-0 overflow-y-auto">
          <SheetDescription className="sr-only">
            Side-by-side comparison of two scans
          </SheetDescription>
          <ScanDiffView scanA={diffScanA} scanB={diffScanB} />
        </SheetContent>
      </Sheet>

      {/* ----------------------------------------------------------------- */}
      {/*  Help dialog                                                       */}
      {/* ----------------------------------------------------------------- */}
      <Sheet
        open={showHelp}
        onOpenChange={(o) => !o && setShowHelp(false)}
      >
        <SheetContent side="right" className="w-full sm:max-w-lg lg:max-w-xl p-0 overflow-y-auto">
          <SheetDescription className="sr-only">
            Help and onboarding guide for the Crypto Discovery Framework
          </SheetDescription>
          <HelpView />
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
  const { t } = useLanguage();
  const map: Record<string, { cls: string; icon: typeof Loader2; key: string }> = {
    completed: { cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", icon: BadgeCheck, key: "scan.statusCompleted" },
    running: { cls: "bg-sky-500/15 text-sky-400 border-sky-500/30", icon: Loader2, key: "scan.statusRunning" },
    queued: { cls: "bg-slate-500/15 text-slate-300 border-slate-500/30", icon: Clock, key: "scan.statusQueued" },
    failed: { cls: "bg-rose-500/15 text-rose-400 border-rose-500/30", icon: AlertTriangle, key: "scan.statusFailed" },
  };
  const m = map[status] || map.queued;
  const Icon = m.icon;
  const label = t(m.key);
  return (
    <Badge variant="outline" className={cn("text-[10px] gap-1 py-0 h-5", m.cls)} dir="auto">
      <Icon className={cn("h-2.5 w-2.5", status === "running" && "animate-spin")} />
      {typeof label === "string" && label !== m.key ? label : status}
    </Badge>
  );
}

function EmptyState() {
  const { t } = useLanguage();
  return (
    <Card className="border-dashed border-2 border-border/60 bg-card/20">
      <CardContent className="flex flex-col items-center justify-center text-center py-16 px-6">
        <div className="relative mb-6">
          <div className="absolute inset-0 bg-emerald-500/20 blur-2xl rounded-full" />
          <div className="relative flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-emerald-500/20 to-teal-600/20 border border-emerald-500/30">
            <Radar className="h-10 w-10 text-emerald-400" />
          </div>
        </div>
        <h2 className="text-xl font-bold mb-2">{t("empty.title")}</h2>
        <p className="text-sm text-muted-foreground max-w-md mb-6">
          {t("empty.description")}
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-2xl w-full">
          {[
            { icon: Crosshair, label: t("empty.lens1"), color: "text-sky-400" },
            { icon: ShieldAlert, label: t("empty.lens2"), color: "text-rose-400" },
            { icon: Gauge, label: t("empty.lens3"), color: "text-emerald-400" },
            { icon: Target, label: t("empty.lens4"), color: "text-amber-400" },
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

function ScanProgressCard({ scan, onRefresh, scanning }: { scan: ScanStatus; onRefresh?: () => void; scanning?: boolean }) {
  const { t } = useLanguage();
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

  const phases = [
    t("scan.phase1"),
    t("scan.phase2"),
    t("scan.phase3"),
    t("scan.phase4"),
    t("scan.phase5"),
    t("scan.phase6"),
    t("scan.phase7"),
    t("scan.phase8"),
  ];

  return (
    <Card className="border-border/60 bg-card/40 backdrop-blur-sm overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-sm">
              <FlaskConical className="h-4 w-4 text-emerald-500" />
              <span dir="auto">{t("scan.scanLabel")} {scan.scan_id.slice(0, 12)}</span>
              <Badge variant="outline" className="ml-1 text-[10px] capitalize">{t(`personas.${scan.config.persona}`)}</Badge>
            </CardTitle>
            <CardDescription className="text-xs mt-1 font-mono" dir="auto">
              {scan.current_phase} · {scan.processed}/{scan.total_candidates} {t("scan.processed")}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {scan.status === "completed" && onRefresh && (
              <Button
                variant="outline"
                size="sm"
                onClick={onRefresh}
                disabled={scanning}
                className="h-7 text-[11px] gap-1"
              >
                <RefreshCw className={cn("h-3 w-3", scanning && "animate-spin")} />
                <span className="hidden sm:inline">{t("results.reset")}</span>
              </Button>
            )}
            <ScanStatusBadge status={scan.status} />
          </div>
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
              <div key={i} className="flex items-center gap-1 flex-shrink-0">
                <div
                  className={cn(
                    "flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-medium border transition-all",
                    done && "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
                    current && "bg-sky-500/15 text-sky-400 border-sky-500/40 shadow-sm shadow-sky-500/20",
                    !done && !current && "bg-muted/30 text-muted-foreground border-border/40",
                  )}
                  dir="auto"
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
                  <span className="truncate" dir="auto">{l}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {scan.error && (
          <p className="text-xs text-rose-400 flex items-center gap-1.5" dir="auto">
            <AlertTriangle className="h-3 w-3" /> {scan.error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// --- Sparkline: fetches 7d price chart and renders a mini SVG ---
function Sparkline({ symbol, geckoId }: { symbol: string; geckoId?: string }) {
  const [points, setPoints] = useState<number[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!geckoId) {
      return;
    }
    const ctrl = new AbortController();
    fetch(`/api/scanner/coingecko/chart/${encodeURIComponent(geckoId)}?days=7`, { signal: ctrl.signal })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (cancelled) return;
        if (data?.prices && Array.isArray(data.prices)) {
          const prices = data.prices.map((p: [number, number]) => p[1]);
          setPoints(prices.length > 20 ? prices : null);
        } else {
          setPoints(null);
        }
      })
      .catch(() => { if (!cancelled) setPoints(null); });
    return () => { cancelled = true; ctrl.abort(); };
  }, [geckoId]);

  if (!geckoId || !points || points.length < 2) return (
    <span className="text-muted-foreground group-hover:text-emerald-400 transition-colors flex items-center gap-0.5">
      Details <ArrowRight className="h-2.5 w-2.5" />
    </span>
  );

  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const w = 60, h = 20;
  const step = w / (points.length - 1);
  const path = points.map((p, i) => {
    const x = i * step;
    const y = h - ((p - min) / range) * h;
    return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const isUp = points[points.length - 1] >= points[0];
  const color = isUp ? "text-emerald-500" : "text-rose-500";
  const change = ((points[points.length - 1] - points[0]) / points[0]) * 100;

  return (
    <div className="flex flex-col items-end gap-0.5">
      <svg width={w} height={h} className={color}>
        <path d={path} fill="none" stroke="currentColor" strokeWidth={1.2} strokeLinejoin="round" strokeLinecap="round" />
      </svg>
      <span className={cn("text-[9px] font-mono", color)}>
        {isUp ? "+" : ""}{change.toFixed(1)}%
      </span>
    </div>
  );
}

function ProjectCard({
  report,
  onSelect,
  compareMode = false,
  compareSelected = false,
  onToggleCompare,
  watchlisted = false,
  onToggleWatchlist,
}: {
  report: ScanSummaryItem;
  onSelect: () => void;
  compareMode?: boolean;
  compareSelected?: boolean;
  onToggleCompare?: () => void;
  watchlisted?: boolean;
  onToggleWatchlist?: () => void;
}) {
  const { t } = useLanguage();
  const ab = actionBadge(report.action, t);
  return (
    <div
      className={cn(
        "group relative text-left p-4 rounded-xl border bg-card/40 hover:bg-card/80 hover:shadow-lg hover:shadow-emerald-500/5 hover:-translate-y-0.5 transition-all duration-200 overflow-hidden",
        compareSelected
          ? "border-violet-500/60 ring-2 ring-violet-500/20"
          : watchlisted
          ? "border-amber-500/40 ring-1 ring-amber-500/10"
          : "border-border/50 hover:border-emerald-500/40",
      )}
    >
      {/* score accent bar */}
      <div className={cn("absolute top-0 inset-x-0 h-0.5", scoreBg(report.project_quality))} />

      {/* Watchlist star (always visible) */}
      <div className="absolute top-2 end-2 z-10">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleWatchlist?.();
          }}
          className={cn(
            "flex h-6 w-6 items-center justify-center rounded-md transition-all",
            watchlisted
              ? "text-amber-400 hover:bg-amber-500/10"
              : "text-muted-foreground/40 hover:text-amber-400 hover:bg-amber-500/10 opacity-0 group-hover:opacity-100",
          )}
        >
          <Star className={cn("h-3.5 w-3.5", watchlisted && "fill-current")} />
        </button>
      </div>

      {compareMode && (
        <div className="absolute top-2 end-9 z-10">
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
                    <TooltipContent>{t("detail.severeRisks")}</TooltipContent>
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
          {/* Social links */}
          <div className="flex items-center gap-0.5 ms-auto">
            {report.website && (
              <a
                href={report.website}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="p-1 rounded text-muted-foreground/50 hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors"
                title={t("projectCard.website")}
              >
                <Globe className="h-3 w-3" />
              </a>
            )}
            {report.twitter && (
              <a
                href={`https://x.com/${report.twitter}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="p-1 rounded text-muted-foreground/50 hover:text-sky-400 hover:bg-sky-500/10 transition-colors"
                title={t("projectCard.twitter")}
              >
                <Twitter className="h-3 w-3" />
              </a>
            )}
            {report.github && (
              <a
                href={report.github}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="p-1 rounded text-muted-foreground/50 hover:text-violet-400 hover:bg-violet-500/10 transition-colors"
                title={t("projectCard.github")}
              >
                <Github className="h-3 w-3" />
              </a>
            )}
          </div>
        </div>

        {/* mini metrics */}
        <div className="grid grid-cols-3 gap-2 text-[10px]">
          <div className="flex flex-col">
            <span className="text-muted-foreground">{t("results.tokenQ")}</span>
            <span className={cn("font-mono font-semibold", report.token_quality != null ? scoreColor(report.token_quality) : "text-muted-foreground")}>
              {report.token_quality != null ? report.token_quality.toFixed(0) : "—"}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-muted-foreground">{t("results.confidence")}</span>
            <div className="flex items-center gap-1.5">
              <span className="font-mono font-semibold text-foreground">{report.confidence.toFixed(0)}%</span>
              {/* Confidence sparkline bar */}
              <div className="flex items-end gap-[1px] h-3">
                {[0, 1, 2, 3, 4].map((i) => {
                  const threshold = 20 + i * 20;
                  const active = report.confidence >= threshold;
                  return (
                    <div
                      key={i}
                      className={cn(
                        "w-[2px] rounded-sm transition-all",
                        active
                          ? report.confidence >= 70
                            ? "bg-emerald-500"
                            : report.confidence >= 50
                            ? "bg-amber-500"
                            : "bg-rose-500"
                          : "bg-muted/40",
                      )}
                      style={{ height: `${30 + i * 17}%` }}
                    />
                  );
                })}
              </div>
            </div>
          </div>
          <div className="flex flex-col items-end justify-end">
            <Sparkline symbol={report.symbol} geckoId={report.gecko_id || undefined} />
          </div>
        </div>
      </button>
    </div>
  );
}

function ReportDetail({
  report,
  onExport,
  onCopy,
  scoreHistory = [],
}: {
  report: FullReport;
  onExport?: (r: FullReport, format: "json" | "markdown") => void;
  onCopy?: (r: FullReport) => void;
  scoreHistory?: { scanId: string; score: number; date: string }[];
}) {
  const { t } = useLanguage();
  const ab = actionBadge(report.decision.action_label, t);
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
            {/* Social links in detail header */}
            <div className="flex items-center gap-1.5 mt-2">
              {report.candidate.website && (
                <a href={report.candidate.website} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] bg-muted/30 hover:bg-emerald-500/10 hover:text-emerald-400 border border-border/40 transition-colors">
                  <Globe className="h-3 w-3" /> {t("projectCard.website")}
                </a>
              )}
              {report.candidate.twitter && (
                <a href={`https://x.com/${report.candidate.twitter}`} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] bg-muted/30 hover:bg-sky-500/10 hover:text-sky-400 border border-border/40 transition-colors">
                  <Twitter className="h-3 w-3" /> @{report.candidate.twitter}
                </a>
              )}
              {report.candidate.github && (
                <a href={report.candidate.github} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] bg-muted/30 hover:bg-violet-500/10 hover:text-violet-400 border border-border/40 transition-colors">
                  <Github className="h-3 w-3" /> {t("projectCard.github")}
                </a>
              )}
              {report.candidate.discord && (
                <a href={report.candidate.discord} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] bg-muted/30 hover:bg-indigo-500/10 hover:text-indigo-400 border border-border/40 transition-colors">
                  <MessageCircle className="h-3 w-3" /> Discord
                </a>
              )}
              {report.candidate.blockchain_explorer && (
                <a href={report.candidate.blockchain_explorer} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] bg-muted/30 hover:bg-amber-500/10 hover:text-amber-400 border border-border/40 transition-colors">
                  <ExternalLink className="h-3 w-3" /> Explorer
                </a>
              )}
            </div>
          </div>
          {/* Score ring - clean, no clutter next to it */}
          <ScoreRadial
            score={report.project_quality_score}
            label={t("detail.projectQuality")}
            size={72}
            strokeWidth={6}
          />
        </div>
        {/* Badges + export buttons on a separate row */}
        <div className="flex items-center justify-between gap-2 flex-wrap mt-3">
          <div className="flex items-center gap-1.5 flex-wrap">
            <Badge className={cn("text-[10px]", ab.cls)}>{report.decision.action_label}</Badge>
            <Badge variant="outline" className="text-[10px]">
              <Gauge className="h-3 w-3 mr-1" />
              {t("detail.riskAdj")} {report.decision.risk_adjusted_score.toFixed(0)}
            </Badge>
            <Badge variant="outline" className="text-[10px]">
              Confidence {report.confidence.toFixed(0)}%
            </Badge>
            <Badge variant="outline" className="text-[10px]">
              Evidence {report.evidence_grade.split(" - ")[0]}
            </Badge>
          </div>
          <div className="flex items-center gap-1">
            {onCopy && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-[11px] gap-1"
                      onClick={() => onCopy(report)}
                    >
                      <Copy className="h-3 w-3" />
                      <span className="hidden sm:inline">{t("detail.copy")}</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t("detail.copy")}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            {onExport && (
              <>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-[11px] gap-1"
                        onClick={() => onExport(report, "markdown")}
                      >
                        <Download className="h-3 w-3" />
                        MD
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{t("detail.md")}</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-[11px] gap-1"
                  onClick={() => onExport(report, "json")}
                >
                  <Download className="h-3 w-3" />
                  JSON
                </Button>
              </>
            )}
          </div>
        </div>
      </SheetHeader>

      <div className="px-6 py-5 space-y-6">
        {/* Verdict */}
        <section>
          <SectionTitle icon={Sparkles} title={t("detail.executiveVerdict")} />
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

        {/* Score Trend Across Scans */}
        {scoreHistory.length > 1 && (
          <section>
            <SectionTitle icon={TrendingUp} title={t("detail.scoreHistory")} />
            <div className="border border-border/40 rounded-lg p-3 bg-card/20">
              <div className="flex items-end justify-between gap-2 h-20 mb-2">
                {scoreHistory.map((point, i) => {
                  const heightPct = Math.max(8, (point.score / 100) * 100);
                  const isLast = i === scoreHistory.length - 1;
                  const prevScore = i > 0 ? scoreHistory[i - 1].score : point.score;
                  const trend = point.score - prevScore;
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1 h-full justify-end group">
                      <span className={cn(
                        "text-[10px] font-mono font-semibold",
                        isLast ? scoreColor(point.score) : "text-muted-foreground",
                      )}>
                        {point.score.toFixed(0)}
                      </span>
                      <div className="w-full flex-1 flex items-end">
                        <div
                          className={cn(
                            "w-full rounded-t-md transition-all duration-500",
                            isLast ? scoreBg(point.score) : "bg-muted/40",
                          )}
                          style={{ height: `${heightPct}%`, opacity: isLast ? 1 : 0.5 }}
                        />
                      </div>
                      {isLast && trend !== 0 && (
                        <div className={cn(
                          "flex items-center gap-0.5 text-[9px] font-mono",
                          trend > 0 ? "text-emerald-400" : "text-rose-400",
                        )}>
                          {trend > 0 ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
                          {trend > 0 ? "+" : ""}{trend.toFixed(0)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center justify-between text-[9px] text-muted-foreground">
                <span>{scoreHistory.length} scans</span>
                <span>{t("detail.oldestToLatest")}</span>
              </div>
            </div>
          </section>
        )}

        {/* 5 Fundamental Axes */}
        <section>
          <div className="flex items-center justify-between gap-2 mb-2">
            <SectionTitle icon={Gauge} title={t("detail.fiveAxes")} />
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
                      <span className="text-xs font-semibold truncate">{translateAxisName(ax.name, t)}</span>
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
                          <span className="text-muted-foreground truncate">{translateSubFactor(k, t)}</span>
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
          <SectionTitle icon={CircleDollarSign} title={t("detail.economicEngine")} />
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            <Metric label={t("metrics.fees24h")} value={fmtUsd(report.economic_engine.fees)} />
            <Metric label={t("metrics.revenue24h")} value={fmtUsd(report.economic_engine.revenue)} />
            <Metric label={t("metrics.netRev30d")} value={fmtUsd(report.economic_engine.net_revenue)} />
            <Metric label={t("metrics.tvl")} value={fmtUsd(report.economic_engine.tvl)} />
            <Metric label={t("metrics.aum")} value={fmtUsd(report.economic_engine.aum)} />
            <Metric
              label={t("metrics.growthWoW")}
              value={fmtPct(report.economic_engine.revenue_growth_pct)}
              tone={report.economic_engine.revenue_growth_pct != null && report.economic_engine.revenue_growth_pct < 0 ? "neg" : "pos"}
            />
            <Metric label={t("metrics.recurrence")} value={report.economic_engine.recurrence || "—"} />
            <Metric label={t("metrics.custConcentration")} value={report.economic_engine.customer_concentration || "—"} />
          </div>

          {/* Framework 3.0: Valuation Multiples (P/R, P/F, P/T) */}
          {report.valuation_multiples && (
            <div className="mt-3 p-3 rounded-lg border border-border/40 bg-card/20">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <Target className="h-3 w-3 text-amber-400" />
                Valuation Multiples (Framework 3.0)
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-2 rounded-md bg-muted/20">
                  <div className="text-[9px] text-muted-foreground">P/R</div>
                  <div className="text-sm font-mono font-bold">
                    {report.valuation_multiples.p_r != null ? report.valuation_multiples.p_r.toFixed(1) : "N/A"}
                  </div>
                  <div className="text-[8px] text-muted-foreground">MC/Revenue</div>
                </div>
                <div className="p-2 rounded-md bg-muted/20">
                  <div className="text-[9px] text-muted-foreground">P/F</div>
                  <div className="text-sm font-mono font-bold">
                    {report.valuation_multiples.p_f != null ? report.valuation_multiples.p_f.toFixed(1) : "N/A"}
                  </div>
                  <div className="text-[8px] text-muted-foreground">FDV/Fees</div>
                </div>
                <div className="p-2 rounded-md bg-muted/20">
                  <div className="text-[9px] text-muted-foreground">P/T</div>
                  <div className="text-sm font-mono font-bold">
                    {report.valuation_multiples.p_t != null ? report.valuation_multiples.p_t.toFixed(2) : "N/A"}
                  </div>
                  <div className="text-[8px] text-muted-foreground">MC/TVL</div>
                </div>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-[10px]">
                <div>
                  <span className="text-muted-foreground">{t("metrics.annualizedRevenue")}: </span>
                  <span className="font-mono font-semibold">
                    {report.valuation_multiples.annualized_revenue != null
                      ? fmtUsd(report.valuation_multiples.annualized_revenue)
                      : "N/A"}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">{t("metrics.annualizedFees")}: </span>
                  <span className="font-mono font-semibold">
                    {report.valuation_multiples.annualized_fees != null
                      ? fmtUsd(report.valuation_multiples.annualized_fees)
                      : "N/A"}
                  </span>
                </div>
              </div>
              {report.valuation_multiples.note && (
                <p className="text-[9px] text-amber-400/70 mt-2 italic">{report.valuation_multiples.note}</p>
              )}
            </div>
          )}

          {/* Fee Stability */}
          {report.fee_stability && (
            <div className="mt-2 flex items-center gap-2">
              <Badge variant="outline" className={cn(
                "text-[10px] gap-1",
                report.fee_stability === "stable" && "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
                report.fee_stability === "volatile" && "bg-rose-500/10 text-rose-400 border-rose-500/30",
                report.fee_stability === "unknown" && "bg-muted/20 text-muted-foreground border-border/40",
              )}>
                {report.fee_stability === "stable" && <BadgeCheck className="h-3 w-3" />}
                {report.fee_stability === "volatile" && <AlertTriangle className="h-3 w-3" />}
                {t("detail.feeStability")}: {report.fee_stability ? t(`feeStability.${report.fee_stability}`) : "—"}
              </Badge>
              {report.valuation_multiples?.fee_volatility_pct != null && (
                <span className="text-[10px] text-muted-foreground">
                  {t("detail.volatility")}: {report.valuation_multiples.fee_volatility_pct.toFixed(1)}%
                </span>
              )}
            </div>
          )}
        </section>

        {/* Tokenomics & Market */}
        <section>
          <SectionTitle icon={Layers} title={t("detail.tokenomics")} />
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-2">
            <Metric label={t("metrics.marketCap")} value={fmtUsd(report.tokenomics.market_cap)} />
            <Metric label={t("metrics.fdv")} value={fmtUsd(report.tokenomics.fdv)} />
            <Metric label={t("metrics.supplyGrowth")} value={fmtPct(report.tokenomics.supply_growth_pct)} tone={report.tokenomics.supply_growth_pct != null && report.tokenomics.supply_growth_pct > 6 ? "neg" : "neutral"} />
            <Metric label={t("metrics.insiderAlloc")} value={fmtPct(report.tokenomics.insider_allocation_pct)} />
            <Metric label={t("metrics.dailyVolume")} value={fmtUsd(report.market_structure.daily_volume)} />
            <Metric label={t("metrics.holderConc")} value={report.market_structure.holder_concentration != null ? fmtPct(report.market_structure.holder_concentration * 100) : "—"} />
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <Badge variant="outline" className="text-[10px]">
              {t("metrics.utilityLevel")} {report.tokenomics.utility_level}/4
            </Badge>
            <Badge variant="outline" className="text-[10px]">
              {t("subFactors.valueCapture")}: {report.tokenomics.value_capture ? t(`valueCapture.${report.tokenomics.value_capture}`) : "—"}
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
            <SectionTitle icon={BadgeCheck} title={t("detail.institutionalAdoption")} />
            <p className="text-xs text-muted-foreground leading-relaxed bg-muted/20 rounded-lg p-3 border border-border/40">
              {report.institutional_adoption}
            </p>
          </div>
          <div>
            <SectionTitle icon={ShieldCheck} title={t("detail.competitiveMoat")} />
            <p className="text-xs text-muted-foreground leading-relaxed bg-muted/20 rounded-lg p-3 border border-border/40">
              {report.competitive_moat}
            </p>
          </div>
        </section>

        {/* Cycle & Peer */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="border border-border/40 rounded-lg p-3 bg-card/30">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">{t("detail.cyclePhase")}</div>
            <div className="text-sm font-semibold flex items-center gap-2">
              <Activity className="h-4 w-4 text-emerald-500" />
              {report.cycle_phase}
            </div>
          </div>
          <div className="border border-border/40 rounded-lg p-3 bg-card/30">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">{t("detail.peerBenchmark")}</div>
            <div className="text-sm font-semibold">
              Percentile {report.peer_benchmark.peer_percentile?.toFixed(0) || "—"}% · Rank {report.peer_benchmark.category_rank || "—"}
            </div>
            {report.peer_benchmark.closest_comparables.length > 0 && (
              <div className="flex items-center gap-1 flex-wrap mt-1.5">
                {report.peer_benchmark.closest_comparables.map((c, i) => (
                  <Badge key={`${c}-${i}`} variant="outline" className="text-[10px]">{c}</Badge>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Catalysts */}
        <section>
          <SectionTitle icon={Zap} title={t("detail.catalysts")} />
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
          <SectionTitle icon={Target} title={t("detail.investmentThesis")} />
          <div className="bg-gradient-to-br from-emerald-500/10 to-teal-600/5 border border-emerald-500/20 rounded-lg p-3">
            <p className="text-sm italic text-foreground/90 leading-relaxed">
              &ldquo;{report.final_thesis}&rdquo;
            </p>
          </div>
        </section>

        {/* Kill conditions */}
        <section>
          <SectionTitle icon={ShieldAlert} title={t("detail.killConditions")} />
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
            <SectionTitle icon={AlertTriangle} title={t("detail.severeRisks")} />
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
          <SectionTitle icon={Brain} title={t("detail.finalQuestions")} />
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
            <SectionTitle icon={FlaskConical} title={t("detail.dataVerification")} />
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

        {/* Framework 3.0: Cross-Verification */}
        {report.cross_verifications && report.cross_verifications.length > 0 && (
          <section>
            <SectionTitle icon={BadgeCheck} title={t("detail.crossVerification")} />
            <div className="space-y-1.5">
              {report.cross_verifications.map((cv, i) => (
                <div key={i} className="flex items-center gap-2 p-2 rounded-lg border border-border/40 bg-card/20 text-[11px]">
                  <span className="font-semibold min-w-[80px]">{cv.metric}</span>
                  <div className="flex-1 flex items-center gap-2">
                    <span className="text-muted-foreground">{cv.source_a}:</span>
                    <span className="font-mono">{cv.value_a != null ? fmtUsd(cv.value_a) : "N/A"}</span>
                  </div>
                  <Badge variant="outline" className={cn(
                    "text-[9px]",
                    cv.status === "verified" && "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
                    cv.status === "discrepancy" && "bg-rose-500/10 text-rose-400 border-rose-500/30",
                    cv.status === "single-source" && "bg-amber-500/10 text-amber-400 border-amber-500/30",
                  )}>
                    {cv.status}
                  </Badge>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Framework 3.0: Self-Correction / Bias Checks */}
        {report.bias_checks && report.bias_checks.length > 0 && (
          <section>
            <SectionTitle icon={Brain} title={t("detail.selfCorrection")} />
            <div className="space-y-1">
              {report.bias_checks.map((bc, i) => (
                <div key={i} className="flex items-start gap-2 text-[11px] text-muted-foreground p-1.5 rounded-md bg-muted/10">
                  <span>{bc}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Fee Stability */}
        {report.fee_stability && report.fee_stability !== "unknown" && (
          <section>
            <SectionTitle icon={Gauge} title="Fee Stability" />
            <div className="p-3 rounded-lg border border-border/40 bg-card/20">
              <Badge variant="outline" className={cn(
                "text-[10px]",
                report.fee_stability === "stable" && "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
                report.fee_stability === "volatile" && "bg-rose-500/10 text-rose-400 border-rose-500/30",
              )}>
                {report.fee_stability === "stable" ? "Stable" : "Volatile"}
              </Badge>
              <p className="text-[11px] text-muted-foreground mt-1.5">
                {report.valuation_multiples?.fee_volatility_pct != null
                  ? `Fee volatility: ${report.valuation_multiples.fee_volatility_pct.toFixed(1)}% (7d avg vs 30d avg)`
                  : "Based on 24h vs 7d fee comparison"}
              </p>
            </div>
          </section>
        )}

        {/* Market Overview (CMC Keyless data) */}
        {report.market_overview && (() => {
          const mo = report.market_overview as Record<string, any>;
          return (
          <section>
            <SectionTitle icon={ChartNoAxesColumn} title="Market Overview" />
            <div className="grid grid-cols-2 gap-2">
              {mo.cmc_rank != null && (
                <div className="p-2 rounded-lg border border-border/40 bg-card/20">
                  <div className="text-[9px] text-muted-foreground uppercase">CMC Rank</div>
                  <div className="text-sm font-semibold">#{mo.cmc_rank}</div>
                </div>
              )}
              {mo.holder_count != null && (
                <div className="p-2 rounded-lg border border-border/40 bg-card/20">
                  <div className="text-[9px] text-muted-foreground uppercase">Holders</div>
                  <div className="text-sm font-semibold">{Number(mo.holder_count).toLocaleString()}</div>
                </div>
              )}
              {mo.top_10_holder_ratio != null && (
                <div className="p-2 rounded-lg border border-border/40 bg-card/20">
                  <div className="text-[9px] text-muted-foreground uppercase">Top 10 Holders</div>
                  <div className="text-sm font-semibold">{Number(mo.top_10_holder_ratio).toFixed(2)}%</div>
                </div>
              )}
              {mo.top_100_holder_ratio != null && (
                <div className="p-2 rounded-lg border border-border/40 bg-card/20">
                  <div className="text-[9px] text-muted-foreground uppercase">Top 100 Holders</div>
                  <div className="text-sm font-semibold">{Number(mo.top_100_holder_ratio).toFixed(2)}%</div>
                </div>
              )}
              {mo.ath != null && (
                <div className="p-2 rounded-lg border border-border/40 bg-card/20">
                  <div className="text-[9px] text-muted-foreground uppercase">ATH</div>
                  <div className="text-sm font-semibold">{fmtUsd(Number(mo.ath))}</div>
                </div>
              )}
              {mo.atl != null && (
                <div className="p-2 rounded-lg border border-border/40 bg-card/20">
                  <div className="text-[9px] text-muted-foreground uppercase">ATL</div>
                  <div className="text-sm font-semibold">{fmtUsd(Number(mo.atl))}</div>
                </div>
              )}
              {mo.price_high_52w != null && (
                <div className="p-2 rounded-lg border border-border/40 bg-card/20">
                  <div className="text-[9px] text-muted-foreground uppercase">52W High</div>
                  <div className="text-sm font-semibold">{fmtUsd(Number(mo.price_high_52w))}</div>
                </div>
              )}
              {mo.price_low_52w != null && (
                <div className="p-2 rounded-lg border border-border/40 bg-card/20">
                  <div className="text-[9px] text-muted-foreground uppercase">52W Low</div>
                  <div className="text-sm font-semibold">{fmtUsd(Number(mo.price_low_52w))}</div>
                </div>
              )}
              {mo.platform_count != null && (
                <div className="p-2 rounded-lg border border-border/40 bg-card/20">
                  <div className="text-[9px] text-muted-foreground uppercase">Platforms</div>
                  <div className="text-sm font-semibold">{mo.platform_count}</div>
                </div>
              )}
              {mo.market_cap_dominance != null && (
                <div className="p-2 rounded-lg border border-border/40 bg-card/20">
                  <div className="text-[9px] text-muted-foreground uppercase">MC Dominance</div>
                  <div className="text-sm font-semibold">{Number(mo.market_cap_dominance).toFixed(2)}%</div>
                </div>
              )}
              {mo.audited != null && (
                <div className="p-2 rounded-lg border border-border/40 bg-card/20">
                  <div className="text-[9px] text-muted-foreground uppercase">Audited</div>
                  <div className="text-sm font-semibold">{mo.audited ? "✓ Yes" : "✗ No"}</div>
                </div>
              )}
              {mo.percent_change_30d != null && (
                <div className="p-2 rounded-lg border border-border/40 bg-card/20">
                  <div className="text-[9px] text-muted-foreground uppercase">30d Change</div>
                  <div className={cn("text-sm font-semibold", Number(mo.percent_change_30d) >= 0 ? "text-emerald-400" : "text-rose-400")}>
                    {Number(mo.percent_change_30d) >= 0 ? "+" : ""}{Number(mo.percent_change_30d).toFixed(2)}%
                  </div>
                </div>
              )}
            </div>
            {/* Audit details */}
            {mo.audit_infos && Array.isArray(mo.audit_infos) && mo.audit_infos.length > 0 && (
              <div className="mt-2 space-y-1">
                {mo.audit_infos.slice(0, 3).map((a: any, i: number) => (
                  <div key={i} className="flex items-center gap-2 text-[10px] text-muted-foreground">
                    <BadgeCheck className="h-3 w-3 text-emerald-500" />
                    <span>{a.auditor}</span>
                    <span className="text-muted-foreground/60">{a.time?.slice(0, 10)}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
          );
        })()}

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
  const { t } = useLanguage();
  if (reports.length === 0) return null;

  const rows: { label: string; getValue: (r: FullReport) => string; getColor?: (r: FullReport) => string }[] = [
    { label: t("results.projectQuality"), getValue: (r) => r.project_quality_score.toFixed(1), getColor: (r) => scoreColor(r.project_quality_score) },
    { label: t("results.tokenQuality"), getValue: (r) => r.token_quality_score?.toFixed(1) ?? "—", getColor: (r) => (r.token_quality_score != null ? scoreColor(r.token_quality_score) : "text-muted-foreground") },
    { label: t("results.confidence"), getValue: (r) => `${r.confidence.toFixed(0)}%` },
    { label: t("detail.riskAdj"), getValue: (r) => r.decision.risk_adjusted_score.toFixed(0) },
    { label: t("results.action"), getValue: (r) => r.decision.action_label },
    { label: t("detail.valuationMultiples") ? t("detail.valuationMultiples") : "Valuation", getValue: (r) => r.valuation_label },
    { label: t("comparison.investmentAttr"), getValue: (r) => r.investment_attractiveness_score?.toFixed(0) ?? "—" },
    { label: t("detail.evidence"), getValue: (r) => r.evidence_grade.split(" - ")[0] },
    { label: t("detail.cyclePhase"), getValue: (r) => r.cycle_phase.replace("Phase ", "P") },
    { label: t("comparison.category"), getValue: (r) => r.candidate.category },
    { label: t("comparison.sector"), getValue: (r) => r.candidate.sector },
    { label: t("metrics.tvl"), getValue: (r) => fmtUsd(r.economic_engine.tvl) },
    { label: t("metrics.revenue24h"), getValue: (r) => fmtUsd(r.economic_engine.revenue) },
    { label: t("metrics.fees24h"), getValue: (r) => fmtUsd(r.economic_engine.fees) },
    { label: t("metrics.marketCap"), getValue: (r) => fmtUsd(r.tokenomics.market_cap) },
    { label: t("metrics.fdv"), getValue: (r) => fmtUsd(r.tokenomics.fdv) },
    { label: t("metrics.supplyGrowth"), getValue: (r) => fmtPct(r.tokenomics.supply_growth_pct) },
    { label: t("metrics.utilityLevel"), getValue: (r) => `${r.tokenomics.utility_level}/4` },
    { label: t("metrics.peerPercentile"), getValue: (r) => (r.peer_benchmark.peer_percentile != null ? r.peer_benchmark.peer_percentile.toFixed(0) + "%" : "—") },
  ];

  const axisRows = reports[0]?.axes.map((ax) => ax.name) ?? [];

  return (
    <div>
      <SheetHeader className="px-6 pt-6 pb-4 border-b border-border/60 sticky top-0 bg-background/95 backdrop-blur z-10">
        <SheetTitle className="flex items-center gap-2 text-base">
          <GitCompare className="h-5 w-5 text-violet-400" />
          {t("comparison.title")}
          <Badge variant="secondary" className="font-mono text-[10px]">{reports.length}</Badge>
        </SheetTitle>
        <p className="text-xs text-muted-foreground">
          {t("comparison.description", { n: rows.length + axisRows.length })}
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
  const { t } = useLanguage();
  const counts: Record<string, { count: number; cls: string; key: string }> = {};
  reports.forEach((r) => {
    const a = r.action.toLowerCase();
    let key: string;
    let cls: string;
    let i18nKey: string;
    if (a.includes("high conviction")) { key = "High Conviction"; cls = "bg-emerald-500"; i18nKey = "actions.highConviction"; }
    else if (a.includes("core")) { key = "Core Candidate"; cls = "bg-lime-500"; i18nKey = "actions.coreCandidate"; }
    else if (a.includes("small")) { key = "Small Position"; cls = "bg-amber-500"; i18nKey = "actions.smallPosition"; }
    else if (a.includes("research")) { key = "Deep Research"; cls = "bg-sky-500"; i18nKey = "actions.deepResearch"; }
    else if (a.includes("watch")) { key = "Watch"; cls = "bg-slate-400"; i18nKey = "actions.watch"; }
    else { key = "Ignore"; cls = "bg-rose-500"; i18nKey = "actions.ignore"; }
    if (!counts[key]) counts[key] = { count: 0, cls, key: i18nKey };
    counts[key].count++;
  });

  const entries = Object.entries(counts).sort((a, b) => b[1].count - a[1].count);
  const max = Math.max(...entries.map(([, v]) => v.count), 1);
  const total = reports.length;

  if (entries.length === 0) {
    return <p className="text-xs text-muted-foreground py-8 text-center">{t("common.noData")}</p>;
  }

  return (
    <div className="space-y-2.5">
      {entries.map(([label, { count, cls, key: i18nKey }]) => {
        const translated = t(i18nKey);
        const displayLabel = typeof translated === "string" && translated !== i18nKey ? translated : label;
        return (
          <div key={label} className="space-y-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-medium" dir="auto">{displayLabel}</span>
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
        );
      })}
    </div>
  );
}

// --------------------------------------------------------------------------- //
//  ScoreHistogram — vertical bar histogram of quality scores
// --------------------------------------------------------------------------- //
function ScoreHistogram({ reports }: { reports: ScanSummaryItem[] }) {
  const { t } = useLanguage();
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

// --------------------------------------------------------------------------- //
//  ReportSkeleton — loading skeleton for the detail drawer
// --------------------------------------------------------------------------- //
function ReportSkeleton() {
  return (
    <div className="px-6 py-5 space-y-6 animate-pulse">
      {/* Header skeleton */}
      <div className="flex items-center gap-3 pb-4 border-b border-border/60">
        <div className="h-12 w-12 rounded-full bg-muted/40" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-32 rounded bg-muted/40" />
          <div className="h-3 w-48 rounded bg-muted/30" />
        </div>
        <div className="h-16 w-16 rounded-full bg-muted/40" />
      </div>
      {/* Verdict skeleton */}
      <div className="space-y-2">
        <div className="h-3 w-24 rounded bg-muted/30" />
        <div className="h-16 w-full rounded-lg bg-muted/20" />
      </div>
      {/* Radar chart skeleton */}
      <div className="space-y-2">
        <div className="h-3 w-32 rounded bg-muted/30" />
        <div className="h-[260px] w-full rounded-lg bg-muted/20 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-500/50" />
        </div>
      </div>
      {/* Axis cards skeleton */}
      {[1, 2, 3].map((i) => (
        <div key={i} className="space-y-2">
          <div className="h-3 w-28 rounded bg-muted/30" />
          <div className="h-20 w-full rounded-lg bg-muted/20" />
        </div>
      ))}
      {/* Metrics grid skeleton */}
      <div className="grid grid-cols-3 gap-2">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="h-16 rounded-lg bg-muted/20" />
        ))}
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------- //
//  WatchlistView — shows saved projects from localStorage
// --------------------------------------------------------------------------- //
function WatchlistView({
  watchlist,
  onRemove,
  onSelect,
  reports,
}: {
  watchlist: Set<string>;
  onRemove: (id: string) => void;
  onSelect: (id: string) => void;
  reports: ScanSummaryItem[];
}) {
  const { t } = useLanguage();
  const watchlisted = reports.filter((r) => watchlist.has(r.id));

  return (
    <div>
      <SheetHeader className="px-6 pt-6 pb-4 border-b border-border/60 sticky top-0 bg-background/95 backdrop-blur z-10">
        <SheetTitle className="flex items-center gap-2 text-base">
          <Star className="h-5 w-5 text-amber-400 fill-current" />
          {t("watchlist.title")}
          <Badge variant="secondary" className="font-mono text-[10px]">
            {watchlist.size}
          </Badge>
        </SheetTitle>
        <p className="text-xs text-muted-foreground">
          {t("watchlist.description")}
        </p>
      </SheetHeader>

      <div className="px-6 py-5">
        {watchlisted.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/10 border border-amber-500/20 mb-4">
              <Star className="h-8 w-8 text-amber-400/50" />
            </div>
            <h3 className="text-sm font-semibold mb-1">{t("watchlist.empty")}</h3>
            <p className="text-xs text-muted-foreground max-w-xs">
              Click the star icon on any project card to add it to your watchlist.
              Watchlisted projects are saved across scans.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {watchlisted.map((r) => {
              const ab = actionBadge(r.action, t);
              return (
                <div
                  key={r.id}
                  className="flex items-center gap-3 p-3 rounded-lg border border-border/40 bg-card/30 hover:bg-card/60 transition-colors group"
                >
                  <button
                    onClick={() => onSelect(r.id)}
                    className="flex items-center gap-3 flex-1 min-w-0 text-left"
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted/40 border border-border/40 overflow-hidden flex-shrink-0">
                      {r.image ? (
                        <img src={r.image} alt={r.symbol} className="h-full w-full object-cover" />
                      ) : (
                        <span className="text-[10px] font-bold text-muted-foreground">
                          {r.symbol.slice(0, 3)}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-semibold truncate">{r.name}</span>
                        <span className="text-[11px] text-muted-foreground font-mono">${r.symbol}</span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <Badge variant="outline" className={cn("text-[9px] gap-0.5 h-4", ab.cls)}>
                          {r.action}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground">{r.category}</span>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className={cn("text-lg font-bold tabular-nums", scoreColor(r.project_quality))}>
                        {r.project_quality.toFixed(0)}
                      </div>
                      <div className="text-[9px] text-muted-foreground">/ 100</div>
                    </div>
                  </button>
                  <button
                    onClick={() => onRemove(r.id)}
                    className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10 transition-colors flex-shrink-0"
                  >
                    <Star className="h-4 w-4 fill-current text-amber-400 group-hover:text-amber-400" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------- //
//  HistoryView — scan history comparison across recent scans
// --------------------------------------------------------------------------- //
function HistoryView({
  scans,
  loading,
  onSelectScan,
  onCompareScans,
}: {
  scans: ScanStatus[];
  loading: boolean;
  onSelectScan: (scan: ScanStatus) => void;
  onCompareScans?: () => void;
}) {
  const { t } = useLanguage();
  if (loading) {
    return (
      <div>
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-border/60">
          <SheetTitle className="flex items-center gap-2 text-base">
            <History className="h-5 w-5 text-sky-400" />
            {t("history.title")}
          </SheetTitle>
          <SheetDescription className="sr-only">{t("history.loadingHistory")}</SheetDescription>
        </SheetHeader>
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-sky-500" />
        </div>
      </div>
    );
  }

  if (scans.length === 0) {
    return (
      <div>
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-border/60">
          <SheetTitle className="flex items-center gap-2 text-base">
            <History className="h-5 w-5 text-sky-400" />
            {t("history.title")}
          </SheetTitle>
          <SheetDescription className="sr-only">{t("history.noScansAvailable")}</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col items-center justify-center py-16 text-center px-6">
          <History className="h-12 w-12 text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">{t("history.noScansYet")}</p>
        </div>
      </div>
    );
  }

  // Calculate stats for each scan
  const scanStats = scans.map((s) => {
    const reports = s.reports;
    const total = reports.length;
    const avgQ = total > 0 ? reports.reduce((sum, r) => sum + r.project_quality, 0) / total : 0;
    const avgConf = total > 0 ? reports.reduce((sum, r) => sum + r.confidence, 0) / total : 0;
    const highCount = reports.filter((r) => r.project_quality >= 70).length;
    const vetoCount = reports.filter((r) => r.veto).length;
    const topProject = reports.length > 0
      ? reports.reduce((best, r) => r.project_quality > best.project_quality ? r : best, reports[0])
      : null;
    return { scan: s, total, avgQ, avgConf, highCount, vetoCount, topProject };
  });

  return (
    <div>
      <SheetHeader className="px-6 pt-6 pb-4 border-b border-border/60 sticky top-0 bg-background/95 backdrop-blur z-10">
        <div className="flex items-center justify-between gap-2">
          <SheetTitle className="flex items-center gap-2 text-base">
            <History className="h-5 w-5 text-sky-400" />
            {t("history.title")}
            <Badge variant="secondary" className="font-mono text-[10px]">{scans.length}</Badge>
          </SheetTitle>
          {onCompareScans && scans.length >= 2 && (
            <Button
              variant="outline"
              size="sm"
              onClick={onCompareScans}
              className="h-8 text-xs gap-1.5"
            >
              <GitCompare className="h-3.5 w-3.5 text-violet-400" />
              {t("history.diffScans")}
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {t("history.description", {count: scans.length})}
        </p>
      </SheetHeader>

      <div className="px-6 py-5 space-y-4">
        {/* Trend chart: avg quality over time */}
        <Card className="border-border/50 bg-card/30 backdrop-blur-sm">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <TrendingUp className="h-4 w-4 text-emerald-500" />
              {t("history.qualityTrend")}
            </CardTitle>
            <CardDescription className="text-xs">
              Average project quality across recent scans
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-2">
            <div className="flex items-end justify-between gap-2 h-32 px-2">
              {scanStats.slice().reverse().map((stat, i) => {
                const heightPct = Math.max(5, (stat.avgQ / 100) * 100);
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end">
                    <span className="text-xs font-mono font-semibold text-foreground">{stat.avgQ.toFixed(0)}</span>
                    <div className="w-full flex-1 flex items-end">
                      <div
                        className={cn("w-full rounded-t-md transition-all duration-700 min-h-[4px]", scoreBg(stat.avgQ))}
                        style={{ height: `${heightPct}%` }}
                      />
                    </div>
                    <span className="text-[9px] text-muted-foreground font-mono truncate w-full text-center">
                      {stat.scan.scan_id.slice(0, 6)}
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Scan cards */}
        <div className="space-y-3">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t("history.individualScans")}
          </div>
          {scanStats.map((stat) => (
            <button
              key={stat.scan.scan_id}
              onClick={() => onSelectScan(stat.scan)}
              className="w-full text-left p-4 rounded-xl border border-border/50 bg-card/30 hover:bg-card/60 hover:border-sky-500/40 transition-all group"
            >
              <div className="flex items-center justify-between gap-3 mb-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">{stat.scan.scan_id.slice(0, 12)}</span>
                    <Badge variant="outline" className="text-[10px] capitalize">{t(`personas.${stat.scan.config.persona}`)}</Badge>
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    {new Date(stat.scan.started_at).toLocaleString()}
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-sky-400 transition-colors" />
              </div>
              <div className="grid grid-cols-4 gap-2">
                <div className="text-center p-2 rounded-lg bg-muted/20">
                  <div className="text-[10px] text-muted-foreground">{t("analytics.projects")}</div>
                  <div className="text-sm font-bold font-mono">{stat.total}</div>
                </div>
                <div className="text-center p-2 rounded-lg bg-muted/20">
                  <div className="text-[10px] text-muted-foreground">{t("history.avgQuality")}</div>
                  <div className={cn("text-sm font-bold font-mono", scoreColor(stat.avgQ))}>{stat.avgQ.toFixed(1)}</div>
                </div>
                <div className="text-center p-2 rounded-lg bg-muted/20">
                  <div className="text-[10px] text-muted-foreground">{t("history.avgConf")}</div>
                  <div className="text-sm font-bold font-mono text-emerald-400">{stat.avgConf.toFixed(0)}%</div>
                </div>
                <div className="text-center p-2 rounded-lg bg-muted/20">
                  <div className="text-[10px] text-muted-foreground">{t("history.high70")}</div>
                  <div className="text-sm font-bold font-mono text-lime-400">{stat.highCount}</div>
                </div>
              </div>
              {stat.topProject && (
                <div className="mt-2 flex items-center gap-1.5 text-[11px]">
                  <Sparkles className="h-3 w-3 text-amber-400" />
                  <span className="text-muted-foreground">{t("history.top")}:</span>
                  <span className="font-semibold">{stat.topProject.name}</span>
                  <span className="text-muted-foreground font-mono">({stat.topProject.project_quality.toFixed(0)})</span>
                </div>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------- //
//  MarketSentimentBanner — prominent gauge showing overall market health
// --------------------------------------------------------------------------- //
function MarketSentimentBanner({
  stats,
}: {
  stats: { total: number; avgQ: number; avgConf: number; highCount: number; vetoCount: number; topSector: string };
}) {
  const { t } = useLanguage();
  // Calculate a composite sentiment score (0-100)
  const qualityComponent = stats.avgQ; // 0-100
  const confidenceComponent = stats.avgConf; // 0-100
  const highRatio = stats.total > 0 ? (stats.highCount / stats.total) * 100 : 0;
  const vetoPenalty = stats.total > 0 ? (stats.vetoCount / stats.total) * 100 : 0;
  const sentiment = Math.round(
    qualityComponent * 0.4 + confidenceComponent * 0.25 + highRatio * 0.35 - vetoPenalty * 0.2,
  );
  const clampedSentiment = Math.max(0, Math.min(100, sentiment));

  let label: string;
  let color: string;
  let bgGradient: string;
  let icon: typeof Gauge;
  if (clampedSentiment >= 70) {
    label = t("sentiment.bullish");
    color = "text-emerald-400";
    bgGradient = "from-emerald-500/15 via-teal-500/10 to-transparent";
    icon = TrendingUp;
  } else if (clampedSentiment >= 50) {
    label = t("sentiment.cautiouslyOptimistic");
    color = "text-lime-400";
    bgGradient = "from-lime-500/15 via-amber-500/5 to-transparent";
    icon = Activity;
  } else if (clampedSentiment >= 30) {
    label = t("sentiment.neutral");
    color = "text-amber-400";
    bgGradient = "from-amber-500/15 via-orange-500/5 to-transparent";
    icon = Gauge;
  } else {
    label = t("sentiment.bearish");
    color = "text-rose-400";
    bgGradient = "from-rose-500/15 via-red-500/5 to-transparent";
    icon = TrendingDown;
  }

  const SentimentIcon = icon;

  return (
    <div className={cn("relative overflow-hidden rounded-xl border p-4 bg-gradient-to-r", bgGradient, "border-border/50")}>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className={cn("flex h-14 w-14 items-center justify-center rounded-full bg-background/60 border border-border/40", color)}>
            <SentimentIcon className="h-7 w-7" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold">{t("sentiment.title")}</span>
              <Badge className={cn("text-[10px] border-transparent", color.replace("text-", "bg-").replace("-400", "-500/20"))} dir="auto">
                {label}
              </Badge>
            </div>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className={cn("text-3xl font-bold tabular-nums", color)}>{clampedSentiment}</span>
              <span className="text-sm text-muted-foreground">/ 100</span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5" dir="auto">
              {t("sentiment.basedOn", { total: stats.total, high: stats.highCount, veto: stats.vetoCount })}
            </p>
          </div>
        </div>
        {/* Sentiment meter bar */}
        <div className="hidden sm:flex flex-col items-end gap-1.5 flex-shrink-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-muted-foreground">{t("sentiment.bearishLabel")}</span>
            <div className="relative w-32 h-2 rounded-full bg-muted/30 overflow-hidden">
              <div
                className={cn("absolute inset-y-0 left-0 rounded-full transition-all duration-1000", scoreBg(clampedSentiment))}
                style={{ width: `${clampedSentiment}%` }}
              />
              {/* Tick marks */}
              {[25, 50, 75].map((tick) => (
                <div key={tick} className="absolute inset-y-0 w-px bg-background/40" style={{ left: `${tick}%` }} />
              ))}
            </div>
            <span className="text-[10px] text-muted-foreground">{t("sentiment.bullishLabel")}</span>
          </div>
          <div className="text-[10px] text-muted-foreground font-mono">
            Q:{stats.avgQ.toFixed(0)} · C:{stats.avgConf.toFixed(0)}% · H:{stats.highCount}
          </div>
        </div>
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------- //
//  GlobalSearchView — search across all completed scans
// --------------------------------------------------------------------------- //
function GlobalSearchView({
  query,
  onQueryChange,
  results,
  loading,
  onSelect,
}: {
  query: string;
  onQueryChange: (q: string) => void;
  results: { scan: ScanListItem; report: ScanSummaryItem }[];
  loading: boolean;
  onSelect: (reportId: string) => void;
}) {
  const { t } = useLanguage();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div>
      <SheetHeader className="px-6 pt-6 pb-4 border-b border-border/60 sticky top-0 bg-background/95 backdrop-blur z-10">
        <SheetTitle className="flex items-center gap-2 text-base">
          <Search className="h-5 w-5 text-muted-foreground" />
          Global Search
        </SheetTitle>
        <SheetDescription className="sr-only">
          Search for projects by name, symbol, or category across all completed scans
        </SheetDescription>
        <div className="relative mt-2">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            ref={inputRef}
            placeholder={t("search.placeholder")}
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            className="h-10 ps-10 text-sm"
          />
          {loading && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
          )}
        </div>
      </SheetHeader>

      <div className="px-6 py-5">
        {!query.trim() ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Search className="h-12 w-12 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">{t("search.empty")}</p>
            <p className="text-[11px] text-muted-foreground/70 mt-1">{t("search.emptyDesc")}</p>
          </div>
        ) : results.length === 0 && !loading ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-sm text-muted-foreground">{t("search.noResults", {query})}</p>
          </div>
        ) : (
          <>
            <div className="text-[10px] text-muted-foreground mb-3">
              {results.length} result{results.length !== 1 ? "s" : ""} across {new Set(results.map((r) => r.scan.scan_id)).size} scan{new Set(results.map((r) => r.scan.scan_id)).size !== 1 ? "s" : ""}
            </div>
            <div className="space-y-2">
              {results.map((result, i) => {
                const ab = actionBadge(result.report.action, t);
                return (
                  <button
                    key={`${result.report.id}-${i}`}
                    onClick={() => onSelect(result.report.id)}
                    className="w-full flex items-center gap-3 p-3 rounded-lg border border-border/40 bg-card/30 hover:bg-card/60 hover:border-emerald-500/40 transition-all group text-left"
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted/40 border border-border/40 overflow-hidden flex-shrink-0">
                      {result.report.image ? (
                        <img src={result.report.image} alt={result.report.symbol} className="h-full w-full object-cover" />
                      ) : (
                        <span className="text-[10px] font-bold text-muted-foreground">{result.report.symbol.slice(0, 3)}</span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-semibold truncate">{result.report.name}</span>
                        <span className="text-[11px] text-muted-foreground font-mono">${result.report.symbol}</span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <Badge variant="outline" className={cn("text-[9px] gap-0.5 h-4", ab.cls)}>
                          {result.report.action}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground">{result.report.category}</span>
                        <span className="text-[10px] text-muted-foreground/50">·</span>
                        <span className="text-[10px] text-muted-foreground font-mono">{result.scan.scan_id.slice(0, 8)}</span>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className={cn("text-lg font-bold tabular-nums", scoreColor(result.report.project_quality))}>
                        {result.report.project_quality.toFixed(0)}
                      </div>
                      <div className="text-[9px] text-muted-foreground">/ 100</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------- //
//  ScanDiffView — side-by-side comparison of two scans
// --------------------------------------------------------------------------- //
function ScanDiffView({ scanA, scanB }: { scanA: ScanStatus | null; scanB: ScanStatus | null }) {
  const { t } = useLanguage();
  if (!scanA || !scanB) {
    return (
      <div>
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-border/60">
          <SheetTitle className="flex items-center gap-2 text-base">
            <GitCompare className="h-5 w-5 text-violet-400" />
            Scan Diff
          </SheetTitle>
          <SheetDescription className="sr-only">{t("scanDiff.selectTwoShort")}</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col items-center justify-center py-16 text-center px-6">
          <GitCompare className="h-12 w-12 text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">{t("scanDiff.selectTwo")}</p>
        </div>
      </div>
    );
  }

  const statsA = {
    total: scanA.reports.length,
    avgQ: scanA.reports.length > 0 ? scanA.reports.reduce((s, r) => s + r.project_quality, 0) / scanA.reports.length : 0,
    avgConf: scanA.reports.length > 0 ? scanA.reports.reduce((s, r) => s + r.confidence, 0) / scanA.reports.length : 0,
    highCount: scanA.reports.filter((r) => r.project_quality >= 70).length,
    vetoCount: scanA.reports.filter((r) => r.veto).length,
  };
  const statsB = {
    total: scanB.reports.length,
    avgQ: scanB.reports.length > 0 ? scanB.reports.reduce((s, r) => s + r.project_quality, 0) / scanB.reports.length : 0,
    avgConf: scanB.reports.length > 0 ? scanB.reports.reduce((s, r) => s + r.confidence, 0) / scanB.reports.length : 0,
    highCount: scanB.reports.filter((r) => r.project_quality >= 70).length,
    vetoCount: scanB.reports.filter((r) => r.veto).length,
  };

  const symbolsA = new Set(scanA.reports.map((r) => r.symbol));
  const commonProjects = scanB.reports.filter((r) => symbolsA.has(r.symbol));
  const onlyInA = scanA.reports.filter((r) => !scanB.reports.some((s) => s.symbol === r.symbol));
  const onlyInB = scanB.reports.filter((r) => !scanA.reports.some((s) => s.symbol === r.symbol));

  const diffRows: { label: string; a: number; b: number; format: (v: number) => string; invert?: boolean }[] = [
    { label: "Total Projects", a: statsA.total, b: statsB.total, format: (v) => v.toString() },
    { label: "Avg Quality", a: statsA.avgQ, b: statsB.avgQ, format: (v) => v.toFixed(1) },
    { label: "Avg Confidence", a: statsA.avgConf, b: statsB.avgConf, format: (v) => `${v.toFixed(0)}%` },
    { label: "High Score (70+)", a: statsA.highCount, b: statsB.highCount, format: (v) => v.toString() },
    { label: "Vetoed", a: statsA.vetoCount, b: statsB.vetoCount, format: (v) => v.toString(), invert: true },
  ];

  return (
    <div>
      <SheetHeader className="px-6 pt-6 pb-4 border-b border-border/60 sticky top-0 bg-background/95 backdrop-blur z-10">
        <SheetTitle className="flex items-center gap-2 text-base">
          <GitCompare className="h-5 w-5 text-violet-400" />
          Scan Diff
        </SheetTitle>
        <SheetDescription className="sr-only">{t("scanDiff.sideBySide")}</SheetDescription>
        <p className="text-xs text-muted-foreground">
          Comparing {scanA.scan_id.slice(0, 8)} vs {scanB.scan_id.slice(0, 8)}
        </p>
      </SheetHeader>

      <div className="px-6 py-5 space-y-5">
        {/* Scan headers */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { scan: scanA, stats: statsA, color: "sky" as const },
            { scan: scanB, stats: statsB, color: "violet" as const },
          ].map(({ scan, stats, color }) => (
            <div key={scan.scan_id} className={cn(
              "p-3 rounded-xl border",
              color === "sky" ? "border-sky-500/30 bg-sky-500/5" : "border-violet-500/30 bg-violet-500/5",
            )}>
              <div className="flex items-center gap-2 mb-2">
                <div className={cn("h-2 w-2 rounded-full", color === "sky" ? "bg-sky-500" : "bg-violet-500")} />
                <span className="font-mono text-xs font-semibold">{scan.scan_id.slice(0, 12)}</span>
              </div>
              <div className="text-[10px] text-muted-foreground mb-2">
                {new Date(scan.started_at).toLocaleString()}
              </div>
              <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                <div>{t("history.projects")}: <span className="font-mono font-semibold">{stats.total}</span></div>
                <div>{t("history.avgQ")}: <span className={cn("font-mono font-semibold", scoreColor(stats.avgQ))}>{stats.avgQ.toFixed(1)}</span></div>
                <div>{t("history.avgConf")}: <span className="font-mono font-semibold text-emerald-400">{stats.avgConf.toFixed(0)}%</span></div>
                <div>{t("history.high70")}: <span className="font-mono font-semibold text-lime-400">{stats.highCount}</span></div>
              </div>
            </div>
          ))}
        </div>

        {/* Metrics diff table */}
        <Card className="border-border/50 bg-card/30 backdrop-blur-sm">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Gauge className="h-4 w-4 text-emerald-500" />
              Metrics Comparison
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-2">
            <div className="space-y-1">
              <div className="grid grid-cols-[1fr_80px_80px_80px] gap-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground pb-1 border-b border-border/30">
                <div>{t("scanDiff.metric")}</div>
                <div className="text-right text-sky-400">{t("scanDiff.scanA")}</div>
                <div className="text-right text-violet-400">{t("scanDiff.scanB")}</div>
                <div className="text-right">{t("scanDiff.change")}</div>
              </div>
              {diffRows.map((row, i) => {
                const diff = row.b - row.a;
                const isPositive = row.invert ? diff < 0 : diff > 0;
                const isNegative = row.invert ? diff > 0 : diff < 0;
                return (
                  <div key={i} className="grid grid-cols-[1fr_80px_80px_80px] gap-2 py-1.5 text-xs items-center hover:bg-muted/10 rounded px-1">
                    <div className="text-muted-foreground">{row.label}</div>
                    <div className="text-right font-mono font-semibold">{row.format(row.a)}</div>
                    <div className="text-right font-mono font-semibold">{row.format(row.b)}</div>
                    <div className={cn(
                      "text-right font-mono font-semibold flex items-center justify-end gap-0.5",
                      diff === 0 ? "text-muted-foreground" : isPositive ? "text-emerald-400" : isNegative ? "text-rose-400" : "text-muted-foreground",
                    )}>
                      {diff > 0 && <TrendingUp className="h-3 w-3" />}
                      {diff < 0 && <TrendingDown className="h-3 w-3" />}
                      {diff === 0 ? "—" : `${diff > 0 ? "+" : ""}${row.format(Math.abs(diff))}`}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Project overlap */}
        <Card className="border-border/50 bg-card/30 backdrop-blur-sm">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Layers className="h-4 w-4 text-amber-500" />
              Project Overlap
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-2">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-3 rounded-lg bg-sky-500/5 border border-sky-500/20">
                <div className="text-[10px] text-muted-foreground uppercase">{t("scanDiff.onlyInA")}</div>
                <div className="text-2xl font-bold text-sky-400">{onlyInA.length}</div>
              </div>
              <div className="p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
                <div className="text-[10px] text-muted-foreground uppercase">{t("scanDiff.common")}</div>
                <div className="text-2xl font-bold text-emerald-400">{commonProjects.length}</div>
              </div>
              <div className="p-3 rounded-lg bg-violet-500/5 border border-violet-500/20">
                <div className="text-[10px] text-muted-foreground uppercase">{t("scanDiff.onlyInB")}</div>
                <div className="text-2xl font-bold text-violet-400">{onlyInB.length}</div>
              </div>
            </div>
            {onlyInA.length > 0 && (
              <div className="mt-3">
                <div className="text-[10px] text-muted-foreground mb-1.5">{t("scanDiff.onlyInScanA")}:</div>
                <div className="flex flex-wrap gap-1">
                  {onlyInA.slice(0, 8).map((r) => (
                    <Badge key={r.id} variant="outline" className="text-[10px] gap-1 text-sky-400 border-sky-500/30">
                      {r.symbol}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            {onlyInB.length > 0 && (
              <div className="mt-2">
                <div className="text-[10px] text-muted-foreground mb-1.5">{t("scanDiff.onlyInScanB")}:</div>
                <div className="flex flex-wrap gap-1">
                  {onlyInB.slice(0, 8).map((r) => (
                    <Badge key={r.id} variant="outline" className="text-[10px] gap-1 text-violet-400 border-violet-500/30">
                      {r.symbol}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------- //
//  BacktestView — compare framework predictions with price performance
// --------------------------------------------------------------------------- //
function BacktestView() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const fetchBacktest = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/scanner/backtest");
      if (res.ok) setData(await res.json());
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    fetch(`/api/scanner/backtest`, { signal: ctrl.signal })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d) setData(d); })
      .catch(() => {});
    return () => ctrl.abort();
  }, []);

  if (loading) return <Card className="border-border/60 bg-card/40 backdrop-blur-sm"><CardContent className="p-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></CardContent></Card>;
  if (!data) return null;

  const s = data.summary || {};
  return (
    <Card className="border-border/60 bg-card/40 backdrop-blur-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Target className="h-4 w-4 text-violet-500" /> Backtest Results
        </CardTitle>
        <CardDescription className="text-xs">
          Comparing framework scores with 30d price performance
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {s.total_compared > 0 ? (
          <>
            <div className="grid grid-cols-3 gap-2">
              <div className="p-2 rounded-lg border border-border/40 bg-card/20 text-center">
                <div className="text-[9px] text-muted-foreground uppercase">Accuracy</div>
                <div className={cn("text-lg font-bold", s.accuracy_pct >= 60 ? "text-emerald-400" : s.accuracy_pct >= 40 ? "text-amber-400" : "text-rose-400")}>
                  {s.accuracy_pct}%
                </div>
              </div>
              <div className="p-2 rounded-lg border border-border/40 bg-card/20 text-center">
                <div className="text-[9px] text-muted-foreground uppercase">Avg Score (↑)</div>
                <div className="text-lg font-bold text-emerald-400">{s.avg_score_price_up}</div>
              </div>
              <div className="p-2 rounded-lg border border-border/40 bg-card/20 text-center">
                <div className="text-[9px] text-muted-foreground uppercase">Avg Score (↓)</div>
                <div className="text-lg font-bold text-rose-400">{s.avg_score_price_down}</div>
              </div>
            </div>
            <div className="max-h-48 overflow-y-auto space-y-1">
              {(data.results || []).filter((r: any) => r.change_pct !== null).map((r: any, i: number) => (
                <div key={i} className="flex items-center gap-2 p-1.5 rounded-md border border-border/30 bg-card/10 text-[11px]">
                  <span className="font-mono font-semibold w-12">{r.symbol}</span>
                  <span className="text-muted-foreground">score={r.score?.toFixed(0)}</span>
                  <span className={cn("font-mono ml-auto", r.change_pct >= 0 ? "text-emerald-400" : "text-rose-400")}>
                    {r.change_pct >= 0 ? "+" : ""}{r.change_pct}%
                  </span>
                  {r.correct !== null && (
                    <Badge variant="outline" className={cn("text-[8px] h-4", r.correct ? "text-emerald-400 border-emerald-500/30" : "text-rose-400 border-rose-500/30")}>
                      {r.correct ? "✓" : "✗"}
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="text-center py-4">
            <p className="text-xs text-muted-foreground">
              Not enough data yet. Run more analyses to accumulate score history.
            </p>
            <p className="text-[10px] text-muted-foreground mt-1">
              {data.count} symbols in history, {data.valid_count} with price data
            </p>
          </div>
        )}
        <Button size="sm" variant="outline" onClick={fetchBacktest} className="w-full h-7 text-xs gap-1.5">
          <RefreshCw className="h-3 w-3" /> Refresh
        </Button>
      </CardContent>
    </Card>
  );
}

// --------------------------------------------------------------------------- //
//  HelpView — onboarding guide and framework explanation
// --------------------------------------------------------------------------- //
function HelpView() {
  const { t } = useLanguage();
  const sections = [
    {
      icon: Crosshair,
      title: t("help.configure"),
      color: "text-emerald-400",
      items: t("help.configureItems") as unknown as string[],
    },
    {
      icon: Zap,
      title: t("help.run"),
      color: "text-amber-400",
      items: t("help.runItems") as unknown as string[],
    },
    {
      icon: Gauge,
      title: t("help.explore"),
      color: "text-sky-400",
      items: t("help.exploreItems") as unknown as string[],
    },
    {
      icon: ShieldAlert,
      title: t("help.understand"),
      color: "text-rose-400",
      items: t("help.understandItems") as unknown as string[],
    },
    {
      icon: GitCompare,
      title: t("help.compareTrack"),
      color: "text-violet-400",
      items: t("help.compareTrackItems") as unknown as string[],
    },
    {
      icon: Download,
      title: t("help.exportShare"),
      color: "text-teal-400",
      items: t("help.exportShareItems") as unknown as string[],
    },
  ];

  const shortcuts = [
    { key: "S", desc: "Start scan" },
    { key: "/", desc: "Focus search" },
    { key: "G", desc: "Grid view" },
    { key: "A", desc: "Analytics view" },
    { key: "C", desc: "Compare mode" },
    { key: "W", desc: "Watchlist" },
    { key: "⌘K", desc: "Global search" },
    { key: "Esc", desc: "Close dialog" },
  ];

  return (
    <div>
      <SheetHeader className="px-6 pt-6 pb-4 border-b border-border/60 sticky top-0 bg-background/95 backdrop-blur z-10">
        <SheetTitle className="flex items-center gap-2 text-base">
          <HelpCircle className="h-5 w-5 text-emerald-400" />
          {t("help.title")}
        </SheetTitle>
        <p className="text-xs text-muted-foreground">
          {t("help.description")}
        </p>
      </SheetHeader>

      <div className="px-6 py-5 space-y-5">
        {/* Framework philosophy */}
        <div className="rounded-xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 to-teal-600/5 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="h-4 w-4 text-emerald-400" />
            <h3 className="text-sm font-semibold text-emerald-400">{t("help.corePrinciple")}</h3>
          </div>
          <p className="text-xs text-foreground/80 leading-relaxed">
            <span className="font-mono font-semibold">Evidence &gt; Narrative</span>
            {" · "}
            <span className="font-mono font-semibold">Revenue &gt; Hype</span>
            {" · "}
            <span className="font-mono font-semibold">Adoption &gt; Attention</span>
          </p>
          <p className="text-[11px] text-muted-foreground mt-2" dir="auto">
            {t("help.corePrincipleDesc")}
          </p>
        </div>

        {/* Steps */}
        {sections.map((section) => {
          const Icon = section.icon;
          return (
            <div key={section.title}>
              <div className="flex items-center gap-2 mb-2">
                <Icon className={cn("h-4 w-4", section.color)} />
                <h3 className="text-sm font-semibold" dir="auto">{section.title}</h3>
              </div>
              <ul className="space-y-1.5 ml-6">
                {section.items.map((item, i) => (
                  <li key={i} className="text-xs text-muted-foreground flex gap-2">
                    <span className="text-emerald-500/50 flex-shrink-0">•</span>
                    <span dir="auto">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}

        {/* Keyboard shortcuts */}
        <div className="rounded-xl border border-border/50 bg-card/30 p-4">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Zap className="h-4 w-4 text-amber-400" />
            {t("help.keyboardShortcuts")}
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {shortcuts.map((s) => (
              <div key={s.key} className="flex items-center gap-2 text-xs">
                <kbd className="px-2 py-1 rounded bg-muted/40 border border-border/40 font-mono text-[10px] font-semibold min-w-[28px] text-center">
                  {s.key}
                </kbd>
                <span className="text-muted-foreground" dir="auto">{s.desc}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Data sources */}
        <div className="rounded-xl border border-border/50 bg-muted/10 p-4">
          <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
            <Activity className="h-4 w-4 text-sky-400" />
            {t("help.dataSources")}
          </h3>
          <div className="space-y-1 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[10px]">CoinGecko</Badge>
              <span dir="auto">{t("help.coinGeckoDesc")}</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[10px]">DeFiLlama</Badge>
              <span dir="auto">{t("help.defiLlamaDesc")}</span>
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground/70 mt-2" dir="auto">
            {t("help.dataSourcesNote")}
          </p>
        </div>

        {/* Disclaimer */}
        <div className="rounded-lg bg-rose-500/5 border border-rose-500/20 p-3">
          <p className="text-[11px] text-rose-300/80" dir="auto">
            {t("help.disclaimer")}
          </p>
        </div>
      </div>
    </div>
  );
}
