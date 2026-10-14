// Audits.tsx · 审计中心（S4-05）：操作审计 + 指令审计两个 Tab（路由 logs / cmd-logs）。
// 追加式禁改删：本页只读；before/after JSON 展开查看；trace_id 支持排障互跳。两个 Tab 均走 ProTable。

import { useRef, useState } from "react";
import { Button, Input, Modal, Tabs, Tag, Typography } from "antd";
import type { ActionType, ProColumns } from "@ant-design/pro-components";
import { ProTable } from "@ant-design/pro-components";
import { get } from "@micro/shared";
import type { AuditLogItem, CmdAuditItem } from "@micro/shared/types";

const PAGED = { defaultPageSize: 10, showSizeChanger: true, pageSizeOptions: [10, 20, 50, 100] };

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
  const actionRef = useRef<ActionType | undefined>(undefined);

  const columns: ProColumns<AuditLogItem>[] = [
    { title: "时间", dataIndex: "created_at", render: (_, r) => new Date(r.created_at).toLocaleString("zh-CN") },
    { title: "动作", dataIndex: "action", render: (_, r) => <Tag>{r.action}</Tag> },
    { title: "操作人", dataIndex: "uid" },
    { title: "目标", render: (_, r) => (r.target_type ? `${r.target_type}:${r.target_id}` : "-") },
    { title: "结果", dataIndex: "result", render: (_, r) => (r.result === "OK" ? <Tag color="green">OK</Tag> : <Tag color="red">{r.result}</Tag>) },
    { title: "trace", dataIndex: "trace_id", ellipsis: true, render: (_, r) => r.trace_id || "-" },
    {
      title: "快照",
      valueType: "option",
      render: (_, r) => [
        <Button key="view" size="small" type="link" onClick={() => setJsonView(r)}>before/after</Button>,
      ],
    },
  ];

  return (
    <>
      <ProTable<AuditLogItem>
        headerTitle="操作审计"
        rowKey="log_id"
        size="small"
        actionRef={actionRef}
        columns={columns}
        search={false}
        params={{ action, uid }}
        request={async (params) => {
          const resp = await get<{ list: AuditLogItem[]; total: number }>(
            `/audit-logs?page=${params.current ?? 1}&size=${params.pageSize ?? 10}&action=${encodeURIComponent(action)}&uid=${uid}`,
          );
          return { data: resp.list, total: resp.total, success: true };
        }}
        pagination={PAGED}
        toolBarRender={() => [
          <Input.Search key="action" onSearch={(v) => setAction(v)} style={{ width: 200 }} allowClear placeholder="动作(如 auth.login)" />,
          <Input.Search key="uid" onSearch={(v) => setUid(v)} style={{ width: 160 }} allowClear placeholder="操作人 uid" />,
        ]}
      />
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
  const actionRef = useRef<ActionType | undefined>(undefined);

  const columns: ProColumns<CmdAuditItem>[] = [
    { title: "时间", dataIndex: "created_at", render: (_, r) => new Date(r.created_at).toLocaleString("zh-CN") },
    { title: "指令", dataIndex: "action" },
    { title: "设备 SN", dataIndex: "sn" },
    { title: "下发人", dataIndex: "uid" },
    {
      title: "结果",
      dataIndex: "result",
      render: (_, r) => (r.result === "FAILED" ? <Tag color="red">{r.result}</Tag> : <Tag color="green">{r.result}</Tag>),
    },
    { title: "错误", dataIndex: "error", render: (_, r) => r.error || "-" },
    { title: "trace", dataIndex: "trace_id", ellipsis: true, render: (_, r) => r.trace_id || "-" },
  ];

  return (
    <ProTable<CmdAuditItem>
      headerTitle="指令审计"
      rowKey="cmd_audit_id"
      size="small"
      actionRef={actionRef}
      columns={columns}
      search={false}
      params={{ sn }}
      request={async (params) => {
        const resp = await get<{ list: CmdAuditItem[]; total: number }>(
          `/cmd-logs?page=${params.current ?? 1}&size=${params.pageSize ?? 10}&sn=${encodeURIComponent(sn)}`,
        );
        return { data: resp.list, total: resp.total, success: true };
      }}
      pagination={PAGED}
      toolBarRender={() => [
        <Input.Search key="sn" onSearch={(v) => setSn(v)} style={{ width: 220 }} allowClear placeholder="设备序列号" />,
      ]}
    />
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
