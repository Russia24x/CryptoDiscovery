# گزارش فنی پروژه — CryptoSieve
## فریمورک کشف و تحلیل بازار کریپتو

> **سند ارائه به مشاور پروژه**
> تاریخ: آگوست ۲۰۲۶
> نسخه: ۱.۰

---

## ۱. نمای کلی پروژه

CryptoSieve یک فریمورک **تحلیل و کشف بازار کریپتو مبتنی بر شواهد** (Evidence-First) است که ۸ فاز تحلیلی را برای ارزیابی پروژه‌های کریپتو پیاده‌سازی می‌کند. سیستم از ۱۵ منبع داده (۱۱ رایگان + ۴ با کلید API) استفاده می‌کند و گزارش‌های ۲۹ بخشی برای هر پروژه تولید می‌کند.

### اصول بنیادین

```
Evidence > Narrative          ← هر ادعا باید با داده پشتیبانی شود
Revenue ≠ Fees                ← Fees × 365 = annualized run-rate، نه revenue واقعی
Project Quality ≠ Token Quality ≠ Investment Attractiveness
Never guess missing data      ← اگر Evidence کافی نیست، Confidence پایین می‌رود
```

### آمار کلی

| متریک | مقدار |
|--------|-------|
| خطوط کد Python | ۶,۸۶۴ |
| خطوط کد Frontend | ۱۱,۵۲۲ |
| کل خطوط کد | ~۱۸,۳۸۶ |
| Endpoint‌های API | ۳۰ |
| Route‌های Next.js | ۲۵ |
| کامپوننت‌های View | ۴ |
| کلیدهای i18n | ۶۲۰ (EN = FA) |
| Commit‌های feat/fix | ۳۷ |
| منابع داده | ۱۵ (۱۱ رایگان + ۴ با کلید) |

---

## ۲. معماری سیستم

```
┌─────────────────────────────────────────────────────────────────┐
│                    Next.js Dashboard (:3000)                     │
│                                                                  │
│  ┌─────────┐  ┌───────────┐  ┌──────────┐  ┌──────────┐        │
│  │   Hub   │  │ Discovery │  │ Explorer │  │  Market  │  + News │
│  │ (Landing)│  │  (Scan)   │  │  (Coin)  │  │ (Intell) │         │
│  └────┬────┘  └─────┬─────┘  └────┬─────┘  └────┬─────┘        │
│       └──────────────┴─────────────┴──────────────┘              │
│                          │ API Proxy (25 routes)                 │
└──────────────────────────┼──────────────────────────────────────┘
                           │ HTTP
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│              Python FastAPI Service (:3003)                       │
│                                                                  │
│  PHASE 1-8 Pipeline:                                             │
│  Discovery → Screening → Evidence → Evaluation → Scoring        │
│  → Investment → Decision → Output (29-section report)           │
│                                                                  │
│  ┌──────────────────────────────────────┐                        │
│  │  15 Data Sources (11 free + 4 key)   │                        │
│  │  SQLite Persistence + Cache (300 max)│                        │
│  └──────────────────────────────────────┘                        │
└─────────────────────────────────────────────────────────────────┘
```

### پشته فناوری

| لایه | فناوری |
|------|--------|
| Frontend | Next.js 16, TypeScript 5, Tailwind CSS 4, shadcn/ui |
| Backend | Python 3.12, FastAPI, httpx, Pydantic |
| Database | SQLite (Persistence Layer) |
| Charts | Pure SVG (بدون کتابخانه چارت) |
| i18n | Custom LanguageProvider (EN + FA, RTL) |
| Process Management | Python double-fork watchdog daemons |

---

## ۳. فریمورک ۸ فازی

### PHASE 1: Discovery (کشف)
- ۵ لنز کشف: Money Flow, Hidden Infrastructure, Bottleneck, Institutional, Emerging
- منابع: CoinGecko (top 250 coins) + DeFiLlama (8000+ protocols) + DeFiLlama Fees
- خروجی: Candidate Pool رتبه‌بندی‌شده

