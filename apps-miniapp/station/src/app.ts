// app.ts · 应用入口（Taro React 形态）：启动时安装请求层/登录态（auth.setupAuth）。
// 驻站上下文（/station-web/me）由各页经 ensureStationMe 惰性获取，不在此预拉——
// 登录页成功后已预热，重启动时首屏页自行兜底。

import { PropsWithChildren } from "react";
import type React from "react";
import { useLaunch } from "@tarojs/taro";
import { setupAuth } from "./auth";
import "./app.scss";

function App({ children }: PropsWithChildren) {
  useLaunch(() => {
    setupAuth();
  });

  // weapp 下 children 即页面栈根，无需 JSX 包裹
  return children as React.ReactElement;
}

export default App;
