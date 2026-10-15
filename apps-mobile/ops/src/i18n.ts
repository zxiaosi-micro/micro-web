// i18n.ts · 偏好中心装配（ops App，RN 双目标）：AsyncStorage 异步适配注入 shared prefs。
//
// RN 的 AsyncStorage 是异步 API——启动时先以默认值（中文/浅色）同步装配保证首帧，
// 后台读回持久化偏好后 setLocale/setTheme（usePrefs 订阅者自动重渲）。
// 页面落地时按 README 的 i18n/主题规范消费：t()/usePrefs() + themed() 类名后缀
// （css-to-rn 不支持 CSS 变量与后代选择器，主题走 `--dark` 扁平类集）。

import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  configureI18n,
  setLocale,
  setTheme,
  type Messages,
  type PrefsStorage,
} from "@micro/shared/prefs";
import zh from "./locales/zh-CN";
import en from "./locales/en-US";

/** AsyncStorage → 同步签名适配（get 恒 null：持久化值经启动异步读回显式 set） */
const asyncStorage: PrefsStorage = {
  get: () => null,
  set: (key, value) => {
    void AsyncStorage.setItem(key, value).catch(() => undefined);
  },
};

/** app.ts 启动装配（useLaunch 调用一次） */
export function setupPrefs(): void {
  configureI18n({
    storage: asyncStorage,
    messages: { "zh-CN": zh as Messages, "en-US": en as Messages },
  });
  void (async () => {
    try {
      const [locale, theme] = await Promise.all([
        AsyncStorage.getItem("micro.locale"),
        AsyncStorage.getItem("micro.theme"),
      ]);
      // setLocale/setTheme 写回 storage 并 notify 重渲；值不合法时保持默认
      if (locale === "en-US" || locale === "zh-CN") {
        setLocale(locale);
      }
      if (theme === "dark" || theme === "light") {
        setTheme(theme);
      }
    } catch {
      // storage 不可用保持默认中文/浅色
    }
  })();
}
