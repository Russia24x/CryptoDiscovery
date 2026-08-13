# ARCHITECTURE.md — CryptoSieve Complete Blueprint

> **مستند جامع معماری، ساختار، و منطق کامل پروژه**
> برای نگهداری، توسعه آینده، و درک عمیق سیستم

---

## فهرست

1. [نمای کلی سیستم](#1-نمای-کلی-سیستم)
2. [معماری سطح بالا](#2-معماری-سطح-بالا)
3. [لوله‌کشی داده (Data Pipeline)](#3-لولهکشی-داده-data-pipeline)
4. [فریمورک ۸ فازی — منطق کامل](#4-فریمورک-۸-فازی--منطق-کامل)
5. [منابع داده و استراتژی چندمنبعی](#5-منابع-داده-و-استراتژی-چندمنبعی)
6. [Backend (Python FastAPI)](#6-backend-python-fastapi)
7. [Frontend (Next.js 16)](#7-frontend-nextjs-16)
8. [سیستم i18n دوزبانه](#8-سیستم-i18n-دوزبانه)
9. [مدیریت حافظه و کش](#9-مدیریت-حافظه-و-کش)
10. [پایداری و Watchdog](#10-پایداری-و-watchdog)
11. [نقشه راه توسعه](#11-نقشه-راه-توسعه)

---

## 1. نمای کلی سیستم

CryptoSieve یک فریمورک **تحلیل و کشف بازار کریپتو** است که بر اساس شواهد (evidence-first) کار می‌کند. سیستم از ۵ نما (view) تشکیل شده که توسط یک **هاب مرکزی** به هم متصل شده‌اند.

### اصول بنیادین

```
Evidence > Narrative          ← هر ادعا باید با داده پشتیبانی شود
Revenue ≠ Fees                ← Fees × 365 = annualized run-rate، نه revenue واقعی
Project Quality ≠ Token Quality ≠ Investment Attractiveness
Never guess missing data      ← اگر Evidence کافی نیست، Confidence را پایین بیاور
```

### سه لایه جدایی‌ناپذیر

هر پروژه سه امتیاز جداگانه دریافت می‌کند:

| امتیاز | معنی | محاسبه |
|--------|------|--------|
| **Project Quality** | کیفیت زیرساخت پروژه | مجموع وزنی ۵ محور با penalize ضعیف‌ترین |
| **Token Quality** | کیفیت توکن | تابع tokenomics + market structure |
| **Investment Attractiveness** | جذابیت سرمایه‌گذاری | project_quality × valuation × timing |

---

## 2. معماری سطح بالا

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    Next.js Dashboard (:3000)                             │
│                                                                          │
│  ┌─────────┐  ┌───────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │   Hub   │  │ Discovery │  │ Explorer │  │  Market  │  │   News   │  │
│  │ (Landing)│  │  (Scan)   │  │  (Coin)  │  │ (Intell) │  │ (Signals)│  │
│  └────┬────┘  └─────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘  │
│       │              │             │              │              │        │
│       └──────────────┴─────────────┴──────────────┴──────────────┘        │
│                              │                                            │
│                    ┌─────────▼──────────┐                                 │
│                    │  API Proxy Layer   │  21 route files                 │
│                    │  /api/scanner/*    │  timeout + error handling       │
│                    └─────────┬──────────┘                                 │
└──────────────────────────────┼───────────────────────────────────────────┘
                               │ HTTP (XTransformPort=3003)
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│              Python FastAPI Service (:3003)                               │
│                                                                          │
│  ┌──────────┐  ┌───────────┐  ┌──────────┐  ┌────────────┐              │
│  │Discovery │→│ Screening  │→│ Evidence │→│ Evaluation │              │
│  │5 Lenses  │  │5 Veto     │  │4 Sources │  │5 Axes(0-10)│              │
│  └──────────┘  └───────────┘  └──────────┘  └────────────┘              │
│       │              │              │              │                      │
│       ▼              ▼              ▼              ▼                      │
│  ┌──────────┐  ┌───────────┐  ┌──────────┐  ┌────────────┐              │
│  │ Scoring  │→│ Investment│→│ Decision │→│  Output    │              │
│  │ + Penalty│  │ + P/R/P/F │  │ 6 Levels │  │ 29 Sections│              │
│  └──────────┘  └───────────┘  └──────────┘  └────────────┘              │
│       │              │              │              │                      │
│       └──────────────┴──────────────┴──────────────┘                      │
│                              │                                            │
│                    ┌─────────▼──────────┐                                 │
│                    │  Data Sources      │  15 sources                     │
│                    │  11 free + 4 key   │  TTL cache (500 max)            │
│                    └────────────────────┘                                 │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 3. لوله‌کشی داده (Data Pipeline)

### جریان داده در یک Scan کامل

```
User clicks "Scan Market"
        │
        ▼
POST /api/scanner/scan  →  POST /scan  (Python)
        │
        ▼
┌─── PHASE 1: Discovery ────────────────────────────────────┐
│  fetch_top_markets(CoinGecko, 100 coins)                   │
│  fetch_defillama_protocols(8042 protocols)                  │
│  fetch_fees_overview(2557 fee protocols)                    │
│  → Merge by symbol, apply 5 discovery lenses                │
│  → Rank by composite signal, take top N                     │
│  → Return: list[CandidateInfo] + llama_by_symbol + fees     │
└─────────────────────────────────────────────────────────────┘
        │
        ▼  (for each candidate)
┌─── PHASE 2: Screening (Veto Gates) ───────────────────────┐
│  5 hard veto checks:                                        │
│  A. Fraud (guaranteed returns / ponzi)                      │
│  B. Security (unresolved hack)                              │
│  C. Custody (single-key / opaque)                           │
│  D. Backing (asset transparency)                            │
│  E. Legal (material deception)                              │
│  → If any triggered: HARD REJECT (score = 0)                │
│  → 12 severe risks tracked (penalty, not veto)              │
└─────────────────────────────────────────────────────────────┘
        │
        ▼
┌─── PHASE 3: Evidence Collection ──────────────────────────┐
│  Source 1: CoinGecko coin detail (tokenomics, links)       │
│  Source 2: DeFiLlama protocol overview (TVL, chains)        │
│  Source 3: DeFiLlama fees overview (fees 24h/7d/30d)        │
│  Source 4: CMC Keyless (holders, audits, price ranges)     │
│  Source 5: CMC Pro (if key set — cross-verification)       │
│  → EvidenceBundle: economic, tokenomics, market, flags      │
│  → Evidence grade: A (3+ sources) → D (0 sources)          │
└─────────────────────────────────────────────────────────────┘
        │
        ▼
┌─── PHASE 4: Fundamental Evaluation (5 Axes) ──────────────┐
│  Axis 1: Invisible Utility (API, SDK, docs, switching)    │
│  Axis 2: Economic Engine (revenue, fees, TVL, growth)      │
│  Axis 3: Moat (TVL rank, chains, licenses, network)        │
│  Axis 4: Token & Market (supply, liquidity, holders)       │
│  Axis 5: Governance/Legal (team, audit, multisig, reg)     │
│  → Each axis: score (0-10) + confidence (0-100) + sub-factors│
└─────────────────────────────────────────────────────────────┘
        │
        ▼
┌─── PHASE 5: Scoring ──────────────────────────────────────┐
│  Weighted sum: Σ(persona_weight[axis] × axis_score × 10)   │
│  Weakest-link penalty: if axis < 4 → penalty up to 24 pts  │
│  High-risk flag: if any sub-factor < 3 → +10 penalty       │
│  → Project Quality Score (0-100)                            │
│  → Quality band: Elite/Strong/Promising/Watchlist/Weak/Story│
└─────────────────────────────────────────────────────────────┘
        │
        ▼
┌─── PHASE 6: Investment Analysis ──────────────────────────┐
│  Valuation multiples (Framework 3.0):                       │
│    P/R = Market Cap ÷ Annualized Revenue (real only)       │
│    P/F = FDV ÷ Annualized Fees (≠ revenue)                  │
│    P/T = Market Cap ÷ TVL                                   │
│  Fee stability: 24h vs 7d vs 30d volatility                 │
│  Cycle phase: 1-7 (Hidden Dev → Maturity)                  │
│  Catalysts: positive/negative with ETA                      │
│  → Investment Attractiveness Score                          │
└─────────────────────────────────────────────────────────────┘
        │
        ▼
┌─── PHASE 7: Decision ─────────────────────────────────────┐
│  Blended = 0.4×project + 0.3×token + 0.3×investment        │
│  Confidence gate:                                           │
│    < 45% → Watch only                                       │
│    < 60% → Deep Research                                    │
│    ≥ 60% → full action scale:                               │
│      0=Ignore, 1=Watch, 2=Deep Research,                    │
│      3=Small Position, 4=Core Candidate, 5=High Conviction  │
│  → Decision(action, action_label, key_risks)                │
└─────────────────────────────────────────────────────────────┘
        │
        ▼
┌─── PHASE 8: Output (29-section report) ───────────────────┐
│  1. Candidate info + links                                  │
│  2. Veto result + severe risks                              │
│  3. Executive verdict (i18n)                                │
│  4. 5 axes with sub-factors + radar chart                   │
│  5. Economic engine (fees, revenue, TVL)                    │
│  6. Tokenomics (supply, utility, value capture)             │
│  7. Market structure (volume, holders, liquidity)           │
│  8. Institutional adoption text                             │
│  9. Competitive moat text                                   │
│  10. Cycle phase                                            │
│  11. Peer benchmark (percentile, rank, comparables)         │
│  12. Catalysts (positive/negative)                          │
│  13. Thesis + kill conditions                               │
│  14. Decision (action, confidence, risk-adjusted)           │
│  15. Evidence grade (A-D)                                   │
│  16. Data needing verification                              │
│  17. Final thesis                                           │
│  18. Five final answers                                     │
│  19. Valuation multiples (P/R, P/F, P/T)                    │
│  20. Cross-verifications (source vs source)                 │
│  21. Fee stability                                          │
│  22. Bias checks (7 self-correction checks)                 │
│  23. Market overview (CMC/CG data — no external visits)     │
└─────────────────────────────────────────────────────────────┘
```

### جریان داده در Coin Explorer (تحلیل دستی)

```
User searches "chainlink"
        │
        ▼
GET /api/scanner/search?q=chainlink  →  CoinGecko /search
        │
        ▼ (user selects Chainlink, picks persona, clicks Analyze)
POST /api/scanner/analyze {gecko_id: "chainlink", persona: "investor"}
        │
        ▼
POST /analyze  (Python)
  → fetch_coin_detail(gecko_id)         ← CoinGecko
  → fetch_defillama_protocols()         ← DeFiLlama (cached)
  → fetch_fees_overview()               ← DeFiLlama (cached)
  → match_llama_protocol()              ← merge by symbol
  → evidence.collect(candidate)         ← PHASE 3 (4 sources)
  → analysis.build_report(candidate, ev, config, "manual")
  → Store report in REPORTS dict
  → Return full 29-section ProjectReport
```

---

## 4. فریمورک ۸ فازی — منطق کامل

### PHASE 1: Discovery (کشف)

**هدف**: کشف پروژه‌های کریپتو با ارزش بازار ۱۰۰M تا ۵۰B از CoinGecko + DeFiLlama.

**۵ لنز کشف** (هر کدام سیگنال ۰-۵۰ تولید می‌کنند):

| لنز | منطق | خروجی |
|-----|------|-------|
| **A. Money Flow** | fees 24h + revenue 24h + TVL (log-scaled) | 0-100 |
| **B. Hidden Infrastructure** | category in {oracle, bridge, RPC, ...} | 0-15 |
| **C. Bottleneck** | TVL > $1B + multi-chain | 0-26 |
| **D. Institutional** | category in {RWA, stablecoin, ...} | 0-12 |
| **E. Emerging** | category in {AI, intent, modular, ...} | 0-14 |

**Composite signal** = مجموع ۵ لنز. اولویت: High (≥۵۰)، Medium (≥۲۵)، Low (<۲۵).

### PHASE 3: Evidence Collection (جمع‌آوری شواهد)

**منابع داده** (به ترتیب اولویت):

| منبع | داده | Evidence Grade |
|------|------|----------------|
| **Dune Analytics** (اگر کلید باشد) | تمرکز توکن، درآمد واقعی، DAU | A — Primary Verified |
| **CoinGecko** | قیمت، مارکت‌کپ، تأمین، توکنومیکس | B — Strong Secondary |
| **DeFiLlama** | TVL، کارمزد ۷d/30d | B — Strong Secondary |
| **CMC Keyless** | هولدرها، حسابرسی، ATH/ATL | B — Strong Secondary |
| **CMC Pro** (اگر کلید باشد) | تأیید متقابل قیمت/مارکت‌کپ | A — Primary Verified |

**ویژگی خاص: Blockchain TVL**

توکن‌هایی که خودشان **بلاک‌چین** هستند (SOL، ETH، BTC، AVAX، ...) TVL پروتکل ندارند — TVL آن‌ها مجموع تمام پروتکل‌های دیفای روی آن زنجیره است:

```python
# تشخیص بلاک‌چین بودن
chain = is_blockchain_token(symbol, name)  # "SOL" → "Solana"
if chain:
    # TVL = aggregate of all 273 protocols on Solana chain
    tvl = fetch_defillama_chain_tvl(chain)  # $10.83B for Solana
    # بلاک‌چین‌ها governance/moat بالاتر می‌گیرند (decentralized, network effect)
```

| کوین | نوع | TVL قبل | TVL بعد |
|------|-----|---------|---------|
| SOL | بلاک‌چین | $0.00B | **$10.83B** (273 پروتکل) |
| TRX | بلاک‌چین | $0.00B | **$5.69B** (33 پروتکل) |
| ETH | بلاک‌چین | $0.00B | ~$40B+ |
| AVAX | بلاک‌چین | $0.00B | aggregate |
| TON | بلاک‌چین | $0.00B | aggregate |
| AAVE | پروتکل | $12B | $12B (تغییری ندارد) |

**۴۰+ توکن بلاک‌چین شناسایی می‌شوند**: SOL، ETH، BTC، BNB، AVAX، MATIC، DOT، ATOM، NEAR، FTM، OP، ARB، APT، SUI، SEI، TIA، STX، RUNE، ICP، ALGO، XRP، ADA، EGLD، KAVA، TRX، TON، XLM، HBAR، VET، THETA، FLOW، XTZ، ZIL، IOTA، WAVES، QTUM، MNT.

**اصلاح تطبیق کارمزدها**: وقتی چندین ورودی در DeFiLlama همان نماد/نام را دارند (مثلاً "Solana" و "Solana Name Service")، سیستم بالاترین کارمزد ۲۴ ساعته را انتخاب می‌کند — اطمینان از تطبیق پروتکل واقعی.

| کوین | کارمزد قبل | کارمزد بعد | P/F قبل | P/F بعد |
|------|-----------|-----------|---------|---------|
| SOL | $1.8K | **$708K** | 72,531 | **186** |
| TRX | $920K | $920K | 94.8 | 94.8 |

### PHASE 2: Screening (غربالگری)

**۵ Veto Gate** (هر یک → HARD REJECT):

```python
A. Fraud: guaranteed_return_claims OR ponzi_structure
B. Security: unresolved_hack (without transparent remediation)
C. Custody: single_key_custody OR opaque_custody
D. Backing: backing_transparency_failure
E. Legal: material legal_deception
```

**۱۲ Severe Risk** (penalty، نه veto):

```
Anonymous team, Stale audit, Centralized governance,
Centralized upgrade authority, Single solver dependency,
High customer concentration, Near token unlock cliff,
Market maker dependency, Critical bridge dependency,
Critical chain dependency, Unclear token value capture,
Regulatory uncertainty
```

### PHASE 4: ۵ محور بنیادی

#### Axis 1: Invisible Utility
```python
sub_factors = {
    "User Abstraction":      3.0 if is_infrastructure else 5.0 if is_user_facing else 1.0
    "Integration Simplicity": 4.0 if has_api else 1.0
    "API Usability":         4.0 if (has_api and has_sdk) else 2.0 if has_api else 1.0
    "Developer Experience":  min(8.0, 2.0 + developer_count * 0.5)
    "Documentation":         4.0 if has_docs else 1.0
    "Switching Cost":        5.0 if switching_cost_signal else 2.0
    "Community Signal":      min(7.0, 1.0 + github_stars / 1000.0)
}
score = average(sub_factors)  # 0-10
```

#### Axis 2: Economic Engine
```python
# Framework 3.0: Revenue ≠ Fees
if daily_revenue > 0:
    # Real revenue — full scoring (up to 9.5)
    Revenue Scale based on annual_rev thresholds
elif daily_fees > 0:
    # Fees as proxy — CAPPED at 5.0 (fees ≠ revenue)
    Revenue Scale capped at 5.0
else:
    Revenue Scale = 0.5

sub_factors = {
    "Revenue Scale":     based on annual thresholds,
    "Fee Generation":    based on annual fees,
    "TVL Strength":      based on TVL,
    "Growth Trajectory": 24h vs 7d fee comparison,
    "Recurrence":        "recurring" if TVL > 0 else "none",
}
```

#### Axis 3: Moat
```python
sub_factors = {
    "TVL Rank":          based on tvl_rank (1=top),
    "Network Effect":    based on chain_count,
    "Regulatory Moat":   8.0 if has_license else 2.0,
    "Partner Lock-in":   based on partner_integrations,
    "Liquidity Moat":    based on liquidity_tvl,
}
```

#### Axis 4: Token & Market Structure
```python
sub_factors = {
    "Supply Dynamics":   circulating/total ratio,
    "Insider Risk":      insider_allocation_pct,
    "Utility Level":     0-4 (governance → staking → fee → burn),
    "Value Capture":     "strong" / "moderate" / "weak",
    "Liquidity Depth":   daily_volume / market_cap,
    "Holder Distribution": top_10_holder_ratio,
}
→ token_quality_score (0-100, separate from project quality)
```

#### Axis 5: Governance / Legal / Security
```python
sub_factors = {
    "Team Transparency":    8.0 if transparent else 2.0,
    "Legal Entity":         7.0 if has_entity else 2.0,
    "Audit Status":         9.0 if recent else 4.0 if stale else 1.0,
    "Incident History":     8.0 if clean else 3.0,
    "Multisig":             7.0 if multisig else 2.0,
    "Upgrade Decentralization": 7.0 if decentralized else 3.0,
    "Regulatory Clarity":   8.0 if clear else 3.0,
    "Disclosure Quality":   based on methodology presence,
}
```

### PHASE 5: Scoring

```python
# Persona-weighted sum (weights sum to 1.0)
weights = PERSONA_WEIGHTS[persona]  # e.g. Investor: Economic=0.30, Moat=0.20, ...
raw_score = Σ(weights[axis] × axis_score × 10.0)  # 0-100

# Weakest-link penalty
if min_axis_score < 4.0:
    penalty += (4.0 - min_axis_score) × 6.0  # up to 24 points
if min_sub_factor < 3.0:
    high_risk = True
    penalty += 10.0

project_quality = max(0, raw_score - penalty)  # 0-100
risk_adjusted = project_quality × (confidence / 100)
```

**Quality Bands**:
| Score | Band |
|-------|------|
| ≥90 | Elite Infrastructure |
| ≥80 | Strong Infrastructure |
| ≥70 | Promising |
| ≥60 | Watchlist |
| ≥50 | Weak |
| <50 | Story / Speculation |

### PHASE 6: Investment Analysis

```python
# Valuation multiples (Framework 3.0)
P_R = market_cap / annual_revenue     # real revenue only
P_F = fdv / annual_fees               # fees ≠ revenue (explicitly)
P_T = market_cap / tvl

# Fee stability (24h vs 7d vs 30d)
fee_volatility = abs(24h_avg - 30d_avg) / 30d_avg × 100
# >40% → "volatile", else "stable"

# Cycle phase (1-7)
1. Hidden Development → 2. PMF → 3. Adoption → 4. Monetization
→ 5. Institutional → 6. Scale → 7. Maturity

# Investment attractiveness = f(quality, valuation, timing)
```

### PHASE 7: Decision

```python
blended = 0.4 × project_quality + 0.3 × token_quality + 0.3 × investment_attractiveness

# Confidence gate
if confidence < 45:  return "Watch (Low confidence)"
if confidence < 60:  return "Deep Research (Confidence building)"

if blended >= 85:  return "High Conviction"       # 5
if blended >= 75:  return "Core Position Candidate" # 4
if blended >= 65:  return "Small Position"          # 3
if blended >= 55:  return "Deep Research"           # 2
if blended >= 45:  return "Watch"                   # 1
return "Ignore"                                     # 0
```

### Persona Weights

```python
PERSONA_WEIGHTS = {
    "investor":       {"Economic": 0.30, "Moat": 0.20, "Token": 0.20, "Utility": 0.15, "Gov": 0.15},
    "institutional":  {"Economic": 0.30, "Gov": 0.25, "Moat": 0.20, "Utility": 0.15, "Token": 0.10},
    "researcher":     {"Utility": 0.25, "Economic": 0.20, "Moat": 0.25, "Token": 0.10, "Gov": 0.20},
    "developer":      {"Utility": 0.30, "Moat": 0.25, "Economic": 0.20, "Gov": 0.15, "Token": 0.10},
    "trader":         {"Token": 0.30, "Economic": 0.25, "Moat": 0.15, "Utility": 0.15, "Gov": 0.15},
    "comprehensive":  {"Economic": 0.22, "Moat": 0.22, "Gov": 0.20, "Utility": 0.18, "Token": 0.18},
}
```

---

## 5. منابع داده و استراتژی چندمنبعی

### ۱۵ منبع داده (۱۱ رایگان + ۴ با API Key)

#### منابع رایگان (همیشه فعال)

| منبع | داده | Endpoint | کش |
|------|------|----------|-----|
| **CoinGecko** | قیمت، مارکت‌کپ، تأمین، جستجو، trending | `/coins/markets`, `/coins/{id}`, `/search`, `/global` | 90-180s |
| **DeFiLlama** | TVL، کارمزد ۷d/30d، درآمد، پروتکل‌ها | `/protocols`, `/overview/fees` | 90s |
| **CMC Keyless** | نسبت هولدرها، حسابرسی، ATH/ATL، بازه قیمت | `data-api/v3/cryptocurrency/detail` | — |
| **CoinDesk RSS** | اخبار انگلیسی | `coindesk.com/arc/outboundfeeds/rss/` | 300s |
| **Cointelegraph RSS** | اخبار انگلیسی | `cointelegraph.com/rss` | 300s |
| **Decrypt RSS** | اخبار انگلیسی | `decrypt.co/feed` | 300s |
| **Bitcoinist RSS** | اخبار انگلیسی | `bitcoinist.com/feed/` | 300s |
| **ArzDigital** | خبر فوری + مقالات فارسی | `arzdigital.com/breaking/feed/` + `/feed/` | 300s |
| **MihanBlockchain** | اخبار + تحلیل بازار فارسی | `mihanblockchain.com/category/news/feed/` + `/markets/feed/` | 300s |
| **Fear & Greed** | شاخص احساسات ۰-۱۰۰ | `api.alternative.me/fng/` | 300s |
| **Telegram** | پیام‌های کانال عمومی | `t.me/s/{channel}` | 120s |

#### منابع با API Key (اختیاری)

| منبع | Key Env | داده اختصاصی | وضعیت طرح فعلی |
|------|---------|-------------|----------------|
| **CMC Pro** | `CMC_API_KEY` | Categories (350), Global metrics, Exchange map, Quotes/Info, Cross-verification | Basic: Categories ✓, Global ✓, Airdrops ✗ |
| **Dune Analytics** | `DUNE_API_KEY` | **EXCLUSIVE: On-chain Grade A data** — real revenue vs fees (Revenue ≠ Fees), token holder concentration, bot-filtered DAU/MAU, whale tracking, 100+ chains (Solana, Bitcoin L2, non-EVM) | Free tier: 2500 datapoints/month, 5 req/min |
| **CryptoPanic** | `CRYPTOPANIC_TOKEN` | اخبار curated | — |
| **CryptoCompare** | `CRYPTOCOMPARE_KEY` | اخبار + قیمت | — |

### Dune Analytics — ارتقای Evidence Grade به A

Dune داده‌ها را **مستقیماً از تراکنش‌های بلاک‌چین** می‌خواند — بدون واسطه. این بالاترین کیفیت شواهد در لوله داده است:

```
بدون Dune: CoinGecko + DeFiLlama + CMC Keyless = Grade B (Strong Secondary)
با Dune:   CoinGecko + DeFiLlama + CMC Keyless + Dune = Grade A (Primary Verified)
```

**کوئری‌های پیش‌فرض Dune** (قابل تنظیم با env var):

| Env Var | کاربرد | ماژول CryptoSieve |
|---------|--------|-------------------|
| `DUNE_QUERY_TOKEN_CONCENTRATION` | تمرکز هولدرها (top 10/100، نهنگ‌ها، تیم) | PHASE 2: Veto/Screening + Axis 4 |
| `DUNE_QUERY_REAL_REVENUE` | تفکیک درآمد واقعی از کارمزد | PHASE 4/6: Revenue ≠ Fees |
| `DUNE_QUERY_ACTIVE_USERS` | DAU/MAU با فیلتر ربات | Axis 1: Invisible Utility + Axis 3: Moat |

**فعال‌سازی**: کلید رایگان از https://dune.com/api-keys، سپس در `.env`:
```
DUNE_API_KEY=your_key
DUNE_QUERY_TOKEN_CONCENTRATION=12345  # query ID from dune.com
DUNE_QUERY_REAL_REVENUE=67890
DUNE_QUERY_ACTIVE_USERS=11111
```

### استراتژی Cross-Verification

```
CoinGecko BTC Dominance: 56.29%    ─┐
                                      ├─→ Δ 4.02% discrepancy (shown in Hub)
CMC Pro BTC Dominance:    58.55%    ─┘
```

هر داده‌ای که از ۲+ منبع قابل دریافت باشد، در گزارش نمایش داده می‌شود:
- `cross_verifications[]` — مقایسه source_a vs source_b با درصد اختلاف
- `bias_checks[]` — ۷ بررسی خوداصلاحی (popular bias, source bias, snapshot bias, ...)

### مدیریت خطای ۴۰۳ CMC

```python
_cmc_get()         → returns None on any error (silent)
_cmc_get_strict()  → raises CmcPlanNotSupported on 403

# همه CMC fetchers از _cmc_get_strict استفاده می‌کنند
# endpoint‌ها بین "no key" (cmc_pro_required) و "plan doesn't support" (plan_not_supported) تمایز قائل می‌شوند
```

---

## 6. Backend (Python FastAPI)

### ساختار فایل‌ها

```
mini-services/crypto-scanner/
├── main.py              (706 lines) — FastAPI app, 18 endpoints
├── models/
│   └── schemas.py       (355 lines) — Pydantic models (all data structures)
├── data/
│   └── sources.py       (1360 lines) — All data source fetchers + cache
├── framework/
│   ├── core.py          (225 lines) — Persona weights, veto gates, scoring
│   ├── discovery.py     (389 lines) — PHASE 1: 5 discovery lenses
│   ├── evidence.py      (599 lines) — PHASE 3: Evidence collection
│   ├── evaluation.py    (488 lines) — PHASE 4: 5 axis scoring
│   ├── analysis.py      (921 lines) — PHASE 5-8: Scoring + output
│   └── i18n.py          (201 lines) — Backend translations (EN/FA)
├── requirements.txt
└── start.sh
```

### تمام Endpoint‌ها

#### Core Scanner
| Method | Path | توضیح |
|--------|------|-------|
| GET | `/health` | سلامت سرویس + آمار کش |
| GET | `/sources` | وضعیت ۱۵ منبع داده |
| POST | `/scan` | شروع scan جدید |
| GET | `/scan/{id}` | وضعیت scan + خلاصه نتایج |
| GET | `/scan/{id}/projects` | گزارش‌های کامل یک scan |
| GET | `/scans` | لیست همه scanها |
| GET | `/projects` | همه گزارش‌ها (latest first) |
| GET | `/project/{id}` | گزارش کامل ۲۳ بخشی |

#### Coin Explorer & Market
| Method | Path | توضیح |
|--------|------|-------|
| GET | `/search?q=` | جستجوی کوین (CoinGecko) |
| POST | `/analyze` | تحلیل ۸ فازی یک کوین |
| GET | `/market/overview` | snapshot جامع بازار (۶ منبع موازی) |

#### News & Telegram
| Method | Path | توضیح |
|--------|------|-------|
| GET | `/news?limit=&source=` | اخبار انگلیسی (۴ RSS) |
| GET | `/news/fa?limit=&category=` | اخبار فارسی (ArzDigital + MihanBlockchain) |
| GET | `/telegram?channel=&limit=` | فید کانال تلگرام (t.me/s/) |

#### CMC Pro Exclusive
| Method | Path | توضیح |
|--------|------|-------|
| GET | `/cmc/airdrops?status=` | ایردراپ‌ها (plan_not_supported if 403) |
| GET | `/cmc/categories` | ۳۵۰ دسته CMC با مارکت‌کپ |
| GET | `/cmc/exchanges?limit=` | لیست صرافی‌ها |
| GET | `/cmc/global-metrics` | سلطه BTC، کل مارکت‌کپ (cross-verify) |

#### Dune Analytics (On-Chain, Grade A)
| Method | Path | توضیح |
|--------|------|-------|
| GET | `/dune/query/{query_id}` | نتایج کش‌شده هر کوئری Dune |
| POST | `/dune/execute/{query_id}` | اجرای تازه کوئری با پارامتر |
| GET | `/dune/insights/{symbol}` | insights آماده: تمرکز توکن، درآمد واقعی، کاربران فعال |

#### CoinGecko Enhanced (Demo Key)
| Method | Path | توضیح |
|--------|------|-------|
| GET | `/coingecko/chart/{gecko_id}?days=7` | نمودار قیمت تاریخی (sparkline) |
| GET | `/coingecko/ohlc/{gecko_id}?days=7` | داده OHLC شمعی |
| GET | `/coingecko/new-coins` | کوین‌های تازه لیست‌شده (discovery) |
| GET | `/coingecko/categories` | دسته‌بندی CoinGecko (رایگان، متفاوت از CMC) |

### ذخیره‌سازی داده

```python
# In-memory stores (no database — single instance)
SCANS: dict[str, ScanProgress]              # scan_id → progress
REPORTS: dict[str, ProjectReport]           # report_id → full report
SCAN_REPORT_IDS: dict[str, list[str]]       # scan_id → [report_ids]
```

---

## 7. Frontend (Next.js 16)

### ساختار فایل‌ها

```
src/
├── app/
│   ├── page.tsx                    (4338 lines) — Main page, 5 views, Hub + Discovery
│   ├── layout.tsx                  — Root layout with ThemeProvider + LanguageProvider
│   └── api/scanner/                — 21 proxy route files
│       ├── health/route.ts
│       ├── scan/route.ts
│       ├── scan/[id]/route.ts
│       ├── scans/route.ts
│       ├── project/[id]/route.ts
│       ├── projects/route.ts
│       ├── search/route.ts
│       ├── analyze/route.ts
│       ├── market/overview/route.ts
│       ├── news/route.ts
│       ├── news/fa/route.ts
│       ├── telegram/route.ts
│       ├── sources/route.ts
│       └── cmc/
│           ├── airdrops/route.ts
│           ├── categories/route.ts
│           ├── exchanges/route.ts
│           └── global-metrics/route.ts
├── components/
│   ├── views/                      — 5 main views
│   │   ├── hub-view.tsx            (1520 lines) — Landing page
│   │   ├── coin-explorer-view.tsx  (1362 lines) — Manual coin analysis
│   │   ├── market-intelligence-view.tsx (1665 lines) — CMC+DeFiLlama replacement
│   │   └── news-feed-view.tsx      (1414 lines) — News + Telegram
│   ├── dashboard/                  — Chart components
│   │   ├── score-radial.tsx        — SVG radial gauge
│   │   ├── axis-radar-chart.tsx    — SVG radar for 5 axes
│   │   ├── sector-donut.tsx        — SVG donut chart
│   │   └── risk-heatmap.tsx        — Risk visualization
│   ├── ui/                         — 47 shadcn/ui components
│   ├── theme-provider.tsx          — next-themes wrapper
│   ├── theme-toggle.tsx            — Dark/light toggle
│   └── language-toggle.tsx         — EN/FA toggle
├── lib/
│   ├── scanner-client.ts           — Proxy helper (timeout, XTransformPort)
│   ├── scanner-types.ts            (452 lines) — All TypeScript interfaces
│   ├── i18n/
│   │   ├── LanguageProvider.tsx    — Context provider + t() function
│   │   ├── en.json                 — English translations (553+ keys)
│   │   └── fa.json                 — Persian translations (553+ keys)
│   ├── use-indexed-db.ts           — IndexedDB hook (watchlist, recently viewed)
│   ├── db.ts                       — Prisma client
│   └── utils.ts                    — cn() helper
└── hooks/
    ├── use-toast.ts                — Toast notifications
    └── use-mobile.ts               — Mobile detection
```

### ۵ نمای اصلی

#### 0. Hub (صفحه فرود)
- **هرو بنر**: کل مارکت‌کپ، سلطه BTC/ETH (CMC cross-verified)، Fear & Greed gauge
- **اقدامات سریع**: ۴ کارت ناوبری به سایر نماها
- **نمای بازار**: Trending coins، top-3 DeFi، TVL کل، فعال‌ترین کوین‌ها
- **چیدمان دو ستونه**: اخبار (EN/FA) + تلگرام | آمار چارچوب + cross-verification + top movers
- **فوتر سلامت**: ۱۵ منبع با dot‌های وضعیت
- **داده**: ۷ API موازی با resilience مستقل

#### 1. Discovery (اسکن بازار)
- **پیکربندی**: persona، بازه مارکت‌کپ، بخش‌ها، حداکثر پروژه
- **پیش‌نویس سریع**: DeFi Focus، Large Cap، Emerging، Infra
- **پیشرفت زنده**: ۸ فاز با progress bar و phase log
- **نتایج**: کارت‌های رتبه‌بندی شده با quality score، action badge، confidence
- **حالت‌ها**: Grid (کارت‌ها) / Analytics (هیت‌مپ ریسک، توزیع امتیاز، donut بخش)
- **باز.drawer گزارش**: ۲۳ بخش کامل با radar chart، valuation multiples، thesis
- **ویژگی‌ها**: مقایسه پروژه‌ها، watchlist (IndexedDB)، تاریخچه scan، scan diff، جستجوی سراسری، export CSV/Markdown

#### 2. Coin Explorer (تحلیل دستی)
- **جستجو**: CoinGecko /search با debounce 300ms
- **انتخاب پرسونا**: ۶ persona با توضیح
- **تحلیل ۸ فازی**: POST /analyze → گزارش کامل ۲۳ بخشی
- **نمایش نتیجه**: ScoreRadial، ۵ محور با progress bars، valuation multiples، thesis blockquote، severe risks، catalysts

#### 3. Market Intelligence (CMC + DeFiLlama)
- **بنر آمار جهانی**: ۶ کارت (mcap، 24h، BTC dom، volume، coins، markets)
- **Fear & Greed gauge**: نوار گرادیان با marker
- **DeFi TVL total**: عدد بزرگ
- **۹ تب**: Top Coins (50) | Gainers | Losers | Trending | Top DeFi (50) | Top Fees (30) | Sectors | **Airdrops (CMC Pro)** | **Categories (CMC Pro)**
- **کلیک روی کوین**: → انتقال به Coin Explorer با gecko_id

#### 4. News & Signals
- **۳ سابت‌تب**: Crypto News (EN) | اخبار فارسی | Telegram Channel
- **اخبار انگلیسی**: ۴ منبع RSS + فیلتر منبع + جستجو
- **اخبار فارسی**: ArzDigital + MihanBlockchain با فیلتر دسته (خبر فوری/مقاله/خبر/تحلیل)
- **تلگرام**: chat-style bubbles با photo + album grid، view counts، auto-refresh

### پراکسی API

```typescript
// scanner-client.ts — تمام fetch‌ها از این تابع استفاده می‌کنند
const SCANNER_PORT = "3003";
const SCANNER_BASE = "http://localhost:3003";

export async function scannerFetch(path, init?: ScannerFetchInit) {
  // URL: http://localhost:3003{path}?XTransformPort=3003
  // AbortController با timeout قابل تنظیم (پیش‌فرض 30s، analyze 90s، market 60s)
  // cache: "no-store"
}
```

---

## 7.5. سیستم Health Check و نگهداری خودکار

### Endpoint بررسی سلامت (`GET /system/health-check`)

سیستم به‌طور خودکار یکپارچگی خط لوله داده را بررسی می‌کند:

```json
{
  "sources": {"coingecko": true, "defillama": true, "cmc_keyless": true, ...},
  "blockchain_detection": {"auto_synced_symbols": 140, "manual_overrides": 40},
  "data_gaps": [
    {"symbol": "BNB", "issues": ["Blockchain token but TVL=$0"]},
    {"symbol": "USDT", "issues": ["CMC Keyless: no data (slug mismatch)"]}
  ],
  "summary": {"status": "needs_attention", "data_gaps_found": 10}
}
```

### همگام‌سازی خودکار زنجیره‌ها

به‌جای نگهداری دستی جدول توکن‌های بلاک‌چین، سیستم به‌طور خودکار از DeFiLlama `/chains` endpoint (۴۶۱+ زنجیره) بارگذاری می‌کند:

```python
await _sync_chain_mapping()  # هر ۱ ساعت کش می‌شود
# پوشش: ۱۴۰ نماد (در مقابل ۴۰ دستی قبلی) — ۳.۵ برابر بهبود
```

### سیستم Long-Running خودکار (هر ۳۰ دقیقه)

یک تسک زمان‌بندی‌شده (cron job) به‌طور **مداوم و بدون توقف** سیستم را ممیزی، دیباگ و توسعه می‌دهد:

```yaml
نام: CryptoSieve Auto-Audit & Development
بازه: هر ۱۸۰۰ ثانیه (۳۰ دقیقه)
منطقه زمانی: Asia/Tehran
نوع: agentTurn (ایجنت خودکار کدنویسی)
```

**دستورالعمل اجرای هر دوره**:
1. `worklog.md` را می‌خواند برای درک وضعیت فعلی
2. `GET /system/health-check` را اجرا می‌کند — شکاف‌های داده را رفع می‌کند
3. `bun run lint` را اجرا می‌کند — خطاها را برطرف می‌کند
4. تحلیل ۳ کوین (SOL، BTC، LINK) را تست می‌کند — داده‌های واقعی را تأیید می‌کند
5. جستجو برای placeholder/TODO/FIXME — مقادیر نمایشی را پیدا و حذف می‌کند
6. لاگ‌های dev و scanner را بررسی می‌کند — خطاها را رفع می‌کند
7. تغییرات را commit و push می‌کند
8. یافته‌ها را به worklog اضافه می‌کند
9. حداکثر ۲ رفع در هر دوره (برای جلوگیری از تغییرات بیش از حد)

**مزایای این سیستم**:
- **خود‌ترمیم‌شونده**: باگ‌های داده به‌طور خودکار شناسایی و رفع می‌شوند
- **آینده‌نگرانه**: placeholder‌ها قبل از تبدیل شدن به مشکل حذف می‌شوند
- **بدون توقف**: سیستم ۲۴/۷ در حال ممیزی است
- **مستندسازی خودکار**: هر تغییر در worklog ثبت می‌شود

---

## 8. سیستم i18n دوزبانه

### ساختار

```typescript
// LanguageProvider.tsx
const { t, lang, dir } = useLanguage();
// t(key) → رشته ترجمه‌شده یا key خودش (اگر ترجمه وجود ندارد)
// lang → "en" | "fa"
// dir → "ltr" | "rtl" (خودکار از lang)

// الگوی tt (translate with fallback)
const tt = (key, fallback) => {
  const v = t(key);
  return typeof v === "string" && v !== key ? v : fallback;
};
```

### Namespace‌ها (۳۴ بخش)

```
nav, header, config, personas, sectors, stats, sentiment,
results, projectCard, detail, metrics, analytics, history,
scanDiff, watchlist, search, help, footer, empty, common,
actions, qualityBands, axes, subFactors, valueCapture,
feeStability, explorer, market, news, news_fa, telegram,
scan, toast, comparison, hub
```

### قواعد
- نام برندها انگلیسی می‌مانند: CoinGecko, DeFiLlama, CoinMarketCap, ArzDigital
- مخفف‌های صنعتی ثابت: PRO, TVL, FDV, P/R, P/F, P/T, RSS, API
- متن‌های مختلط فارسی/انگلیسی: `dir="auto"` برای bidi خودکار
- placeholder‌ها در ترجمه فارسی حفظ می‌شوند: `{n}`, `{count}`, `{name}`

---

## 9. مدیریت حافظه و کش

### کش TTL (Python)

```python
_CACHE: dict[str, tuple[float, Any]]  # key → (timestamp, value)
_CACHE_TTL_DEFAULT = 90.0   # seconds
_CACHE_MAX_ENTRIES = 500    # threshold for eviction

def cache_get(key, ttl):
    # اگر منقضی شده → lazy removal + return None

def cache_set(key, value):
    # اگر len >= 500 → _evict_expired()
    # _evict_expired: حذف همه منقضی‌ها
    # اگر هنوز >= 500 → حذف ۲۰٪ قدیمی‌ترین

def cache_info():
    # {entries, live, ttl_seconds, max_entries} → در /health
```

### کش در Frontend
- **IndexedDB**: watchlist + recently viewed (با fallback به localStorage)
- **HTTP cache**: `cache: "no-store"` برای همه scanner fetch‌ها (داده پویا)
- **React state**: هر view داده خود را نگه می‌دارد (lazy load روی tab switch)

---

## 10. پایداری و Watchdog

### Next.js Watchdog (`watchdog.py`)
```python
# Double-fork daemon
# Next.js dev server را با --max-old-space-size=384 اجرا می‌کند
# اگر بمیرد، پس از ۳ ثانیه ری‌استارت می‌کند
# PID در dev-server.pid
```

### Scanner Watchdog (`scanner-watchdog.py`)
```python
# Double-fork daemon
# .env را load می‌کند (CMC_API_KEY, CRYPTOPANIC_TOKEN, ...)
# uvicorn را با follow_redirects اجرا می‌کند
# اگر بمیرد، پس از ۳ ثانیه ری‌استارت می‌کند
# PID در scanner.pid
```

### Gateway (Caddyfile)
```
# پورت ۳۰۰۰ خارجی است
# XTransformPort در query برای routing به پورت‌های داخلی
# /api/scanner/* → localhost:3003 (scanner)
# /api/* → localhost:3000 (Next.js)
```

---

## 11. نقشه راه توسعه

### اولویت بالا (Short-term)

#### ۱. پایداری داده
- [ ] **Persistence layer**: ذخیره scan‌ها و گزارش‌ها در SQLite (Prisma) به‌جای in-memory
- [x] **CoinGecko rate limit handling**: Demo API key فعال (۳۰ calls/min) ✓
- [ ] **Webhook برای Telegram**: به‌جای polling، ثبت webhook برای real-time updates
- [ ] **Retry logic**: exponential backoff برای API‌های ناپایدار

#### ۲. بهبود فریمورک
- [ ] **Historical scoring**: ذخیره امتیاز پروژه در طول زمان برای trend analysis
- [ ] **Alert system**: هشدار زمانی که امتیاز یک پروژه تغییر قابل‌توجه می‌کند
- [ ] **Custom persona**: اجازه تعریف وزن‌های شخصی‌سازی‌شده توسط کاربر
- [ ] **Backtesting**: مقایسه پیش‌بینی‌های فریمورک با عملکرد واقعی قیمت

#### ۳. UI/UX
- [x] **Price charts**: endpoint نمودار قیمت اضافه شد (`/coingecko/chart/{id}`) ✓
- [ ] **Dark/Light theme در charts**: نمودارهای SVG به theme واکنش نشان دهند
- [ ] **Mobile app**: PWA با offline support برای watchlist
- [ ] **Notifications**: push notification برای اخبار فوری و تغییرات امتیاز
- [x] **Market overview در گزارش**: CMC Keyless data (holders, ATH/ATL, audits) ✓

### اولویت متوسط (Mid-term)

#### ۴. منابع داده جدید
- [ ] **Messari**: endpoint رایگان برای metrics اضافی
- [ ] **Santiment**: داده‌های on-chain (developer activity, social volume)
- [ ] **Glassnode Lite**: on-chain indicators (هنگام در دسترس قرار گرفتن رایگان)
- [x] **Dune Analytics**: یکپارچه‌سازی کامل + کلید فعال ✓

#### ۵. تحلیل پیشرفته
- [ ] **Correlation analysis**: همبستگی امتیاز فریمورک با تغییرات قیمت آینده
- [ ] **Sector rotation**: ردیابی جابجایی سرمایه بین بخش‌ها
- [ ] **Whale tracking**: ردیابی حرکت نهنگ‌ها (از داده Telegram/on-chain)
- [ ] **Sentiment analysis**: تحلیل احساسات از اخبار فارسی و انگلیسی با NLP

#### ۶. Community Features
- [ ] **Shared scans**: اشتراک‌گذاری نتایج scan با URL
- [ ] **Custom watchlists**: لیست‌های متعدد با دسته‌بندی
- [ ] **Notes & tags**: یادداشت کاربر روی هر پروژه
- [ ] **Export portfolio**: خروجی CSV/JSON برای portfolio tracker‌ها

---

### ریسک‌ها و وابستگی‌ها

| ریسک | احتمال | تأثیر | راهکار |
|------|--------|-------|--------|
| CoinGecko rate limit (429) | بالا | متوسط | Demo API key + cache + fallback |
| Telegram t.me/s/ blocking | متوسط | پایین | Proxy + cache |
| CMC Pro plan limitation | بالا | پایین | Graceful degradation + upgrade prompt |
| In-memory data loss (restart) | متوسط | بالا | SQLite persistence (اولویت ۱) |
| page.tsx file size (4338 lines) | پایین | متوسط | Extract Discovery view به component جداگانه |

---

### معیارهای کیفیت (از RULES.md)

| متریک | هدف | وضعیت فعلی |
|-------|------|------------|
| Page load | < 500ms | ~300ms ✓ |
| Scan completion (5 projects) | < 30s | ~7s ✓ |
| Detail drawer open | < 500ms | ~100ms ✓ |
| Language toggle | < 100ms | < 50ms ✓ |
| Lint errors | 0 | 0 ✓ |
| TypeScript errors | 0 | 0 ✓ |
| Console errors | 0 | 0 ✓ |

---

> **این مستند زنده است** — با هر تغییر معماری باید به‌روز شود.
> آخرین به‌روزرسانی: Task 4 (cache eviction + CMC 403 fix)
