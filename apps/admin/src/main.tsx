// main.tsx · admin 入口：安装请求层（10402/10406 全局分流）→ 挂 App。

import { App as AntApp, ConfigProvider, Modal } from "antd";
import zhCN from "antd/locale/zh_CN";
import { createRoot } from "react-dom/client";
import { logout, setupAuth } from "@micro/shared";
import App from "./App";

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
      title: "账号在其他设备登录",
      content: "当前会话已被顶下线,请重新登录。",
      okText: "重新登录",
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

createRoot(document.getElementById("root")!).render(
  <ConfigProvider locale={zhCN}>
    <AntApp>
      <App />
    </AntApp>
  </ConfigProvider>,
);
