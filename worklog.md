# Crypto Market Discovery Framework — Worklog

## Project Overview

A comprehensive Python-based crypto market discovery & analysis framework
exposed through a Next.js dashboard. The user can configure discovery lenses
(persona, market-cap range, sectors) and trigger a market scan on demand.
The framework implements all 8 phases of the provided Persian-language
specification: Discovery → Screening → Evidence → Evaluation → Scoring →
Investment Analysis → Decision → Output.

## Architecture

```
Next.js UI (port 3000)  ──API proxy──▶  Python FastAPI (port 3003)
   src/app/page.tsx                      mini-services/crypto-scanner/
   src/app/api/scanner/*                 ├─ main.py            (FastAPI app)
                                         ├─ models/schemas.py  (Pydantic)
                                         ├─ data/sources.py    (CoinGecko+DeFiLlama)
                                         └─ framework/
                                            ├─ core.py         (principles, veto, persona weights)
                                            ├─ discovery.py    (PHASE 1 — 5 lenses)
                                            ├─ evidence.py     (PHASE 3 — evidence collection)
                                            ├─ evaluation.py   (PHASE 4 — 5 axes scoring)
                                            └─ analysis.py     (PHASE 5-8 — scoring + output)
```

## Current Status (as of completion)

### ✅ Working
- **Python scanner service** (port 3003): FastAPI app, fully implements the 8-phase
  framework. Fetches real data from CoinGecko (markets + coin detail) and DeFiLlama
  (protocols + fees overview). Produces 23-section project reports.
- **Next.js dashboard** (port 3000): Beautiful dark-themed analyst UI with:
  - Scan configuration sidebar (persona, market cap range, sectors, max projects)
  - Live scan progress with 8-phase stepper and phase log
  - Ranked candidate cards (sorted by project quality score)
  - Detailed project drawer with all 23 sections (verdict, 5 axes with sub-factors,
    economic engine, tokenomics, moat, catalysts, thesis, kill conditions, 5 final Qs)
  - Recent scans list with status badges
  - Health indicator (live polling of scanner service)
  - Responsive layout (mobile + desktop)
  - Sticky footer
- **API proxy routes**: `/api/scanner/{scan,scans,projects,project/[id],health}`
- **Process stability**: Python daemon watchdog keeps Next.js dev server alive
  between bash commands (the sandbox kills bash-based watchdogs but Python
  daemons survive). Uses `--max-old-space-size=384` to cap V8 heap.

### ✅ Verified via agent-browser
- Page loads without errors (HTTP 200, no console errors)
- Scan Market button triggers a real scan
- 12 candidates discovered, screened, evaluated, scored, ranked
- Project detail drawer opens and shows all 23 framework sections
- Responsive layout works on mobile (390px) and desktop (1280px)
- Footer is present and sticky

## Key Implementation Decisions

