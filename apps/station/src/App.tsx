// App.tsx · 场站 Web hash 路由（S7-03：登录/工作台/监控/运维/我的 + 大屏；同 admin 极简路由）。

import { useEffect, useState } from "react";
import { Spin } from "antd";
import { fetchMe, logout, tokenStore } from "@micro/shared";
import LoginPage from "./pages/Login";
import WorkbenchPage from "./pages/Workbench";
import MonitorPage from "./pages/Monitor";
import OpsPage from "./pages/Ops";
import ProfilePage from "./pages/Profile";
import ScreenPage from "./pages/Screen";
import { stationWebMe } from "./api";
import type { StationWebMeResp } from "@micro/shared/types";

function currentRoute(): string {
  return window.location.hash.replace(/^#\/?/, "") || "workbench";
}

/** 驻站上下文（登录后拉取；大屏免登录跳过） */
export interface StationCtx {
  me: StationWebMeResp | null;
}

export default function App() {
  const [route, setRoute] = useState(currentRoute());
  const [authed, setAuthed] = useState(!!tokenStore.getAccessToken());
  const [ctx, setCtx] = useState<StationCtx>({ me: null });
  const [checking, setChecking] = useState(authed);

  useEffect(() => {
    const onHash = () => setRoute(currentRoute());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    if (!authed) {
      setChecking(false);
      return;
    }
    // 大屏：免登录设备账号（10s 轮询，不占人工席位）
    if (route === "screen") {
      setChecking(false);
      return;
    }
    (async () => {
      try {
        const me = await fetchMe();
        if (!me) {
          setAuthed(false);
        } else {
          const mine = await stationWebMe().catch(() => null);
          setCtx({ me: mine });
        }
      } finally {
        setChecking(false);
      }
    })();
  }, [authed, route]);

  if (route === "screen") {
    return <ScreenPage />;
  }

  if (checking) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!authed) {
    return (
      <LoginPage
        onLoggedIn={() => {
          setAuthed(true);
          setChecking(true);
        }}
      />
    );
  }

  const nav = (
    <select
      value={route}
      onChange={(e) => (window.location.hash = "#/" + e.target.value)}
      style={{ padding: 6, borderRadius: 6 }}
    >
      <option value="workbench">工作台</option>
      <option value="monitor">监控</option>
      <option value="ops">运维</option>
      <option value="profile">我的</option>
      <option value="screen">大屏</option>
    </select>
  );

  const shell = (children: React.ReactNode) => (
    <div style={{ minHeight: "100vh", background: "#f0f2f5" }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          padding: "12px 24px",
          background: "#fff",
          borderBottom: "1px solid #eee",
        }}
      >
        <b>场站 Web{ctx.me?.station_name ? ` · ${ctx.me.station_name}` : ""}</b>
        <div style={{ flex: 1 }} />
        {nav}
        <a
          onClick={() => {
            void logout();
            setAuthed(false);
            window.location.hash = "#/login";
          }}
        >
          退出
        </a>
      </header>
      <div style={{ padding: 16 }}>{children}</div>
    </div>
  );

  switch (route) {
    case "monitor":
      return shell(<MonitorPage stationId={ctx.me?.station_id ?? ""} />);
    case "ops":
      return shell(<OpsPage stationId={ctx.me?.station_id ?? ""} />);
    case "profile":
      return shell(<ProfilePage me={ctx.me} />);
    case "login":
      return shell(<LoginPage onLoggedIn={() => undefined} />);
    default:
      return shell(<WorkbenchPage stationId={ctx.me?.station_id ?? ""} onGoOps={() => (window.location.hash = "#/ops")} />);
  }
}

