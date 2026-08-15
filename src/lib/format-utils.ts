/**
 * Pure formatting utility functions extracted from page.tsx.
 *
 * These functions have no external dependencies — they are pure transforms
 * used across the Discovery view, ReportDetail, and ProjectCard components.
 *
 * Extracted in the page.tsx refactor (RULES.md §5: incremental commits).
 */

/** Format a USD amount with appropriate scale suffix (B / M / K). */
export function fmtUsd(v: number | null | undefined): string {
  if (v == null || isNaN(v)) return "—";
  const abs = Math.abs(v);
  if (abs >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${v.toFixed(2)}`;
}

/** Format a percentage value with configurable decimal digits. */
export function fmtPct(v: number | null | undefined, digits = 1): string {
  if (v == null || isNaN(v)) return "—";
  return `${v.toFixed(digits)}%`;
}

/** Tailwind text color class based on score ratio (emerald → rose). */
export function scoreColor(score: number, max = 100): string {
  const ratio = score / max;
  if (ratio >= 0.85) return "text-emerald-500";
  if (ratio >= 0.70) return "text-lime-500";
  if (ratio >= 0.55) return "text-amber-500";
  if (ratio >= 0.40) return "text-orange-500";
  return "text-rose-500";
}

/** Tailwind background color class based on score ratio. */
export function scoreBg(score: number, max = 100): string {
  const ratio = score / max;
  if (ratio >= 0.85) return "bg-emerald-500";
  if (ratio >= 0.70) return "bg-lime-500";
  if (ratio >= 0.55) return "bg-amber-500";
  if (ratio >= 0.40) return "bg-orange-500";
  return "bg-rose-500";
}

/** Map an action label to a localized label + Tailwind badge classes. */
export function actionBadge(
  action: string,
  t?: (key: string) => string,
): { label: string; cls: string } {
  const a = action.toLowerCase();
  let label = action;
  if (t) {
    if (a.includes("high conviction")) label = t("actions.highConviction");
    else if (a.includes("core")) label = t("actions.coreCandidate");
    else if (a.includes("small")) label = t("actions.smallPosition");
    else if (a.includes("deep research") || a.includes("research"))
      label = a.includes("confidence")
        ? t("actions.deepResearchConfidence")
        : t("actions.deepResearch");
    else if (a.includes("watch"))
      label = a.includes("low")
        ? t("actions.watchLowConfidence")
        : t("actions.watch");
    else label = t("actions.ignore");
  }
  if (a.includes("high conviction"))
    return {
      label,
      cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    };
  if (a.includes("core"))
    return { label, cls: "bg-lime-500/15 text-lime-400 border-lime-500/30" };
  if (a.includes("small"))
    return { label, cls: "bg-amber-500/15 text-amber-400 border-amber-500/30" };
  if (a.includes("deep research") || a.includes("research"))
    return { label, cls: "bg-sky-500/15 text-sky-400 border-sky-500/30" };
  if (a.includes("watch"))
    return {
      label,
      cls: "bg-slate-500/15 text-slate-300 border-slate-500/30",
    };
  return { label, cls: "bg-rose-500/15 text-rose-400 border-rose-500/30" };
}

/** Translate an axis name (e.g. "Invisible Utility") via the i18n function. */
export function translateAxisName(
  name: string,
  t: (key: string) => string,
): string {
  const map: Record<string, string> = {
    "Invisible Utility": t("axes.invisibleUtility"),
    "Economic Engine": t("axes.economicEngine"),
    Moat: t("axes.moat"),
    "Token & Market Structure": t("axes.tokenMarket"),
    "Governance / Legal / Security": t("axes.governance"),
  };
  return map[name] || name;
}

/** Translate a sub-factor name (e.g. "User Abstraction") via the i18n function. */
export function translateSubFactor(
  name: string,
  t: (key: string) => string,
): string {
  const keyMap: Record<string, string> = {
    "User Abstraction": "subFactors.userAbstraction",
    "Integration Simplicity": "subFactors.integrationSimplicity",
    "API Usability": "subFactors.apiUsability",
    "Developer Experience": "subFactors.developerExperience",
    Documentation: "subFactors.documentation",
    "Switching Cost": "subFactors.switchingCost",
    "Community Signal": "subFactors.communitySignal",
    "Revenue Scale": "subFactors.revenueScale",
    "Fee Generation": "subFactors.feeGeneration",
    Growth: "subFactors.growth",
    "AUM / TVL": "subFactors.aumTvl",
    Recurrence: "subFactors.recurrence",
    Retention: "subFactors.retention",
    "Customer Diversification": "subFactors.customerDiversification",
    "Network Moat": "subFactors.networkMoat",
    "Regulatory Moat": "subFactors.regulatoryMoat",
    "Distribution Moat": "subFactors.distributionMoat",
    "Integration Moat": "subFactors.integrationMoat",
    "Liquidity Moat": "subFactors.liquidityMoat",
    "Data Moat": "subFactors.dataMoat",
    "Token Utility": "subFactors.tokenUtility",
    "Value Capture": "subFactors.valueCapture",
    "Supply Discipline": "subFactors.supplyDiscipline",
    "Unlock Risk": "subFactors.unlockRisk",
    "Holder Alignment": "subFactors.holderAlignment",
    "Buyback / Burn": "subFactors.buybackBurn",
    "Market Liquidity": "subFactors.marketLiquidity",
    "Holder Distribution": "subFactors.holderDistribution",
    "Team Transparency": "subFactors.teamTransparency",
    "Legal Entity": "subFactors.legalEntity",
    "Audit Quality": "subFactors.auditQuality",
    "Incident History": "subFactors.incidentHistory",
    "Operational Security": "subFactors.operationalSecurity",
    "Upgrade Decentralization": "subFactors.upgradeDecentralization",
    "Regulatory Status": "subFactors.regulatoryStatus",
    "Disclosure Quality": "subFactors.disclosureQuality",
  };
  const key = keyMap[name];
  return key ? t(key) : name;
}
