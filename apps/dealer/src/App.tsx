// App.tsx · 经销商 Web 路由（S9-04：手写 hash 路由 → react-router；白名单外回落工作台由 * 路由承担）。
// 登录态由 me 是否存在决定，不占路由。

import { useEffect } from "react";
import { HashRouter, Route, Routes } from "react-router";
import { Spin } from "antd";
import { useAuthStore } from "./store/auth";
import LoginPage from "./pages/Login";
import DealerLayout from "./layouts/DealerLayout";
import WorkbenchPage from "./pages/Workbench";
import CatalogPage from "./pages/Catalog";
import OrderCreatePage from "./pages/OrderCreate";
import OrdersPage from "./pages/Orders";
import DealerServicePage from "./pages/DealerService";
import ReconcilePage from "./pages/Reconcile";

export default function App() {
  const me = useAuthStore((s) => s.me);
  const checking = useAuthStore((s) => s.checking);
  const bootstrap = useAuthStore((s) => s.bootstrap);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  return (
    <HashRouter>
      {checking ? (
        <Spin style={{ display: "grid", placeItems: "center", height: "100vh" }} />
      ) : !me ? (
        <LoginPage />
      ) : (
        <Routes>
          <Route element={<DealerLayout />}>
            <Route index element={<WorkbenchPage />} />
            <Route path="catalog" element={<CatalogPage />} />
            <Route path="order-create" element={<OrderCreatePage />} />
            <Route path="orders" element={<OrdersPage />} />
            <Route path="service" element={<DealerServicePage />} />
            <Route path="reconcile" element={<ReconcilePage />} />
            <Route path="*" element={<WorkbenchPage />} />
          </Route>
        </Routes>
      )}
    </HashRouter>
  );
}
