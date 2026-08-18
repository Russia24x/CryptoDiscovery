# RULES.md — Project Governance Rules

> **این فایل منبع حقیقت (single source of truth) برای قوانین حاکمیتی پروژه‌ی CryptoSieve است.**
> هر session (انسان یا ایجنت) باید این فایل را **قبل از هر کاری** بخواند.
> قوانین زیر هم‌سطح‌اند و استثنا ندارند مگر صراحتاً ذکر شود.
>
> This file is the single source of truth for CryptoSieve governance rules.
> Every session (human or agent) MUST read it before doing anything else.
> The rules below are peer-level and have no exceptions unless explicitly stated.

---

## ۱. NEVER-FORCE-PUSH

**هرگز `git push --force` یا `git push -f` یا `git push --force-with-lease` نزن.**

اگر push به‌دلیل reject شدن (non-fast-forward) شکست خورد:
- **توقف فوری** — هیچ تلاش برای دور زدن نکن
- علت reject را بررسی کن (`git fetch origin && git log origin/main..HEAD`)
- اگه local commit‌هایی داریم که روی remote نیستند: آن‌ها را به‌صورت یک merge commit تمیز روی remote بریز، نه force
- اگه remote commit‌هایی داریم که local نداره: ابتدا `git pull --rebase origin main`، conflict را حل کن، بعد push

**استثنا: هیچ.** حتی اگه فکر می‌کنی history کثیفه و باید rewrite بشه — این تصمیم فقط توسط انسان گرفته می‌شه، نه ایجنت.

---

## ۲. SESSION-START-SYNC-CHECK

**در ابتدای هر session و بعد از هر gap زمانی (بیش از چند دقیقه بی‌کار)، قبل از هر تغییر:**

```bash
git fetch origin && git status
```

قوانین تفسیر:

| وضعیت `git status` | اقدام |
|---|---|
| `up to date with 'origin/main'` | ادامه بده |
| `behind 'origin/main' by N commits` | `git pull --rebase origin main`، بعد ادامه بده |
| `ahead of 'origin/main' by N commits` | ادامه بده — commit‌های local معتبرن، بعداً push کن |
| `diverged from 'origin/main'` | **توقف فوری، منتظر تصمیم کاربر بمون** — هیچ merge/rebase/force خودکار نکن |

**نکته**: sandbox environment ممکن است بین session‌ها working tree یا `.git` را reset کند. اگه فایل‌هایی که باید وجود داشته باشن غیب شده‌ن (مثل `db.py`، `tests/`، `ARCHITECTURE.md`)، این یک نشونه‌ی reset است. در این حالت:
1. `git remote -v` را چک کن — اگه خالی است، remote را دوباره اضافه کن: `git remote add origin <url>`
2. `git fetch origin`
3. اگه local فقط scaffold است و remote canonical است (تأیید شده توسط انسان): `git reset --hard origin/main` برای بازگرداندن state معتبر
4. **هرگز فایل‌های از دست رفته را از صفر بازنویسی نکن** — همیشه از remote recover کن

**استثنا: هیچ.**

---

## ۳. NO-AUTO-CRON

> هرگز cron با قدرت commit+push خودکار نساز — نه با هر بازه‌ای، نه با هر kind ای —
> مگر ۵ gate مستندشده در ARCHITECTURE.md §7.5 پیاده و تأیید شده باشن.
>
> استثنا: هیچ.

**توضیح**: یک cron بی‌ناظر که خودش commit+push می‌کند، دقیقاً همون ریسکیه که در REVIEW-1 به‌عنوان P0 هشدار داده شد. هیچ‌کس تصمیم نمی‌گیرد آیا تغییر آماده‌ی push هست یا نه.

این قانون شامل می‌شود:
- `cron` tool با هر `kind` (cron / fixed_rate / one_time)
- `cron` tool با هر `payload.kind` (agentTurn / webDevReview)
- هر مکانیزم دیگه‌ای که به‌صورت زمان‌بندی‌شده کد را تغییر داده و push می‌کند

**پیش‌شرط re-enable** (همه باید پیاده و تأیید شده باشن —见 ARCHITECTURE.md §7.5):
- [ ] Pre-push sync check (`git fetch` + behind/diverged → STOP)
- [ ] Test gate (`python tests/test_framework.py` باید pass شود)
- [ ] Read-only default (commit+push فقط با gate صریح)
- [ ] لاگ قابل رصد (`cron-audit.log`)
- [ ] Human review cadence (روزانه)

