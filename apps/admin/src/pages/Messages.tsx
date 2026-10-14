// Messages.tsx · 消息中心（S4-05）：站内信列表/已读 + 模板维护 + 通知设置。路由 inbox。
// 收件箱/模板为 ProTable request；通知设置为拉全量小表，保留 antd Table。

import { useRef, useState } from "react";
import {
  App, Button, Form, Input, Select, Switch, Tabs, Tag, Typography,
} from "antd";
import { PlusOutlined } from "@ant-design/icons";
import type { ActionType, ProColumns } from "@ant-design/pro-components";
import { ModalForm, ProFormSelect, ProFormText, ProTable } from "@ant-design/pro-components";
import { get, Perm, post } from "@micro/shared";
import type { MessageItem, NotifySettingItem, TemplateItem } from "@micro/shared/types";

const PAGED = { defaultPageSize: 10, showSizeChanger: true, pageSizeOptions: [10, 20, 50, 100] };

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
  const actionRef = useRef<ActionType | undefined>(undefined);

  const columns: ProColumns<MessageItem>[] = [
    {
      title: "标题",
      dataIndex: "title",
      render: (_, r) => (r.is_read ? r.title : <Typography.Text strong>{r.title}</Typography.Text>),
    },
    { title: "内容", dataIndex: "content", ellipsis: true },
    { title: "来源", dataIndex: "biz_type", render: (_, r) => (r.biz_type ? <Tag>{r.biz_type.replace(/^tpl:/, "")}</Tag> : "-") },
    { title: "时间", dataIndex: "created_at", render: (_, r) => new Date(r.created_at).toLocaleString("zh-CN") },
    {
      title: "操作",
      valueType: "option",
      render: (_, r) => (r.is_read ? [] : [
        <Perm key="read" code="notification:message:read">
          <Button size="small" type="link" onClick={() => void markRead(r.message_id)}>标记已读</Button>
        </Perm>,
      ]),
    },
  ];

  const markRead = async (id: string) => {
    await post(`/messages/${id}/read`, {});
    message.success("已读");
    actionRef.current?.reload();
  };

  return (
    <ProTable<MessageItem>
      headerTitle="收件箱"
      rowKey="message_id"
      actionRef={actionRef}
      columns={columns}
      search={false}
      params={{ onlyUnread }}
      request={async (params) => {
        const resp = await get<{ list: MessageItem[]; total: number }>(
          `/messages?page=${params.current ?? 1}&size=${params.pageSize ?? 10}&only_unread=${onlyUnread}`,
        );
        return { data: resp.list, total: resp.total, success: true };
      }}
      pagination={PAGED}
      toolBarRender={() => [
        <Select
          key="unread"
          value={onlyUnread ? "unread" : "all"}
          style={{ width: 140 }}
          onChange={(v) => setOnlyUnread(v === "unread")}
          options={[{ value: "all", label: "全部" }, { value: "unread", label: "仅未读" }]}
        />,
      ]}
    />
  );
}

function TemplatesTab() {
  const { message } = App.useApp();
  const [createOpen, setCreateOpen] = useState(false);
  const [form] = Form.useForm();
  const actionRef = useRef<ActionType | undefined>(undefined);

  const columns: ProColumns<TemplateItem>[] = [
    { title: "编码", dataIndex: "code" },
    { title: "标题模板", dataIndex: "title_template" },
    { title: "渠道", dataIndex: "channel", render: (_, r) => <Tag>{r.channel}</Tag> },
    { title: "状态", dataIndex: "status", render: (_, r) => (r.status === 1 ? <Tag color="green">启用</Tag> : <Tag>停用</Tag>) },
  ];

  return (
    <>
      <ProTable<TemplateItem>
        headerTitle="模板"
        rowKey="template_id"
        actionRef={actionRef}
        columns={columns}
        search={false}
        request={async (params) => {
          const resp = await get<{ list: TemplateItem[]; total: number }>(
            `/notify-templates?page=${params.current ?? 1}&size=${params.pageSize ?? 10}`,
          );
          return { data: resp.list, total: resp.total, success: true };
        }}
        pagination={PAGED}
        toolBarRender={() => [
          <Perm key="create" code="notification:template:update">
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>新建/更新模板</Button>
          </Perm>,
        ]}
      />
      <ModalForm
        title="新建/更新模板"
        open={createOpen}
        onOpenChange={(o) => { if (!o) setCreateOpen(false); }}
        form={form}
        modalProps={{ destroyOnHidden: true }}
        onFinish={async (v) => {
          await post("/notify-templates", v);
          message.success("模板已保存(Upsert)");
          setCreateOpen(false);
          actionRef.current?.reload();
          return true;
        }}
      >
        <ProFormText name="code" label="模板编码" placeholder="如 order.paid" rules={[{ required: true }]} />
        <ProFormText name="title_template" label="标题模板" placeholder="支持 {{key}} 占位" rules={[{ required: true }]} />
        <Form.Item name="content_template" label="内容模板" rules={[{ required: true }]}>
          <Input.TextArea rows={3} />
        </Form.Item>
        <ProFormSelect
          name="channel"
          label="渠道"
          initialValue="INBOX"
          options={[{ value: "INBOX", label: "站内信" }, { value: "SMS", label: "短信(dev 桩)" }]}
        />
      </ModalForm>
    </>
  );
}

function SettingsTab() {
  const { message } = App.useApp();
  const [editOpen, setEditOpen] = useState(false);
  const [form] = Form.useForm();
  const actionRef = useRef<ActionType | undefined>(undefined);

  return (
    <>
      <ProTable
        headerTitle="通知设置"
        rowKey="template_code"
        actionRef={actionRef}
        search={false}
        options={false}
        pagination={false}
        request={async () => {
          const r = await get<{ list: NotifySettingItem[] }>("/notify-settings");
          return { data: r.list ?? [], total: 0, success: true };
        }}
        toolBarRender={() => [
          <Perm key="edit" code="notification:setting:update">
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditOpen(true)}>设置免打扰/静默</Button>
          </Perm>,
        ]}
        columns={[
          {
            title: "模板编码",
            dataIndex: "template_code",
            render: (_, r) => (r.template_code === "*" ? <Tag color="blue">全局默认</Tag> : r.template_code),
          },
          { title: "接收", dataIndex: "enabled", render: (_, r) => (r.enabled ? "是" : <Tag color="red">静默</Tag>) },
          { title: "免打扰时段", dataIndex: "quiet_hours", render: (_, r) => r.quiet_hours || "-" },
        ]}
      />
      <ModalForm
        title="通知设置"
        open={editOpen}
        onOpenChange={(o) => { if (!o) setEditOpen(false); }}
        form={form}
        modalProps={{ destroyOnHidden: true }}
        onFinish={async (v) => {
          await post("/notify-settings", { ...v, enabled: v.enabled ?? true });
          message.success("设置已保存");
          setEditOpen(false);
          actionRef.current?.reload();
          return true;
        }}
      >
        <ProFormText name="template_code" label="模板编码(*=全局)" initialValue="*" rules={[{ required: true }]} />
        <Form.Item name="enabled" label="接收通知" initialValue={true} valuePropName="checked">
          <Switch />
        </Form.Item>
        <ProFormText name="quiet_hours" label="免打扰时段 JSON" placeholder='{"start":"22:00","end":"08:00"}' />
      </ModalForm>
    </>
  );
}
