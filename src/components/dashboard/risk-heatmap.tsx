"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// --------------------------------------------------------------------------- //
//  Types
// --------------------------------------------------------------------------- //

export interface RiskHeatmapRisk {
  /** Full risk name, e.g. "Anonymous team". */
  name: string;
  /** Whether this risk is present on the project. */
  present: boolean;
}

export interface RiskHeatmapProject {
  /** Full project name, e.g. "Aave". */
  name: string;
  /** Ticker symbol shown in the sticky first column, e.g. "AAVE". */
  symbol: string;
  /** Risk assessments for the project. */
  risks: RiskHeatmapRisk[];
  /** Project quality score (0–100). Drives the right-hand colour bar. */
  project_quality: number;
}

export interface RiskHeatmapProps {
  /** Projects to render in the heatmap. */
  projects: RiskHeatmapProject[];
  /** Extra classes for the wrapper. */
  className?: string;
}

// --------------------------------------------------------------------------- //
//  Helpers — risk name abbreviation
// --------------------------------------------------------------------------- //
//
// The spec mandates these abbreviations:
//   "Anon Team"               → "Anon"
//   "Centralized Gov"         → "CentGov"
//   "Regulatory Uncertainty"  → "RegUnc"
//   "Near Unlock Cliff"       → "Unlock"
//   "Critical Chain Dep"      → "ChainDep"
//   "Unclear Token VC"        → "TokVC"
//
// The framework's actual risk names are slightly different ("Anonymous team",
// "Centralized governance", "Regulatory uncertainty", "Near unlock cliff",
// "Critical chain dependency", "Unclear token value capture"). A regex-based
// matcher handles both variants cleanly.

const RISK_ABBR_MAP: Array<{ test: RegExp; abbr: string }> = [
  { test: /anon/i, abbr: "Anon" },
  { test: /audit/i, abbr: "Audit" },
  { test: /gov/i, abbr: "CentGov" },
  { test: /upgrade/i, abbr: "UpgAuth" },
  { test: /solver/i, abbr: "Solver" },
  { test: /concentr/i, abbr: "Concentr" },
  { test: /unlock/i, abbr: "Unlock" },
  { test: /chain\s*dep/i, abbr: "ChainDep" },
  { test: /token/i, abbr: "TokVC" },
  { test: /regulat/i, abbr: "RegUnc" },
];

function abbreviateRisk(name: string): string {
  for (const { test, abbr } of RISK_ABBR_MAP) {
    if (test.test(name)) return abbr;
  }
  return name.length > 8 ? name.slice(0, 7) + "…" : name;
}

// --------------------------------------------------------------------------- //
//  Quality colour — mirrors scoreColor() in page.tsx
//  Thresholds (by score / 100):
//    0.00 – 0.40  → rose      (poor)
//    0.40 – 0.55  → orange    (below average)
//    0.55 – 0.70  → amber     (average)
//    0.70 – 0.85  → lime      (good)
//    0.85 – 1.00  → emerald   (excellent)
// --------------------------------------------------------------------------- //

function qualityColor(score: number): string {
  if (score >= 85) return "#10b981"; // emerald-500
  if (score >= 70) return "#84cc16"; // lime-500
  if (score >= 55) return "#f59e0b"; // amber-500
  if (score >= 40) return "#f97316"; // orange-500
  return "#f43f5e"; // rose-500
}

// --------------------------------------------------------------------------- //
//  Layout constants
// --------------------------------------------------------------------------- //

const CELL_W = 48;
const CELL_H = 30;
const SYM_W = 96;
const QUALITY_W = 80;

// --------------------------------------------------------------------------- //
//  Component
// --------------------------------------------------------------------------- //

