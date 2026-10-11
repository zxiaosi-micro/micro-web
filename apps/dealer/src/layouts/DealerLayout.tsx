// DealerLayout.tsx · 经销商端布局（S9-04）：Sider 静态菜单 + Header 用户 + 退出。
// 菜单静态写死——数据驱动菜单（/auth/menus）是 admin 的事；经销商端页面集合固定（01 §8.3 七页，登录不进菜单）。

import { Button, Layout, Menu } from "antd";
import {
  AppstoreOutlined,
  DashboardOutlined,
  FileDoneOutlined,
  LogoutOutlined,
  ShoppingOutlined,
  ToolOutlined,
  UnorderedListOutlined,
} from "@ant-design/icons";
import type { ReactNode } from "react";
import { logout } from "@micro/shared";
import type { MeResp } from "@micro/shared/types";

const { Header, Sider, Content } = Layout;

/** 静态菜单（6 项，对应 7 页减登录页；key = hash 路由） */
const MENU_ITEMS = [
  { key: "workbench", icon: <DashboardOutlined />, label: "工作台" },
  { key: "catalog", icon: <AppstoreOutlined />, label: "商品目录" },
  { key: "order-create", icon: <ShoppingOutlined />, label: "下单" },
  { key: "orders", icon: <UnorderedListOutlined />, label: "我的订单" },
  { key: "service", icon: <ToolOutlined />, label: "代客服务" },
  { key: "reconcile", icon: <FileDoneOutlined />, label: "对账" },
];

interface DealerLayoutProps {
  me: MeResp;
  route: string;
  onNavigate: (route: string) => void;
  onLoggedOut: () => void;
  children: ReactNode;
}

export default function DealerLayout(props: DealerLayoutProps) {
  const onLogout = async () => {
    await logout();
    props.onLoggedOut();
  };

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", color: "#fff" }}>
        <span style={{ fontSize: 16, fontWeight: 600 }}>电池全生命周期平台 · 经销商端</span>
        <span style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <span>{props.me.nickname}（{props.me.uid}）</span>
          <Button ghost icon={<LogoutOutlined />} size="small" onClick={() => void onLogout()}>
            退出
          </Button>
        </span>
      </Header>
      <Layout>
        <Sider width={200} theme="light">
          <Menu
            mode="inline"
            selectedKeys={[props.route]}
            items={MENU_ITEMS}
            onClick={({ key }) => props.onNavigate(String(key))}
            style={{ height: "100%" }}
          />
        </Sider>
        <Content style={{ padding: 24 }}>{props.children}</Content>
      </Layout>
    </Layout>
  );
}
