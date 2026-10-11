// app.ts · 应用入口（Taro React 形态）：启动时装请求层认证分流（auth.setupAuth）。
import { PropsWithChildren } from "react";
import type React from "react";
import { useLaunch } from "@tarojs/taro";
import { setupAuth } from "./auth";
import "./app.scss";

function App({ children }: PropsWithChildren) {
  useLaunch(() => {
    // 顺序敏感：认证回调先装好，任何页面的请求才能正确分流 401
    setupAuth();
  });

  // weapp 下 children 即页面栈根（Taro React 渲染容器）
  return children as React.ReactElement;
}

export default App;
