// DownloadCenter.tsx · 下载中心（S8-03/05）：异步导出任务列表 + 发起导出 + 产物下载。
// 导出走 export_requested 事件管道（analytics 渲染 → file 归档）；下载 base64 信封 → Blob。
// 列表走 ProTable request；发起导出为 ModalForm（日期选择器保留 antd Form.Item）。

import { useRef, useState } from "react";
import {
  App, Button, DatePicker, Form, Input, Tag, Tooltip,
} from "antd";
import { DownloadOutlined, PlusOutlined } from "@ant-design/icons";
import type { ActionType, ProColumns } from "@ant-design/pro-components";
import { ModalForm, ProFormSelect, ProTable } from "@ant-design/pro-components";
import { get, Perm, post } from "@micro/shared";
import { usePrefs } from "@micro/shared/prefs";
import type { ExportItem } from "@micro/shared/types";

const REPORT_TYPES: { value: string; labelKey: string }[] = [
  { value: "sales", labelKey: "dl.rtSales" },
  { value: "inventory", labelKey: "dl.rtInventory" },
  { value: "warranty", labelKey: "dl.rtWarranty" },
  { value: "sla", labelKey: "dl.rtSla" },
  { value: "finance", labelKey: "dl.rtFinance" },
  { value: "station", labelKey: "dl.rtStation" },
  { value: "event_ledger", labelKey: "dl.rtLedger" },
];

const STATUS_TAG: Record<string, { color: string; key: string }> = {
  PENDING: { color: "default", key: "dl.stPending" },
  RUNNING: { color: "processing", key: "dl.stRunning" },
  DONE: { color: "success", key: "dl.stDone" },
  FAILED: { color: "error", key: "dl.stFailed" },
};

function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// base64 → Blob 下载（BFF 信封传输；受控下载走 Bearer 会话，无临时令牌暴露）。
function saveBase64File(b64: string, fileName: string, contentType: string) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes], { type: contentType }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

export default function DownloadCenterPage() {
  const { t } = usePrefs();
  const { message } = App.useApp();
  const [createOpen, setCreateOpen] = useState(false);
  const [form] = Form.useForm();
  const [downloading, setDownloading] = useState<string>();
  const actionRef = useRef<ActionType | undefined>(undefined);

  const download = async (item: ExportItem) => {
    setDownloading(item.export_id);
    try {
      const out = await get<{ file_id: string; file_name: string; content_type: string; data: string }>(
        `/exports/${item.export_id}/download`,
      );
      saveBase64File(out.data, out.file_name || item.file_name || "export", out.content_type || "application/octet-stream");
    } finally {
      setDownloading(undefined);
    }
  };

  const columns: ProColumns<ExportItem>[] = [
    { title: t("dl.taskId"), dataIndex: "export_id", width: 170 },
    { title: t("dl.report"), dataIndex: "report_type", width: 120, render: (_, r) => { const m = REPORT_TYPES.find((x) => x.value === r.report_type); return m ? t(m.labelKey) : r.report_type; } },
    { title: t("dl.format"), dataIndex: "format", width: 80, render: (_, r) => <Tag>{r.format}</Tag> },
    { title: t("dl.dateRange"), width: 200, render: (_, r) => `${r.date_start} ~ ${r.date_end}` },
    {
      title: t("common.status"),
      dataIndex: "status",
      width: 100,
      render: (_, r) => {
        const s = STATUS_TAG[r.status];
        return <Tag color={s?.color ?? "default"}>{s ? t(s.key) : r.status}</Tag>;
      },
    },
    { title: t("dl.rowCount"), dataIndex: "row_count", width: 90 },
    { title: t("dl.cost"), dataIndex: "cost_ms", width: 90, render: (_, r) => (r.cost_ms ? `${r.cost_ms}ms` : "-") },
    { title: t("dl.file"), dataIndex: "file_name", ellipsis: true, render: (_, r) => (r.file_name ? <Tooltip title={r.file_name}>{r.file_name}</Tooltip> : "-") },
    {
      title: t("common.actions"),
      width: 100,
      valueType: "option",
      render: (_, r) =>
        r.status === "DONE" && r.file_id !== "0" ? [
          <Button key="dl" size="small" type="link" icon={<DownloadOutlined />}
            loading={downloading === r.export_id} onClick={() => void download(r)}>
            {t("dl.download")}
          </Button>,
        ] : r.status === "FAILED" ? [
          <Tooltip key="err" title={r.error}><Tag color="error">{t("dl.viewReason")}</Tag></Tooltip>,
        ] : [],
    },
  ];

  return (
    <>
      <ProTable<ExportItem>
        headerTitle={t("dl.title")}
        rowKey="export_id"
        actionRef={actionRef}
        columns={columns}
        search={false}
        request={async (params) => {
          const resp = await get<{ list: ExportItem[]; total: number }>(
            `/exports?page=${params.current ?? 1}&size=${params.pageSize ?? 10}`,
          );
          return { data: resp.list, total: resp.total, success: true };
        }}
        pagination={{ defaultPageSize: 10, showSizeChanger: true, pageSizeOptions: [10, 20, 50, 100] }}
        toolBarRender={() => [
          <Perm key="create" code="analytics:export:create">
            <Button type="primary" icon={<PlusOutlined />} onClick={() => {
              form.setFieldsValue({ report_type: "sales", format: "CSV", date_start: fmtDate(new Date()), date_end: fmtDate(new Date()) });
              setCreateOpen(true);
            }}>{t("dl.create")}</Button>
          </Perm>,
        ]}
      />

      <ModalForm
        title={t("dl.exportTitle")}
        open={createOpen}
        onOpenChange={(o) => { if (!o) setCreateOpen(false); }}
        form={form}
        modalProps={{ destroyOnHidden: true }}
        onFinish={async (v) => {
          await post("/exports", v);
          message.success(t("dl.created"));
          setCreateOpen(false);
          actionRef.current?.reload();
          return true;
        }}
      >
        <ProFormSelect name="report_type" label={t("dl.reportType")} options={REPORT_TYPES.map((r) => ({ value: r.value, label: t(r.labelKey) }))} rules={[{ required: true, message: t("common.required") }]} />
        <ProFormSelect
          name="format"
          label={t("dl.format")}
          options={[{ value: "CSV", label: t("dl.fmtCsv") }, { value: "XLSX", label: t("dl.fmtXlsx") }, { value: "PDF", label: t("dl.fmtPdf") }]}
          rules={[{ required: true, message: t("common.required") }]}
        />
        <Form.Item name="date_start" label={t("dl.dateStart")} rules={[{ required: true, message: t("common.required") }]}>
          <DatePicker allowClear={false} />
        </Form.Item>
        <Form.Item name="date_end" label={t("dl.dateEnd")} rules={[{ required: true, message: t("common.required") }]}>
          <DatePicker allowClear={false} />
        </Form.Item>
        <Form.Item name="note" label={t("parties.remark")} hidden>
          <Input />
        </Form.Item>
      </ModalForm>
    </>
  );
}
