"use client";

import * as React from "react";
import en from "./en.json";
import fa from "./fa.json";

export type Language = "en" | "fa";

const translations: Record<Language, Record<string, unknown>> = { en, fa };

// Helper to get nested value from dot-notation key (supports strings and arrays)
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const keys = path.split(".");
  let current: unknown = obj;
  for (const key of keys) {
    if (current && typeof current === "object" && key in current) {
      current = (current as Record<string, unknown>)[key];
    } else {
      return path; // fallback to key if not found
    }
  }
  return current; // can be string, array, or other
}

// Interpolate {placeholder} values
function interpolate(str: string, vars?: Record<string, string | number>): string {
  if (!vars) return str;
  return str.replace(/\{(\w+)\}/g, (_, key) => String(vars[key] ?? `{${key}}`));
}

interface LanguageContextValue {
  lang: Language;
  setLang: (lang: Language) => void;
  toggleLang: () => void;
  t: (key: string, vars?: Record<string, string | number>) => any;
  dir: "ltr" | "rtl";
}

const LanguageContext = React.createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = React.useState<Language>("en");

  // Load language from localStorage on mount
  React.useEffect(() => {
    try {
      const stored = localStorage.getItem("crypto-lang");
      if (stored === "fa" || stored === "en") {
        setLangState(stored);
      }
    } catch {}
  }, []);

  // Apply dir and lang to <html> element
  React.useEffect(() => {
    const dir = lang === "fa" ? "rtl" : "ltr";
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
    try {
      localStorage.setItem("crypto-lang", lang);
    } catch {}
  }, [lang]);

  const setLang = React.useCallback((newLang: Language) => {
    setLangState(newLang);
  }, []);

  const toggleLang = React.useCallback(() => {
    setLangState((prev) => (prev === "en" ? "fa" : "en"));
  }, []);

  const t = React.useCallback(
    (key: string, vars?: Record<string, string | number>): any => {
      const val = getNestedValue(translations[lang], key);
      if (typeof val === "string") {
        return interpolate(val, vars);
      }
      return val; // return arrays/objects as-is
    },
    [lang],
  );

  const dir = lang === "fa" ? "rtl" : "ltr";

  const value = React.useMemo(
    () => ({ lang, setLang, toggleLang, t, dir }),
    [lang, setLang, toggleLang, t, dir],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const ctx = React.useContext(LanguageContext);
  if (!ctx) {
    // Fallback for SSR or if provider not yet mounted
    return {
      lang: "en" as Language,
      setLang: () => {},
      toggleLang: () => {},
      t: (key: string) => key,
      dir: "ltr" as const,
    };
  }
  return ctx;
}