### PHASE 2: Screening (غربالگری)
- ۵ Veto Gate (HARD REJECT): Fraud, Security, Custody, Backing, Legal
- ۱۲ Severe Risk (penalty، نه veto)

### PHASE 3: Evidence Collection
- ۵ منبع داده موازی: CoinGecko, DeFiLlama, DeFiLlama Fees, CMC Keyless, CMC Pro
- Dune Analytics (اختیاری — Grade A on-chain data)
- Evidence Grade: A (3+ sources) → D (0 sources)
- **Blockchain TVL**: تشخیص خودکار ۱۴۰+ توکن بلاک‌چین از DeFiLlama /chains

### PHASE 4: Fundamental Evaluation (۵ محور)

| محور | زیرفاکتورها | منبع داده |
|------|-------------|-----------|
| Invisible Utility | API, SDK, Docs, Switching Cost, Community | CoinGecko + GitHub |
| Economic Engine | Revenue, Fees, TVL, Growth, Recurrence | DeFiLlama + Dune |
| Moat | Network, Regulatory, Distribution, Liquidity | DeFiLlama + CMC |
| Token & Market | Utility, Value Capture, Supply, Holders | CoinGecko + CMC Keyless |
| Governance/Legal | Team, Audit, Multisig, Regulatory | CoinGecko + DeFiLlama |

### PHASE 5: Scoring
- وزن‌دهی Persona (۶ پرسونای پیش‌فرض + Custom Persona)
- Weakest-link penalty (if axis < 4 → penalty up to 24 pts)
- Quality Bands: Elite (≥90) → Story/Speculation (<50)

### PHASE 6: Investment Analysis
- Valuation Multiples: P/R (MC/Revenue), P/F (FDV/Fees), P/T (MC/TVL)
- Fee Stability: مقایسه 7d vs 30d fees
- Cycle Phase: ۷ مرحله (Hidden Dev → Maturity)

### PHASE 7: Decision
- ۶ سطح: Ignore → Watch → Deep Research → Small Position → Core → High Conviction
- Confidence Gate: <45% → Watch only, <60% → Deep Research

### PHASE 8: Output (۲۹ بخش)
- Executive verdict, 5 axes radar, valuation multiples, cross-verifications, bias checks, market overview, fee stability, catalysts, thesis, kill conditions

---

## ۴. منابع داده (۱۵ منبع)

### رایگان (۱۱ منبع — همیشه فعال)

| منبع | داده | کش |
|------|------|-----|
| CoinGecko | قیمت، مارکت‌کپ، جستجو، trending | 90-180s |
| DeFiLlama | TVL، کارمزد ۷d/30d، پروتکل‌ها | 90s |
| CMC Keyless | هولدرها، حسابرسی، ATH/ATL | — |
| CoinDesk RSS | اخبار انگلیسی | 300s |
| Cointelegraph RSS | اخبار انگلیسی | 300s |
| Decrypt RSS | اخبار انگلیسی | 300s |
| Bitcoinist RSS | اخبار انگلیسی | 300s |
| ArzDigital | خبر فوری + مقالات فارسی | 300s |
| MihanBlockchain | اخبار + تحلیل بازار فارسی | 300s |
| Fear & Greed | شاخص احساسات ۰-۱۰۰ | 300s |
| Telegram | فید کانال عمومی (t.me/s/) | 120s |

### با کلید API (۴ منبع)

| منبع | کلید | داده اختصاصی |
|------|------|-------------|
| CoinGecko Demo | `COINGECKO_API_KEY` | افزایش rate limit به 30/min |
| CMC Pro | `CMC_API_KEY` | Categories (350), Global metrics, Exchange map |
| Dune Analytics | `DUNE_API_KEY` | On-chain Grade A: revenue, holders, DAU |
| CryptoPanic | `CRYPTOPANIC_TOKEN` | اخبار curated (کلید نداریم) |

---

## ۵. نماها (Views)

