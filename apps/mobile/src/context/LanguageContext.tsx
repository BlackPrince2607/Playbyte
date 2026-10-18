import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { appLang, type AppLang } from "../i18n/lang";
import { en, hi, type StringKey } from "../i18n/strings";
import { supportedLanguage } from "../lib/languages";
import { getLanguage, setLanguage as persistLanguage } from "../lib/storage";
import { setContentLocale } from "../i18n/contentLocale";
import { fonts as enFonts } from "../theme/typography";

const hiFonts = {
  display: "NotoSansDevanagari_700Bold",
  body: "NotoSansDevanagari_400Regular",
  bodyMedium: "NotoSansDevanagari_500Medium",
  bodyBold: "NotoSansDevanagari_700Bold",
  mono: enFonts.mono,
};

type UiFonts = typeof enFonts;

type LanguageValue = {
  language: AppLang;
  ready: boolean;
  setAppLanguage: (id: string) => void;
  t: (key: StringKey) => string;
  fonts: UiFonts;
};

const LanguageContext = createContext<LanguageValue | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<AppLang>("en");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void getLanguage().then((stored) => {
      const next = appLang(supportedLanguage(stored));
      setLanguageState(next);
      setContentLocale(next);
      setReady(true);
    });
  }, []);

  const setAppLanguage = useCallback((id: string) => {
    const next = appLang(supportedLanguage(id));
    setLanguageState(next);
    setContentLocale(next);
    void persistLanguage(next);
  }, []);

  const value = useMemo<LanguageValue>(() => {
    const table = language === "hi" ? hi : en;
    return {
      language,
      ready,
      setAppLanguage,
      t: (key) => table[key] ?? en[key],
      fonts: language === "hi" ? hiFonts : enFonts,
    };
  }, [language, ready, setAppLanguage]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within LanguageProvider");
  return ctx;
}
