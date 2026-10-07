// Sessions.tsx · 会话管理（S3-04：在线列表 + 踢下线；usePolling 10s 自动刷新）。

import { useState } from "react";
import { App, Button, Input, Popconfirm, Space, Table, Tag, Typography } from "antd";
import { get, post, Perm, usePolling } from "@micro/shared";
import type { SessionItem } from "@micro/shared/types";

const CLIENT_LABEL: Record<string, string> = {
  ADMIN_WEB: "管理后台",
  DEALER_WEB: "经销商",
  STATION_WEB: "场站",
  CLIENT_MINI: "客户端小程序",
  STATION_MINI: "场站小程序",
  OPS_APP: "运维 App",
};

export default function SessionsPage() {
  const { message } = App.useApp();
  const [uid, setUid] = useState("");
  const { data, refresh } = usePolling(
    () => get<{ list: SessionItem[] }>(`/sessions?page=1&size=100&uid=${encodeURIComponent(uid)}`),
    { intervalMs: 10_000 }, // 10s 在线列表轮询（02 §7.5）
  );

  const kick = async (sid: string) => {
    const resp = await post<{ kicked: number }>("/sessions/kick", { sid });
    message.success(`已踢下线 ${resp.kicked} 个会话`);
    refresh();
  };

  const columns = [
    { title: "会话 ID", dataIndex: "sid", key: "sid", render: (v: string) => <span style={{ fontFamily: "monospace" }}>{v}</span> },
    { title: "登录端", dataIndex: "client", key: "client", render: (c: string) => <Tag>{CLIENT_LABEL[c] ?? c}</Tag> },
    {
      title: "登录时间",
      dataIndex: "created_at",
      key: "created_at",
      render: (v: string) => (v ? new Date(Number(v)).toLocaleString("zh-CN") : "-"),
    },
    {
      title: "操作",
      key: "actions",
      render: (_: unknown, s: SessionItem) => (
        <Perm code="system:session:kick">
          <Popconfirm title="确认踢该会话下线?" onConfirm={() => void kick(s.sid)}>
            <Button size="small" danger>踢下线</Button>
          </Popconfirm>
        </Perm>
      ),
    },
  ];

  return (
    <>
      <Typography.Title level={4}>会话管理</Typography.Title>
      <Space style={{ marginBottom: 16 }}>
        <Input.Search
          placeholder="按用户 UID 查询（空=当前用户）"
          allowClear
          onSearch={(v) => setUid(v.trim())}
          style={{ width: 280 }}
        />
        <Button onClick={refresh}>立即刷新</Button>
      </Space>
      <Table rowKey="sid" columns={columns} dataSource={data?.list ?? []} pagination={false} />
    </>
  );
}
