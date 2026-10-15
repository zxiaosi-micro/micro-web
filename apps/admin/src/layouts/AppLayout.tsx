// AppLayout.tsx · 数据驱动菜单布局 + step-up 全局 Modal（S3-04）+ 偏好切换器。
//
// 菜单源：/auth/menus（identity 菜单树 → ProLayout）；AppLayout 只渲染，
// 不硬编码路由——菜单/权限全部服务端数据驱动（降权即时生效）。
// 菜单名 i18n：服务端下发中文名，按路由末段映射 nav.* 词条，miss 回退原中文名。
// 布局壳走 ProLayout（移动端自动收进抽屉）；路由与登录态由 react-router / zustand 承担。

import { useEffect, useMemo, useState } from "react";
import { App, Dropdown, Form, Input, Modal } from "antd";
import { LogoutOutlined, SafetyOutlined, UserOutlined } from "@ant-design/icons";
import { ProLayout } from "@ant-design/pro-components";
import { Outlet, useLocation, useNavigate } from "react-router";
import { get, stepUp } from "@micro/shared";
import { brandStyle, PageTransition, PrefSwitcher } from "@micro/shared/theme";
import { t, usePrefs } from "@micro/shared/prefs";
import type { MenuItem, MenusResp } from "@micro/shared/types";
import zhDict from "../locales/zh-CN";
import { useAuthStore } from "../store/auth";
import { BRAND } from "../brand";

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

/** path → hash route（/system/users → users；路由末段 = App.tsx 的页面 key） */
function routeOf(path: string): string {
  const seg = path.split("/").filter(Boolean);
  return seg[seg.length - 1] ?? "users";
}

/** 服务端菜单名 → 词条：路由末段命中 nav.*（zh 正本存在该 key）才翻译，否则回退原中文名 */
function menuName(n: TreeNode): string {
  const seg = (n.path || "").split("/").filter(Boolean).pop();
  const key = seg ? `nav.${seg}` : "";
  return key && key in zhDict ? t(key) : n.name;
}

interface MenuDataItem {
  path: string;
  name: string;
  children?: MenuDataItem[];
}

/** 树 → ProLayout 菜单数据；叶子 path 归一为单段（location 按 last segment 匹配选中态） */
function toMenuData(nodes: TreeNode[]): MenuDataItem[] {
  return nodes
    .filter((n) => n.status === 1)
    .sort((a, b) => a.sort - b.sort)
    .map((n) => ({
      path: n.children.length > 0 ? n.path || n.menu_id : `/${routeOf(n.path || n.menu_id)}`,
      name: menuName(n),
      ...(n.children.length > 0 ? { children: toMenuData(n.children) } : {}),
    }));
}

export default function AppLayout() {
  const { t } = usePrefs();
  const location = useLocation();
  const navigate = useNavigate();
  const me = useAuthStore((s) => s.me)!;
  const signOut = useAuthStore((s) => s.signOut);
  const [menus, setMenus] = useState<TreeNode[]>([]);
  const [stepUpOpen, setStepUpOpen] = useState(false);
  // 移动端抽屉开合（ProLayout isMobile 时 sider 即抽屉；点菜单后手动收起）
  const [collapsed, setCollapsed] = useState(() => window.innerWidth < 768);
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
      message.success(t("layout.stepUpOk"));
      setStepUpOpen(false);
      form.resetFields();
    } else {
      message.error(result.message ?? t("layout.stepUpFail"));
    }
  };

  const onLogout = async () => {
    await signOut();
  };

  const menuData = useMemo(() => toMenuData(menus), [menus]);

  return (
    <div style={{ minHeight: "100vh", ...brandStyle(BRAND) }}>
      <ProLayout
        title={t("app.title")}
        logo={<span className="brand-logo-mark"><SafetyOutlined /></span>}
        layout="mix"
        fixSiderbar
        fixedHeader
        siderWidth={216}
        collapsed={collapsed}
        onCollapse={setCollapsed}
        location={{ pathname: location.pathname }}
        route={{ path: "/", routes: menuData }}
        menu={{ locale: false }}
        actionsRender={() => [<PrefSwitcher key="prefs" />]}
        menuItemRender={(item, dom) => (
          <div onClick={() => {
            if (window.innerWidth < 768) setCollapsed(true);
            if (item.path) navigate(`/${routeOf(item.path)}`);
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
            colorMenuBackground: "#0a1c46",
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
      <Modal
        title={t("layout.stepUpTitle")}
        open={stepUpOpen}
        onOk={() => void onStepUpSubmit()}
        onCancel={() => setStepUpOpen(false)}
        okText={t("layout.verify")}
        cancelText={t("common.cancel")}
        destroyOnHidden
      >
        <Form form={form}>
          <Form.Item name="password" label={t("layout.loginPassword")} rules={[{ required: true, message: t("layout.passwordRequired") }]}>
            <Input.Password placeholder={t("layout.passwordPlaceholder")} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
