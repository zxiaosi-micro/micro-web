// Audits.tsx · 审计中心（S4-05）：操作审计 + 指令审计两个 Tab（路由 logs / cmd-logs）。
// 追加式禁改删：本页只读；before/after JSON 展开查看；trace_id 支持排障互跳。两个 Tab 均走 ProTable。

import { useRef, useState } from "react";
import { Button, Input, Modal, Tabs, Tag, Typography } from "antd";
import type { ActionType, ProColumns } from "@ant-design/pro-components";
import { ProTable } from "@ant-design/pro-components";
import { get } from "@micro/shared";
import { getLocale, usePrefs } from "@micro/shared/prefs";
import type { AuditLogItem, CmdAuditItem } from "@micro/shared/types";

const PAGED = { defaultPageSize: 10, showSizeChanger: true, pageSizeOptions: [10, 20, 50, 100] };

export default function AuditsPage({ defaultTab = "logs" }: { defaultTab?: string }) {
  const { t } = usePrefs();
  return (
    <Tabs defaultActiveKey={defaultTab} items={[
      { key: "logs", label: t("audit.tabLogs"), children: <LogsTab /> },
      { key: "cmd", label: t("audit.tabCmds"), children: <CmdTab /> },
    ]} />
  );
}

function LogsTab() {
  const { t } = usePrefs();
  const [action, setAction] = useState("");
  const [uid, setUid] = useState("");
  const [jsonView, setJsonView] = useState<AuditLogItem | null>(null);
  const actionRef = useRef<ActionType | undefined>(undefined);

  const columns: ProColumns<AuditLogItem>[] = [
    { title: t("inv.time"), dataIndex: "created_at", render: (_, r) => new Date(r.created_at).toLocaleString(getLocale()) },
    { title: t("audit.action"), dataIndex: "action", render: (_, r) => <Tag>{r.action}</Tag> },
    { title: t("audit.operator"), dataIndex: "uid" },
    { title: t("audit.target"), render: (_, r) => (r.target_type ? `${r.target_type}:${r.target_id}` : "-") },
    { title: t("audit.result"), dataIndex: "result", render: (_, r) => (r.result === "OK" ? <Tag color="green">OK</Tag> : <Tag color="red">{r.result}</Tag>) },
    { title: "trace", dataIndex: "trace_id", ellipsis: true, render: (_, r) => r.trace_id || "-" },
    {
      title: t("audit.snapshot"),
      valueType: "option",
      render: (_, r) => [
        <Button key="view" size="small" type="link" onClick={() => setJsonView(r)}>{t("audit.viewDiff")}</Button>,
      ],
    },
  ];

  return (
    <>
      <ProTable<AuditLogItem>
        headerTitle={t("audit.tabLogs")}
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
          <Input.Search key="action" onSearch={(v) => setAction(v)} style={{ width: 200 }} allowClear placeholder={t("audit.actionPlaceholder")} />,
          <Input.Search key="uid" onSearch={(v) => setUid(v)} style={{ width: 160 }} allowClear placeholder={t("audit.uidPlaceholder")} />,
        ]}
      />
      <Modal title={t("audit.diffTitle")} open={jsonView !== null} onCancel={() => setJsonView(null)} footer={null} width={640}>
        {jsonView && (
          <>
            <Typography.Paragraph type="secondary">{`log_id=${jsonView.log_id} trace=${jsonView.trace_id || "-"}`}</Typography.Paragraph>
            <Typography.Text strong>before</Typography.Text>
            <pre style={{ background: "var(--hover-bg, #fafafa)", padding: 8, maxHeight: 200, overflow: "auto" }}>{pretty(jsonView.before_json)}</pre>
            <Typography.Text strong>after</Typography.Text>
            <pre style={{ background: "var(--hover-bg, #fafafa)", padding: 8, maxHeight: 200, overflow: "auto" }}>{pretty(jsonView.after_json)}</pre>
          </>
        )}
      </Modal>
    </>
  );
}

function CmdTab() {
  const { t } = usePrefs();
  const [sn, setSn] = useState("");
  const actionRef = useRef<ActionType | undefined>(undefined);

  const columns: ProColumns<CmdAuditItem>[] = [
    { title: t("inv.time"), dataIndex: "created_at", render: (_, r) => new Date(r.created_at).toLocaleString(getLocale()) },
    { title: t("audit.cmd"), dataIndex: "action" },
    { title: t("audit.deviceSn"), dataIndex: "sn" },
    { title: t("audit.dispatcher"), dataIndex: "uid" },
    {
      title: t("audit.result"),
      dataIndex: "result",
      render: (_, r) => (r.result === "FAILED" ? <Tag color="red">{r.result}</Tag> : <Tag color="green">{r.result}</Tag>),
    },
    { title: t("audit.error"), dataIndex: "error", render: (_, r) => r.error || "-" },
    { title: "trace", dataIndex: "trace_id", ellipsis: true, render: (_, r) => r.trace_id || "-" },
  ];

  return (
    <ProTable<CmdAuditItem>
      headerTitle={t("audit.tabCmds")}
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
        <Input.Search key="sn" onSearch={(v) => setSn(v)} style={{ width: 220 }} allowClear placeholder={t("audit.snPlaceholder")} />,
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