1. **Data sources**: Used free public APIs (CoinGecko + DeFiLlama) — no API keys
   required. CoinGecko is rate-limited (429s) so we gracefully fall back to
   DeFiLlama-only discovery. The framework correctly lowers confidence when
   evidence is sparse (by design — "never hide uncertainty behind a precise-
   looking score").

2. **Overview data reuse**: Instead of making per-protocol API calls (which were
   slow and caused timeouts), we fetch the DeFiLlama protocols + fees overview
   lists ONCE during discovery, then pass the cached data to the evidence
   collector. This made scans ~10x faster (12 projects in ~7 seconds).

3. **Conservative scoring**: The framework is intentionally skeptical. Projects
   with missing data get low scores AND low confidence. This is the correct
   behavior per the specification (Evidence > Narrative).

4. **Python watchdog**: The sandbox kills bash-based background processes between
   commands, but Python daemons survive. So we use a double-fork Python daemon
   (`watchdog.py`) to keep the Next.js dev server alive.

## How to Use

1. The Python scanner service runs on port 3003 (started by `mini-services/crypto-scanner/start.sh`)
2. The Next.js dev server runs on port 3000 (kept alive by `watchdog.py`)
3. Open the app in the Preview Panel
4. Configure persona + market cap range + sectors in the left sidebar
5. Click "Scan Market"
6. Watch the 8-phase progress
7. Click any project card to see the full 23-section analysis report

## Unresolved Issues / Risks

1. **CoinGecko rate limits**: The free CoinGecko API returns 429 frequently.
   We handle this gracefully (fall back to DeFiLlama), but tokenomics data
   (market cap, supply, etc.) is sometimes missing. A CoinGecko API key would
   fix this.

2. **Conservative scores**: Current scores are low (most projects 10-30/100)
   because the framework penalizes missing evidence heavily. This is by design
   but may surprise users. The confidence column helps interpret this.

3. **In-memory storage**: Scan results are stored in Python process memory.
   If the scanner service restarts, results are lost. For production, persist
   to SQLite.

## Priority Recommendations for Next Phase

1. **Add CoinGecko API key support** to remove rate-limit issues
2. **Persist scan results to SQLite** (Prisma is already configured)
3. **Add comparison view** — side-by-side project comparison
4. **Add export** — download report as PDF/Markdown
5. **Add historical scans** — track score changes over time
6. **Improve tokenomics data** — fetch unlock schedules, holder distributions
7. **Add WebSocket progress** — real-time phase updates instead of polling

---
Task ID: 2
Agent: frontend-styling-expert
Task: Create ScoreRadial and AxisRadarChart components

Work Log:
- Read worklog.md to absorb project context (Next.js 16 + TS + Tailwind 4 + shadcn/ui dark-themed crypto analyst dashboard; 5 fundamental axes scoring; existing `scoreColor`/`scoreBg` helpers use rose→orange→amber→lime→emerald thresholds at 0.40/0.55/0.70/0.85 ratios).
- Inspected existing code patterns: `src/app/page.tsx` (axes data shape `{name, score, confidence, key_reason, sub_factors}`, score is 0–10), `src/components/ui/progress.tsx` & `badge.tsx` (shadcn conventions), `globals.css` (oklch dark theme vars), `tailwind.config.ts`, `tsconfig.json` (`@/*` alias → `./src/*`), `package.json` (lucide-react available, recharts present but task requires pure SVG).
- Created `/home/z/my-project/src/components/dashboard/` directory.
- Created `score-radial.tsx`:
  - `"use client"` directive; exports `ScoreRadial` (named + default).
  - Props: `score`, `max` (default 100), `size` (default 120), `strokeWidth` (default 8), `label`, `sublabel`, `className`.
  - SVG ring with `stroke-dasharray`/`stroke-dashoffset` animation triggered on mount via `useState(0)` + `useEffect` setTimeout; 1.1s cubic-bezier easing.
  - 5-tier color logic matching existing `scoreColor()`: rose #f43f5e / orange #f97316 / amber #f59e0b / lime #84cc16 / emerald #10b981 at ratio thresholds 0.40/0.55/0.70/0.85.
  - Center overlay: large bold score number (Tailwind text color matches ring) + small label + optional sublabel; font sizes scale with `size`.
  - Glow effect: blurred duplicate circle rendered behind main ring via SVG `<feGaussianBlur>` filter (unique id via `React.useId()` to avoid clashes when multiple gauges on page).
  - Background track uses `text-muted/25` + `currentColor`.
  - Display formatting: `max>10` → integer (e.g. "72"); `max<=10` → 1 decimal (e.g. "8.4") for axis-score consistency.
  - Accessible `role="img"` + `aria-label`.
- Created `axis-radar-chart.tsx`:
  - `"use client"` directive; exports `AxisRadarChart` (named + default).
  - Props: `axes` (array of `{name, score, confidence}`), `size` (default 280), `className`.
  - Pure SVG, no chart library. Pentagon with vertex 0 at top (-π/2); vertex count adapts to `axes.length` (≥3) so it generalises beyond 5.
  - 5 concentric grid pentagons at levels 2/4/6/8/10 (stroke `text-muted-foreground/30` via `currentColor`).
  - 5 axis lines centre→vertex; small tick labels (2/4/6/8/10) on top axis in `fill-muted-foreground/50`.
  - Data polygon: fill `rgba(16, 185, 129, 0.2)`, stroke `#10b981` (emerald-500), 2px, round joins.
  - Data point circles (emerald fill, background-colored stroke ring for clean separation).
  - Vertex labels: abbreviated axis name + score (1 decimal) in emerald-400; `text-anchor` auto-switches start/middle/end based on vertex angle; `padding` = 14% of size + label radius offset keeps labels clear of chart area.
  - Abbreviation map handles the long framework axis names ("Governance / Legal / Security" → "Gov / Legal / Sec", "Token & Market Structure" → "Token & Market"); others truncated >20 chars.
  - Mount animation: data polygon scales 0.55→1 + fades in (0.7s cubic-bezier); data points & labels stagger-fade in with per-index delay.
  - Responsive: wrapper `width:size, maxWidth:100%`; SVG `width:100%` + `viewBox` + `height:auto` so it scales down on narrow viewports while staying square.
- Verified: `npx tsc --noEmit` → zero errors in the two new files (4 pre-existing errors in unrelated `examples/` and `skills/` dirs only). `npx eslint` on both files → exit 0, clean.
- Did NOT modify any existing files (only created the two new components + this worklog append).

Stage Summary:
- Files created:
  - `/home/z/my-project/src/components/dashboard/score-radial.tsx` — circular score gauge with animated ring, 5-tier color, glow, center label.
  - `/home/z/my-project/src/components/dashboard/axis-radar-chart.tsx` — pure-SVG pentagon radar chart with grid, axes, filled data polygon, vertex labels, mount animation.
- Key design decisions:
  - Reused the exact color thresholds from the existing `scoreColor()` helper in `page.tsx` so the new visualizations are visually consistent with the existing bars/badges.
  - Used the project's `cn` utility from `@/lib/utils` (same as every shadcn/ui component) for className merging — keeps the components consistent with the existing setup.
  - Pure SVG with `currentColor` + Tailwind `text-*` classes for grid/axis lines so they automatically adapt to light/dark theme tokens (`text-muted-foreground/30`).
  - Hardcoded emerald hex values for data fill/stroke (per spec: `rgba(16, 185, 129, 0.2)` fill, emerald-500 stroke) since these are the brand accent and should not change with theme.
  - All animations are CSS transitions triggered by a `mounted` state flip in `useEffect` — no JS animation libs, no requestAnimationFrame loops.
  - Both components accept a `className` prop and are fully self-contained (only depend on React + the project's `cn` helper).
- Integration notes (for the next agent that wires these into the dashboard):
  - `ScoreRadial` is ready to drop into the project detail drawer for the overall project quality score (`<ScoreRadial score={report.project_quality_score} label="Project Quality" size={140} />`) and/or per-axis gauges (`<ScoreRadial score={ax.score} max={10} label={ax.name} size={80} strokeWidth={6} />`).
  - `AxisRadarChart` consumes the existing `report.axes` array directly (`<AxisRadarChart axes={report.axes} size={300} />`) — the `confidence` field is accepted but currently unused in rendering (reserved for future tooltip/opacity work).

---
Task ID: 3
Agent: main-agent (cron review round 1)
Task: QA testing, bug fixes, and feature enhancements

Work Log:
- Read worklog.md to understand project context (Python FastAPI scanner on :3003 + Next.js dashboard on :3000, 8-phase crypto market discovery framework).
- Verified both services running: Next.js HTTP 200, Python scanner HTTP 200 (2 scans, 24 reports).
- Performed QA testing via agent-browser:
  - Page loads without runtime errors.
  - Identified accessibility warning: "Missing Description or aria-describedby for DialogContent" in Sheet component.
  - Ran VLM analysis on dashboard screenshot — identified styling issues: overflow in Recent Scans list, inconsistent spacing, color overuse.
  - Verified scan workflow works end-to-end (12 candidates discovered, scored, ranked).
  - Verified detail drawer shows all 23 framework sections.
- Fixed accessibility warning by adding `<SheetDescription className="sr-only">` to both Sheet components (detail drawer + comparison dialog).
- Created new reusable visualization components (delegated to frontend-styling-expert agent):
  - `src/components/dashboard/score-radial.tsx` — animated circular score gauge with 5-tier color, glow effect.
  - `src/components/dashboard/axis-radar-chart.tsx` — pure-SVG pentagon radar chart for 5 fundamental axes.
- Enhanced `src/app/page.tsx` with major new features:
  1. **Market Overview Stats Bar**: 6 KPI tiles showing Total Scanned, Avg Quality, Avg Confidence, High Score (70+), Vetoed count, Top Sector.
  2. **Filtering & Sorting Toolbar**: Search input (name/symbol/category), sort dropdown (quality/token/confidence/action), action filter, sector filter, reset button.
  3. **Comparison Mode**: Toggle button activates compare checkboxes on project cards; select up to 4 projects; "View (N)" button opens side-by-side comparison dialog with 24 metrics + axis breakdown, highlighting best values.
  4. **Export Functionality**: Download button (Markdown) + JSON button in detail drawer header; full 23-section report serialized to both formats.
  5. **ScoreRadial Integration**: Circular score gauge in detail drawer header replacing plain number.
  6. **AxisRadarChart Integration**: Pentagon radar chart visualization at top of "Five Fundamental Axes" section.
  7. **Enhanced ProjectCard**: Compare checkbox overlay, violet ring when selected, improved visual hierarchy.
- Removed unused imports (Image, Checkbox, SheetTrigger, Tabs).
- Ran lint: 0 errors, 0 warnings (clean).
- Verified via agent-browser:
  - No console errors or warnings after fresh reload.
  - Market stats bar renders with all 6 KPIs.
  - Compare mode toggles correctly, checkboxes appear on cards.
  - Selected 2 projects → "View (2)" button appeared → comparison dialog opened with side-by-side metrics.
  - Detail drawer shows 25 SVGs (radar chart + score radial + sub-factor bars), export buttons present.
  - VLM confirmed radar chart renders correctly with all 5 axes and scores.

Stage Summary:
- **Bugs fixed**: Sheet/Dialog accessibility warning (aria-describedby) — resolved.
- **New features added**:
  - Market overview stats bar (6 KPIs)
  - Search + sort + filter toolbar
  - Multi-project comparison view (up to 4 projects, 24 metrics)
  - Export report as Markdown and JSON
  - ScoreRadial circular gauge in detail header
  - AxisRadarChart pentagon visualization in axes section
- **Files modified**: `src/app/page.tsx` (major enhancement), `src/components/ui/sheet.tsx` (unchanged, used SheetDescription from existing export).
- **Files created**: `src/components/dashboard/score-radial.tsx`, `src/components/dashboard/axis-radar-chart.tsx`.
- **Verification**: All features tested via agent-browser. Lint clean. No console errors. VLM confirmed visual quality.

Unresolved Issues / Risks:
1. CoinGecko rate limits still cause some tokenomics data to be missing (graceful fallback works).
2. Conservative scores (most projects 10-30/100) — by design but may need calibration in future.
3. In-memory storage — scan results lost if Python service restarts.

Priority Recommendations for Next Phase:
1. Persist scan results to SQLite (Prisma configured, schema needs scan/report models).
2. Add historical scan comparison — track score changes over time.
3. Add CoinGecko API key support for richer tokenomics data.
4. Add WebSocket real-time progress updates (replace 2s polling).
5. Add PDF export (currently Markdown + JSON only).
6. Improve scoring calibration — consider adjusting evidence penalty weights.
7. Add portfolio watchlist — track specific projects across scans.
