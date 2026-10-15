// prefs-row.tsx · 偏好设置卡（语言 + 深色模式行；me 页与登录页共用）。
import { Text, View } from "@tarojs/components";
import { LOCALES, LOCALE_LABEL, setTheme, type Locale } from "@micro/shared/prefs";
import { switchLocale, usePrefs } from "./i18n";

export default function PrefsRow() {
  const { t, locale, theme } = usePrefs();
  const next = (LOCALES.find((l) => l !== locale) ?? "en-US") as Locale;
  const isDark = theme === "dark";

  return (
    <View className="app-card">
      <Text className="pf-party" style={{ fontSize: "26px" }}>
        {t("prefs.section")}
      </Text>
      <View className="pf-row" onClick={() => switchLocale(next)}>
        <Text className="pf-key">{t("prefs.language")}</Text>
        <Text className="pf-val">{LOCALE_LABEL[next]} ›</Text>
      </View>
      <View className="pf-row" onClick={() => setTheme(isDark ? "light" : "dark")}>
        <Text className="pf-key">{t("prefs.theme")}</Text>
        <Text className="pf-val">{isDark ? t("prefs.themeOn") : t("prefs.themeOff")}</Text>
      </View>
    </View>
  );
}
