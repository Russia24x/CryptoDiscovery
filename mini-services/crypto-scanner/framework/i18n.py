"""
Backend i18n translations for dynamic text generation.

Supports English (en) and Persian (fa).
Used by analysis.py for executive verdict, thesis, catalysts,
kill conditions, bias checks, and final answers.
"""
from __future__ import annotations

TRANSLATIONS: dict[str, dict[str, str]] = {
    "en": {
        # Quality bands
        "band.elite": "Elite Infrastructure",
        "band.strong": "Strong Infrastructure",
        "band.promising": "Promising",
        "band.watchlist": "Watchlist",
        "band.weak": "Weak",
        "band.story": "Story / Speculation",
        # Verdict
        "verdict.high_risk": "{band} but flagged HIGH RISK due to a critical sub-factor below 3. Action: {action}.",
        "verdict.normal": "{band} (score {score:.0f}/100). Token quality {token_q}. Valuation {valuation}. Action: {action}.",
        "verdict.veto": "HARD REJECT — {reason}",
        "token_q.na": "N/A",
        # Thesis
        "thesis.template": "If on-chain {sector} activity grows, then {name} ({symbol}) {rail} demand should increase, because it sits {position} the transaction/liquidity rail {rev_part}.",
        "thesis.rail.infra": "infrastructure",
        "thesis.rail.app": "application",
        "thesis.rev.real": "with real fee/revenue generation",
        "thesis.rev.pre": "pre-revenue",
        "thesis.position.inside": "inside",
        "thesis.position.adjacent": "adjacent to",
        # Institutional adoption
        "inst.deployed": "Deployed across {chains} chains.",
        "inst.tvl_high": " TVL above $1B — institutional-grade liquidity.",
        "inst.tvl_mid": " TVL above $100M — moderate liquidity.",
        "inst.revenue": " Annualized revenue >$50M — meaningful cash flow.",
        "inst.limited": "Limited institutional adoption evidence — requires verification.",
        # Competitive moat
        "moat.template": "Moat score {score:.1f}/10 (conf {conf:.0f}%). Key factors: {factors}. Switching cost: {switching}. Network effect: {network}.",
        "moat.switching.high": "high",
        "moat.switching.moderate": "moderate",
        "moat.network.strong": "strong",
        "moat.network.developing": "developing",
        # Catalysts
        "catalyst.multichain": "Multi-chain deployment ({chains} chains)",
        "catalyst.reg_license": "Institutional / regulatory license in place",
        "catalyst.rev_growing": "Fee growing +{growth:.0f}% WoW",
        "catalyst.buyback": "Active buyback program",
        "catalyst.burn": "Token burn mechanism",
        "catalyst.unlock": "Major token unlock cliff approaching",
        "catalyst.bridge_risk": "Critical bridge dependency — security risk",
        "catalyst.reg_uncertain": "Regulatory uncertainty unresolved",
        "catalyst.none": "No strong near-term catalyst identified",
        # Kill conditions
        "kill.revenue_decline": "Revenue / fees decline >40% for 2 consecutive months.",
        "kill.security_exploit": "A critical security exploit occurs without transparent remediation.",
        "kill.customer_loss": "Core integration or largest customer is discontinued.",
        "kill.unlock_pressure": "Token unlock cliff materially exceeds value capture (>2x annual revenue).",
        "kill.regulatory": "Regulatory status materially deteriorates (enforcement action / delisting).",
        "kill.bridge_failure": "Dependent bridge suffers a critical failure.",
        # Bias checks
        "bias.popular": "⚠️ Bias Check: Popular project — ensure score is evidence-based, not reputation-based.",
        "bias.source": "ℹ️ Source Bias: Primary sources are English-language (CoinGecko, DeFiLlama).",
        "bias.snapshot": "⚠️ Snapshot Bias: Fees data is point-in-time, not trend-verified.",
        "bias.precision": "⚠️ Precision Illusion: Low evidence grade — score may not reflect reality.",
        "bias.narrative": "ℹ️ Narrative Check: Infrastructure classification doesn't guarantee quality.",
        "bias.confirmation": "ℹ️ Confirmation Check: Ensure both positive and negative evidence collected.",
        "bias.anti_promise": "ℹ️ Anti-Promise: No guaranteed outcomes — all scores are probabilistic.",
        # Data needing verification
        "verify.revenue": "Revenue / fee figures — verify on official dashboard.",
        "verify.regulatory": "Regulatory status — verify jurisdiction & licenses.",
        "verify.allocation": "Token allocation breakdown — verify in tokenomics docs.",
        "verify.audit": "Security audits — verify with protocol team.",
        "verify.team": "Team identity — verify publicly.",
        "verify.value_capture": "Token value capture mechanism — verify revenue share / burn details.",
        "verify.all_good": "All key data points have at least secondary evidence.",
        # Five final answers
        "answer1.yes": "Yes — appears to be a settlement / infrastructure layer for real business.",
        "answer1.partial": "Partially — has infrastructure traits but revenue evidence is limited.",
        "answer1.no": "No — primarily a consumer-facing or speculative asset.",
        "answer2.yes": "Yes — fee/revenue generation would persist without crypto-twitter attention.",
        "answer2.unclear": "Unclear — limited recurring revenue evidence.",
        "answer3.template": "Revenue flows to {name} protocol treasury and (partially) to token holders via {value_capture} value capture.",
        "answer4.template": "Token utility level {level}/4 — {capture_desc}.",
        "answer4.captures": "captures value",
        "answer4.limited": "limited value capture",
        # Severe risks
        "risk.anon_team": "Anonymous team",
        "risk.stale_audit": "Stale audit",
        "risk.cent_gov": "Centralized governance",
        "risk.cent_upgrade": "Centralized upgrade authority",
        "risk.cust_conc": "High customer concentration",
        "risk.unlock_cliff": "Near token unlock cliff",
        "risk.mm_dep": "Market maker dependency",
        "risk.bridge_dep": "Critical bridge dependency",
        "risk.chain_dep": "Critical chain dependency",
        "risk.tok_vc": "Unclear token value capture",
        "risk.reg_unc": "Regulatory uncertainty",
    },
    "fa": {
        # Quality bands
        "band.elite": "زیرساخت نخبه",
        "band.strong": "زیرساخت قوی",
        "band.promising": "آینده‌دار",
        "band.watchlist": "لیست تحت نظر",
        "band.weak": "ضعیف",
        "band.story": "داستان / سفته‌بازی",
        # Verdict
        "verdict.high_risk": "{band} اما به دلیل یک ساب‌فاکتور بحرانی زیر ۳ علامت‌گذاری شده با ریسک بالا. اقدام: {action}.",
        "verdict.normal": "{band} (امتیاز {score:.0f}/۱۰۰). کیفیت توکن {token_q}. ارزش‌گذاری {valuation}. اقدام: {action}.",
        "verdict.veto": "رد قطعی — {reason}",
        "token_q.na": "ناموجود",
        # Thesis
        "thesis.template": "اگر فعالیت {sector} روی زنجیره رشد کند، تقاضا برای زیرساخت {name} ({symbol}) افزایش می‌یابد، چون در {position} مسیر تراکنش/نقدینگی قرار دارد {rev_part}.",
        "thesis.rail.infra": "زیرساختی",
        "thesis.rail.app": "کاربردی",
        "thesis.rev.real": "با تولید درآمد/کارمزد واقعی",
        "thesis.rev.pre": "پیش از درآمد",
        "thesis.position.inside": "داخل",
        "thesis.position.adjacent": "مجاورت با",
        # Institutional adoption
        "inst.deployed": "در {chains} زنجیره مستقر شده است.",
        "inst.tvl_high": " TVL بالای ۱ میلیارد دلار — نقدینگی در سطح نهادی.",
        "inst.tvl_mid": " TVL بالای ۱۰۰ میلیون دلار — نقدینگی متوسط.",
        "inst.revenue": " درآمد سالانه بالای ۵۰ میلیون دلار — جریان نقدی معنادار.",
        "inst.limited": "شواهد محدود پذیرش نهادی — نیازمند تأیید.",
        # Competitive moat
        "moat.template": "امتیاز خندق {score:.1f}/۱۰ (اطمینان {conf:.0f}%). عوامل کلیدی: {factors}. هزینه تعویض: {switching}. اثر شبکه: {network}.",
        "moat.switching.high": "بالا",
        "moat.switching.moderate": "متوسط",
        "moat.network.strong": "قوی",
        "moat.network.developing": "در حال توسعه",
        # Catalysts
        "catalyst.multichain": "استقرار چندزنجیره‌ای ({chains} زنجیره)",
        "catalyst.reg_license": "مجوز نهادی / تنظیمی در دست",
        "catalyst.rev_growing": "رشد کارمزد +{growth:.0f}% هفتگی",
        "catalyst.buyback": "برنامه فعال بازخرید",
        "catalyst.burn": "مکانیزم سوزاندن توکن",
        "catalyst.unlock": "صعودی توکن عمده در راه است",
        "catalyst.bridge_risk": "وابستگی بحرانی به پل — ریسک امنیتی",
        "catalyst.reg_uncertain": "عدم قطعیت تنظیمی حل‌نشده",
        "catalyst.none": "کاتالیزور قوی کوتاه‌مدت شناسایی نشد",
        # Kill conditions
        "kill.revenue_decline": "کاهش درآمد / کارمزد بیش از ۴۰٪ برای دو ماه متوالی.",
        "kill.security_exploit": "رخداد یک سوءاستفاده امنیتی بحرانی بدون رفع شفاف.",
        "kill.customer_loss": "ادغام اصلی یا بزرگترین مشتری متوقف شود.",
        "kill.unlock_pressure": "صعودی توکن به‌طور مادی از ارزش‌گذاری فراتر رود (بیش از ۲ برابر درآمد سالانه).",
        "kill.regulatory": "وضعیت تنظیمی به‌طور مادی بدتر شود (اقدام اجرایی / حذف از فهرست).",
        "kill.bridge_failure": "پل وابستگی دچار شکست بحرانی شود.",
        # Bias checks
        "bias.popular": "⚠️ بررسی سوگیری: پروژه محبوب — اطمینان از اینکه امتیاز بر اساس شواهد است، نه شهرت.",
        "bias.source": "ℹ️ سوگیری منبع: منابع اصلی انگلیسی‌زبان هستند (CoinGecko، DeFiLlama).",
        "bias.snapshot": "⚠️ سوگیری لحظه‌ای: داده‌های کارمزد نقطه‌ای است، نه روند تأییدشده.",
        "bias.precision": "⚠️ توهم دقت: درجه شواهد پایین — ممکن است امتیاز واقعیت را منعکس نکند.",
        "bias.narrative": "ℹ️ بررسی روایت: طبقه‌بندی زیرساختی تضمین کیفیت نیست.",
        "bias.confirmation": "ℹ️ بررسی تأیید: اطمینان از جمع‌آوری هم شواهد مثبت و هم منفی.",
        "bias.anti_promise": "ℹ️ ضد تضمین: هیچ نتیجه تضمینی وجود ندارد — همه امتیازات احتمالی هستند.",
        # Data needing verification
        "verify.revenue": "ارقام درآمد / کارمزد — در داشبورد رسمی تأیید شود.",
        "verify.regulatory": "وضعیت تنظیمی — حوزه قضایی و مجوزها تأیید شود.",
        "verify.allocation": "تفکیک تخصیص توکن — در مستندات توکنومیکس تأیید شود.",
        "verify.audit": "حسابرسی‌های امنیتی — با تیم پروتکل تأیید شود.",
        "verify.team": "هویت تیم — به‌طور عمومی تأیید شود.",
        "verify.value_capture": "مکانیزم ارزش‌گذاری توکن — درآمد/سوزاندن تأیید شود.",
        "verify.all_good": "تمام نقاط داده کلیدی حداقل شواهد ثانویه دارند.",
        # Five final answers
        "answer1.yes": "بله — به‌نظر می‌رسد یک لایه تسویه/زیرساخت برای کسب‌وکار واقعی است.",
        "answer1.partial": "تا حدی — ویژگی‌های زیرساختی دارد اما شواهد درآمد محدود است.",
        "answer1.no": "خیر — عمدتاً یک دارایی مصرفی یا سفته‌بازی.",
        "answer2.yes": "بله — تولید درآمد/کارمزد بدون توجه کریپتویی ادامه می‌یابد.",
        "answer2.unclear": "نامشخص — شواهد درآمد تکرارشونده محدود است.",
        "answer3.template": "درآمد به خزانه پروتکل {name} و (تا حدی) به دارندگان توکن از طریق ارزش‌گذاری {value_capture} می‌رسد.",
        "answer4.template": "سطح کاربرد توکن {level}/۴ — {capture_desc}.",
        "answer4.captures": "ارزش را دریافت می‌کند",
        "answer4.limited": "ارزش‌گذاری محدود",
        # Severe risks
        "risk.anon_team": "تیم ناشناس",
        "risk.stale_audit": "حسابرسی قدیمی",
        "risk.cent_gov": "حاکمیت متمرکز",
        "risk.cent_upgrade": "اختیارت ارتقای متمرکز",
        "risk.cust_conc": "تمرکز بالای مشتری",
        "risk.unlock_cliff": "صعودی توکن نزدیک",
        "risk.mm_dep": "وابستگی به بازارگردان",
        "risk.bridge_dep": "وابستگی بحرانی به پل",
        "risk.chain_dep": "وابستگی بحرانی به زنجیره",
        "risk.tok_vc": "ارزش‌گذاری توکن نامشخص",
        "risk.reg_unc": "عدم قطعیت تنظیمی",
    },
}


def t(key: str, lang: str = "en", **kwargs) -> str:
    """Translate a key to the given language with optional format args."""
    lang_dict = TRANSLATIONS.get(lang, TRANSLATIONS["en"])
    template = lang_dict.get(key, TRANSLATIONS["en"].get(key, key))
    if kwargs:
        try:
            return template.format(**kwargs)
        except (KeyError, IndexError):
            return template
    return template
