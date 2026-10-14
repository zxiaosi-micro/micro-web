// Sessions.tsx · 会话管理（S3-04：在线列表 + 踢下线；usePolling 10s 自动刷新）。
// 轮询数据源（非分页 request）→ ProTable dataSource 模式；UID 搜索走 toolBarRender。

import { useState } from "react";
import { App, Button, Input, Popconfirm, Tag } from "antd";
import { get, post, Perm, usePolling } from "@micro/shared";
import { ProTable } from "@ant-design/pro-components";
import type { ProColumns } from "@ant-design/pro-components";
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
  const { data, refresh, loading } = usePolling(
    () => get<{ list: SessionItem[] }>(`/sessions?page=1&size=100&uid=${encodeURIComponent(uid)}`),
    { intervalMs: 10_000 }, // 10s 在线列表轮询（02 §7.5）
  );

  const kick = async (sid: string) => {
    const resp = await post<{ kicked: number }>("/sessions/kick", { sid });
    message.success(`已踢下线 ${resp.kicked} 个会话`);
    refresh();
  };

  const columns: ProColumns<SessionItem>[] = [
    {
      title: "会话 ID",
      dataIndex: "sid",
      render: (_, s) => <span style={{ fontFamily: "monospace" }}>{s.sid}</span>,
    },
    { title: "登录端", dataIndex: "client", render: (_, s) => <Tag>{CLIENT_LABEL[s.client] ?? s.client}</Tag> },
    {
      title: "登录时间",
      dataIndex: "created_at",
      render: (_, s) => (s.created_at ? new Date(Number(s.created_at)).toLocaleString("zh-CN") : "-"),
    },
    {
      title: "操作",
      valueType: "option",
      render: (_, s) => (
        <Perm code="system:session:kick">
          <Popconfirm title="确认踢该会话下线?" onConfirm={() => void kick(s.sid)}>
            <Button size="small" danger>踢下线</Button>
          </Popconfirm>
        </Perm>
      ),
    },
  ];

  return (
    <ProTable<SessionItem>
      headerTitle="会话管理"
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
          placeholder="按用户 UID 查询（空=当前用户）"
          allowClear
          onSearch={(v) => setUid(v.trim())}
          style={{ width: 280 }}
        />,
      ]}
    />
  );
}
