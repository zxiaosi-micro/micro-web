// Sessions.tsx · 会话管理（S3-04：在线列表 + 踢下线；usePolling 10s 自动刷新）。
// 轮询数据源（非分页 request）→ ProTable dataSource 模式；UID 搜索走 toolBarRender。

import { useState } from "react";
import { App, Button, Input, Popconfirm, Tag } from "antd";
import { get, post, Perm, usePolling } from "@micro/shared";
import { enumLabel, getLocale, usePrefs } from "@micro/shared/prefs";
import { ProTable } from "@ant-design/pro-components";
import type { ProColumns } from "@ant-design/pro-components";
import type { SessionItem } from "@micro/shared/types";

export default function SessionsPage() {
  const { t } = usePrefs();
  const { message } = App.useApp();
  const [uid, setUid] = useState("");
  const { data, refresh, loading } = usePolling(
    () => get<{ list: SessionItem[] }>(`/sessions?page=1&size=100&uid=${encodeURIComponent(uid)}`),
    { intervalMs: 10_000 }, // 10s 在线列表轮询（02 §7.5）
  );

  const kick = async (sid: string) => {
    const resp = await post<{ kicked: number }>("/sessions/kick", { sid });
    message.success(t("sessions.kicked", { count: resp.kicked }));
    refresh();
  };

  const columns: ProColumns<SessionItem>[] = [
    {
      title: t("sessions.sid"),
      dataIndex: "sid",
      render: (_, s) => <span style={{ fontFamily: "monospace" }}>{s.sid}</span>,
    },
    { title: t("sessions.client"), dataIndex: "client", render: (_, s) => <Tag>{enumLabel("enum.client", s.client)}</Tag> },
    {
      title: t("sessions.loginAt"),
      dataIndex: "created_at",
      render: (_, s) => (s.created_at ? new Date(Number(s.created_at)).toLocaleString(getLocale()) : "-"),
    },
    {
      title: t("common.actions"),
      valueType: "option",
      render: (_, s) => (
        <Perm code="system:session:kick">
          <Popconfirm title={t("sessions.kickConfirm")} onConfirm={() => void kick(s.sid)}>
            <Button size="small" danger>{t("sessions.kick")}</Button>
          </Popconfirm>
        </Perm>
      ),
    },
  ];

  return (
    <ProTable<SessionItem>
      headerTitle={t("sessions.title")}
      rowKey="sid"
      columns={columns}
      dataSource={data?.list ?? []}
      loading={loading}
      search={false}
      options={{ reload: true, density: true, setting: true }}
      pagination={false}
      toolBarRender={() => [
        <Input.Search
          key="uid-search"
          placeholder={t("sessions.uidPlaceholder")}
          allowClear
          onSearch={(v) => setUid(v.trim())}
          style={{ width: 280 }}
        />,
      ]}
    />
  );
}
