"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

// --------------------------------------------------------------------------- //
//  Types
// --------------------------------------------------------------------------- //

export interface ScoreRadialProps {
  /** The score value to display. Interpreted relative to `max`. */
  score: number;
  /** The maximum value the score can take. Defaults to 100. Use 10 for axis scores. */
  max?: number;
  /** Outer diameter of the gauge in pixels. Defaults to 120. */
  size?: number;
  /** Stroke width of the ring in pixels. Defaults to 8. */
  strokeWidth?: number;
  /** Primary label rendered under the score (e.g. "Project Quality"). */
  label?: string;
  /** Optional secondary label rendered under the primary label. */
  sublabel?: string;
  /** Extra classes for the wrapper. */
  className?: string;
}

interface ScoreColor {
  /** Hex stroke color for the SVG ring. */
  stroke: string;
  /** Tailwind text class matching the stroke color. */
  text: string;
  /** RGBA glow color used by the blurred duplicate. */
  glow: string;
}

// --------------------------------------------------------------------------- //
//  Color logic — mirrors the existing scoreColor() helper in page.tsx
//  Thresholds (by ratio = score / max):
//    0.00 – 0.40  → rose      (poor)
//    0.40 – 0.55  → orange    (below average)
//    0.55 – 0.70  → amber     (average)
//    0.70 – 0.85  → lime      (good)
//    0.85 – 1.00  → emerald   (excellent)
// --------------------------------------------------------------------------- //

function getScoreColor(ratio: number): ScoreColor {
  if (ratio >= 0.85)
    return {
      stroke: "#10b981", // emerald-500
      text: "text-emerald-500",
      glow: "rgba(16, 185, 129, 0.55)",
    };
  if (ratio >= 0.70)
    return {
      stroke: "#84cc16", // lime-500
      text: "text-lime-500",
      glow: "rgba(132, 204, 22, 0.55)",
    };
  if (ratio >= 0.55)
    return {
      stroke: "#f59e0b", // amber-500
      text: "text-amber-500",
      glow: "rgba(245, 158, 11, 0.55)",
    };
  if (ratio >= 0.40)
    return {
      stroke: "#f97316", // orange-500
      text: "text-orange-500",
      glow: "rgba(249, 115, 22, 0.55)",
    };
  return {
    stroke: "#f43f5e", // rose-500
    text: "text-rose-500",
    glow: "rgba(244, 63, 94, 0.55)",
  };
}

// --------------------------------------------------------------------------- //
//  Component
// --------------------------------------------------------------------------- //

/**
 * ScoreRadial — a circular progress gauge that visualises a 0–100 (or 0–10)
 * score with a coloured ring. Used in the project detail drawer to render
 * the 5 fundamental axes as individual gauges and the overall project quality
 * score.
 *
 * The ring fills from 0 → target on mount via a stroke-dashoffset transition.
 * A blurred duplicate circle sits behind the main ring to produce a soft glow.
 */
export function ScoreRadial({
  score,
  max = 100,
  size = 120,
  strokeWidth = 8,
  label,
  sublabel,
  className,
}: ScoreRadialProps) {
  // Clamp ratio to [0, 1] so out-of-range scores don't break the ring.
  const ratio = Math.max(0, Math.min(1, score / max));
  const color = getScoreColor(ratio);

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  // Animate the ring filling on mount.
  const [progress, setProgress] = React.useState(0);
  React.useEffect(() => {
    // Defer to next tick so the transition triggers.
    const t = window.setTimeout(() => setProgress(ratio), 60);
    return () => window.clearTimeout(t);
  }, [ratio]);

  const offset = circumference * (1 - progress);

  // Unique filter id so multiple gauges on the same page don't clash.
  const rawId = React.useId();
  const filterId = `score-radial-glow-${rawId.replace(/[:]/g, "")}`;

  // Format the centre number:
  //  - max > 10  → integer (e.g. 72)
  //  - max <= 10 → one decimal (e.g. 8.4) for consistency across axes
  const displayValue =
    max > 10 ? Math.round(score).toString() : score.toFixed(1);

  // Font sizes scale with the gauge size.
  const valueFontSize = Math.round(size * 0.26);
  const labelFontSize = Math.max(9, Math.round(size * 0.085));
  const sublabelFontSize = Math.max(8, Math.round(size * 0.072));

  return (
    <div
      className={cn(
        "relative inline-flex flex-col items-center justify-center",
        className
      )}
      style={{ width: size, height: size, maxWidth: "100%" }}
      role="img"
      aria-label={`${label ? label + ": " : ""}${displayValue} out of ${max}`}
    >
      <svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${size} ${size}`}
        className="block"
        style={{ height: "auto" }}
      >
        <defs>
          <filter
            id={filterId}
            x="-50%"
            y="-50%"
            width="200%"
            height="200%"
          >
            <feGaussianBlur stdDeviation={strokeWidth * 0.55} />
          </filter>
        </defs>

        {/* Background track */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="currentColor"
          className="text-muted/25"
          strokeWidth={strokeWidth}
        />

        {/* Blurred glow duplicate (sits behind the main ring) */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={color.glow}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          filter={`url(#${filterId})`}
          transform={`rotate(-90 ${center} ${center})`}
          style={{ transition: "stroke-dashoffset 1.1s cubic-bezier(0.22, 1, 0.36, 1)" }}
        />

        {/* Main progress ring */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={color.stroke}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${center} ${center})`}
          style={{ transition: "stroke-dashoffset 1.1s cubic-bezier(0.22, 1, 0.36, 1)" }}
        />
      </svg>

      {/* Centre text overlay (absolutely positioned over the SVG) */}
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-2 text-center">
        <span
          className={cn(
            "font-bold leading-none tabular-nums",
            color.text
          )}
          style={{ fontSize: valueFontSize }}
        >
          {displayValue}
        </span>
        {label && (
          <span
            className="mt-1 font-medium text-muted-foreground leading-tight"
            style={{ fontSize: labelFontSize }}
          >
            {label}
          </span>
        )}
        {sublabel && (
          <span
            className="mt-0.5 text-muted-foreground/70 leading-tight"
            style={{ fontSize: sublabelFontSize }}
          >
            {sublabel}
          </span>
        )}
      </div>
    </div>
  );
}

export default ScoreRadial;
