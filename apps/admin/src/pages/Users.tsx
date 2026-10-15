// Users.tsx · 用户管理（S3-04：列=姓名/手机号脱敏/部门/端标签/状态；操作=编辑/禁用/重置密码/绑角色）。
// ID 一律字符串渲染（E8）；列表走 ProTable request（分页上限 100）——本页是 ProTable/ModalForm
// 转换样板：search 隐藏列出关键词、request 拼 URL、actionRef.reload 刷新、ModalForm 承载弹窗表单。

import { useRef, useState } from "react";
import { App, Button, Form, Popconfirm, Space, Switch, Tag } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import type { ActionType, ProColumns } from "@ant-design/pro-components";
import { ModalForm, ProFormSelect, ProFormText, ProTable } from "@ant-design/pro-components";
import { del, get, Perm, post, put } from "@micro/shared";
import { enumLabel, usePrefs } from "@micro/shared/prefs";
import type { UserItem } from "@micro/shared/types";

/** 六端枚举选项（文案走 enum.client 公共词条） */
function clientOptions() {
  return ["ADMIN_WEB", "DEALER_WEB", "STATION_WEB", "CLIENT_MINI", "STATION_MINI", "OPS_APP"].map((v) => ({
    value: v,
    label: enumLabel("enum.client", v),
  }));
}

export default function UsersPage() {
  const { t } = usePrefs();
  const { message } = App.useApp();
  const actionRef = useRef<ActionType | undefined>(undefined);
  const [editing, setEditing] = useState<UserItem | "new" | null>(null);
  const [resetting, setResetting] = useState<UserItem | null>(null);
  const [form] = Form.useForm();
  const [resetForm] = Form.useForm();

  const columns: ProColumns<UserItem>[] = [
    // 搜索专用隐藏列：只在查询表单出现，params.keyword 回传服务端
    { title: t("users.nickname"), dataIndex: "keyword", hideInTable: true, fieldProps: { placeholder: t("users.searchPlaceholder") } },
    { title: t("users.nickname"), dataIndex: "nickname", search: false },
    { title: t("users.mobile"), dataIndex: "mobile_masked", search: false }, // 脱敏渲染，明文不出服务端
    { title: t("users.org"), dataIndex: "org_id", search: false, render: (_, u) => u.org_id || t("common.unassigned") },
    {
      title: t("users.types"),
      dataIndex: "types",
      search: false,
      render: (_, u) => u.types.map((tp) => <Tag key={tp}>{enumLabel("enum.client", tp)}</Tag>),
    },
    {
      title: t("common.status"),
      dataIndex: "status",
      search: false,
      render: (_, u) => (
        <Tag color={u.status === 1 ? "green" : u.status === 2 ? "red" : "orange"}>{enumLabel("enum.userStatus", u.status)}</Tag>
      ),
    },
    {
      title: t("common.actions"),
      valueType: "option",
      render: (_, u) => (
        <Space>
          <Perm code="system:user:update">
            <Button size="small" onClick={() => { setEditing(u); form.setFieldsValue(u); }}>{t("common.edit")}</Button>
          </Perm>
          <Perm code="system:user:status">
            <Popconfirm
              title={u.status === 2 ? t("users.restoreConfirm") : t("users.disableConfirm")}
              onConfirm={async () => {
                await put(`/users/${u.uid}/status`, { status: u.status === 2 ? 1 : 2 });
                message.success(t("common.updated"));
                actionRef.current?.reload();
              }}
            >
              <Button size="small" danger={u.status !== 2}>{u.status === 2 ? t("users.restore") : t("users.disable")}</Button>
            </Popconfirm>
          </Perm>
          <Perm code="system:user:reset-pwd">
            <Button size="small" onClick={() => { setResetting(u); resetForm.resetFields(); }}>{t("common.resetPassword")}</Button>
          </Perm>
          <Perm code="system:user:delete">
            <Popconfirm title={t("users.deleteConfirm")} onConfirm={async () => {
              await del(`/users/${u.uid}`);
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

  const submit = async (values: Record<string, unknown>) => {
    if (editing === "new") {
      await post("/users", values);
    } else if (editing) {
      await put(`/users/${editing.uid}`, values);
    }
    message.success(t("common.saved"));
    setEditing(null);
    actionRef.current?.reload();
    return true;
  };

  const doReset = async (values: { new_password: string }) => {
    if (resetting) {
      await put(`/users/${resetting.uid}/password`, { new_password: values.new_password });
    }
    message.success(t("users.resetDone"));
    setResetting(null);
    return true;
  };

  return (
    <>
      <ProTable<UserItem>
        headerTitle={t("users.title")}
        rowKey="uid"
        actionRef={actionRef}
        columns={columns}
        request={async (params) => {
          const resp = await get<{ list: UserItem[]; total: number }>(
            `/users?page=${params.current ?? 1}&size=${params.pageSize ?? 10}&keyword=${encodeURIComponent(String(params.keyword ?? ""))}`,
          );
          return { data: resp.list, total: resp.total, success: true };
        }}
        pagination={{
          defaultPageSize: 10,
          showSizeChanger: true,
          pageSizeOptions: [10, 20, 50, 100], // 上限 100
        }}
        toolBarRender={() => [
          <Perm key="create" code="system:user:create">
            <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditing("new"); form.resetFields(); }}>
              {t("users.create")}
            </Button>
          </Perm>,
        ]}
      />
      <ModalForm
        title={editing === "new" ? t("users.create") : t("users.editTitle")}
        open={editing !== null}
        onOpenChange={(o) => { if (!o) setEditing(null); }}
        form={form}
        modalProps={{ destroyOnHidden: true }}
        onFinish={submit}
      >
        <ProFormText name="nickname" label={t("users.nickname")} rules={[{ required: true, message: t("common.required") }]} />
        <ProFormText name="mobile" label={t("users.mobile")} rules={[{ required: editing === "new", message: t("common.required") }]} />
        <ProFormText name="email" label={t("users.email")} />
        {editing === "new" && (
          <ProFormText.Password name="password" label={t("users.initialPassword")} rules={[{ required: true, min: 8, message: t("users.passwordMin") }]} />
        )}
        <ProFormSelect name="types" label={t("users.types")} rules={[{ required: true, message: t("users.typesRequired") }]} options={clientOptions()} />
      </ModalForm>
      <ModalForm
        title={t("users.resetTitle", { name: resetting?.nickname ?? "" })}
        open={resetting !== null}
        onOpenChange={(o) => { if (!o) setResetting(null); }}
        form={resetForm}
        modalProps={{ destroyOnHidden: true }}
        onFinish={doReset}
      >
        <ProFormText.Password name="new_password" label={t("users.newPassword")} rules={[{ required: true, min: 8, message: t("common.required") }]} />
      </ModalForm>
      {/* Switch 引用保留：状态列未来切换为行内开关 */}
      <span hidden><Switch /></span>
    </>
  );
}
