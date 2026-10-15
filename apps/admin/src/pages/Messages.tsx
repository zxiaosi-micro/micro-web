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
import { getLocale, usePrefs } from "@micro/shared/prefs";
import type { MessageItem, NotifySettingItem, TemplateItem } from "@micro/shared/types";

const PAGED = { defaultPageSize: 10, showSizeChanger: true, pageSizeOptions: [10, 20, 50, 100] };

export default function MessagesPage() {
  const { t } = usePrefs();
  return (
    <Tabs defaultActiveKey="inbox" items={[
      { key: "inbox", label: t("msg.tabInbox"), children: <InboxTab /> },
      { key: "templates", label: t("msg.tabTemplates"), children: <TemplatesTab /> },
      { key: "settings", label: t("msg.tabSettings"), children: <SettingsTab /> },
    ]} />
  );
}

function InboxTab() {
  const { t } = usePrefs();
  const { message } = App.useApp();
  const [onlyUnread, setOnlyUnread] = useState(false);
  const actionRef = useRef<ActionType | undefined>(undefined);

  const columns: ProColumns<MessageItem>[] = [
    {
      title: t("msg.title"),
      dataIndex: "title",
      render: (_, r) => (r.is_read ? r.title : <Typography.Text strong>{r.title}</Typography.Text>),
    },
    { title: t("msg.content"), dataIndex: "content", ellipsis: true },
    { title: t("msg.source"), dataIndex: "biz_type", render: (_, r) => (r.biz_type ? <Tag>{r.biz_type.replace(/^tpl:/, "")}</Tag> : "-") },
    { title: t("parties.time"), dataIndex: "created_at", render: (_, r) => new Date(r.created_at).toLocaleString(getLocale()) },
    {
      title: t("common.actions"),
      valueType: "option",
      render: (_, r) => (r.is_read ? [] : [
        <Perm key="read" code="notification:message:read">
          <Button size="small" type="link" onClick={() => void markRead(r.message_id)}>{t("msg.markRead")}</Button>
        </Perm>,
      ]),
    },
  ];

  const markRead = async (id: string) => {
    await post(`/messages/${id}/read`, {});
    message.success(t("msg.read"));
    actionRef.current?.reload();
  };

  return (
    <ProTable<MessageItem>
      headerTitle={t("msg.tabInbox")}
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
          options={[{ value: "all", label: t("msg.all") }, { value: "unread", label: t("msg.unreadOnly") }]}
        />,
      ]}
    />
  );
}

function TemplatesTab() {
  const { t } = usePrefs();
  const { message } = App.useApp();
  const [createOpen, setCreateOpen] = useState(false);
  const [form] = Form.useForm();
  const actionRef = useRef<ActionType | undefined>(undefined);

  const columns: ProColumns<TemplateItem>[] = [
    { title: t("msg.code"), dataIndex: "code" },
    { title: t("msg.titleTemplate"), dataIndex: "title_template" },
    { title: t("msg.channel"), dataIndex: "channel", render: (_, r) => <Tag>{r.channel}</Tag> },
    { title: t("common.status"), dataIndex: "status", render: (_, r) => (r.status === 1 ? <Tag color="green">{t("msg.enabled")}</Tag> : <Tag>{t("msg.disabled")}</Tag>) },
  ];

  return (
    <>
      <ProTable<TemplateItem>
        headerTitle={t("msg.tabTemplates")}
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
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>{t("msg.upsert")}</Button>
          </Perm>,
        ]}
      />
      <ModalForm
        title={t("msg.upsert")}
        open={createOpen}
        onOpenChange={(o) => { if (!o) setCreateOpen(false); }}
        form={form}
        modalProps={{ destroyOnHidden: true }}
        onFinish={async (v) => {
          await post("/notify-templates", v);
          message.success(t("msg.tplSaved"));
          setCreateOpen(false);
          actionRef.current?.reload();
          return true;
        }}
      >
        <ProFormText name="code" label={t("msg.tplCode")} placeholder={t("msg.tplCodePlaceholder")} rules={[{ required: true, message: t("common.required") }]} />
        <ProFormText name="title_template" label={t("msg.titleTemplate")} placeholder={t("msg.tplTitlePlaceholder")} rules={[{ required: true, message: t("common.required") }]} />
        <Form.Item name="content_template" label={t("msg.contentTemplate")} rules={[{ required: true, message: t("common.required") }]}>
          <Input.TextArea rows={3} />
        </Form.Item>
        <ProFormSelect
          name="channel"
          label={t("msg.channel")}
          initialValue="INBOX"
          options={[{ value: "INBOX", label: t("msg.chInbox") }, { value: "SMS", label: t("msg.chSms") }]}
        />
      </ModalForm>
    </>
  );
}

function SettingsTab() {
  const { t } = usePrefs();
  const { message } = App.useApp();
  const [editOpen, setEditOpen] = useState(false);
  const [form] = Form.useForm();
  const actionRef = useRef<ActionType | undefined>(undefined);

  return (
    <>
      <ProTable
        headerTitle={t("msg.tabSettings")}
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
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditOpen(true)}>{t("msg.editSetting")}</Button>
          </Perm>,
        ]}
        columns={[
          {
            title: t("msg.tplCode"),
            dataIndex: "template_code",
            render: (_, r) => (r.template_code === "*" ? <Tag color="blue">{t("msg.globalDefault")}</Tag> : r.template_code),
          },
          { title: t("msg.receiver"), dataIndex: "enabled", render: (_, r) => (r.enabled ? t("msg.yes") : <Tag color="red">{t("msg.silent")}</Tag>) },
          { title: t("msg.quietHours"), dataIndex: "quiet_hours", render: (_, r) => r.quiet_hours || "-" },
        ]}
      />
      <ModalForm
        title={t("msg.settingTitle")}
        open={editOpen}
        onOpenChange={(o) => { if (!o) setEditOpen(false); }}
        form={form}
        modalProps={{ destroyOnHidden: true }}
        onFinish={async (v) => {
          await post("/notify-settings", { ...v, enabled: v.enabled ?? true });
          message.success(t("msg.settingSaved"));
          setEditOpen(false);
          actionRef.current?.reload();
          return true;
        }}
      >
        <ProFormText name="template_code" label={t("msg.tplCodeGlobal")} initialValue="*" rules={[{ required: true, message: t("common.required") }]} />
        <Form.Item name="enabled" label={t("msg.receiveNotify")} initialValue={true} valuePropName="checked">
          <Switch />
        </Form.Item>
        <ProFormText name="quiet_hours" label={t("msg.quietHoursJson")} placeholder='{"start":"22:00","end":"08:00"}' />
      </ModalForm>
    </>
  );
}
