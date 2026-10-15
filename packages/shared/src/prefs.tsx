// prefs.tsx · 六端共用偏好中心：语言（zh-CN/en-US）+ 主题（light/dark）+ 轻量 i18n。
//
// 设计口径（照 request.ts 的 configureRequest/TokenStore 抽象模式）：
//   - 模块本体零平台 API：storage 由各端入口注入（Web=localStorage、Taro=Taro storage），
//     不 import 任何端专属包，React 18.3（小程序）/19（Web）双版本通用；
//   - React 绑定用 useSyncExternalStore（不引入 zustand——小程序端未安装）；
//   - 词条：各端 zh/en 字典在 configureI18n 时与 COMMON 公共词条合并；zh 为正本，
//     en 用 satisfies 强制同型（漏键编译期报错）；运行时 miss 回退 zh 再回退 key 原文
//     （防裸 key 白板）；
//   - 主题：Web 端经 antd darkAlgorithm + html[data-theme]（见 theme.tsx applyHtmlPrefs）；
//     weapp 小程序经根节点 .theme-dark + CSS 变量；RN 经 themed() 类名后缀 + MINIAPP_TOKENS。

import { useSyncExternalStore } from "react";
import { COMMON_EN, COMMON_ZH } from "./prefs-common";

/** 支持的语言（正本顺序即切换器展示顺序；新增语言先扩这里） */
export type Locale = "zh-CN" | "en-US";

export const LOCALES: Locale[] = ["zh-CN", "en-US"];

/** 语言展示名（切换器用） */
export const LOCALE_LABEL: Record<Locale, string> = {
  "zh-CN": "中文",
  "en-US": "English",
};

/** 主题模式 */
export type ThemeMode = "light" | "dark";

/** 词条字典（扁平点分 key；zh 正本约束 en 同型见各端 locales 文件） */
export type Messages = Record<string, string>;

/** 偏好存储抽象（照 TokenStore 模式；各端注入同步实现） */
export interface PrefsStorage {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

/** Web 端存储适配器（localStorage；Taro 端自建 Taro.get/setStorageSync 包装） */
export const webStorage: PrefsStorage = {
  get: (key) => (typeof localStorage === "undefined" ? null : localStorage.getItem(key)),
  set: (key, value) => {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(key, value);
    }
  },
};

const LOCALE_KEY = "micro.locale";
const THEME_KEY = "micro.theme";

// ---- 模块级状态（configureI18n 后有效；未配置时走默认值 + key 回退） ----

let storage: PrefsStorage | null = null;
let onChange: (() => void) | undefined;
let locale: Locale = "zh-CN";
let theme: ThemeMode = "light";
let dict: Record<Locale, Messages> = { "zh-CN": { ...COMMON_ZH }, "en-US": { ...COMMON_EN } };

// 订阅版本号（getSnapshot 返回原始值，规避对象引用快照问题）
let version = 0;
const listeners = new Set<() => void>();

function notify(): void {
  version += 1;
  for (const fn of listeners) {
    fn();
  }
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export interface I18nConfig {
  /** 偏好存储（必须提供；Web 传 localStorage 包装、Taro 端传 storage 包装） */
  storage: PrefsStorage;
  /** 各端自有词条（与 COMMON 公共词条合并，端 key 覆盖同名公共 key） */
  messages?: Partial<Record<Locale, Messages>>;
  /** 系统语言探测（返回 navigator.language / Taro 系统信息等原始串；持久化值优先） */
  detect?: () => string | null;
  /** locale/theme 任一变化后的回调（Web 端用于同步 html 属性、document.title 等） */
  onChange?: () => void;
}

/** 偏好中心装配（各端入口调用一次，须在任何 t()/usePrefs() 消费前） */
export function configureI18n(config: I18nConfig): void {
  storage = config.storage;
  onChange = config.onChange;
  dict = {
    "zh-CN": { ...COMMON_ZH, ...config.messages?.["zh-CN"] },
    "en-US": { ...COMMON_EN, ...config.messages?.["en-US"] },
  };
  // 持久化值 > 系统探测 > 默认中文
  const savedLocale = storage.get(LOCALE_KEY);
  if (savedLocale === "zh-CN" || savedLocale === "en-US") {
    locale = savedLocale;
  } else {
    const detected = config.detect?.() ?? "";
    locale = detected.toLowerCase().startsWith("en") ? "en-US" : "zh-CN";
  }
  const savedTheme = storage.get(THEME_KEY);
  theme = savedTheme === "dark" ? "dark" : "light";
}

/** 翻译：当前语言 miss 回退 zh 正本再回退 key 原文；{{var}} 插值 */
export function t(key: string, params?: Record<string, string | number>): string {
  let text = dict[locale][key] ?? dict["zh-CN"][key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), String(v));
    }
  }
  return text;
}

