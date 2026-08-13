# RULES.md — CryptoSieve Project Rules

## Git & Repository Rules

### NEVER-FORCE-PUSH

```
git push --force  →  مطلقاً ممنوعه
```

**قانون:**
- اگر `git push` عادی rejected شد (non-fast-forward error):
  1. **STOP فوری** — هیچ تغییری انجام نده
  2. خطا را گزارش بده (به کاربر نشان بده)
  3. منتظر تصمیم کاربر بمون
- هرگز `--force` یا `-f` به push اضافه نکن
- حتی اگر مطمئن هستی که مشکلی نیست، باز هم force نزن
- این قانون برای جلوگیری از از دست رفتن commit‌های remote است

**استثنا:** هیچ استثنایی وجود ندارد.

---

### SESSION-START-SYNC-CHECK

در ابتدای هر session (و بعد از هر gap زمانی، مثلاً بعد از پیام جدید کاربر)،
قبل از هر تغییر جدید در کد:

**مراحل:**

```bash
# Step 1: Fetch latest from remote
git fetch origin

# Step 2: Check status
git status
```

**بررسی:**
- اگر `behind` از `origin/main` دیده شد:
  1. **STOP فوری**
  2. گزارش بده: "Local is behind origin/main by N commits"
  3. منتظر تصمیم کاربر بمون (یا pull یا rebase یا تصمیم دیگر)

- اگر `diverged` از `origin/main` دیده شد:
  1. **STOP فوری**
  2. گزارش بده: "Local has diverged from origin/main"
  3. منتظر تصمیم کاربر بمون

- اگر `clean` / `up-to-date` بود:
  1. ادامه بده با کار جدید
  2. لاگ بزن: "Sync check passed — local is up-to-date with origin/main"

---

## Code Quality Rules

### Before Any Commit

1. **Lint check** — `bun run lint` باید بدون خطا باشد
2. **TypeScript check** — `npx tsc --noEmit 2>&1 | grep "^src/"` باید بدون خطا باشد
3. **No console.log** — هیچ `console.log` در کد production نباید باشد
4. **No secrets** — هیچ secret یا API key در کد نباید باشد
5. **No hardcoded strings** — تمام رشته‌های UI باید از سیستم i18n استفاده کنند

### Commit Message Format

```
<type>: <short description>

<optional longer description>
```

**Types:**
- `feat` — ویژگی جدید
- `fix` — رفع باگ
- `refactor` — بازسازی کد بدون تغییر رفتار
- `docs` — تغییر مستندات
- `i18n` — تغییر ترجمه
- `chore` — کارهای نگهداری

**مثال:**
```
feat: add scan diff view with metrics comparison

- Side-by-side scan comparison with delta indicators
- Project overlap analysis (Only in A/B, Common)
- Metrics table with trend icons
```

### After Any Push

1. Verify push succeeded (check exit code)
2. If push fails with non-fast-forward → STOP (see NEVER-FORCE-PUSH)
3. Report push result to user

---

## Architecture Rules

### File Size Limits

| فایل | حداکثر خطوط | اقدام اگر تجاوز کرد |
|------|-------------|-------------------|
| `src/app/page.tsx` | ۵۰۰۰ | تقسیم به کامپوننت‌های جداگانه |
| Python files | ۵۰۰ | تقسیم به ماژول‌های کوچکتر |
| Translation JSON | بدون محدودیت | — |

### Component Structure

هر کامپوننت باید:
1. `"use client"` در ابتدا (اگر از hooks استفاده می‌کند)
2. TypeScript interfaces برای props
3. `useLanguage()` برای ترجمه
4. Props قابل تست و مستقل

### API Route Pattern

تمام API routes باید:
1. `try-catch` با error handling مناسب
2. `scannerJson()` به‌جای `scannerFetch()` برای error handling خودکار
3. Timeout در سطح client (۳۰ ثانیه)
4. HTTP status codes صحیح (۲۰۰، ۴۰۴، ۵۰۲، ۵۰۳)

### Python Service Rules

1. **No `except Exception`** — همیشه exception type مشخص شود
2. **No `datetime.utcnow()`** — از `datetime.now(timezone.utc)` استفاده شود
3. **Type hints** برای تمام توابع
4. **Docstrings** برای توابع public
5. **Pydantic models** برای تمام ورودی/خروجی API

---

## i18n Rules

### Adding Translation Keys

1. کلید را به `en.json` اضافه کن
2. کلید معادل را به `fa.json` اضافه کن
3. در کامپوننت از `t("section.key")` استفاده کن
4. هرگز رشته hardcoded در UI نگذار

### Translation Quality

- فارسی: استفاده از اصطلاحات استاندارد مالی/کریپتوی فارسی
- انگلیسی: استفاده از terminology استاندارد صنعت
- RTL: `dir="rtl"` به‌طور خودکار توسط LanguageProvider تنظیم می‌شود
- Brand names (CoinGecko, DeFiLlama) همیشه به انگلیسی باقی می‌مانند

---

## Testing Rules

### Before Merge

1. **Lint** — `bun run lint` (0 errors)
2. **TypeScript** — `npx tsc --noEmit` (0 errors in `src/`)
3. **Browser test** — صفحه بارگذاری می‌شود بدون console error
4. **Scan test** — یک اسکن کامل انجام می‌شود بدون خطا
5. **Bilingual test** — تغییر زبان کار می‌کند با RTL

### Performance Benchmarks

| متریک | هدف |
|-------|------|
| Page load | < ۵۰۰ms |
| Scan completion (5 projects) | < ۳۰s |
| Detail drawer open | < ۵۰۰ms |
| Language toggle | < ۱۰۰ms |

---

## Framework Rules (CryptoSieve 3.0)

### Core Principles
1. **Evidence > Narrative** — هر ادعا باید با داده پشتیبانی شود
2. **Revenue ≠ Fees** — Fees × 12 = annualized run-rate، نه Revenue واقعی
3. **Project Quality ≠ Token Quality ≠ Investment Attractiveness** — سه امتیاز جداگانه
4. **Never guess missing data** — اگر Evidence کافی نیست، Confidence را پایین بیاور

### Data Handling
1. هیچ‌گاه داده جعل نکن
2. مقادیر گمشده را بی‌سروصدا پر نکن
3. همیشه Primary Evidence را از Secondary Evidence متمایز کن
4. تاریخ و منبع هر داده حساس به زمان را ثبت کن

### Valuation Multiples
- **P/R** = Market Cap ÷ Annualized Revenue (فقط Revenue واقعی)
- **P/F** = FDV ÷ Annualized Fees (صراحتاً ≠ Revenue)
- **P/T** = Market Cap ÷ TVL
- اگر Revenue واقعی موجود نیست، P/R = N/A و P/F با کپ امتیاز استفاده می‌شود

---

## Maintenance Checklist

### Weekly
- [ ] `git fetch origin && git status` — sync check
- [ ] `bun run lint` — lint check
- [ ] `npx tsc --noEmit` — TS check
- [ ] Run a test scan — verify data quality
- [ ] Check CoinGecko API availability

### Monthly
- [ ] Review and update dependencies (`bun update`)
- [ ] Check for Python package updates
- [ ] Review error logs in `service.log`
- [ ] Update translations if new features added
- [ ] Review and update README.md and DEVELOPMENT.md

### Before Release
- [ ] All tests passing
- [ ] Documentation updated
- [ ] No console errors in browser
- [ ] No TypeScript errors
- [ ] Lint clean
- [ ] Both languages working with RTL
- [ ] Performance benchmarks met
