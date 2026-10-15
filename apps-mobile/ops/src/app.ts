// app.ts · 应用入口（Taro React 形态）：启动时装偏好中心（i18n/prefs.setupPrefs）+
// 请求层/恢复服务端地址，回前台触发离线队列恢复同步（02 §12.3 离线工单草稿）。
// RN 适配：useDidShow 覆盖 RN AppState 前后台切换（taro-rn 桥接，见 polling.ts 注释）。

import { PropsWithChildren } from "react";
import type React from "react";
import { useDidShow, useLaunch } from "@tarojs/taro";
import { setupAuth } from "./auth";
import { setupPrefs } from "./i18n";
import { restoreBaseURL } from "./request";
import { flushOnAppShow } from "./offline";
import "./app.scss";

function App({ children }: PropsWithChildren) {
  useLaunch(() => {
    // 顺序敏感：偏好中心先行（t() 词条就绪），再恢复 baseURL 装请求层回调（RN 首帧桥接前预热见 auth.ts）
    setupPrefs();
    restoreBaseURL();
    setupAuth();
    flushOnAppShow(); // 冷启动即尝试补投离线草稿
  });

  // 回前台（RN AppState active）：网络恢复后自动补投
  useDidShow(() => {
    flushOnAppShow();
  });

  // RN 下 children 即页面栈根（taro-rn 渲染容器），无需 JSX 包裹
  return children as React.ReactElement;
}

export default App;
