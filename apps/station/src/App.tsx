// App.tsx · 场站 Web 路由（S7-03：手写 hash 路由 → react-router）。
// Gate：登录探测/大屏分流；登录后 ProLayout 壳 + 嵌套路由。
// 大屏免登录独立全屏渲染（不占人工席位，FR-STN-007）。

import { useEffect, useState } from "react";
import { HashRouter, Outlet, Route, Routes, useLocation, useNavigate } from "react-router";
import { Dropdown, Spin } from "antd";
import {
  DashboardOutlined,
  FundOutlined,
  LogoutOutlined,
  MonitorOutlined,
  ThunderboltOutlined,
  ToolOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { ProLayout } from "@ant-design/pro-components";
import { fetchMe } from "@micro/shared";
import { brandStyle, PageTransition, PrefSwitcher } from "@micro/shared/theme";
import { usePrefs } from "@micro/shared/prefs";
import LoginPage from "./pages/Login";
import WorkbenchPage from "./pages/Workbench";
import MonitorPage from "./pages/Monitor";
import OpsPage from "./pages/Ops";
import ProfilePage from "./pages/Profile";
import ScreenPage from "./pages/Screen";
import { stationWebMe } from "./api";
import { useAuthStore } from "./store/auth";
import { BRAND } from "./brand";

/** 静态导航（5 项；大屏进入后为独立全屏页，不再套壳；nameKey 渲染期翻译） */
const NAV = [
  { path: "/workbench", nameKey: "nav.workbench", icon: <DashboardOutlined /> },
  { path: "/monitor", nameKey: "nav.monitor", icon: <MonitorOutlined /> },
  { path: "/ops", nameKey: "nav.ops", icon: <ToolOutlined /> },
  { path: "/profile", nameKey: "nav.profile", icon: <UserOutlined /> },
  { path: "/screen", nameKey: "nav.screen", icon: <FundOutlined /> },
];

export default function App() {
  return (
    <HashRouter>
      <Gate />
    </HashRouter>
  );
}

/** 登录门卫：会话探测 + 大屏分流（大屏免登录，不走布局壳） */
function Gate() {
  const route = useLocation().pathname.replace(/^\//, "") || "workbench";
  const authed = useAuthStore((s) => s.authed);
  const checking = useAuthStore((s) => s.checking);
  const ctx = useAuthStore((s) => s.ctx);
  const setAuthed = useAuthStore((s) => s.setAuthed);
  const setChecking = useAuthStore((s) => s.setChecking);
  const setCtx = useAuthStore((s) => s.setCtx);
  const navigate = useNavigate();

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
  }, [authed, route, setAuthed, setChecking, setCtx]);

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
    return <LoginPage />;
  }

  const stationId = ctx.me?.station_id ?? "";
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<WorkbenchPage stationId={stationId} onGoOps={() => navigate("/ops")} />} />
        <Route path="workbench" element={<WorkbenchPage stationId={stationId} onGoOps={() => navigate("/ops")} />} />
        <Route path="monitor" element={<MonitorPage stationId={stationId} />} />
        <Route path="ops" element={<OpsPage stationId={stationId} />} />
        <Route path="profile" element={<ProfilePage me={ctx.me} />} />
        <Route path="*" element={<WorkbenchPage stationId={stationId} onGoOps={() => navigate("/ops")} />} />
      </Route>
    </Routes>
  );
}

/** 布局壳：ProLayout（移动端自动抽屉）+ 驻站上下文头像 + 偏好切换器 */
function AppShell() {
  const { t } = usePrefs();
  const location = useLocation();
  const navigate = useNavigate();
  const ctx = useAuthStore((s) => s.ctx);
  const signOut = useAuthStore((s) => s.signOut);
  // 移动端抽屉开合（ProLayout isMobile 时 sider 即抽屉；点菜单后手动收起）
  const [collapsed, setCollapsed] = useState(() => window.innerWidth < 768);

  return (
    <div style={{ minHeight: "100vh", ...brandStyle(BRAND) }}>
      <ProLayout
        title={ctx.me?.station_name ? t("shell.titleWithStation", { name: ctx.me.station_name }) : t("shell.title")}
        logo={<span className="brand-logo-mark"><ThunderboltOutlined /></span>}
        layout="mix"
        fixSiderbar
        fixedHeader
        siderWidth={200}
        collapsed={collapsed}
        onCollapse={setCollapsed}
        location={{ pathname: location.pathname }}
        route={{ path: "/", routes: NAV.map((n) => ({ path: n.path, name: t(n.nameKey), icon: n.icon })) }}
        menu={{ locale: false }}
        actionsRender={() => [<PrefSwitcher key="prefs" />]}
        menuItemRender={(item, dom) => (
          <div onClick={() => {
            if (window.innerWidth < 768) setCollapsed(true);
            if (item.path) navigate(item.path);
          }}>{dom}</div>
        )}
        avatarProps={{
          icon: <UserOutlined />,
          size: "small",
          title: ctx.me?.station_name || t("shell.stationUser"),
          render: (_, dom) => (
            <Dropdown
              menu={{
                items: [{ key: "logout", icon: <LogoutOutlined />, label: t("common.logout") }],
                onClick: ({ key }) => {
                  if (key === "logout") void signOut();
                },
              }}
            >
              {dom}
            </Dropdown>
          ),
        }}
        token={{
          header: { colorBgHeader: "rgba(255,255,255,0.88)" },
          sider: {
            colorMenuBackground: "#180f3d",
            colorTextMenu: "rgba(255,255,255,0.75)",
            colorTextMenuSecondary: "rgba(255,255,255,0.55)",
            colorTextMenuSelected: "#ffffff",
            colorTextMenuActive: "#ffffff",
            colorBgMenuItemSelected: BRAND.colorPrimary,
            colorBgMenuItemHover: "rgba(255,255,255,0.08)",
            colorBgMenuItemActive: "rgba(255,255,255,0.10)",
          },
        }}
      >
        <PageTransition routeKey={location.pathname}>
          <Outlet />
        </PageTransition>
      </ProLayout>
    </div>
  );
}
