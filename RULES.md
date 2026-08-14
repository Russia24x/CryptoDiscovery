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
