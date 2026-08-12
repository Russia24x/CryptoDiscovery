"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

// --------------------------------------------------------------------------- //
//  Types
// --------------------------------------------------------------------------- //

export interface RadarAxis {
  /** Axis name, e.g. "Invisible Utility". */
  name: string;
  /** Axis score, 0–10. */
  score: number;
  /** Confidence 0–100 (unused in rendering but part of the data contract). */
  confidence: number;
}

export interface AxisRadarChartProps {
  /** The 5 fundamental axes (works for any count ≥ 3). */
  axes: RadarAxis[];
  /** Square chart size in pixels. Defaults to 280. */
  size?: number;
  /** Extra classes for the wrapper. */
  className?: string;
}

// --------------------------------------------------------------------------- //
//  Helpers
// --------------------------------------------------------------------------- //

/**
 * Abbreviate long axis names so labels fit cleanly outside the pentagon
 * without overlapping the data area. The two long axis names from the
 * framework get explicit short forms; anything else > 20 chars is truncated.
 */
function abbreviate(name: string): string {
  const explicit: Record<string, string> = {
    "Governance / Legal / Security": "Gov / Legal / Sec",
    "Token & Market Structure": "Token & Market",
    "Invisible Utility": "Invisible Utility",
    "Economic Engine": "Economic Engine",
    Moat: "Moat",
  };
  if (explicit[name]) return explicit[name];
  if (name.length > 20) return name.slice(0, 19) + "…";
  return name;
}

// --------------------------------------------------------------------------- //
//  Component
// --------------------------------------------------------------------------- //

/**
 * AxisRadarChart — a pure-SVG pentagon radar / spider chart that visualises
 * the 5 fundamental axes (Invisible Utility, Economic Engine, Moat, Token &
 * Market Structure, Governance/Legal/Security) as a single filled polygon.
 *
 * Features:
 *  - Pentagon background grid with 5 concentric levels (2, 4, 6, 8, 10)
 *  - Axis lines from centre to each vertex
 *  - Semi-transparent emerald fill + emerald-500 stroke
 *  - Data points as small circles
 *  - Vertex labels (abbreviated name + score) that don't overlap the chart
 *  - Subtle scale + fade-in animation on mount
 *
 * No external chart library — just hand-rolled SVG.
 */
