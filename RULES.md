# RULES.md — Crypto Discovery Framework

## Git & Repository Rules

### NEVER-FORCE-PUSH

```
git push --force  →  مطلقاً ممنوعه
```

**قانون:**
- اگر `git push` عادی rejected شد (non-fast-forward error):
  1. **STOP فوری** — هیچ تغییری انجام نده
  2. خطا را گزارش بده (به کاربر نشان بده)
  3. منتظر تصمیر کاربر بمون
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

**نکته:** اگر remote خالی است (مثل اولین بار):
- این یک حالت خاص است — باید گزارش شود
- کاربر تصمیم می‌گیرد که push کند یا نه

---

## Code Quality Rules

### Before Any Commit
1. `bun run lint` باید بدون خطا باشد
2. `npx tsc --noEmit` باید بدون خطا در `src/` باشد
3. هیچ فایل `console.log` در کد production نباید باشد
4. هیچ secret یا API key در کد نباید باشد

### After Any Push
1. Verify push succeeded (check exit code)
2. If push fails with non-fast-forward → STOP (see NEVER-FORCE-PUSH)
3. Report push result to user

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
