// Audits.tsx · 审计中心（S4-05）：操作审计 + 指令审计两个 Tab（路由 logs / cmd-logs）。
// 追加式禁改删：本页只读；before/after JSON 展开查看；trace_id 支持排障互跳。

import { useMemo, useState } from "react";
import { Button, Input, Modal, Space, Table, Tabs, Tag, Typography } from "antd";
import { ReloadOutlined } from "@ant-design/icons";
import { get, usePaged } from "@micro/shared";
import type { AuditLogItem, CmdAuditItem } from "@micro/shared/types";

export default function AuditsPage({ defaultTab = "logs" }: { defaultTab?: string }) {
  return (
    <Tabs defaultActiveKey={defaultTab} items={[
      { key: "logs", label: "操作审计", children: <LogsTab /> },
      { key: "cmd", label: "指令审计", children: <CmdTab /> },
    ]} />
  );
}

function LogsTab() {
  const [action, setAction] = useState("");
  const [uid, setUid] = useState("");
  const [jsonView, setJsonView] = useState<AuditLogItem | null>(null);
  const { list, total, page, size, loading, setPage, setSize, refresh } = usePaged<AuditLogItem>(
    (p) => get<{ list: AuditLogItem[]; total: number }>(
      `/audit-logs?page=${p.page}&size=${p.size}&action=${encodeURIComponent(action)}&uid=${uid}`,
    ),
  );

  const columns = useMemo(() => [
    { title: "时间", dataIndex: "created_at", render: (v: number) => new Date(v).toLocaleString("zh-CN") },
    { title: "动作", dataIndex: "action", render: (v: string) => <Tag>{v}</Tag> },
    { title: "操作人", dataIndex: "uid" },
    { title: "目标", render: (_: unknown, r: AuditLogItem) => (r.target_type ? `${r.target_type}:${r.target_id}` : "-") },
    { title: "结果", dataIndex: "result", render: (v: string) => (v === "OK" ? <Tag color="green">OK</Tag> : <Tag color="red">{v}</Tag>) },
    { title: "trace", dataIndex: "trace_id", ellipsis: true, render: (v: string) => v || "-" },
    {
      title: "快照",
      render: (_: unknown, r: AuditLogItem) => (
        <Button size="small" type="link" onClick={() => setJsonView(r)}>before/after</Button>
      ),
    },
  ], []);

  return (
    <>
      <Space style={{ marginBottom: 16 }}>
        <Input.Search onSearch={(v) => { setAction(v); setPage(1); }} style={{ width: 200 }} allowClear placeholder="动作(如 auth.login)" />
        <Input.Search onSearch={(v) => { setUid(v); setPage(1); }} style={{ width: 160 }} allowClear placeholder="操作人 uid" />
        <Button icon={<ReloadOutlined />} onClick={refresh}>刷新</Button>
      </Space>
      <Table rowKey="log_id" size="small" columns={columns} dataSource={list} loading={loading}
        pagination={{ current: page, pageSize: size, total, showSizeChanger: true, onChange: (p, s) => { setPage(p); setSize(s); } }} />
      <Modal title="变更快照(追加式禁改删)" open={jsonView !== null} onCancel={() => setJsonView(null)} footer={null} width={640}>
        {jsonView && (
          <>
            <Typography.Paragraph type="secondary">{`log_id=${jsonView.log_id} trace=${jsonView.trace_id || "-"}`}</Typography.Paragraph>
            <Typography.Text strong>before</Typography.Text>
            <pre style={{ background: "#fafafa", padding: 8, maxHeight: 200, overflow: "auto" }}>{pretty(jsonView.before_json)}</pre>
            <Typography.Text strong>after</Typography.Text>
            <pre style={{ background: "#fafafa", padding: 8, maxHeight: 200, overflow: "auto" }}>{pretty(jsonView.after_json)}</pre>
          </>
        )}
      </Modal>
    </>
  );
}

function CmdTab() {
  const [sn, setSn] = useState("");
  const { list, total, page, size, loading, setPage, setSize, refresh } = usePaged<CmdAuditItem>(
    (p) => get<{ list: CmdAuditItem[]; total: number }>(`/cmd-logs?page=${p.page}&size=${p.size}&sn=${encodeURIComponent(sn)}`),
  );
  return (
    <>
      <Space style={{ marginBottom: 16 }}>
        <Input.Search onSearch={(v) => { setSn(v); setPage(1); }} style={{ width: 220 }} allowClear placeholder="设备序列号" />
        <Button icon={<ReloadOutlined />} onClick={refresh}>刷新</Button>
      </Space>
      <Table rowKey="cmd_audit_id" size="small" columns={[
        { title: "时间", dataIndex: "created_at", render: (v: number) => new Date(v).toLocaleString("zh-CN") },
        { title: "指令", dataIndex: "action" },
        { title: "设备 SN", dataIndex: "sn" },
        { title: "下发人", dataIndex: "uid" },
        {
          title: "结果", dataIndex: "result",
          render: (v: string) => (v === "FAILED" ? <Tag color="red">{v}</Tag> : <Tag color="green">{v}</Tag>),
        },
        { title: "错误", dataIndex: "error", render: (v: string) => v || "-" },
        { title: "trace", dataIndex: "trace_id", ellipsis: true, render: (v: string) => v || "-" },
      ]} dataSource={list} loading={loading}
        pagination={{ current: page, pageSize: size, total, showSizeChanger: true, onChange: (p, s) => { setPage(p); setSize(s); } }} />
    </>
  );
}

function pretty(s: string): string {
  if (!s) return "-";
  try {
    return JSON.stringify(JSON.parse(s), null, 2);
  } catch {
    return s;
  }
}
