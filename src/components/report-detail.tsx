"use client";

// --------------------------------------------------------------------------- //
//  ReportDetail
//  Extracted from src/app/page.tsx (commit 2 of incremental refactor).
//  Self-contained component rendering the full project report inside the
//  detail Sheet. Internal helpers: SectionTitle, Metric, AXIS_ICONS.
// --------------------------------------------------------------------------- //

import {
  Activity,
  AlertTriangle,
  BadgeCheck,
  Brain,
  ChartNoAxesColumn,
  CircleDollarSign,
  Copy,
  Download,
  ExternalLink,
  FlaskConical,
  Gauge,
  Github,
  Globe,
  Layers,
  MessageCircle,
  Radar,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Twitter,
  Zap,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { AxisRadarChart } from "@/components/dashboard/axis-radar-chart";
import { ScoreRadial } from "@/components/dashboard/score-radial";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import {
  actionBadge,
  fmtPct,
  fmtUsd,
  scoreBg,
  scoreColor,
  translateAxisName,
  translateSubFactor,
} from "@/lib/format-utils";
import type { FullReport } from "@/lib/scanner-types";
import { cn } from "@/lib/utils";

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

export function ReportDetail({
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
              label={t("metrics.feeGrowth")}
              value={fmtPct(report.economic_engine.fee_growth_pct)}
              tone={report.economic_engine.fee_growth_pct != null && report.economic_engine.fee_growth_pct < 0 ? "neg" : "pos"}
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

        {/* RD-3 fix: Cross-Verification — was only rendering source_a, dropping source_b/value_b/discrepancy_pct */}
        {report.cross_verifications && report.cross_verifications.length > 0 && (
          <section>
            <SectionTitle icon={ShieldCheck} title={t("detail.crossVerification", "Cross-Verification")} />
            <div className="space-y-2">
              {report.cross_verifications.map((cv, i) => (
                <div key={i} className="p-2 rounded-lg border border-border/40 bg-card/20 text-[11px]">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium">{cv.metric}</span>
                    <Badge variant="outline" className={cn(
                      "text-[10px]",
                      cv.status === "verified" && "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
                      cv.status === "discrepancy" && "bg-amber-500/10 text-amber-400 border-amber-500/30",
                      cv.status === "single-source" && "bg-slate-500/10 text-slate-400 border-slate-500/30",
                    )}>
                      {cv.status === "verified" ? t("detail.verified", "Verified")
                       : cv.status === "discrepancy" ? t("detail.discrepancy", "Discrepancy")
                       : t("detail.singleSource", "Single Source")}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-muted-foreground">
                    <div>
                      <span className="text-[10px] uppercase">{cv.source_a}</span>
                      <div className="font-mono">{cv.value_a != null ? fmtUsd(cv.value_a) : "—"}</div>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase">{cv.source_b || "—"}</span>
                      <div className="font-mono">{cv.value_b != null ? fmtUsd(cv.value_b) : "—"}</div>
                    </div>
                  </div>
                  {cv.discrepancy_pct != null && (
                    <div className="mt-1 text-[10px] text-muted-foreground">
                      {t("detail.discrepancyPct", "Δ")}: {cv.discrepancy_pct.toFixed(1)}%
                    </div>
                  )}
                </div>
              ))}
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