/**
 * RiskHeatmap — a scrollable heatmap grid visualising the presence of severe
 * risks across all scanned projects, with a project-quality colour bar on the
 * right.
 *
 * Layout (CSS grid, scrollable):
 *   ┌─────────┬──────┬──────┬…┬──────────┐
 *   │ Project │ Anon │ RegU │ │  Quality │   ← sticky header row (top-0)
 *   ├─────────┼──────┼──────┼…┼──────────┤
 *   │  AAVE   │  ■   │  □   │ │  ████ 29 │   ← sticky first column (left-0)
 *   │  UNI    │  □   │  ■   │ │  ██ 22   │
 *   │  …      │      │      │ │          │
 *   ├─────────┼──────┼──────┼…┼──────────┤
 *   │ Totals  │  3   │  5   │ │  avg 24  │   ← summary row at bottom
 *   └─────────┴──────┴──────┴─┴──────────┘
 *
 * Features:
 *  - Sticky header row + sticky first column (corner cell pinned to both)
 *  - Cells use exact Tailwind classes from spec:
 *      present → bg-rose-500/70 hover:bg-rose-500
 *      absent  → bg-emerald-500/10 hover:bg-emerald-500/20
 *  - Per-cell Tooltip (shadcn) showing project name + full risk name + status
 *  - Right-hand quality bar coloured by score tier (same palette as ScoreRadial)
 *  - Top legend explaining colour coding
 *  - Summary row at the bottom: total risks per type + average quality
 *  - Empty state: "No projects to display" placeholder
 *  - Max-height + overflow-auto for vertical scroll on long project lists
 */