**تا این ۵ مورد پیاده نشن، هیچ auto-commit cron فعالی نباید وجود داشته باشد.**

---

## ۴. NO-AUTO-COMMIT-WITHOUT-PUSH-VERIFICATION

**هرگز ادعا نکن کار «تحویل شده» بدون تأیید صریح push.**

`git status` تمیز فقط یعنی committed، نه pushed. قبل از گزارش completion:
1. `git push origin main` را اجرا کن
2. خروجی را چک کن: باید `<old>..<new>  main -> main` ببینی
3. `git log origin/main -1` را چک کن: باید hash جدید را نشان بده
4. فقط وقتی هر سه تأیید شدن، «done» را گزارش بده

این قانون مستقیماً از یافته‌ی advisor review ناشی می‌شه: تست‌های رگرسیون لوکال ۲۴/۲۴ بودن ولی commit هرگز push نشده بود، و advisor با clone کردن remote فقط ۲۲ تست دید.

**استثنا: هیچ.**

---

## ۵. INCREMENTAL-COMMITS

**برای refactor یا تغییرات بزرگ، هر بخش را جداگانه commit کن — نه یک commit غول‌پیکر.**

هر commit باید:
- یک واحد منطقی تغییر را شامل بشه
- بعد از آن `bun run lint` سبز باشه
- بعد از آن `python tests/test_framework.py` سبز باشه (اگه منطق backend را تغییر داد)
- پیام commit واضم و توصیفی داشته باشه

**دلیل**: یک commit ۲۰۰۰ خطی اگه چیزی بشکنه، bisect غیرممکن می‌شه. commit‌های کوچک اجازه‌ی rollback و review می‌دن.

**استثنا: هیچ.**

---

## ۶. SESSION-AUTO-COMMIT-IS-NOT-DELIVERY

فریمورک sandbox ممکنه به‌طور خودکار بعد از هر session، یک commit با پیام UUID
بسازه. این auto-commit هرگز نباید معادل «کار تحویل‌شده» در نظر گرفته بشه، چون:
- بدون test gate انجام می‌شه
- بدون بررسی محتوا انجام می‌شه (می‌تونه فایل ناخواسته هم commit کنه —
  دقیقاً همون چیزی که با skills/ و tool-results/ دیدیم)
- push بودنش تضمین‌شده نیست

**قانون**: تجربه نشون داده auto-commit در محیط سندباکس متزلزل قابل‌اعتماد نیست.
همیشه طبق §۴ و §۵ عمل کن — صریح، دستی، مرحله‌ای، تأییدشده. auto-commit
فریمورک صرفاً یک safety-net پس‌زمینه‌ست، نه مکانیزم اصلی تحویل کار.

استثنا: هیچ.

---

## ۷. FILE-SIZE-LIMITS

هر فایل باید درون این حدود بماند. اگه فایلی به حد نزدیک شد، باید قبل از
اضافه کردن کد جدید، refactor شود (استخراج به فایل/ماژول جدا).

| فایل/نوع | حد (خط) | دلیل |
|---|---|---|
| `src/app/page.tsx` | ۵۰۰۰ | hub اصلی state + UI — بزرگ‌تر از این غیرقابل نگهداری |
| `mini-services/crypto-scanner/main.py` | ۸۰۰ | routing layer — بزرگ‌تر از این باید به service layer + routers جدا شود |
| `mini-services/crypto-scanner/data/sources.py` | ۲۵۰۰ | ۱۵+ منبع داده — هر منبع می‌تونه ماژول جدا باشه |
| سایر فایل‌های Python (framework/) | ۱۰۰۰ | هر فاز فریمورک باید مستقل و قابل تست باشه |
| سایر فایل‌های TypeScript/TSX | ۱۵۰۰ | استخراج به sub-component‌ها |

**اقدام وقتی فایلی به ۹۰٪ حد رسید**: به‌جای اضافه کردن کد جدید، اول refactor کن.
اگه refactor ممکن نیست (مثلاً کل فایل یک منطق یکپارچه‌ست)، حد را با تأیید
صریح انسان افزایش بده (نه خودکار).

استثنا: فایل‌های تولید‌شده (generated) و test files از این حد مستثنا هستند.

---

## ۸. CODE-QUALITY-RULES

### ۸.۱ Never Guess Missing Data (الگوی شماره ۱)

اگه داده‌ای در دسترس نیست (None/null/undefined)، آن را به‌عنوان «بدترین حالت»
یا «صفر» تفسیر نکن. به‌جای آن، neutral (وسط بازه) یا None استفاده کن.

