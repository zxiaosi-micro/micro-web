// App.tsx · 极简 hash 路由（S3-04 范围：登录 + 布局 + 五页；多路由框架 S4 演进）。

import { useEffect, useState } from "react";
import { Spin } from "antd";
import { cachedMe, fetchMe } from "@micro/shared";
import LoginPage from "./pages/Login";
import AppLayout from "./layouts/AppLayout";
import UsersPage from "./pages/Users";
import RolesPage from "./pages/Roles";
import OrgsPage from "./pages/Orgs";
import SessionsPage from "./pages/Sessions";
import TenantsPage from "./pages/Tenants";
import PartiesPage from "./pages/Parties";
import OpportunitiesPage from "./pages/Opportunities";
import ProductsPage from "./pages/Products";
import InventoryPage from "./pages/Inventory";
import MessagesPage from "./pages/Messages";
import AuditsPage from "./pages/Audits";
import OrdersPage from "./pages/Orders";
import PaymentsPage from "./pages/Payments";
import ContractsPage from "./pages/Contracts";

function currentRoute(): string {
  return window.location.hash.replace(/^#\/?/, "") || "users";
}

export default function App() {
  const [route, setRoute] = useState(currentRoute());
  const [me, setMe] = useState<ReturnType<typeof cachedMe>>(cachedMe());
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const onHash = () => setRoute(currentRoute());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    // 启动期会话探测：有 token 则拉 /auth/me 预热
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

  // S4 业务页面：products 与 station-products 共用商品中心（Tab 默认位不同）；
  // logs 与 cmd-logs 共用审计中心（同上）。
  const page =
    route === "roles" ? <RolesPage /> :
    route === "orgs" ? <OrgsPage /> :
    route === "sessions" ? <SessionsPage /> :
    route === "tenants" ? <TenantsPage /> :
    route === "parties" ? <PartiesPage /> :
    route === "opportunities" ? <OpportunitiesPage /> :
    route === "products" ? <ProductsPage /> :
    route === "station-products" ? <ProductsPage defaultTab="station" /> :
    route === "stocks" ? <InventoryPage /> :
    route === "inbox" ? <MessagesPage /> :
    route === "logs" ? <AuditsPage /> :
    route === "cmd-logs" ? <AuditsPage defaultTab="cmd" /> :
    // S5 交易域（路由末段来自 AppLayout.routeOf：/trade/orders → orders）
    route === "orders" ? <OrdersPage /> :
    route === "returns" ? <OrdersPage defaultTab="returns" /> :
    route === "payments" ? <PaymentsPage /> :
    route === "refunds" ? <PaymentsPage defaultTab="refunds" /> :
    route === "invoices" ? <PaymentsPage defaultTab="invoices" /> :
    route === "reconcile-tasks" ? <PaymentsPage defaultTab="reconcile" /> :
    route === "contracts" ? <ContractsPage /> :
    route === "warranties" ? <ContractsPage defaultTab="warranties" /> :
    route === "sla" ? <ContractsPage defaultTab="sla" /> :
    route === "claims" ? <ContractsPage defaultTab="claims" /> :
    route === "extensions" ? <ContractsPage defaultTab="extensions" /> :
    <UsersPage />;

  return (
    <AppLayout me={me} route={route} onNavigate={(r) => (window.location.hash = `/${r}`)} onLoggedOut={() => setMe(null)}>
      {page}
    </AppLayout>
  );
}