export function RiskHeatmap({ projects, className }: RiskHeatmapProps) {
  // Collect the union of risk names across all projects, preserving the
  // first-seen order (so column order matches the first project's risk list,
  // which is the framework's canonical order).
  const riskNames = React.useMemo(() => {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const p of projects) {
      for (const r of p.risks) {
        if (!seen.has(r.name)) {
          seen.add(r.name);
          result.push(r.name);
        }
      }
    }
    return result;
  }, [projects]);

  // Per-risk-column total (how many projects have that risk present).
  const totalsByRisk = React.useMemo(
    () =>
      riskNames.map(
        (rn) =>
          projects.filter((p) => p.risks.find((r) => r.name === rn)?.present)
            .length
      ),
    [riskNames, projects]
  );

  // Average project quality (shown in the summary row's quality cell).
  const avgQuality =
    projects.length > 0
      ? Math.round(
          projects.reduce((s, p) => s + p.project_quality, 0) / projects.length
        )
      : 0;

  if (projects.length === 0) {
    return (
      <div
        className={cn(
          "rounded-lg border border-dashed border-muted/30 p-8 text-center text-sm text-muted-foreground",
          className
        )}
      >
        No projects to display
      </div>
    );
  }

  // CSS grid template: sticky symbol col + risk cols + quality col.
  const gridTemplateColumns = `${SYM_W}px repeat(${riskNames.length}, ${CELL_W}px) ${QUALITY_W}px`;

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {/* ---------------- Legend ---------------- */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm bg-rose-500/70" />
          <span>Risk present</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm bg-emerald-500/10 ring-1 ring-inset ring-emerald-500/20" />
          <span>No risk</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className="h-3 w-10 rounded-sm"
            style={{
              background:
                "linear-gradient(to right, #f43f5e, #f97316, #f59e0b, #84cc16, #10b981)",
            }}
          />
          <span>Project quality (low → high)</span>
        </div>
      </div>

      {/* ---------------- Heatmap ---------------- */}
      <div className="max-h-[440px] overflow-auto rounded-lg border border-muted/20 bg-muted/5">
        <div
          className="grid"
          style={{
            gridTemplateColumns,
            width: "max-content",
            minWidth: "100%",
          }}
        >
          {/* ---------- Header row ---------- */}
          <div
            className={cn(
              "sticky left-0 top-0 z-30 border-b border-r border-muted/20 bg-muted/90 px-2 py-1.5 text-[11px] font-semibold text-foreground backdrop-blur"
            )}
            style={{ width: SYM_W }}
          >
            Project
          </div>
          {riskNames.map((rn) => (
            <div
              key={`hdr-${rn}`}
              title={rn}
              className="sticky top-0 z-20 flex items-center justify-center border-b border-muted/20 bg-muted/90 px-1 py-1.5 text-[10px] font-medium text-muted-foreground backdrop-blur"
              style={{ width: CELL_W }}
            >
              <span className="truncate">{abbreviateRisk(rn)}</span>
            </div>
          ))}
          <div
            className="sticky top-0 z-20 border-b border-muted/20 bg-muted/90 px-2 py-1.5 text-center text-[11px] font-semibold text-foreground backdrop-blur"
            style={{ width: QUALITY_W }}
          >
            Quality
          </div>

          {/* ---------- Project rows ---------- */}
          {projects.map((p) => {
            const qColor = qualityColor(p.project_quality);
            const qPct = Math.max(0, Math.min(100, p.project_quality));
            return (
              <React.Fragment key={`row-${p.name}`}>
                {/* Sticky symbol cell */}
                <div
                  className="sticky left-0 z-10 flex items-center border-r border-muted/20 bg-background/95 px-2 py-1 backdrop-blur"
                  style={{ width: SYM_W, height: CELL_H }}
                >
                  <span
                    className="truncate font-mono text-[11px] font-semibold text-foreground"
                    title={p.name}
                  >
                    {p.symbol}
                  </span>
                </div>

                {/* Risk cells */}
                {riskNames.map((rn) => {
                  const risk = p.risks.find((r) => r.name === rn);
                  const present = risk?.present ?? false;
                  return (
                    <div
                      key={`cell-${p.name}-${rn}`}
                      className="flex items-center justify-center p-0.5"
                      style={{ width: CELL_W, height: CELL_H }}
                    >
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div
                            role="img"
                            aria-label={`${p.name} — ${rn}: ${present ? "risk present" : "no risk"}`}
                            className={cn(
                              "flex h-5 w-9 cursor-default items-center justify-center rounded-sm transition-colors",
                              present
                                ? "bg-rose-500/70 hover:bg-rose-500"
                                : "bg-emerald-500/10 hover:bg-emerald-500/20"
                            )}
                          />
                        </TooltipTrigger>
                        <TooltipContent side="top" sideOffset={4}>
                          <div className="font-semibold text-foreground">
                            {p.name}
                            <span className="ml-1 font-mono text-[10px] font-normal text-muted-foreground">
                              {p.symbol}
                            </span>
                          </div>
                          <div className="text-muted-foreground">{rn}</div>
                          <div
                            className={cn(
                              "mt-0.5 text-[10px] font-medium",
                              present ? "text-rose-300" : "text-emerald-300"
                            )}
                          >
                            {present ? "● Risk present" : "○ No risk detected"}
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  );
                })}

                {/* Quality bar cell */}
                <div
                  className="flex items-center gap-1.5 border-l border-muted/20 px-2 py-1"
                  style={{ width: QUALITY_W, height: CELL_H }}
                >
                  <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-500"
                      style={{ width: `${qPct}%`, backgroundColor: qColor }}
                    />
                  </div>
                  <span
                    className="w-6 text-right text-[11px] font-semibold tabular-nums"
                    style={{ color: qColor }}
                  >
                    {Math.round(p.project_quality)}
                  </span>
                </div>
              </React.Fragment>
            );
          })}

          {/* ---------- Summary row ---------- */}
          <div
            className="sticky left-0 z-20 border-r border-t-2 border-muted/30 bg-muted/90 px-2 py-1.5 text-[11px] font-semibold text-foreground backdrop-blur"
            style={{ width: SYM_W }}
          >
            Total risks
          </div>
          {totalsByRisk.map((t, i) => (
            <div
              key={`total-${riskNames[i]}`}
              className="flex items-center justify-center border-t-2 border-muted/30 bg-muted/90 px-1 py-1.5 text-[11px] font-semibold tabular-nums text-foreground backdrop-blur"
              style={{ width: CELL_W }}
              title={`${riskNames[i]}: ${t} project${t === 1 ? "" : "s"}`}
            >
              {t > 0 ? t : "—"}
            </div>
          ))}
          <div
            className="border-t-2 border-l border-muted/30 bg-muted/90 px-2 py-1.5 text-center text-[11px] font-medium text-muted-foreground backdrop-blur"
            style={{ width: QUALITY_W }}
          >
            avg {avgQuality}
          </div>
        </div>
      </div>
    </div>
  );
}

export default RiskHeatmap;
