# CryptoSieve — Crypto Discovery Framework

> Evidence-first crypto market intelligence, discovery, risk screening, due diligence & valuation engine.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Next.js](https://img.shields.io/badge/Next.js-16-black)](https://nextjs.org/)
[![Python](https://img.shields.io/badge/Python-3.12-blue)](https://python.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)](https://www.typescriptlang.org/)
[![Bilingual](https://img.shields.io/badge/i18n-EN%2FFA%20RTL-green)]()

## Overview

CryptoSieve is a comprehensive framework for discovering, evaluating, and ranking crypto projects based on verifiable evidence — not narratives. It implements a multi-phase analysis pipeline inspired by professional investment research methodologies, aligned with Framework 3.0 specifications.

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

## Key Features

### User Interface — 4 Main Views

#### 1. Discovery (Scan-Based)
- **8-Phase Pipeline**: Discovery → Screening → Evidence → Evaluation → Scoring → Investment → Decision → Output
- **5 Discovery Lenses**: Money Flow, Hidden Infrastructure, Bottleneck, Institutional Adoption, Emerging Rails
- **5 Hard Veto Gates**: Fraud, Security, Custody, Backing Transparency, Legal Deception
- **5 Fundamental Axes** (0-10 scoring with confidence): Invisible Utility, Economic Engine, Moat, Token & Market Structure, Governance/Legal/Security
- **Valuation Multiples** (Framework 3.0): P/R (MC/Revenue), P/F (FDV/Fees), P/T (MC/TVL)
- **Cross-Verification Engine**: Tracks data sources and discrepancies
- **Self-Correction Engine**: 7 bias checks (popular project, source, snapshot, precision, narrative, confirmation, anti-promise)
- **Fee Stability Analysis**: Real 7d vs 30d fee volatility comparison
- **Scan History**: Quality trend visualization across scans
- **Scan Diff**: Side-by-side comparison of two scans
- **Global Search**: Search across all completed scans with debounce
- **Market Sentiment**: Composite score (Bullish/Bearish/Neutral)

#### 2. Coin Explorer (Manual Single-Coin Analysis)
- Search any cryptocurrency by name/symbol (CoinGecko search API)
- Select from 6 analysis personas (Investor, Institutional, Researcher, Developer, Trader, Comprehensive)
- Run the full 8-phase framework on a single coin → complete 23-section report
- Rich result card with quality score radial, 5 axes bars, valuation multiples, executive verdict, thesis, catalysts, severe risks
- Deep links to website, Twitter/X, GitHub, block explorer

#### 3. Market Intelligence (CoinMarketCap + DeFiLlama Replacement)
- **Global market banner**: Total mcap, 24h change, BTC/ETH dominance, volume, active coins, markets
- **Fear & Greed gauge**: 0-100 visual gauge with classification
- **DeFi TVL total**: Aggregate TVL across all protocols
- **9 tabbed data tables**:
  - Top Coins (50 by mcap) · Gainers (24h) · Losers (24h) · Trending (24h)
  - Top DeFi (50 by TVL) · Top Fees (30 by 24h fees) · Sectors (bar chart)
  - **Airdrops** (CMC Pro exclusive) · **Categories** (CMC Pro exclusive)
- Every coin row is clickable → switches to Coin Explorer for analysis
- Cache age indicator + refresh button

#### 4. News & Signals (Multi-Source Feed)
- **English Crypto News**: CoinDesk, Cointelegraph, Decrypt, Bitcoinist RSS (+ optional CryptoPanic, CryptoCompare)
- **Persian Crypto News**: ArzDigital (breaking + blog) + MihanBlockchain (news + market analysis)
  - Category filtering: خبر فوری (breaking) · مقاله (blog) · خبر (news) · تحلیل (analysis)
  - Full RTL text rendering with `dir="auto"` for mixed Persian/English content
  - Image extraction from `content:encoded` (skips base64 placeholders)
- **Telegram Channel Feed**: @Mastersharkcrypto (no bot token needed — uses t.me/s/ public web preview)
  - Chat-style message bubbles with photos and album grids
  - View counts, relative timestamps, per-message deep links
  - Auto-refresh toggle (60s interval)
- **Data sources badge row**: shows all 14 sources with availability + free/key status

### General UI Features
- **Bilingual UI**: English & Persian (فارسی) with automatic RTL layout
- **Dark/Light Theme**: System-aware with manual toggle
- **Keyboard Shortcuts**: S (scan), / (search), G/A (views), C (compare), W (watchlist), ⌘K (global search), Esc (close)
- **IndexedDB Persistence**: Watchlist and recently viewed saved in browser
- **Export**: Markdown, JSON, CSV (with formula injection protection)
- **Social Links**: Website, Twitter/X, GitHub, Discord, Blockchain Explorer

### Data Sources (14 total: 11 free + 3 optional API-key)

#### Free Sources (no key required)
| Source | Data |
|--------|------|
| **CoinGecko** | Prices, market cap, supply, volume, coin search, trending |
| **DeFiLlama** | TVL, fees (7d/30d), revenue, protocol metadata |
| **CoinMarketCap Keyless** | Holder ratios, audit info, price ranges, ATH/ATL |
| **CoinDesk RSS** | English crypto news |
| **Cointelegraph RSS** | English crypto news |
| **Decrypt RSS** | English crypto news |
| **Bitcoinist RSS** | English crypto news |
| **ArzDigital** | Persian breaking news + blog articles |
| **MihanBlockchain** | Persian crypto news + market analysis |
| **Fear & Greed (alternative.me)** | Market sentiment index (0-100) |
| **Telegram (t.me/s/)** | Public channel web preview (no bot token needed) |

#### Optional API-Key Sources (unlock exclusive data)
| Source | Key Env Var | Exclusive Data |
|--------|------------|----------------|
| **CoinMarketCap Pro** | `CMC_API_KEY` | **Categories** (350 categories with per-category mcap, 24h/7d change, top coins) · **Global metrics** (CMC's own BTC dominance + total mcap for cross-verification) · **Exchange map** · **Quotes/info** (metadata, logo, links) · Cross-verification of price/mcap/supply. *Note: Airdrops & exchange volume require a higher tier plan.* |
| **CryptoPanic** | `CRYPTOPANIC_TOKEN` | Curated crypto news feed |
| **CryptoCompare** | `CRYPTOCOMPARE_KEY` | Crypto news + price data |

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Next.js Dashboard (:3000)                 │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────┐ │
│  │ Scan Config  │  │ Results Grid  │  │ Detail Drawer      │ │
│  │ + Presets    │  │ + Analytics   │  │ + Radar Chart      │ │
│  │ + Persona    │  │ + Sentiment   │  │ + Valuation P/R/P/F│ │
│  │ + i18n EN/FA │  │ + Heatmap     │  │ + Cross-Verify     │ │
│  └─────────────┘  └──────────────┘  └────────────────────┘ │
│         │                │                    │              │
│         ▼                ▼                    ▼              │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │        API Proxy Layer (/api/scanner/*)                  │ │
│  │        • 30s timeout • Error handling • try-catch       │ │
│  └─────────────────────────┬───────────────────────────────┘ │
└────────────────────────────┼────────────────────────────────┘
                             │ HTTP
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
│  │ + Penalty│  │ + P/R/P/F │  │ 6 Levels │  │ 23 Sections│ │
│  └──────────┘  └───────────┘  └──────────┘  └────────────┘ │
│         │              │                                  │
│         ▼              ▼                                  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │        Data Sources (11 Free + 3 Optional API-Key)     │  │
│  │  ┌────────────┐  ┌──────────────┐  ┌────────────┐   │  │
│  │  │ CoinGecko  │  │  DeFiLlama   │  │ CMC Keyless│   │  │
│  │  │ Prices     │  │  TVL/Fees    │  │ Holders    │   │  │
│  │  │ Tokenomics │  │  Revenue     │  │ Audits     │   │  │
│  │  │ Search     │  │  7d/30d      │  │ ATH/ATL    │   │  │
│  │  └────────────┘  └──────────────┘  └────────────┘   │  │
│  │  ┌────────────┐  ┌──────────────┐  ┌────────────┐   │  │
│  │  │ 4 EN RSS   │  │ 4 FA RSS     │  │ Telegram   │   │  │
│  │  │ CoinDesk   │  │ ArzDigital   │  │ t.me/s/    │   │  │
│  │  │ Cointel.   │  │ MihanBlock.  │  │ (no token) │   │  │
│  │  └────────────┘  └──────────────┘  └────────────┘   │  │
│  │  ┌──────────────────────────────────────────────┐    │  │
│  │  │ CMC Pro (optional key): Airdrops · Categories│    │  │
│  │  │ Exchanges · Cross-verification               │    │  │
│  │  └──────────────────────────────────────────────┘    │  │
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

# Optional: Configure CoinMarketCap API key for cross-verification
# Get a free key at: https://pro.coinmarketcap.com/signup
echo "CMC_API_KEY=your_key_here" > mini-services/crypto-scanner/.env

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
6. Toggle language (EN/FA) using the language button
7. Toggle theme (dark/light) using the theme button

## Framework Phases

| Phase | Name | Description |
|-------|------|-------------|
| 0 | Settings | Persona selection, market cap range, sector filters |
| 1 | Discovery | 5 lenses: Money Flow, Hidden Infrastructure, Bottleneck, Institutional, Emerging |
| 2 | Screening | 5 hard veto gates (Fraud, Security, Custody, Backing, Legal) + 12 severe risks |
| 3 | Evidence | 4 quality grades (A-D) with freshness tracking, real 7d/30d fee data |
| 4 | Evaluation | 5 fundamental axes scored 0-10 with confidence, persona-weighted |
| 5 | Scoring | Weighted score 0-100 with weakest-link penalty, token quality separate |
| 6 | Investment | P/R, P/F, P/T valuation + cycle phase + catalysts + thesis + kill conditions |
| 7 | Decision | 6 action levels with risk adjustment + bias checks |
| 8 | Output | 23-section report + 5 final questions + cross-verification + self-correction |

## Project Structure

```
.
├── src/
│   ├── app/
│   │   ├── page.tsx              # Main dashboard
│   │   ├── layout.tsx            # Root layout (ThemeProvider + LanguageProvider)
│   │   └── api/scanner/          # API proxy routes (7 endpoints, error-handled)
│   ├── components/
│   │   ├── dashboard/            # SVG visualization components
│   │   │   ├── score-radial.tsx       # Animated circular gauge
│   │   │   ├── axis-radar-chart.tsx   # Pentagon radar chart
│   │   │   ├── sector-donut.tsx       # Animated donut chart
│   │   │   └── risk-heatmap.tsx       # CSS-grid heatmap
│   │   ├── theme-provider.tsx
│   │   ├── theme-toggle.tsx
│   │   └── language-toggle.tsx
│   └── lib/
│       ├── i18n/
│       │   ├── LanguageProvider.tsx   # Context provider with RTL
│       │   ├── en.json                # English translations
│       │   └── fa.json                # Persian translations
│       ├── use-indexed-db.ts          # IndexedDB hooks
│       ├── scanner-client.ts          # API client (30s timeout)
│       └── utils.ts
├── mini-services/
│   └── crypto-scanner/
│       ├── main.py               # FastAPI service
│       ├── models/schemas.py     # Pydantic models
│       ├── data/sources.py       # CoinGecko + DeFiLlama
│       └── framework/
│           ├── core.py           # Principles, veto, persona weights
│           ├── discovery.py      # PHASE 1 — 5 lenses
│           ├── evidence.py       # PHASE 3 — evidence collection
│           ├── evaluation.py     # PHASE 4 — 5 axes scoring
│           └── analysis.py       # PHASE 5-8 — scoring + output
├── RULES.md                      # Git + code quality rules
├── README.md                     # This file
├── DEVELOPMENT.md                # Development guide
└── worklog.md                    # Development history
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16, React, TypeScript, Tailwind CSS 4, shadcn/ui |
| Backend | Python 3.12, FastAPI, Pydantic, httpx |
| Data | CoinGecko API, DeFiLlama API (free, no key) |
| Storage | IndexedDB (browser), in-memory (Python) |
| Charts | Pure SVG (no chart library) |
| i18n | Custom LanguageProvider with EN/FA + RTL |

## API Endpoints

### Core Scanner
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/scanner/health` | Scanner service health + cache stats |
| GET | `/api/scanner/sources` | All 14 data sources status (free + API-key) |
| POST | `/api/scanner/scan` | Start a new market scan |
| GET | `/api/scanner/scan/:id` | Get scan status and results |
| GET | `/api/scanner/scans` | List all scans |
| GET | `/api/scanner/projects` | List all project reports |
| GET | `/api/scanner/project/:id` | Get full 23-section project report |

### Coin Explorer & Market Intelligence
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/scanner/search?q=` | Search coins by name/symbol (CoinGecko) |
| POST | `/api/scanner/analyze` | Run 8-phase analysis on a single coin |
| GET | `/api/scanner/market/overview` | Comprehensive market snapshot (6 sources in parallel) |

### News & Telegram
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/scanner/news?limit=&source=` | English crypto news (4 RSS + optional API keys) |
| GET | `/api/scanner/news/fa?limit=&category=` | Persian crypto news (ArzDigital + MihanBlockchain) |
| GET | `/api/scanner/telegram?channel=&limit=` | Telegram channel feed (t.me/s/ public preview) |

### CMC Pro Exclusive (require `CMC_API_KEY`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/scanner/cmc/airdrops?status=` | Crypto airdrops (returns `plan_not_supported` if key tier doesn't include it) |
| GET | `/api/scanner/cmc/categories` | 350 CMC categories with market cap, 24h/7d change, top coins |
| GET | `/api/scanner/cmc/exchanges?limit=` | Exchange map (active exchanges list) |
| GET | `/api/scanner/cmc/global-metrics` | CMC global metrics (BTC dominance, total mcap — cross-verifies CoinGecko) |

## Documentation

- [RULES.md](RULES.md) — Git rules, code quality, architecture, i18n, testing
- [DEVELOPMENT.md](DEVELOPMENT.md) — Setup, testing, troubleshooting, architecture decisions
- [worklog.md](worklog.md) — Complete development history

## Disclaimer

This framework is a research and analysis tool, not personalized financial advice. Always do your own research (DYOR) before making investment decisions.

## License

MIT
