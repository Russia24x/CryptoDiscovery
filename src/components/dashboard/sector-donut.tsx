"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

// --------------------------------------------------------------------------- //
//  Types
// --------------------------------------------------------------------------- //

export interface SectorDonutDatum {
  /** Sector label, e.g. "DeFi". */
  label: string;
  /** Number of projects in this sector. */
  value: number;
  /** Optional explicit segment colour (hex / css color). Falls back to palette. */
  color?: string;
}

export interface SectorDonutProps {
  /** Sector distribution data. */
  data: SectorDonutDatum[];
  /** Outer diameter of the donut in pixels. Defaults to 200. */
  size?: number;
  /** Ring thickness in pixels. Defaults to 28. */
  thickness?: number;
  /** Extra classes for the wrapper. */
  className?: string;
  /** Small muted label rendered above the centre value. */
  centerLabel?: string;
  /** Large bold value rendered in the centre. */
  centerValue?: string | number;
}

// --------------------------------------------------------------------------- //
//  Palette — emerald, sky, amber, violet, rose, teal, orange, lime
// --------------------------------------------------------------------------- //

const PALETTE = [
  "#10b981", // emerald-500
  "#0ea5e9", // sky-500
  "#f59e0b", // amber-500
  "#8b5cf6", // violet-500
  "#f43f5e", // rose-500
  "#14b8a6", // teal-500
  "#f97316", // orange-500
  "#84cc16", // lime-500
] as const;

/** Angular gap between segments (degrees). */
const GAP_DEG = 2.5;

// --------------------------------------------------------------------------- //
//  Helpers
// --------------------------------------------------------------------------- //

function polarToCartesian(
  cx: number,
  cy: number,
  r: number,
  angleDeg: number
): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

interface SegmentModel {
  index: number;
  label: string;
  value: number;
  color: string;
  /** Start angle (degrees, SVG convention — 0° at 3 o'clock, clockwise positive). */
  startDeg: number;
  /** End angle (degrees). */
  endDeg: number;
  /** Arc length of the visible (post-gap) segment. */
  arcLength: number;
  /** Ratio of this segment to the total (0–1). */
  ratio: number;
}

// --------------------------------------------------------------------------- //
//  Component
// --------------------------------------------------------------------------- //

/**
 * SectorDonut — a pure-SVG donut/ring chart visualising the sector distribution
 * of scanned projects.
 *
 * Features:
 *  - Segments rendered as stroked SVG arc paths (one <path> per segment)
 *  - 2.5° angular gap between segments
 *  - Palette: emerald, sky, amber, violet, rose, teal, orange, lime
 *  - Centre overlay: optional label + value
 *  - Legend: label / value / percentage (mirrors segment hover state)
 *  - Mount animation: each segment grows from 0 → full arc length
 *    (via stroke-dashoffset transition, staggered per segment)
 *  - Hover: segment expands outward (CSS scale around donut centre) +
 *    other segments dim; legend row highlights in sync
 *  - Empty data: shows "No data" placeholder
 */