این الگو ۴ بار در این پروژه پیدا و رفع شد:
1. `has_api/has_sdk/has_docs` → None=neutral (2.5)
2. `retention_pct` → None=neutral (5.0)
3. `fdv_rev/mc_rev` truthiness → `is not None`
4. Sector rotation weighted average → `weighted_mc` جدا

**قانون**: هر بار که `(x or 0)` یا `x ?? 0` یا `if x:` می‌نویسی، صریح بپرس:
«آیا None معنی «نمی‌دونیم» داره یا «قطعاً صفر»؟» اگه «نمی‌دونیم» است،
از None/neutral استفاده کن.

### ۸.۲ CancelledError Guard

هر `except Exception` در یک async function باید قبلش `except asyncio.CancelledError: raise` داشته باشته. sync function‌ها مستثنا هستند (که باید با کامنت مشخص بشن).

### ۸.۳ Input Validation

هر endpoint که عدد (limit, threshold, days) یا رشته (gecko_id, channel, symbol) می‌گیرد، باید اعتبارسنجی کند. به‌جای `if limit < 1: limit = 1` دستی، از
`Annotated[int, Query(ge=1, le=500)]` (Pydantic/FastAPI native) استفاده کن.

### ۸.۴ XSS Prevention

هر URL که از منبع خارجی (RSS, API, user input) می‌آید و به‌عنوان `href` یا
`src` رندر می‌شود، باید scheme validation داشته باشد (فقط `http://` و `https://`).

---

## ۹. ARCHITECTURE-RULES

### ۹.۱ Layered Architecture

```
Frontend (Next.js)
    ↓ /api/scanner/* (same-origin proxy)
Backend (FastAPI)
    ├── main.py (routing only — no business logic)
    ├── services/ (business logic, aggregation, formatting)
    ├── framework/ (8-phase analysis engine)
    └── data/ (data source fetchers)
```

main.py فقط routing + validation باید انجام بده. منطق تجاری (محاسبات،
aggregation، formatting) باید در service layer یا framework باشد.

### ۹.۲ No Dead Code

فایل‌ها، dependencies، و scripts که استفاده نمی‌شوند باید حذف شوند.
اگه `prisma/schema.prisma` یا `src/lib/db.ts` هیچ مصرف‌کننده‌ای ندارند،
حذف شوند — سردرگمی برای توسعه‌دهنده‌ی جدید ایجاد می‌کنند.

### ۹.۳ i18n Parity

هر string نمایشی به کاربر باید از `t()` / `tt()` با fallback انگلیسی عبور کند.
هر کلید جدید باید همزمان به `en.json` و `fa.json` اضافه شود.

---

## ۱۰. TESTING-RULES

### ۱۰.۱ Regression Tests for Bug Patterns

هر بار که یک bug از یک الگوی تکراری پیدا و رفع شد (مثل pattern #1:
None≠0)، یک regression test باید اضافه شود که آن الگو را قفل کند.

### ۱۰.۲ End-to-End Tests

تست‌های unit که توابع را isolated صدا می‌زنند کافی نیستند — حداقل یک تست
end-to-end که از طریق pipeline واقعی (مثل `collect()`) عبور می‌کند،
برای هر fix wiring لازم است.

### ۱۰.۳ Test Gate

`python tests/test_framework.py` باید قبل از هر commit سبز باشد.
اگه شکست خورد، commit نکن (RULES.md §۵).

---

## ۱۱. FRAMEWORK-PRINCIPLES

این اصول غیرقابل مذاکره‌ی فریمورک CryptoSieve هستند:

### ۱۱.۱ Evidence > Narrative
داده‌ی واقعی همیشه بر روایت ترجیح دارد. اگه داده‌ای نیست، صادقانه «نامعلوم» گزارش شود.

### ۱۱.۲ Revenue ≠ Fees
درآمد (Revenue) و کارمزد (Fees) متریک‌های متفاوت هستند. هرگز به‌جای هم استفاده نشوند.

### ۱۱.۳ Never Guess Missing Data
مستقیماً به §۸.۱ ارجاع می‌شود.

### ۱۱.۴ Project Quality ≠ Token Quality ≠ Investment Attractiveness
سه امتیاز مستقل هستند و نباید با هم مخلوط شوند.

### ۱۱.۵ Weakest-Link Penalty
جریمه باید متناسب با شدت ضعف باشد (radius-based)، نه flat.

