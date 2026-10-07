// AppLayout.tsx · 数据驱动菜单布局 + step-up 全局 Modal（S3-04）。
//
// 菜单源：/auth/menus（identity 菜单树 → antd Menu）；AppLayout 只渲染，
// 不硬编码路由——菜单/权限全部服务端数据驱动（降权即时生效）。

import { useEffect, useState } from "react";
import { Layout, Menu, Modal, Button, Form, Input, App } from "antd";
import { LogoutOutlined } from "@ant-design/icons";
import { get, logout, stepUp } from "@micro/shared";
import type { MenuItem, MenusResp } from "@micro/shared/types";

interface AppLayoutProps {
  me: { uid: string; nickname: string };
  route: string;
  onNavigate: (route: string) => void;
  onLoggedOut: () => void;
  children: React.ReactNode;
}

interface TreeNode extends MenuItem {
  children: TreeNode[];
}

/** 平铺菜单 → 树（parent_id 关联；仅 type=1/2 参与渲染） */
function buildTree(items: MenuItem[]): TreeNode[] {
  const byId = new Map<string, TreeNode>();
  for (const m of items) {
    byId.set(m.menu_id, { ...m, children: [] });
  }
  const roots: TreeNode[] = [];
  for (const node of byId.values()) {
    const parent = byId.get(node.parent_id);
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

function toAntdItems(nodes: TreeNode[]): { key: string; label: string; path?: string; children?: unknown[] }[] {
  return nodes
    .filter((n) => n.status === 1)
    .sort((a, b) => a.sort - b.sort)
    .map((n) => ({
      key: n.path || n.menu_id,
      label: n.name,
      ...(n.children.length > 0 ? { children: toAntdItems(n.children) } : { path: n.path }),
    }));
}

/** path → hash route（/system/users → users） */
function routeOf(path: string): string {
  const seg = path.split("/").filter(Boolean);
  return seg[seg.length - 1] ?? "users";
}

export default function AppLayout(props: AppLayoutProps) {
  const { Header, Sider, Content } = Layout;
  const [menus, setMenus] = useState<TreeNode[]>([]);
  const [stepUpOpen, setStepUpOpen] = useState(false);
  const [form] = Form.useForm();
  const { message } = App.useApp();

  useEffect(() => {
    void get<MenusResp>("/auth/menus").then((resp) => setMenus(buildTree(resp.menus)));
    // 10406 提级事件（request.ts 全局分发）
    const onStepUp = () => setStepUpOpen(true);
    window.addEventListener("micro:stepup-required", onStepUp);
    return () => window.removeEventListener("micro:stepup-required", onStepUp);
  }, []);

  const onStepUpSubmit = async () => {
    const { password } = await form.validateFields();
    const result = await stepUp(password);
    if (result.ok) {
      message.success("二次验证通过,5 分钟内可执行敏感操作");
      setStepUpOpen(false);
      form.resetFields();
    } else {
      message.error(result.message ?? "二次验证失败");
    }
  };

  const onLogout = async () => {
    await logout();
    props.onLoggedOut();
  };

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", color: "#fff" }}>
        <span style={{ fontSize: 16, fontWeight: 600 }}>电池全生命周期平台 · 管理后台</span>
        <span style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <span>{props.me.nickname}（{props.me.uid}）</span>
          <Button ghost icon={<LogoutOutlined />} size="small" onClick={() => void onLogout()}>
            退出
          </Button>
        </span>
      </Header>
      <Layout>
        <Sider width={220} theme="light">
          <Menu
            mode="inline"
            selectedKeys={[props.route]}
            items={toAntdItems(menus)}
            onClick={({ key }) => props.onNavigate(routeOf(String(key)))}
            style={{ height: "100%" }}
          />
        </Sider>
        <Content style={{ padding: 24 }}>{props.children}</Content>
      </Layout>
      <Modal
        title="敏感操作二次验证"
        open={stepUpOpen}
        onOk={() => void onStepUpSubmit()}
        onCancel={() => setStepUpOpen(false)}
        okText="验证"
        cancelText="取消"
        destroyOnHidden
      >
        <Form form={form}>
          <Form.Item name="password" label="登录密码" rules={[{ required: true, message: "请输入登录密码" }]}>
            <Input.Password placeholder="验证登录密码,5 分钟内免二次验证" />
          </Form.Item>
        </Form>
      </Modal>
    </Layout>
  );
}