/** 词条是否存在（enumLabel 兜底判断用） */
function hasTranslation(key: string): boolean {
  return key in dict[locale] || key in dict["zh-CN"];
}

/** 枚举兜底：命中 enum.* 词条显示译文，miss 原样返回值本身（服务端新增枚举不白板、不裸 key） */
export function enumLabel(prefix: string, value: string | number): string {
  const key = `${prefix}.${value}`;
  return hasTranslation(key) ? t(key) : String(value);
}

// ---- 语言 ----

export function getLocale(): Locale {
  return locale;
}

export function setLocale(next: Locale): void {
  if (next === locale) {
    return;
  }
  locale = next;
  storage?.set(LOCALE_KEY, next);
  notify();
  onChange?.();
}

export function toggleLocale(): void {
  setLocale(locale === "zh-CN" ? "en-US" : "zh-CN");
}

// ---- 主题 ----

export function getTheme(): ThemeMode {
  return theme;
}

export function isDark(): boolean {
  return theme === "dark";
}

export function setTheme(next: ThemeMode): void {
  if (next === theme) {
    return;
  }
  theme = next;
  storage?.set(THEME_KEY, next);
  notify();
  onChange?.();
}

export function toggleTheme(): void {
  setTheme(theme === "dark" ? "light" : "dark");
}

/** weapp 小程序根节点 class（.theme-dark 内 CSS 变量覆盖全页色板） */
export function themeRootClass(): string {
  return theme === "dark" ? "theme-dark" : "";
}

/** RN 类名后缀方案（css-to-rn 不支持 CSS 变量；样式表须成对提供 `--dark` 类） */
export function themed(cls: string): string {
  return theme === "dark" ? `${cls} ${cls}--dark` : cls;
}

// ---- React 绑定 ----

/** 偏好订阅（locale/theme 任一变化触发重渲；t 为稳定模块函数） */
export function usePrefs(): { locale: Locale; theme: ThemeMode; t: typeof t } {
  useSyncExternalStore(subscribe, () => version);
  return { locale, theme, t };
}

export function useLocale(): Locale {
  useSyncExternalStore(subscribe, () => version);
  return locale;
}

export function useTheme(): ThemeMode {
  useSyncExternalStore(subscribe, () => version);
  return theme;
}

// ---- 小程序/RN 色板（RN 无 CSS 变量；weapp 的 app.scss 变量值须与此保持一致） ----

export interface MiniappTokens {
  pageBg: string;
  cardBg: string;
  title: string;
  sub: string;
  brand: string;
  brandWeak: string;
  inputBg: string;
  plainBg: string;
  dangerText: string;
  dangerBg: string;
  tagBg: string;
  tagText: string;
  tagWarnBg: string;
  tagWarnText: string;
  tagDangerBg: string;
  navBarBg: string;
  navBarText: "white" | "black";
}

export const MINIAPP_TOKENS: Record<ThemeMode, MiniappTokens> = {
  light: {
    pageBg: "#f5f6f8",
    cardBg: "#ffffff",
    title: "#1f2329",
    sub: "#86909c",
    brand: "#1f6feb",
    brandWeak: "#e8f3ff",
    inputBg: "#f7f8fa",
    plainBg: "#f2f3f5",
    dangerText: "#f53f3f",
    dangerBg: "#ffece8",
    tagBg: "#e8f3ff",
    tagText: "#1f6feb",
    tagWarnBg: "#fff3e8",
    tagWarnText: "#d25f00",
    tagDangerBg: "#ffece8",
    navBarBg: "#1f6feb",
    navBarText: "white",
  },
  dark: {
    pageBg: "#0d1220",
    cardBg: "#161d2f",
    title: "#e5eaf3",
    sub: "#8a94a6",
    brand: "#4c8dff",
    brandWeak: "#1b2a45",
    inputBg: "#101725",
    plainBg: "#1a2236",
    dangerText: "#ff7875",
    dangerBg: "#2a1a1e",
    tagBg: "#1b2a45",
    tagText: "#7cabff",
    tagWarnBg: "#2a2216",
    tagWarnText: "#ffa940",
    tagDangerBg: "#2a1a1e",
    navBarBg: "#101725",
    navBarText: "white",
  },
};