export function AxisRadarChart({
  axes,
  size = 280,
  className,
}: AxisRadarChartProps) {
  const n = Math.max(3, axes.length);

  // Layout constants — padding keeps labels clear of the chart area.
  const padding = Math.round(size * 0.14);
  const center = size / 2;
  const maxRadius = size / 2 - padding;
  const labelRadius = maxRadius + Math.round(size * 0.085);

  const maxScore = 10;

  /** Angle (radians) for vertex i, with vertex 0 at the top (-π/2). */
  const angleFor = React.useCallback(
    (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / n,
    [n]
  );

  /** Cartesian point at vertex i for a given radius. */
  const pointAt = React.useCallback(
    (i: number, radius: number) => {
      const a = angleFor(i);
      return {
        x: center + radius * Math.cos(a),
        y: center + radius * Math.sin(a),
      };
    },
    [center, angleFor]
  );

  // ---- Grid: 5 concentric pentagons at levels 2, 4, 6, 8, 10 ----
  const levels = [2, 4, 6, 8, 10];
  const gridPolygons = levels.map((level) => {
    const r = (level / maxScore) * maxRadius;
    return Array.from({ length: n }, (_, i) => {
      const p = pointAt(i, r);
      return `${p.x.toFixed(2)},${p.y.toFixed(2)}`;
    }).join(" ");
  });

  // ---- Axis lines from centre to each vertex ----
  const axisLines = Array.from({ length: n }, (_, i) => {
    const p = pointAt(i, maxRadius);
    return { x2: p.x, y2: p.y };
  });

  // ---- Level tick labels (2, 4, 6, 8, 10) on the top axis ----
  const tickLabels = levels.map((level) => {
    const r = (level / maxScore) * maxRadius;
    const p = pointAt(0, r);
    return { x: p.x, y: p.y, label: String(level) };
  });

  // ---- Data polygon + points ----
  const dataPoints = axes.map((ax, i) => {
    const clamped = Math.max(0, Math.min(maxScore, ax.score));
    const r = (clamped / maxScore) * maxRadius;
    return pointAt(i, r);
  });
  const dataPolygon = dataPoints
    .map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`)
    .join(" ");

  // ---- Vertex labels (name + score) positioned outside the chart ----
  const labels = axes.map((ax, i) => {
    const a = angleFor(i);
    const x = center + labelRadius * Math.cos(a);
    const y = center + labelRadius * Math.sin(a);
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    let anchor: "start" | "middle" | "end" = "middle";
    if (cos > 0.3) anchor = "start";
    else if (cos < -0.3) anchor = "end";

    // Vertical nudge so multi-line labels clear the chart vertex.
    // Top vertex → shift up, bottom vertices → shift down.
    const yShift = sin * 2;

    return {
      x,
      y: y + yShift,
      anchor,
      name: abbreviate(ax.name),
      score: ax.score,
    };
  });

  // ---- Mount animation ----
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => {
    const t = window.setTimeout(() => setMounted(true), 50);
    return () => window.clearTimeout(t);
  }, []);

  // Font sizes scale with chart size.
  const nameFontSize = Math.max(9, Math.round(size * 0.038));
  const scoreFontSize = Math.max(8, Math.round(size * 0.034));
  const tickFontSize = Math.max(7, Math.round(size * 0.028));

  return (
    <div
      className={cn("flex items-center justify-center", className)}
      style={{ width: size, maxWidth: "100%" }}
      role="img"
      aria-label={`Radar chart of ${axes.length} fundamental axes`}
    >
      <svg
        width="100%"
        viewBox={`0 0 ${size} ${size}`}
        className="block"
        style={{ height: "auto" }}
      >
        {/* ---- Grid pentagons ---- */}
        {gridPolygons.map((points, i) => (
          <polygon
            key={`grid-${i}`}
            points={points}
            fill="none"
            stroke="currentColor"
            className="text-muted-foreground/30"
            strokeWidth={1}
            strokeLinejoin="round"
          />
        ))}

        {/* ---- Axis lines ---- */}
        {axisLines.map((line, i) => (
          <line
            key={`axis-${i}`}
            x1={center}
            y1={center}
            x2={line.x2}
            y2={line.y2}
            stroke="currentColor"
            className="text-muted-foreground/30"
            strokeWidth={1}
          />
        ))}

        {/* ---- Level tick labels (2/4/6/8/10) on the top axis ---- */}
        {tickLabels.map((t, i) => (
          <text
            key={`tick-${i}`}
            x={t.x - 4}
            y={t.y}
            textAnchor="end"
            dominantBaseline="middle"
            className="fill-muted-foreground/50"
            style={{ fontSize: tickFontSize, fontVariantNumeric: "tabular-nums" }}
          >
            {t.label}
          </text>
        ))}

        {/* ---- Filled data polygon ---- */}
        <polygon
          points={dataPolygon}
          fill="rgba(16, 185, 129, 0.2)"
          stroke="#10b981"
          strokeWidth={2}
          strokeLinejoin="round"
          style={{
            opacity: mounted ? 1 : 0,
            transform: mounted ? "scale(1)" : "scale(0.55)",
            transformOrigin: `${center}px ${center}px`,
            transition:
              "opacity 0.7s cubic-bezier(0.22, 1, 0.36, 1), transform 0.7s cubic-bezier(0.22, 1, 0.36, 1)",
          }}
        />

        {/* ---- Data points ---- */}
        {dataPoints.map((p, i) => (
          <circle
            key={`point-${i}`}
            cx={p.x}
            cy={p.y}
            r={Math.max(2.5, size * 0.013)}
            fill="#10b981"
            stroke="hsl(var(--background))"
            strokeWidth={1.5}
            style={{
              opacity: mounted ? 1 : 0,
              transition: `opacity 0.4s ease-out ${0.3 + i * 0.08}s`,
            }}
          />
        ))}

        {/* ---- Vertex labels (name + score) ---- */}
        {labels.map((l, i) => (
          <g
            key={`label-${i}`}
            style={{
              opacity: mounted ? 1 : 0,
              transition: `opacity 0.4s ease-out ${0.35 + i * 0.08}s`,
            }}
          >
            <text
              x={l.x}
              y={l.y}
              textAnchor={l.anchor}
              dominantBaseline="middle"
              className="fill-foreground"
              style={{ fontSize: nameFontSize, fontWeight: 600 }}
            >
              {l.name}
            </text>
            <text
              x={l.x}
              y={l.y + nameFontSize + 2}
              textAnchor={l.anchor}
              dominantBaseline="middle"
              className="fill-emerald-400"
              style={{
                fontSize: scoreFontSize,
                fontWeight: 700,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {l.score.toFixed(1)}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

export default AxisRadarChart;
