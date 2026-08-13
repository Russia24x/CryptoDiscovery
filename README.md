# CryptoSieve — Crypto Discovery Framework

> Evidence-first crypto market intelligence, discovery, risk screening, due diligence & valuation engine.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Next.js](https://img.shields.io/badge/Next.js-16-black)](https://nextjs.org/)
[![Python](https://img.shields.io/badge/Python-3.12-blue)](https://python.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)](https://www.typescriptlang.org/)

## Overview

CryptoSieve is a comprehensive framework for discovering, evaluating, and ranking crypto projects based on verifiable evidence — not narratives. It implements a multi-phase analysis pipeline inspired by professional investment research methodologies.

### Core Philosophy

```
Evidence > Narrative
Revenue > Hype
Adoption > Attention
```

### Three-Layer Separation

```
Project Quality ≠ Token Quality ≠ Investment Attractiveness
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Next.js Dashboard (:3000)                 │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────┐ │
│  │ Scan Config  │  │ Results Grid  │  │ Detail Drawer      │ │
│  │ + Presets    │  │ + Analytics   │  │ + Radar Chart      │ │
│  │ + Persona    │  │ + Sentiment   │  │ + Valuation P/R/P/F│ │
│  └─────────────┘  └──────────────┘  └────────────────────┘ │
│         │                │                    │              │
│         ▼                ▼                    ▼              │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │              API Proxy Layer (/api/scanner/*)            │ │
│  └─────────────────────────┬───────────────────────────────┘ │
└────────────────────────────┼────────────────────────────────┘
                             │ HTTP (30s timeout, error handling)
                             ▼
┌─────────────────────────────────────────────────────────────┐
│              Python FastAPI Service (:3003)                   │
│  ┌──────────┐  ┌───────────┐  ┌──────────┐  ┌────────────┐ │
│  │Discovery │→│ Screening  │→│ Evidence │→│ Evaluation  │ │
│  │5 Lenses  │  │5 Veto     │  │4 Grades  │  │5 Axes      │ │
│  └──────────┘  └───────────┘  └──────────┘  └────────────┘ │
│         │              │              │              │        │
│         ▼              ▼              ▼              ▼        │
│  ┌──────────┐  ┌───────────┐  ┌──────────┐  ┌────────────┐ │
│  │ Scoring  │→│ Investment│→│ Decision │→│ Output     │ │
│  │ + Penalty│  │ + Valuation│  │ 6 Levels │  │ 23 Sections│ │
│  └──────────┘  └───────────┘  └──────────┘  └────────────┘ │
│         │              │                                  │
│         ▼              ▼                                  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │           Data Sources (No API Key Required)          │  │
│  │  ┌────────────┐  ┌──────────────┐  ┌──────────────┐ │  │
│  │  │ CoinGecko  │  │  DeFiLlama   │  │ (Extensible) │ │  │
│  │  │ Prices     │  │  TVL/Fees    │  │              │ │  │
│  │  │ Tokenomics │  │  Revenue     │  │              │ │  │
│  │  └────────────┘  └──────────────┘  └──────────────┘ │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Quick Start

### Prerequisites

- Node.js 18+ / Bun
- Python 3.12+
- No API keys required

### Installation

```bash
# Install Next.js dependencies
bun install

# Install Python dependencies
pip install fastapi uvicorn httpx pydantic

# Start Python scanner service
bash mini-services/crypto-scanner/start.sh

# Start Next.js dev server (in another terminal)
bun run dev
```

### Usage

1. Open `http://localhost:3000` in your browser
2. Select a Persona (Investor, Researcher, Developer, etc.)
3. Configure market cap range and sectors
4. Click "Scan Market" or press `S`
5. Explore ranked results and detailed reports

## Framework Phases

| Phase | Name | Description |
|-------|------|-------------|
| 0 | Settings | Persona selection, market cap range, sector filters |
| 1 | Discovery | 5 lenses: Money Flow, Hidden Infrastructure, Bottleneck, Institutional, Emerging |
| 2 | Screening | 5 hard veto gates + 12 severe risk flags |
| 3 | Evidence | 4 quality grades (A-D) with freshness tracking |
| 4 | Evaluation | 5 fundamental axes scored 0-10 with confidence |
| 5 | Scoring | Weighted score 0-100 with weakest-link penalty |
| 6 | Investment | P/R, P/F, P/T valuation multiples + cycle phase |
| 7 | Decision | 6 action levels with risk adjustment |
| 8 | Output | 23-section report with 5 final questions |

### Valuation Multiples (Framework 3.0)

```
P/R = Market Cap ÷ Annualized Revenue    (real revenue only)
P/F = FDV ÷ Annualized Fees              (fees ≠ revenue)
P/T = Market Cap ÷ TVL
```

## Key Features

- **Bilingual UI** (English/Persian) with automatic RTL
- **Dark/Light theme** with system detection
- **Keyboard shortcuts** (S, /, G, A, C, W, ⌘K, Esc)
- **IndexedDB** persistence for watchlist and recently viewed
- **Export** (Markdown, JSON, CSV) with formula injection protection
- **Scan history** with quality trend visualization
- **Scan diff** for comparing two scans side-by-side
- **Global search** across all completed scans
- **Market sentiment** composite score (Bullish/Bearish)
- **Cross-verification** engine tracking data sources
- **Self-correction** engine with 7 bias checks

## Project Structure

```
.
├── src/
│   ├── app/
│   │   ├── page.tsx              # Main dashboard (4100+ lines)
│   │   ├── layout.tsx            # Root layout with ThemeProvider + LanguageProvider
│   │   └── api/scanner/          # API proxy routes (7 endpoints)
│   ├── components/
│   │   ├── dashboard/            # Visualization components
│   │   │   ├── score-radial.tsx
│   │   │   ├── axis-radar-chart.tsx
│   │   │   ├── sector-donut.tsx
│   │   │   └── risk-heatmap.tsx
│   │   ├── theme-provider.tsx
│   │   ├── theme-toggle.tsx
│   │   └── language-toggle.tsx
│   └── lib/
│       ├── i18n/
│       │   ├── LanguageProvider.tsx
│       │   ├── en.json
│       │   └── fa.json
│       ├── use-indexed-db.ts
│       ├── scanner-client.ts
│       └── utils.ts
├── mini-services/
│   └── crypto-scanner/
│       ├── main.py               # FastAPI service
│       ├── models/schemas.py     # Pydantic models
│       ├── data/sources.py       # API integrations
│       └── framework/
│           ├── core.py           # Principles, veto gates, persona weights
│           ├── discovery.py      # PHASE 1 — 5 discovery lenses
│           ├── evidence.py       # PHASE 3 — evidence collection
│           ├── evaluation.py     # PHASE 4 — 5 axes scoring
│           └── analysis.py       # PHASE 5-8 — scoring + output
├── RULES.md                      # Git and code quality rules
└── README.md                     # This file
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16, React, TypeScript, Tailwind CSS 4, shadcn/ui |
| Backend | Python 3.12, FastAPI, Pydantic, httpx |
| Data | CoinGecko API, DeFiLlama API (both free, no key) |
| Storage | IndexedDB (browser), in-memory (Python) |
| Charts | Pure SVG (no external chart library) |

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/scanner/health` | Scanner service health check |
| POST | `/api/scanner/scan` | Start a new market scan |
| GET | `/api/scanner/scan/:id` | Get scan status and results |
| GET | `/api/scanner/scans` | List all scans |
| GET | `/api/scanner/projects` | List all project reports |
| GET | `/api/scanner/project/:id` | Get full project report |

## Disclaimer

This framework is a research and analysis tool, not personalized financial advice. Always do your own research (DYOR) before making investment decisions.

## License

MIT
