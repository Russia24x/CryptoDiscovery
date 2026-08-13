"use client";

import { Languages } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/lib/i18n/LanguageProvider";
import { cn } from "@/lib/utils";

export function LanguageToggle() {
  const { lang, toggleLang } = useLanguage();

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={toggleLang}
      className="h-9 gap-1.5 px-2"
      title={lang === "en" ? "تغییر به فارسی" : "Switch to English"}
    >
      <Languages className="h-4 w-4 text-muted-foreground" />
      <span className={cn("text-xs font-medium", lang === "fa" && "font-sans")}>
        {lang === "en" ? "FA" : "EN"}
      </span>
    </Button>
  );
}
