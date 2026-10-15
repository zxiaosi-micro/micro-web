// main.tsx · admin 入口：安装请求层（10402/10406 全局分流）→ 装配偏好中心（语言/主题）→ 挂 App。

import { App as AntApp, ConfigProvider, Modal } from "antd";
import enUS from "antd/locale/en_US";
import zhCN from "antd/locale/zh_CN";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { logout, setupAuth } from "@micro/shared";
import { applyHtmlPrefs, brandTheme, useDocumentTitle } from "@micro/shared/theme";
import { configureI18n, t, usePrefs, webStorage } from "@micro/shared/prefs";
import "@micro/shared/theme.css";
import { BRAND } from "./brand";
import App from "./App";
import enMessages from "./locales/en-US";
import zhMessages from "./locales/zh-CN";

let kickedShown = false;

setupAuth({
  baseURL: "/api/v1", // 统一走 vite 代理 → admin-bff（prod 由网关同域反代）
  onSessionKicked: () => {
    // 10402 互斥弹窗（02 §9.5：当前账号已在其他设备登录）
    if (kickedShown) {
      return;
    }
    kickedShown = true;
    Modal.warning({
      title: t("session.kickedTitle"),
      content: t("session.kickedContent"),
      okText: t("session.relogin"),
      onOk: () => {
        kickedShown = false;
        window.location.reload();
      },
    });
  },
  onStepUpRequired: () => {
    // 10406 提级：App 内全局 StepUpModal 监听（见 AppLayout）
    window.dispatchEvent(new CustomEvent("micro:stepup-required"));
  },
  onForceLogout: () => {
    if (kickedShown) {
      return; // 互斥弹窗在途:等用户点"重新登录"再回登录页(弹窗不可一闪而过)
    }
    void logout();
    window.location.hash = "#/login";
    window.location.reload();
  },
});

configureI18n({
  storage: webStorage,
  messages: { "zh-CN": zhMessages, "en-US": enMessages },
  detect: () => (typeof navigator !== "undefined" ? navigator.language : null),
  onChange: applyHtmlPrefs,
});
applyHtmlPrefs();

/** 动态 locale/theme 的根 Provider（usePrefs 订阅切换即时重渲；title 随语言同步） */
function RootProviders({ children }: { children: ReactNode }) {
  const { locale, theme } = usePrefs();
  useDocumentTitle(t("app.title"));
  return (
    <ConfigProvider locale={locale === "en-US" ? enUS : zhCN} theme={brandTheme(BRAND, theme)}>
      <AntApp>{children}</AntApp>
    </ConfigProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <RootProviders>
    <App />
  </RootProviders>,
);
