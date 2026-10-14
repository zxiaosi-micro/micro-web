// App.tsx · react-router 路由表（原手写 hash 路由 + 三元链 → HashRouter 声明式路由）。
// 登录态由 store 承担（未登录渲染 LoginPage，不占路由）；产品 Tab 复用页在此以 props 表达。

import { useEffect } from "react";
import { HashRouter, Route, Routes } from "react-router";
import { Spin } from "antd";
import { useAuthStore } from "./store/auth";
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
import DevicesPage from "./pages/Devices";
import StationsPage from "./pages/Stations";
import PaymentsPage from "./pages/Payments";
import ContractsPage from "./pages/Contracts";
import ReportsPage from "./pages/Reports";
import DownloadCenterPage from "./pages/DownloadCenter";
import RetirementsPage from "./pages/Retirements";
import BIQueryPage from "./pages/BIQuery";
import RebatesPage from "./pages/Rebates";
import DiagPage from "./pages/Diag";

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
          <Route element={<AppLayout />}>
            <Route index element={<UsersPage />} />
            <Route path="roles" element={<RolesPage />} />
            <Route path="orgs" element={<OrgsPage />} />
            <Route path="sessions" element={<SessionsPage />} />
            <Route path="tenants" element={<TenantsPage />} />
            <Route path="parties" element={<PartiesPage />} />
            <Route path="opportunities" element={<OpportunitiesPage />} />
            {/* S4 业务页：products 与 station-products 共用商品中心（Tab 默认位不同） */}
            <Route path="products" element={<ProductsPage />} />
            <Route path="station-products" element={<ProductsPage defaultTab="station" />} />
            <Route path="stocks" element={<InventoryPage />} />
            <Route path="inbox" element={<MessagesPage />} />
            {/* logs 与 cmd-logs 共用审计中心（同上） */}
            <Route path="logs" element={<AuditsPage />} />
            <Route path="cmd-logs" element={<AuditsPage defaultTab="cmd" />} />
            {/* S5 交易域 */}
            <Route path="orders" element={<OrdersPage />} />
            <Route path="returns" element={<OrdersPage defaultTab="returns" />} />
            <Route path="payments" element={<PaymentsPage />} />
            <Route path="refunds" element={<PaymentsPage defaultTab="refunds" />} />
            <Route path="invoices" element={<PaymentsPage defaultTab="invoices" />} />
            <Route path="reconcile-tasks" element={<PaymentsPage defaultTab="reconcile" />} />
            {/* S10-03 经销商返利 */}
            <Route path="rebates" element={<RebatesPage />} />
            <Route path="contracts" element={<ContractsPage />} />
            <Route path="warranties" element={<ContractsPage defaultTab="warranties" />} />
            <Route path="sla" element={<ContractsPage defaultTab="sla" />} />
            <Route path="claims" element={<ContractsPage defaultTab="claims" />} />
            <Route path="extensions" element={<ContractsPage defaultTab="extensions" />} />
            <Route path="devices" element={<DevicesPage />} />
            <Route path="ota-tasks" element={<DevicesPage defaultTab="ota" />} />
            <Route path="commands" element={<DevicesPage defaultTab="cmds" />} />
            {/* S10-01 退役评估 */}
            <Route path="retirements" element={<RetirementsPage />} />
            <Route path="stations" element={<StationsPage />} />
            {/* S8 分析域 */}
            <Route path="reports" element={<ReportsPage />} />
            <Route path="download-center" element={<DownloadCenterPage />} />
            {/* S10-02 BI 自助 */}
            <Route path="bi" element={<BIQueryPage />} />
            {/* S9 运维 PC 本地诊断（Tauri 探测，浏览器占位拒绝） */}
            <Route path="diag" element={<DiagPage />} />
            <Route path="*" element={<UsersPage />} />
          </Route>
        </Routes>
      )}
    </HashRouter>
  );
}
