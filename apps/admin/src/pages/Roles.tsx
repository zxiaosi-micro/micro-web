// Roles.tsx · 角色管理（S3-04：菜单权限树 + data_scope 编辑）。ProTable + ModalForm。

import { useEffect, useRef, useState } from "react";
import { App, Button, Form, Input, Popconfirm, Radio, Space, Tree } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import type { ActionType, ProColumns } from "@ant-design/pro-components";
import { ModalForm, ProFormText, ProTable } from "@ant-design/pro-components";
import { del, get, Perm, post, put } from "@micro/shared";
import { usePrefs } from "@micro/shared/prefs";
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
  const { t } = usePrefs();
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
    message.success(t("roles.saved"));
    setEditing(null);
    actionRef.current?.reload();
    return true;
  };

  const columns: ProColumns<RoleItem>[] = [
    { title: t("roles.code"), dataIndex: "code", search: false },
    { title: t("roles.name"), dataIndex: "name", search: false },
    { title: t("roles.dataScope"), dataIndex: "data_scope", search: false },
    { title: t("roles.remark"), dataIndex: "remark", search: false },
    {
      title: t("common.actions"),
      valueType: "option",
      render: (_, r) => (
        <Space>
          <Perm code="system:role:update">
            <Button size="small" onClick={() => void openEdit(r)}>{t("common.edit")}</Button>
          </Perm>
          <Perm code="system:role:delete">
            <Popconfirm title={t("roles.deleteConfirm")} onConfirm={async () => {
              await del(`/roles/${r.role_id}`);
              message.success(t("common.deleted"));
              actionRef.current?.reload();
            }}>
              <Button size="small" danger type="link">{t("common.delete")}</Button>
            </Popconfirm>
          </Perm>
        </Space>
      ),
    },
  ];

  return (
    <>
      <ProTable<RoleItem>
        headerTitle={t("roles.title")}
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
            <Button type="primary" icon={<PlusOutlined />} onClick={() => void openEdit("new")}>{t("roles.create")}</Button>
          </Perm>,
        ]}
      />
      <ModalForm
        title={editing === "new" ? t("roles.create") : t("roles.editTitle")}
        open={editing !== null}
        onOpenChange={(o) => { if (!o) setEditing(null); }}
        form={form}
        modalProps={{ destroyOnHidden: true, width: 640 }}
        onFinish={submit}
      >
        <ProFormText
          name="code"
          label={t("roles.code")}
          disabled={editing !== "new"}
          placeholder={t("roles.codePlaceholder")}
          rules={[{ required: true, message: t("common.required") }]}
        />
        <ProFormText name="name" label={t("roles.name")} rules={[{ required: true, message: t("common.required") }]} />
        <Form.Item name="data_scope_type" label={t("roles.dataScope")}>
          <Radio.Group
            options={[
              { value: "ALL", label: t("roles.scopeAll") },
              { value: "ORG", label: t("roles.scopeOrg") },
              { value: "SELF", label: t("roles.scopeSelf") },
            ]}
          />
        </Form.Item>
        <Form.Item name="remark" label={t("roles.remark")}>
          <Input.TextArea rows={2} />
        </Form.Item>
        <Form.Item label={t("roles.menuTree")}>
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
