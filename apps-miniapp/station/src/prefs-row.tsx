// prefs-row.tsx · 偏好设置卡（语言 + 深色模式行；登录页共用；类名用 station 端通用样式）。
import { Text, View } from "@tarojs/components";
import { LOCALES, LOCALE_LABEL, setTheme, type Locale } from "@micro/shared/prefs";
import { switchLocale, usePrefs } from "./i18n";

export default function PrefsRow() {
  const { t, locale, theme } = usePrefs();
  const next = (LOCALES.find((l) => l !== locale) ?? "en-US") as Locale;
  const isDark = theme === "dark";

  return (
    <View className="app-card">
      <Text className="app-title" style={{ fontSize: "26rpx" }}>
        {t("prefs.section")}
      </Text>
      <View className="app-row" onClick={() => switchLocale(next)}>
        <Text className="app-sub">{t("prefs.language")}</Text>
        <Text className="app-sub">{LOCALE_LABEL[next]} ›</Text>
      </View>
      <View className="app-row" onClick={() => setTheme(isDark ? "light" : "dark")}>
        <Text className="app-sub">{t("prefs.theme")}</Text>
        <Text className="app-sub">{isDark ? t("prefs.themeOn") : t("prefs.themeOff")}</Text>
      </View>
    </View>
  );
}
