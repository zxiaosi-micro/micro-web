// Tenants.tsx · 租户管理（S3-04：列表 + 配额 JSON 编辑）。ProTable + ModalForm。

import { useRef, useState } from "react";
import { App, Button, Form, Input, Popconfirm, Space, Tag } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import type { ActionType, ProColumns } from "@ant-design/pro-components";
import { ModalForm, ProFormSelect, ProFormText, ProTable } from "@ant-design/pro-components";
import { del, get, Perm, post, put } from "@micro/shared";
import type { TenantItem } from "@micro/shared/types";

const STATUS = { 1: { text: "正常", color: "green" }, 2: { text: "停用", color: "red" } } as const;

export default function TenantsPage() {
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
    message.success("已保存");
    setEditing(null);
    actionRef.current?.reload();
    return true;
  };

  const saveQuota = async (values: { quota: string }) => {
    try {
      JSON.parse(values.quota); // 前端先校验合法性（后端仍强校验）
    } catch {
      message.error("配额必须是合法 JSON");
      return false;
    }
    if (quotaEditing) {
      await put(`/tenants/${quotaEditing.tenant_id}/quota`, { quota: values.quota });
    }
    message.success("配额已更新");
    setQuotaEditing(null);
    actionRef.current?.reload();
    return true;
  };

  const columns: ProColumns<TenantItem>[] = [
    { title: "租户编码", dataIndex: "keyword", hideInTable: true, fieldProps: { placeholder: "编码/名称搜索" } },
    { title: "租户编码", dataIndex: "tenant_code", search: false },
    { title: "名称", dataIndex: "name", search: false },
    { title: "套餐", dataIndex: "plan", search: false, render: (_, t) => <Tag>{t.plan}</Tag> },
    {
      title: "状态",
      dataIndex: "status",
      search: false,
      render: (_, t) => (
        <Tag color={STATUS[t.status as keyof typeof STATUS]?.color}>
          {STATUS[t.status as keyof typeof STATUS]?.text ?? t.status}
        </Tag>
      ),
    },
    {
      title: "操作",
      valueType: "option",
      render: (_, t) => (
        <Space>
          <Perm code="system:tenant:update">
            <Button size="small" onClick={() => { setEditing(t); form.setFieldsValue(t); }}>编辑</Button>
          </Perm>
          <Perm code="system:tenant:quota">
            <Button size="small" onClick={() => { setQuotaEditing(t); quotaForm.setFieldsValue({ quota: t.quota || "{}" }); }}>配额</Button>
          </Perm>
          <Perm code="system:tenant:update">
            <Popconfirm title="确认删除该租户?" onConfirm={async () => {
              await del(`/tenants/${t.tenant_id}`);
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
      <ProTable<TenantItem>
        headerTitle="租户管理"
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
            <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditing("new"); form.resetFields(); }}>新建租户</Button>
          </Perm>,
        ]}
      />
      <ModalForm
        title={editing === "new" ? "新建租户" : "编辑租户"}
        open={editing !== null}
        onOpenChange={(o) => { if (!o) setEditing(null); }}
        form={form}
        modalProps={{ destroyOnHidden: true }}
        onFinish={submit}
      >
        <ProFormText name="tenant_code" label="租户编码" disabled={editing !== "new"} rules={[{ required: true, message: "必填" }]} />
        <ProFormText name="name" label="名称" rules={[{ required: true, message: "必填" }]} />
        <ProFormSelect name="plan" label="套餐" options={["STANDARD", "PRO", "ENTERPRISE"].map((v) => ({ value: v, label: v }))} />
        <ProFormSelect name="status" label="状态" options={[{ value: 1, label: "正常" }, { value: 2, label: "停用" }]} />
      </ModalForm>
      <ModalForm
        title={`配额设置（${quotaEditing?.name ?? ""}）`}
        open={quotaEditing !== null}
        onOpenChange={(o) => { if (!o) setQuotaEditing(null); }}
        form={quotaForm}
        modalProps={{ destroyOnHidden: true }}
        onFinish={saveQuota}
      >
        <Form.Item
          name="quota"
          label='配额 JSON（如 {"rpm":600,"user_max":100}；空值不限）'
          rules={[{ required: true, message: "必填" }]}
        >
          <Input.TextArea rows={4} style={{ fontFamily: "monospace" }} />
        </Form.Item>
      </ModalForm>
    </>
  );
}
