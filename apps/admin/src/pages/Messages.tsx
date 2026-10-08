// Messages.tsx · 消息中心（S4-05）：站内信列表/已读 + 模板维护 + 通知设置。路由 inbox。

import { useEffect, useState } from "react";
import {
  App, Button, Form, Input, Modal, Select, Space, Switch, Table, Tabs, Tag, Typography,
} from "antd";
import { PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import { get, Perm, post, usePaged } from "@micro/shared";
import type { MessageItem, NotifySettingItem, TemplateItem } from "@micro/shared/types";

export default function MessagesPage() {
  return (
    <Tabs defaultActiveKey="inbox" items={[
      { key: "inbox", label: "收件箱", children: <InboxTab /> },
      { key: "templates", label: "模板", children: <TemplatesTab /> },
      { key: "settings", label: "通知设置", children: <SettingsTab /> },
    ]} />
  );
}

function InboxTab() {
  const { message } = App.useApp();
  const [onlyUnread, setOnlyUnread] = useState(false);
  const { list, total, page, size, loading, setPage, setSize, refresh } = usePaged<MessageItem>(
    (p) => get<{ list: MessageItem[]; total: number }>(`/messages?page=${p.page}&size=${p.size}&only_unread=${onlyUnread}`),
  );

  const markRead = async (id: string) => {
    await post(`/messages/${id}/read`, {});
    message.success("已读");
    refresh();
  };

  return (
    <>
      <Space style={{ marginBottom: 16 }}>
        <Select value={onlyUnread ? "unread" : "all"} style={{ width: 140 }}
          onChange={(v) => setOnlyUnread(v === "unread")}
          options={[{ value: "all", label: "全部" }, { value: "unread", label: "仅未读" }]} />
        <Button icon={<ReloadOutlined />} onClick={refresh}>刷新</Button>
      </Space>
      <Table rowKey="message_id" columns={[
        { title: "标题", dataIndex: "title", render: (v: string, r: MessageItem) => (r.is_read ? v : <Typography.Text strong>{v}</Typography.Text>) },
        { title: "内容", dataIndex: "content", ellipsis: true },
        { title: "来源", dataIndex: "biz_type", render: (v: string) => (v ? <Tag>{v.replace(/^tpl:/, "")}</Tag> : "-") },
        { title: "时间", dataIndex: "created_at", render: (v: number) => new Date(v).toLocaleString("zh-CN") },
        {
          title: "操作",
          render: (_: unknown, r: MessageItem) => (r.is_read ? null : (
            <Perm code="notification:message:read">
              <Button size="small" type="link" onClick={() => void markRead(r.message_id)}>标记已读</Button>
            </Perm>
          )),
        },
      ]} dataSource={list} loading={loading}
        pagination={{ current: page, pageSize: size, total, showSizeChanger: true, onChange: (p, s) => { setPage(p); setSize(s); } }} />
    </>
  );
}

function TemplatesTab() {
  const { message } = App.useApp();
  const [createOpen, setCreateOpen] = useState(false);
  const [form] = Form.useForm();
  const { list, total, page, size, loading, setPage, setSize, refresh } = usePaged<TemplateItem>(
    (p) => get<{ list: TemplateItem[]; total: number }>(`/notify-templates?page=${p.page}&size=${p.size}`),
  );

  const submit = async () => {
    const v = await form.validateFields();
    await post("/notify-templates", v);
    message.success("模板已保存(Upsert)");
    setCreateOpen(false);
    refresh();
  };

  return (
    <>
      <Space style={{ marginBottom: 16 }}>
        <Perm code="notification:template:update">
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>新建/更新模板</Button>
        </Perm>
        <Button icon={<ReloadOutlined />} onClick={refresh}>刷新</Button>
      </Space>
      <Table rowKey="template_id" columns={[
        { title: "编码", dataIndex: "code" },
        { title: "标题模板", dataIndex: "title_template" },
        { title: "渠道", dataIndex: "channel", render: (v: string) => <Tag>{v}</Tag> },
        { title: "状态", dataIndex: "status", render: (v: number) => (v === 1 ? <Tag color="green">启用</Tag> : <Tag>停用</Tag>) },
      ]} dataSource={list} loading={loading}
        pagination={{ current: page, pageSize: size, total, showSizeChanger: true, onChange: (p, s) => { setPage(p); setSize(s); } }} />
      <Modal title="新建/更新模板" open={createOpen} onOk={() => void submit()} onCancel={() => setCreateOpen(false)} destroyOnHidden>
        <Form form={form} layout="vertical">
          <Form.Item name="code" label="模板编码" rules={[{ required: true }]}><Input placeholder="如 order.paid" /></Form.Item>
          <Form.Item name="title_template" label="标题模板" rules={[{ required: true }]}><Input placeholder="支持 {{key}} 占位" /></Form.Item>
          <Form.Item name="content_template" label="内容模板" rules={[{ required: true }]}><Input.TextArea rows={3} /></Form.Item>
          <Form.Item name="channel" label="渠道" initialValue="INBOX">
            <Select options={[{ value: "INBOX", label: "站内信" }, { value: "SMS", label: "短信(dev 桩)" }]} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}

function SettingsTab() {
  const { message } = App.useApp();
  const [settings, setSettings] = useState<NotifySettingItem[]>([]);
  const [editOpen, setEditOpen] = useState(false);
  const [form] = Form.useForm();

  const load = async () => {
    const r = await get<{ list: NotifySettingItem[] }>("/notify-settings");
    setSettings(r.list ?? []);
  };

  useEffect(() => {
    void load();
  }, []);

  const submit = async () => {
    const v = await form.validateFields();
    await post("/notify-settings", { ...v, enabled: v.enabled ?? true });
    message.success("设置已保存");
    setEditOpen(false);
    void load();
  };

  return (
    <>
      <Space style={{ marginBottom: 16 }}>
        <Perm code="notification:setting:update">
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditOpen(true)}>设置免打扰/静默</Button>
        </Perm>
        <Button icon={<ReloadOutlined />} onClick={() => void load()}>刷新</Button>
      </Space>
      <Table rowKey="template_code" pagination={false} dataSource={settings} columns={[
        { title: "模板编码", dataIndex: "template_code", render: (v: string) => (v === "*" ? <Tag color="blue">全局默认</Tag> : v) },
        { title: "接收", dataIndex: "enabled", render: (v: boolean) => (v ? "是" : <Tag color="red">静默</Tag>) },
        { title: "免打扰时段", dataIndex: "quiet_hours", render: (v: string) => v || "-" },
      ]} />
      <Modal title="通知设置" open={editOpen} onOk={() => void submit()} onCancel={() => setEditOpen(false)} destroyOnHidden>
        <Form form={form} layout="vertical">
          <Form.Item name="template_code" label="模板编码(*=全局)" initialValue="*" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="enabled" label="接收通知" initialValue={true}><Switch /></Form.Item>
          <Form.Item name="quiet_hours" label="免打扰时段 JSON"><Input placeholder='{"start":"22:00","end":"08:00"}' /></Form.Item>
        </Form>
      </Modal>
    </>
  );
}
