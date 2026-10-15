// DealerLayout.tsx · 经销商端布局（S9-04）：ProLayout 布局壳（移动端自动抽屉）。
// 菜单静态写死——数据驱动菜单（/auth/menus）是 admin 的事；经销商端页面集合固定
// （01 §8.3 七页，登录不进菜单）。路由/登录态由 react-router / zustand 承担。

import { Dropdown } from "antd";
import {
  LogoutOutlined,
  ShopOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { ProLayout } from "@ant-design/pro-components";
import { Outlet, useLocation, useNavigate } from "react-router";
import { useState } from "react";
import { brandStyle, PageTransition, PrefSwitcher } from "@micro/shared/theme";
import { usePrefs } from "@micro/shared/prefs";
import { useAuthStore } from "../store/auth";
import { BRAND } from "../brand";

/** 静态菜单（6 项，对应 7 页减登录页；key = hash 路由；name 为 nav.* 词条 key） */
const MENU_ITEMS = [
  { path: "/workbench", nameKey: "nav.workbench" },
  { path: "/catalog", nameKey: "nav.catalog" },
  { path: "/order-create", nameKey: "nav.order-create" },
  { path: "/orders", nameKey: "nav.orders" },
  { path: "/service", nameKey: "nav.service" },
  { path: "/reconcile", nameKey: "nav.reconcile" },
];

export default function DealerLayout() {
  const { t } = usePrefs();
  const location = useLocation();
  const navigate = useNavigate();
  const me = useAuthStore((s) => s.me)!;
  const signOut = useAuthStore((s) => s.signOut);
  // 移动端抽屉开合（ProLayout isMobile 时 sider 即抽屉；点菜单后手动收起）
  const [collapsed, setCollapsed] = useState(() => window.innerWidth < 768);

  const onLogout = async () => {
    await signOut();
  };

  return (
    <div style={{ minHeight: "100vh", ...brandStyle(BRAND) }}>
      <ProLayout
        title={t("app.title")}
        logo={<span className="brand-logo-mark"><ShopOutlined /></span>}
        layout="mix"
        fixSiderbar
        fixedHeader
        siderWidth={200}
        collapsed={collapsed}
        onCollapse={setCollapsed}
        location={{ pathname: location.pathname }}
        route={{ path: "/", routes: MENU_ITEMS.map((m) => ({ path: m.path, name: t(m.nameKey) })) }}
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
          title: me.nickname,
          render: (_, dom) => (
            <Dropdown
              menu={{
                items: [
                  { key: "uid", label: t("layout.uidLabel", { uid: me.uid }), disabled: true },
                  { type: "divider" as const },
                  { key: "logout", icon: <LogoutOutlined />, label: t("common.logout") },
                ],
                onClick: ({ key }) => {
                  if (key === "logout") void onLogout();
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
            colorMenuBackground: "#042e2a",
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
