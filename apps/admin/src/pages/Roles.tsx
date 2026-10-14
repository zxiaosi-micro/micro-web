// Roles.tsx · 角色管理（S3-04：菜单权限树 + data_scope 编辑）。ProTable + ModalForm。

import { useEffect, useRef, useState } from "react";
import { App, Button, Form, Input, Popconfirm, Radio, Space, Tree } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import type { ActionType, ProColumns } from "@ant-design/pro-components";
import { ModalForm, ProFormText, ProTable } from "@ant-design/pro-components";
import { del, get, Perm, post, put } from "@micro/shared";
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
  const actionRef = useRef<ActionType | undefined>(undefined);
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

  const submit = async (values: Record<string, unknown>) => {
    const data_scope = JSON.stringify({ type: values.data_scope_type });
    if (editing === "new") {
      await post("/roles", { ...values, data_scope, menu_ids: checkedKeys });
    } else if (editing) {
      await put(`/roles/${editing.role_id}`, { ...values, data_scope, menu_ids: checkedKeys });
    }
    message.success("已保存（相关用户权限即时刷新）");
    setEditing(null);
    actionRef.current?.reload();
    return true;
  };

  const columns: ProColumns<RoleItem>[] = [
    { title: "角色码", dataIndex: "code", search: false },
    { title: "角色名", dataIndex: "name", search: false },
    { title: "数据域", dataIndex: "data_scope", search: false },
    { title: "备注", dataIndex: "remark", search: false },
    {
      title: "操作",
      valueType: "option",
      render: (_, r) => (
        <Space>
          <Perm code="system:role:update">
            <Button size="small" onClick={() => void openEdit(r)}>编辑</Button>
          </Perm>
          <Perm code="system:role:delete">
            <Popconfirm title="确认删除该角色?" onConfirm={async () => {
              await del(`/roles/${r.role_id}`);
              message.success("已删除");
              actionRef.current?.reload();
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
      <ProTable<RoleItem>
        headerTitle="角色管理"
        rowKey="role_id"
        actionRef={actionRef}
        columns={columns}
        search={false}
        request={async (params) => {
          const resp = await get<{ list: RoleItem[]; total: number }>(
            `/roles?page=${params.current ?? 1}&size=${params.pageSize ?? 10}`,
          );
          return { data: resp.list, total: resp.total, success: true };
        }}
        pagination={{ defaultPageSize: 10, showSizeChanger: true, pageSizeOptions: [10, 20, 50, 100] }}
        toolBarRender={() => [
          <Perm key="create" code="system:role:create">
            <Button type="primary" icon={<PlusOutlined />} onClick={() => void openEdit("new")}>新建角色</Button>
          </Perm>,
        ]}
      />
      <ModalForm
        title={editing === "new" ? "新建角色" : "编辑角色"}
        open={editing !== null}
        onOpenChange={(o) => { if (!o) setEditing(null); }}
        form={form}
        modalProps={{ destroyOnHidden: true, width: 640 }}
        onFinish={submit}
      >
        <ProFormText
          name="code"
          label="角色码"
          disabled={editing !== "new"}
          placeholder="admin 等（唯一）"
          rules={[{ required: true, message: "必填" }]}
        />
        <ProFormText name="name" label="角色名" rules={[{ required: true, message: "必填" }]} />
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
      </ModalForm>
    </>
  );
}
