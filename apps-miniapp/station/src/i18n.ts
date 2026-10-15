// i18n.ts · 偏好中心装配（client 小程序）：Taro storage 适配器注入 shared prefs，
// 语言（zh-CN/en-US）+ 主题（light/dark）双偏好；页面经 useThemePage 消费。
//
// shared prefs 模块本体零平台 API（照 configureRequest 抽象模式）；本文件是 Taro 端
// 唯一的桥接点：storage 适配器 + 系统语言探测 + 导航栏/窗口背景随主题同步。

import Taro from "@tarojs/taro";
import { useEffect } from "react";
import {
  MINIAPP_TOKENS,
  configureI18n,
  setLocale,
  usePrefs,
  type Locale,
  type PrefsStorage,
  type ThemeMode,
  type Messages,
} from "@micro/shared/prefs";
import zh from "./locales/zh-CN";
import en from "./locales/en-US";

/** Taro storage → PrefsStorage 适配（getStorageSync 缺省返回 ""，归一为 null） */
const taroStorage: PrefsStorage = {
  get: (key) => {
    const v = Taro.getStorageSync<string>(key);
    return v === "" || v == null ? null : v;
  },
  set: (key, value) => {
    Taro.setStorageSync(key, value);
  },
};

/** app.ts 启动装配（须在任何 t()/usePrefs() 消费前调用一次） */
export function setupPrefs(): void {
  configureI18n({
    storage: taroStorage,
    messages: { "zh-CN": zh as Messages, "en-US": en as Messages },
    detect: () => {
      try {
        return Taro.getSystemInfoSync().language ?? null;
      } catch {
        return null;
      }
    },
  });
}

/** 手动切换语言（me/登录页切换行用；写 storage + 触发全页重渲） */
export function switchLocale(next: Locale): void {
  setLocale(next);
}

export { usePrefs };
export type { Locale, ThemeMode };

/** 页面主题/语言消费 hook：rootClass 挂页面根 View（CSS 变量切换），并同步
 * 导航栏/窗口背景与标题（主题或语言任一变化即时刷新）。titleKey 省略则不动标题。 */
export function useThemePage(titleKey?: string): { t: typeof import("@micro/shared/prefs").t; isDark: boolean; rootClass: string } {
  const { t, theme, locale } = usePrefs();
  const isDark = theme === "dark";

  useEffect(() => {
    const tokens = MINIAPP_TOKENS[theme];
    void Taro.setNavigationBarColor({
      frontColor: tokens.navBarText === "white" ? "#ffffff" : "#000000",
      backgroundColor: tokens.navBarBg,
    }).catch(() => undefined);
    void Taro.setBackgroundColor({ backgroundColor: tokens.pageBg }).catch(() => undefined);
    if (titleKey) {
      void Taro.setNavigationBarTitle({ title: t(titleKey) }).catch(() => undefined);
    }
  }, [theme, locale, titleKey]);

  return { t, isDark, rootClass: isDark ? "theme-dark" : "" };
}