### ۰. Hub (صفحه فرود)
- Market Pulse Hero: کل مارکت‌کپ، سلطه BTC/ETH (CMC cross-verified)، Fear & Greed
- Quick Actions: ۴ کارت ناوبری
- Market Snapshot: Trending coins، top-3 DeFi، TVL کل
- News + Telegram feed + Framework Stats + Cross-verification

### ۱. Discovery (اسکن بازار)
- پیکربندی: Persona + Custom Weights (۵ اسلایدر) + بازه مارکت‌کپ + بخش‌ها
- پیشرفت زنده ۸ فاز
- کارت‌های پروژه با Sparkline + Share + CSV export
- Analytics: Heatmap ریسک، توزیع امتیاز، donut بخش
- Backtest Results card

### ۲. Coin Explorer (تحلیل دستی)
- جستجوی CoinGecko
- ۶ پرسونا + Custom Weights
- تحلیل کامل ۸ فازی → گزارش ۲۹ بخشی

### ۳. Market Intelligence (CMC + DeFiLlama)
- ۹ تب: Top Coins, Gainers, Losers, Trending, Top DeFi, Top Fees, Sectors, Airdrops (PRO), Categories (PRO)
- Fear & Greed gauge
- کلیک روی کوین → انتقال به Coin Explorer

### ۴. News & Signals
- ۳ سابت‌تب: English News, Persian News, Telegram
- فیلتر منبع + جستجو
- Telegram: chat bubbles با photo + album grids

---

## ۶. ویژگی‌های پیشرفته

### Persistence Layer (SQLite)
- ۳ جدول: scans, reports, score_history
- داده‌ها پس از restart باقی می‌مانند
- Report reload از DB (fallback از in-memory)

### Historical Scoring + Trend
- هر تحلیل در score_history ذخیره می‌شود
- Endpoint: `GET /score-history/{symbol}`

### Alert System
- Polling هر ۶۰ ثانیه برای تغییرات امتیاز
- Toast notification + Browser notification
- Endpoint: `GET /alerts?threshold=10`

### Backtesting
- مقایسه امتیاز فریمورک با تغییر قیمت ۳۰ روزه
- محاسبه accuracy %
- Endpoint: `GET /backtest`

### Correlation Analysis
- ضریب همبستگی پیرسون بین امتیاز و قیمت
- Endpoint: `GET /correlation`

### Custom Persona
- کاربر وزن ۵ محور را با اسلایدر تنظیم می‌کند
- اعتبارسنجی + نرمال‌سازی خودکار

### Shared Scans
- اشتراک‌گذاری نتایج با URL (`/?scan={id}`)
- auto-load هنگام باز کردن لینک

### Retry Logic (Exponential Backoff)
- 429: ۳ retry در ۲s، ۴s، ۸s
- 5xx: ۲ retry در ۱s، ۲s
- Network error: ۱ retry در ۱s

### Price Sparkline
- نمودار SVG ۷ روزه در کارت‌های پروژه
- رنگ سبز/قرمز + درصد تغییر

### Market Overview در گزارش
- CMC Keyless: holders، ATH/ATL، 52W range، audits، platform_count

### Auto-Sync Blockchain Detection
- همگام‌سازی خودکار ۴۶۱+ زنجیره از DeFiLlama /chains
- ۱۴۰ توکن بلاک‌چین شناسایی می‌شوند (خودکار، بدون نگهداری دستی)

---

## ۷. API Endpoints (۳۰ endpoint)

### Core Scanner (۸)
| Method | Path |
|--------|------|
| GET | `/health` |
| GET | `/sources` |
| POST | `/scan` |
| GET | `/scan/{id}` |
| GET | `/scan/{id}/projects` |
| GET | `/scans` |
| GET | `/projects` |
| GET | `/project/{id}` |

### Coin Explorer & Market (۳)
| GET | `/search?q=` |
| POST | `/analyze` |
| GET | `/market/overview` |

### News & Telegram (۳)
| GET | `/news?limit=&source=` |
| GET | `/news/fa?limit=&category=` |
| GET | `/telegram?channel=&limit=` |

### CMC Pro (۴)
| GET | `/cmc/airdrops` |
| GET | `/cmc/categories` |
| GET | `/cmc/exchanges` |
| GET | `/cmc/global-metrics` |

