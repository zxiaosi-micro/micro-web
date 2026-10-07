// Roles.tsx · 角色管理（S3-04：菜单权限树 + data_scope 编辑）。

import { useEffect, useState } from "react";
import {
  App, Button, Form, Input, Modal, Popconfirm, Radio, Space, Table, Tree, Typography,
} from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { del, get, Perm, post, put, usePaged } from "@micro/shared";
import type { MenuItem, RoleItem } from "@micro/shared/types";
import type { DataNode } from "antd/es/tree";

interface RoleDetail {
  role: RoleItem;
  menu_ids: string[];
}

/** 平铺菜单 → TreeData（四级节点均可授权：目录/菜单/按钮/接口） */
function toTreeData(items: MenuItem[]): DataNode[] {
  const byId = new Map<string, MenuItem[]>();
  for (const m of items) {
    const arr = byId.get(m.parent_id) ?? [];
    arr.push(m);
    byId.set(m.parent_id, arr);
  }
  const build = (parentId: string): DataNode[] =>
    (byId.get(parentId) ?? []).map((n) => ({
      key: n.menu_id,
      title: `${n.name}${n.perm_code ? `（${n.perm_code}）` : ""}`,
      children: build(n.menu_id),
    }));
  return build("0");
}

export default function RolesPage() {
  const { message } = App.useApp();
  const { list, total, page, size, loading, setPage, setSize, refresh } = usePaged<RoleItem>(
    (p) => get(`/roles?page=${p.page}&size=${p.size}`),
  );
  const [editing, setEditing] = useState<RoleItem | "new" | null>(null);
  const [menuTree, setMenuTree] = useState<ReturnType<typeof toTreeData>>([]);
  const [checkedKeys, setCheckedKeys] = useState<string[]>([]);
  const [form] = Form.useForm();

  useEffect(() => {
    void get<{ list: MenuItem[] }>("/menus").then((resp) => setMenuTree(toTreeData(resp.list)));
  }, []);

  const openEdit = async (role: RoleItem | "new") => {
    setEditing(role);
    form.resetFields();
    if (role === "new") {
      setCheckedKeys([]);
      form.setFieldsValue({ data_scope_type: "SELF" });
    } else {
      const detail = await get<RoleDetail>(`/roles/${role.role_id}`);
      setCheckedKeys(detail.menu_ids);
      // data_scope JSON → 表单（type + org_ids）
      let scopeType = "SELF";
      try {
        const parsed = JSON.parse(detail.role.data_scope || "{}") as { type?: string };
        scopeType = parsed.type ?? "SELF";
      } catch {
        // keep default
      }
      form.setFieldsValue({ ...detail.role, data_scope_type: scopeType });
    }
  };

  const submit = async () => {
    const values = await form.validateFields();
    const data_scope = JSON.stringify({ type: values.data_scope_type });
    if (editing === "new") {
      await post("/roles", { ...values, data_scope, menu_ids: checkedKeys });
    } else if (editing) {
      await put(`/roles/${editing.role_id}`, { ...values, data_scope, menu_ids: checkedKeys });
    }
    message.success("已保存（相关用户权限即时刷新）");
    setEditing(null);
    refresh();
  };

  const columns = [
    { title: "角色码", dataIndex: "code", key: "code" },
    { title: "角色名", dataIndex: "name", key: "name" },
    { title: "数据域", dataIndex: "data_scope", key: "data_scope", render: (v: string) => v },
    { title: "备注", dataIndex: "remark", key: "remark" },
    {
      title: "操作",
      key: "actions",
      render: (_: unknown, r: RoleItem) => (
        <Space>
          <Perm code="system:role:update">
            <Button size="small" onClick={() => void openEdit(r)}>编辑</Button>
          </Perm>
          <Perm code="system:role:delete">
            <Popconfirm title="确认删除该角色?" onConfirm={async () => {
              await del(`/roles/${r.role_id}`);
              message.success("已删除");
              refresh();
            }}>
              <Button size="small" danger type="link">删除</Button>
            </Popconfirm>
          </Perm>
        </Space>
      ),
    },
  ];

  return (
    <>
      <Typography.Title level={4}>角色管理</Typography.Title>
      <Space style={{ marginBottom: 16 }}>
        <Perm code="system:role:create">
          <Button type="primary" icon={<PlusOutlined />} onClick={() => void openEdit("new")}>新建角色</Button>
        </Perm>
      </Space>
      <Table
        rowKey="role_id"
        columns={columns}
        dataSource={list}
        loading={loading}
        pagination={{ current: page, pageSize: size, total, showSizeChanger: true, pageSizeOptions: [10, 20, 50, 100], onChange: (p, s) => { setPage(p); setSize(s); } }}
      />
      <Modal
        title={editing === "new" ? "新建角色" : "编辑角色"}
        open={editing !== null}
        onOk={() => void submit()}
        onCancel={() => setEditing(null)}
        width={640}
        destroyOnHidden
      >
        <Form form={form} layout="vertical">
          <Form.Item name="code" label="角色码" rules={[{ required: true, message: "必填" }]}>
            <Input disabled={editing !== "new"} placeholder="admin 等（唯一）" />
          </Form.Item>
          <Form.Item name="name" label="角色名" rules={[{ required: true, message: "必填" }]}>
            <Input />
          </Form.Item>
          <Form.Item name="data_scope_type" label="数据域">
            <Radio.Group
              options={[
                { value: "ALL", label: "全部数据" },
                { value: "ORG", label: "本组织" },
                { value: "SELF", label: "仅本人" },
              ]}
            />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item label="菜单权限树">
            <Tree
              checkable
              defaultExpandAll
              checkedKeys={checkedKeys}
              onCheck={(keys) => setCheckedKeys(keys as string[])}
              treeData={menuTree}
            />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
