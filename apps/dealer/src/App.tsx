// App.tsx · 经销商 Web hash 路由（S9-04：登录探测 + 6 业务页；同 admin/station 极简路由）。

import { useEffect, useState } from "react";
import { Spin } from "antd";
import { cachedMe, fetchMe } from "@micro/shared";
import type { MeResp } from "@micro/shared/types";
import LoginPage from "./pages/Login";
import DealerLayout from "./layouts/DealerLayout";
import WorkbenchPage from "./pages/Workbench";
import CatalogPage from "./pages/Catalog";
import OrderCreatePage from "./pages/OrderCreate";
import OrdersPage from "./pages/Orders";
import DealerServicePage from "./pages/DealerService";
import ReconcilePage from "./pages/Reconcile";

/** 合法路由（白名单外回落工作台）；登录态由 me 是否存在决定，不占路由 */
const ROUTES = ["workbench", "catalog", "order-create", "orders", "service", "reconcile"];

function currentRoute(): string {
  const r = window.location.hash.replace(/^#\/?/, "") || "workbench";
  return ROUTES.includes(r) ? r : "workbench";
}

export default function App() {
  const [route, setRoute] = useState(currentRoute());
  const [me, setMe] = useState<MeResp | null>(cachedMe());
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const onHash = () => setRoute(currentRoute());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    // 启动期会话探测：有 token 则拉 /auth/me 预热（同 admin）
    void fetchMe().then((m) => {
      setMe(m);
      setChecking(false);
    });
  }, []);

  if (checking) {
    return <Spin style={{ display: "grid", placeItems: "center", height: "100vh" }} />;
  }
  if (!me) {
    return <LoginPage onLoggedIn={() => setMe(cachedMe())} />;
  }

  const page =
    route === "catalog" ? <CatalogPage /> :
    route === "order-create" ? <OrderCreatePage /> :
    route === "orders" ? <OrdersPage /> :
    route === "service" ? <DealerServicePage /> :
    route === "reconcile" ? <ReconcilePage /> :
    <WorkbenchPage />;

  return (
    <DealerLayout me={me} route={route} onNavigate={(r) => (window.location.hash = `/${r}`)} onLoggedOut={() => setMe(null)}>
      {page}
    </DealerLayout>
  );
}