### Dune Analytics (۳)
| GET | `/dune/query/{id}` |
| POST | `/dune/execute/{id}` |
| GET | `/dune/insights/{symbol}` |

### CoinGecko Enhanced (۴)
| GET | `/coingecko/chart/{id}?days=7` |
| GET | `/coingecko/ohlc/{id}?days=7` |
| GET | `/coingecko/new-coins` |
| GET | `/coingecko/categories` |

### Analytics (۳)
| GET | `/score-history/{symbol}` |
| GET | `/alerts?threshold=` |
| GET | `/backtest` |
| GET | `/correlation` |

### System (۱)
| GET | `/system/health-check` |

---

## ۸. ساختار فایل‌ها

```
mini-services/crypto-scanner/
├── main.py              (1,293 lines) — FastAPI app, 30 endpoints
├── db.py                (236 lines)   — SQLite persistence layer
├── models/schemas.py    (356 lines)   — Pydantic models
├── data/sources.py      (1,998 lines) — All data source fetchers + cache
├── framework/
│   ├── core.py          (226 lines)   — Persona weights, veto gates, scoring
│   ├── discovery.py     (399 lines)   — PHASE 1: 5 discovery lenses
│   ├── evidence.py      (694 lines)   — PHASE 3: Evidence collection
│   ├── evaluation.py    (489 lines)   — PHASE 4: 5 axis scoring
│   ├── analysis.py      (935 lines)   — PHASE 5-8: Scoring + output
│   └── i18n.py          (201 lines)   — Backend translations (EN/FA)

src/
├── app/page.tsx         (4,756 lines) — Main page, 5 views, Discovery
├── components/views/
│   ├── hub-view.tsx     (1,520 lines) — Landing page
│   ├── coin-explorer-view.tsx (1,362) — Manual coin analysis
│   ├── market-intelligence-view.tsx (1,665) — CMC+DeFiLlama
│   └── news-feed-view.tsx (1,414)    — News + Telegram
├── lib/
│   ├── scanner-client.ts  — Proxy helper
│   ├── scanner-types.ts   (518 lines) — TypeScript interfaces
│   └── i18n/              — EN/FA translations (620 keys each)
└── app/api/scanner/       — 25 proxy route files
```

---

## ۹. امنیت و پایداری

### Authentication
- کلیدهای API در `.env` (gitignore شده)
- کلیدهای فعال: CMC Pro, Dune Analytics, CoinGecko Demo

### Rate Limiting
- CoinGecko: Demo key (30 calls/min) + exponential backoff retry
- DeFiLlama: کش ۹۰ ثانیه
- CMC: کش ۳۰۰ ثانیه
- Dune: کش ۱۸۰ ثانیه

### Process Management
- Scanner watchdog: double-fork daemon، auto-restart
- Next.js watchdog: double-fork daemon، auto-restart
- Memory: کش با proactive cleanup هر ۵ دقیقه + eviction (max 300 entries)

### Data Integrity
- Cross-verification بین CoinGecko و CMC (منطق برای هر ۵ متریک فعال است)
- ۷ bias check خودکار
- Evidence Grade: A (Primary Verified) → D (Unverified)

### Test Suite
- **۲۴ تست** (۲۲ تست منطق + ۲ تست رگرسیون) — همه passing
- تست‌های رگرسیون: concurrent `save_report` (race condition) + cache unbounded growth (memory leak)
- اجرا: `cd mini-services/crypto-scanner && python tests/test_framework.py`

---

## ۹ب. REVIEW-1 Fixes & Verification