export function SectorDonut({
  data,
  size = 200,
  thickness = 28,
  className,
  centerLabel,
  centerValue,
}: SectorDonutProps) {
  const [mounted, setMounted] = React.useState(false);
  const [hoveredIndex, setHoveredIndex] = React.useState<number | null>(null);

  React.useEffect(() => {
    const t = window.setTimeout(() => setMounted(true), 60);
    return () => window.clearTimeout(t);
  }, []);

  const total = data.reduce((sum, d) => sum + Math.max(0, d.value), 0);
  const hasData = data.length > 0 && total > 0;

  const center = size / 2;
  // Radius of the stroke path — leaves a 2px outer margin so the hover-scale
  // expansion doesn't clip against the SVG viewport.
  const radius = Math.max(thickness / 2 + 2, (size - thickness) / 2);
  const circumference = 2 * Math.PI * radius;

  // Compute segment geometry.
  const segments = React.useMemo<SegmentModel[]>(() => {
    if (!hasData) return [];
    let cursor = -90; // start at 12 o'clock in SVG angle convention
    return data.map((d, i) => {
      const value = Math.max(0, d.value);
      const segDeg = (value / total) * 360;
      const visibleDeg = Math.max(0, segDeg - GAP_DEG);
      const startDeg = cursor + GAP_DEG / 2;
      const endDeg = startDeg + visibleDeg;
      cursor += segDeg;
      const arcLength = (visibleDeg / 360) * circumference;
      return {
        index: i,
        label: d.label,
        value,
        color: d.color ?? PALETTE[i % PALETTE.length],
        startDeg,
        endDeg,
        arcLength,
        ratio: value / total,
      };
    });
  }, [data, total, hasData, circumference]);

  // Font sizes scale with donut size.
  const valueFontSize = Math.max(14, Math.round(size * 0.16));
  const labelFontSize = Math.max(9, Math.round(size * 0.058));

  return (
    <div
      className={cn(
        "flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:gap-6",
        className
      )}
      role="img"
      aria-label={
        hasData
          ? `Sector distribution donut chart with ${data.length} segment${data.length === 1 ? "" : "s"}`
          : "Sector distribution donut chart — no data"
      }
    >
      {/* ---------------- Donut ---------------- */}
      <div
        className="relative shrink-0"
        style={{ width: size, height: size, maxWidth: "100%" }}
      >
        {hasData ? (
          <svg
            width="100%"
            height="100%"
            viewBox={`0 0 ${size} ${size}`}
            className="block"
            style={{ height: "auto" }}
          >
            {/* Background ring track */}
            <circle
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              stroke="currentColor"
              className="text-muted/15"
              strokeWidth={thickness}
            />

            {segments.map((seg) => {
              const isHovered = hoveredIndex === seg.index;
              const dimmed = hoveredIndex !== null && !isHovered;
              const scale = mounted && isHovered ? 1.05 : 1;
              const dashoffset = mounted ? 0 : seg.arcLength;

              const start = polarToCartesian(center, center, radius, seg.startDeg);
              const end = polarToCartesian(center, center, radius, seg.endDeg);
              const largeArc = seg.endDeg - seg.startDeg > 180 ? 1 : 0;
              const pathD = `M ${start.x.toFixed(3)} ${start.y.toFixed(3)} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x.toFixed(3)} ${end.y.toFixed(3)}`;

              return (
                <path
                  key={`seg-${seg.index}-${seg.label}`}
                  d={pathD}
                  fill="none"
                  stroke={seg.color}
                  strokeWidth={isHovered ? thickness + 4 : thickness}
                  strokeLinecap="butt"
                  strokeDasharray={`${seg.arcLength} ${circumference + 1}`}
                  strokeDashoffset={dashoffset}
                  style={{
                    // Scale around the donut centre so hovered segments
                    // expand outward radially.
                    transformBox: "view-box",
                    transformOrigin: `${center}px ${center}px`,
                    transform: `scale(${scale})`,
                    transition:
                      "stroke-dashoffset 0.9s cubic-bezier(0.22, 1, 0.36, 1), transform 0.3s cubic-bezier(0.22, 1, 0.36, 1), stroke-width 0.2s ease-out, opacity 0.3s ease-out",
                    // Stagger the mount animation per segment; once mounted,
                    // hover transitions are immediate.
                    transitionDelay: mounted ? "0ms" : `${seg.index * 90}ms`,
                    opacity: dimmed ? 0.45 : 1,
                    cursor: "pointer",
                  }}
                  onMouseEnter={() => setHoveredIndex(seg.index)}
                  onMouseLeave={() => setHoveredIndex(null)}
                />
              );
            })}
          </svg>
        ) : (
          <div className="flex h-full w-full items-center justify-center rounded-full border border-dashed border-muted/30 text-xs text-muted-foreground">
            No data
          </div>
        )}

        {/* Centre overlay (label + value) */}
        {hasData && (centerLabel || centerValue !== undefined) && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-2 text-center">
            {centerLabel && (
              <span
                className="font-medium uppercase tracking-wider text-muted-foreground"
                style={{ fontSize: labelFontSize }}
              >
                {centerLabel}
              </span>
            )}
            {centerValue !== undefined && (
              <span
                className="mt-0.5 font-bold tabular-nums text-foreground"
                style={{ fontSize: valueFontSize, lineHeight: 1 }}
              >
                {centerValue}
              </span>
            )}
          </div>
        )}
      </div>

      {/* ---------------- Legend ---------------- */}
      {hasData && (
        <ul className="flex w-full flex-col gap-1 sm:max-w-[280px]">
          {segments.map((seg) => {
            const isHovered = hoveredIndex === seg.index;
            return (
              <li
                key={`legend-${seg.index}-${seg.label}`}
                onMouseEnter={() => setHoveredIndex(seg.index)}
                onMouseLeave={() => setHoveredIndex(null)}
                className={cn(
                  "flex items-center gap-2 rounded-md px-1.5 py-1 text-xs transition-colors",
                  isHovered ? "bg-muted/40" : "hover:bg-muted/20"
                )}
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-sm"
                  style={{ backgroundColor: seg.color }}
                />
                <span
                  className={cn(
                    "flex-1 truncate",
                    isHovered ? "font-semibold text-foreground" : "text-muted-foreground"
                  )}
                >
                  {seg.label}
                </span>
                <span className="tabular-nums font-medium text-foreground">
                  {seg.value}
                </span>
                <span className="w-12 text-right tabular-nums text-muted-foreground">
                  {(seg.ratio * 100).toFixed(1)}%
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default SectorDonut;
