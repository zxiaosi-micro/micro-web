// Tenants.tsx · 租户管理（S3-04：列表 + 配额 JSON 编辑）。ProTable + ModalForm。

import { useRef, useState } from "react";
import { App, Button, Form, Input, Popconfirm, Space, Tag } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import type { ActionType, ProColumns } from "@ant-design/pro-components";
import { ModalForm, ProFormSelect, ProFormText, ProTable } from "@ant-design/pro-components";
import { del, get, Perm, post, put } from "@micro/shared";
import { usePrefs } from "@micro/shared/prefs";
import type { TenantItem } from "@micro/shared/types";

export default function TenantsPage() {
  const { t } = usePrefs();
  const { message } = App.useApp();
  const actionRef = useRef<ActionType | undefined>(undefined);
  const [editing, setEditing] = useState<TenantItem | "new" | null>(null);
  const [quotaEditing, setQuotaEditing] = useState<TenantItem | null>(null);
  const [form] = Form.useForm();
  const [quotaForm] = Form.useForm();

  const submit = async (values: Record<string, unknown>) => {
    if (editing === "new") {
      await post("/tenants", values);
    } else if (editing) {
      await put(`/tenants/${editing.tenant_id}`, values);
    }
    message.success(t("common.saved"));
    setEditing(null);
    actionRef.current?.reload();
    return true;
  };

  const saveQuota = async (values: { quota: string }) => {
    try {
      JSON.parse(values.quota); // 前端先校验合法性（后端仍强校验）
    } catch {
      message.error(t("tenants.quotaInvalid"));
      return false;
    }
    if (quotaEditing) {
      await put(`/tenants/${quotaEditing.tenant_id}/quota`, { quota: values.quota });
    }
    message.success(t("tenants.quotaUpdated"));
    setQuotaEditing(null);
    actionRef.current?.reload();
    return true;
  };

  const columns: ProColumns<TenantItem>[] = [
    { title: t("tenants.code"), dataIndex: "keyword", hideInTable: true, fieldProps: { placeholder: t("tenants.searchPlaceholder") } },
    { title: t("tenants.code"), dataIndex: "tenant_code", search: false },
    { title: t("tenants.name"), dataIndex: "name", search: false },
    { title: t("tenants.plan"), dataIndex: "plan", search: false, render: (_, item) => <Tag>{item.plan}</Tag> },
    {
      title: t("common.status"),
      dataIndex: "status",
      search: false,
      render: (_, item) => (
        <Tag color={item.status === 1 ? "green" : "red"}>{item.status === 1 ? t("tenants.active") : t("tenants.disabled")}</Tag>
      ),
    },
    {
      title: t("common.actions"),
      valueType: "option",
      render: (_, item) => (
        <Space>
          <Perm code="system:tenant:update">
            <Button size="small" onClick={() => { setEditing(item); form.setFieldsValue(item); }}>{t("common.edit")}</Button>
          </Perm>
          <Perm code="system:tenant:quota">
            <Button size="small" onClick={() => { setQuotaEditing(item); quotaForm.setFieldsValue({ quota: item.quota || "{}" }); }}>{t("tenants.quota")}</Button>
          </Perm>
          <Perm code="system:tenant:update">
            <Popconfirm title={t("tenants.deleteConfirm")} onConfirm={async () => {
              await del(`/tenants/${item.tenant_id}`);
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
      <ProTable<TenantItem>
        headerTitle={t("tenants.title")}
        rowKey="tenant_id"
        actionRef={actionRef}
        columns={columns}
        request={async (params) => {
          const resp = await get<{ list: TenantItem[]; total: number }>(
            `/tenants?page=${params.current ?? 1}&size=${params.pageSize ?? 10}&keyword=${encodeURIComponent(String(params.keyword ?? ""))}`,
          );
          return { data: resp.list, total: resp.total, success: true };
        }}
        pagination={{ defaultPageSize: 10, showSizeChanger: true, pageSizeOptions: [10, 20, 50, 100] }}
        toolBarRender={() => [
          <Perm key="create" code="system:tenant:create">
            <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditing("new"); form.resetFields(); }}>{t("tenants.create")}</Button>
          </Perm>,
        ]}
      />
      <ModalForm
        title={editing === "new" ? t("tenants.create") : t("tenants.editTitle")}
        open={editing !== null}
        onOpenChange={(o) => { if (!o) setEditing(null); }}
        form={form}
        modalProps={{ destroyOnHidden: true }}
        onFinish={submit}
      >
        <ProFormText name="tenant_code" label={t("tenants.code")} disabled={editing !== "new"} rules={[{ required: true, message: t("common.required") }]} />
        <ProFormText name="name" label={t("tenants.name")} rules={[{ required: true, message: t("common.required") }]} />
        <ProFormSelect name="plan" label={t("tenants.plan")} options={["STANDARD", "PRO", "ENTERPRISE"].map((v) => ({ value: v, label: v }))} />
        <ProFormSelect name="status" label={t("common.status")} options={[{ value: 1, label: t("tenants.active") }, { value: 2, label: t("tenants.disabled") }]} />
      </ModalForm>
      <ModalForm
        title={t("tenants.quotaTitle", { name: quotaEditing?.name ?? "" })}
        open={quotaEditing !== null}
        onOpenChange={(o) => { if (!o) setQuotaEditing(null); }}
        form={quotaForm}
        modalProps={{ destroyOnHidden: true }}
        onFinish={saveQuota}
      >
        <Form.Item
          name="quota"
          label={t("tenants.quotaLabel")}
          rules={[{ required: true, message: t("common.required") }]}
        >
          <Input.TextArea rows={4} style={{ fontFamily: "monospace" }} />
        </Form.Item>
      </ModalForm>
    </>
  );
}