### Race Condition (SQLite concurrent writes)
- **باگ**: `save_report`/`save_scan` بدون قفل از async routeها صدا زده می‌شدند → تداخل `execute()`+`commit()` روی connection مشترک
- **رفع**: `threading.Lock` (`_db_lock`) دور تمام writeها
- **WAL mode**: `PRAGMA journal_mode=WAL` در `_get_conn()` تنظیم شده — تأیید شد با `PRAGMA journal_mode` که `wal` برمی‌گرداند
- **Tradeoff صادقانه**: قفل event loop را ~۱ms در هر نوشتن بلاک می‌کند (۱۲ نوشتن/اسکن = ~۱۲ms). در مقیاس فعلی ناچیز، ولی اگر چند کاربر هم‌زمان اسکن بزنند باید به `asyncio.to_thread` مهاجرت شود (در watch-list)
- **تست رگرسیون**: ۵۰ thread × ۲ write روی shared connection — بدون قفل ۳۳ خطا + ۱۹ data loss، با قفل ۱۰۰/۱۰۰ موفق

### Memory Leak (Cache unbounded growth)
- **باگ**: eviction فقط lazy در `cache_get` بود → write-only entries برای همیشه باقی می‌ماندند
- **رفع**: `cache_set` هر ۳۰۰ ثانیه `_cleanup_expired()` را proactive صدا می‌زند
- **تست رگرسیون**: ۲۰۰ write-only entry → expire → ۱ write جدید → فقط ۱ entry باقی می‌ماند (بدون fix: ۲۰۱ entry)

### Cross-verification (منطق vs کامل بودن داده)
| متریک | منطق | داده واقعی |
|-------|------|------------|
| Market Cap | ✅ verified (CoinGecko ↔ CMC) | ✅ هر دو منبع فعال |
| Volume | ✅ verified (CoinGecko ↔ CMC) | ✅ هر دو منبع فعال |
| Circulating Supply | ✅ verified (CoinGecko ↔ CMC) | ✅ هر دو منبع فعال |
| TVL | ✅ verified (DeFiLlama ↔ CMC Keyless) | ⚠️ CMC TVL پروتکل‌محور نمی‌دهد |
| Fees | ✅ verified (DeFiLlama ↔ Dune) | ⚠️ وابسته به تنظیم Dune query IDs |

**نکته مهم**: منطق cross-verification برای هر ۵ متریک درست است (هیچ‌کدام `value_b=None` هاردکد نیستند). اما کامل بودن داده برای TVL و Fees به شرایط بیرونی وابسته است (Dune query IDs هنوز کانفیگ نشده). این تمایز بین «منطق درست» و «داده کامل» در جدول بالا مشخص شده است.

---

## ۱۰. نقشه راه

### تکمیل‌شده ✓
- [x] Persistence layer (SQLite)
- [x] Historical scoring
- [x] CoinGecko Demo API key
- [x] Price charts + sparkline
- [x] Market overview در گزارش
- [x] Dune Analytics
- [x] Custom persona
- [x] Alert system (browser notifications)
- [x] Backtesting
- [x] Correlation analysis
- [x] Retry logic (exponential backoff)
- [x] Shared scans (URL)
- [x] Auto-sync blockchain detection

### باقیمانده
- [ ] Webhook برای Telegram
- [ ] Dark/Light theme در charts
- [ ] Mobile app (PWA)
- [ ] Messari / Santiment (منابع داده جدید)
- [ ] Sector rotation analysis
- [ ] Whale tracking
- [ ] Sentiment analysis (NLP)
- [ ] Custom watchlists (متعدد)
- [ ] Notes & tags روی پروژه‌ها

---

## ۱۱. نتیجه‌گیری

CryptoSieve یک فریمورک تحلیلی کامل با ۱۸,۳۸۶ خط کد است که:

1. **۱۵ منبع داده** را به‌صورت موازی و چندمنبعی استفاده می‌کند
2. **۸ فاز تحلیلی** را با شفافیت کامل اجرا می‌کند
3. **۲۹ بخش گزارش** برای هر پروژه تولید می‌کند
4. **پایداری production** دارد (SQLite persistence, retry logic, watchdog)
5. **دوزبانه** (فارسی/انگلیسی) با RTL کامل است
6. **تحلیل تاریخی** و **backtesting** را پشتیبانی می‌کند
7. **هوشمند و خودکار** است (auto-sync chains, alert system, cross-verification)

سیستم آماده توسعه فازهای بعدی و استفاده در محیط واقعی است.
