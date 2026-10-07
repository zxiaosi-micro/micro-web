// Tenants.tsx · 租户管理（S3-04：列表 + 配额 JSON 编辑）。

import { useState } from "react";
import { App, Button, Form, Input, Modal, Popconfirm, Select, Space, Table, Tag, Typography } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { del, get, Perm, post, put, usePaged } from "@micro/shared";
import type { TenantItem } from "@micro/shared/types";

const STATUS = { 1: { text: "正常", color: "green" }, 2: { text: "停用", color: "red" } } as const;

export default function TenantsPage() {
  const { message } = App.useApp();
  const [keyword, setKeyword] = useState("");
  const { list, total, page, size, loading, setPage, setSize, refresh } = usePaged<TenantItem>(
    (p) => get(`/tenants?page=${p.page}&size=${p.size}&keyword=${encodeURIComponent(keyword)}`),
  );
  const [editing, setEditing] = useState<TenantItem | "new" | null>(null);
  const [quotaEditing, setQuotaEditing] = useState<TenantItem | null>(null);
  const [form] = Form.useForm();
  const [quotaForm] = Form.useForm();

  const submit = async () => {
    const values = await form.validateFields();
    if (editing === "new") {
      await post("/tenants", values);
    } else if (editing) {
      await put(`/tenants/${editing.tenant_id}`, values);
    }
    message.success("已保存");
    setEditing(null);
    refresh();
  };

  const saveQuota = async () => {
    const { quota } = await quotaForm.validateFields();
    try {
      JSON.parse(quota); // 前端先校验合法性（后端仍强校验）
    } catch {
      message.error("配额必须是合法 JSON");
      return;
    }
    if (quotaEditing) {
      await put(`/tenants/${quotaEditing.tenant_id}/quota`, { quota });
    }
    message.success("配额已更新");
    setQuotaEditing(null);
    refresh();
  };

  const columns = [
    { title: "租户编码", dataIndex: "tenant_code", key: "tenant_code" },
    { title: "名称", dataIndex: "name", key: "name" },
    { title: "套餐", dataIndex: "plan", key: "plan", render: (v: string) => <Tag>{v}</Tag> },
    {
      title: "状态",
      dataIndex: "status",
      key: "status",
      render: (s: number) => <Tag color={STATUS[s as keyof typeof STATUS]?.color}>{STATUS[s as keyof typeof STATUS]?.text ?? s}</Tag>,
    },
    {
      title: "操作",
      key: "actions",
      render: (_: unknown, t: TenantItem) => (
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
      <Typography.Title level={4}>租户管理</Typography.Title>
      <Space style={{ marginBottom: 16 }}>
        <Input.Search placeholder="编码/名称搜索" allowClear onSearch={(v) => { setKeyword(v); setPage(1); }} style={{ width: 240 }} />
        <Perm code="system:tenant:create">
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditing("new"); form.resetFields(); }}>新建租户</Button>
        </Perm>
      </Space>
      <Table
        rowKey="tenant_id"
        columns={columns}
        dataSource={list}
        loading={loading}
        pagination={{ current: page, pageSize: size, total, showSizeChanger: true, pageSizeOptions: [10, 20, 50, 100], onChange: (p, s) => { setPage(p); setSize(s); } }}
      />
      <Modal title={editing === "new" ? "新建租户" : "编辑租户"} open={editing !== null} onOk={() => void submit()} onCancel={() => setEditing(null)} destroyOnHidden>
        <Form form={form} layout="vertical">
          <Form.Item name="tenant_code" label="租户编码" rules={[{ required: true, message: "必填" }]}>
            <Input disabled={editing !== "new"} />
          </Form.Item>
          <Form.Item name="name" label="名称" rules={[{ required: true, message: "必填" }]}>
            <Input />
          </Form.Item>
          <Form.Item name="plan" label="套餐">
            <Select options={["STANDARD", "PRO", "ENTERPRISE"].map((v) => ({ value: v, label: v }))} />
          </Form.Item>
          <Form.Item name="status" label="状态">
            <Select options={[{ value: 1, label: "正常" }, { value: 2, label: "停用" }]} />
          </Form.Item>
        </Form>
      </Modal>
      <Modal title={`配额设置（${quotaEditing?.name ?? ""}）`} open={quotaEditing !== null} onOk={() => void saveQuota()} onCancel={() => setQuotaEditing(null)} destroyOnHidden>
        <Form form={quotaForm} layout="vertical">
          <Form.Item
            name="quota"
            label='配额 JSON（如 {"rpm":600,"user_max":100}；空值不限）'
            rules={[{ required: true, message: "必填" }]}
          >
            <Input.TextArea rows={4} style={{ fontFamily: "monospace" }} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
