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
import type { ExportItem } from "@micro/shared/types";

const REPORT_TYPES = [
  { value: "sales", label: "销售日报" },
  { value: "inventory", label: "库存日报" },
  { value: "warranty", label: "质保日报" },
  { value: "sla", label: "SLA 日报" },
  { value: "finance", label: "财务日报" },
  { value: "station", label: "场站日报" },
  { value: "event_ledger", label: "事件流水（10 万行级）" },
];

const STATUS_TAG: Record<string, { color: string; text: string }> = {
  PENDING: { color: "default", text: "排队中" },
  RUNNING: { color: "processing", text: "渲染中" },
  DONE: { color: "success", text: "完成" },
  FAILED: { color: "error", text: "失败" },
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
  const { message } = App.useApp();
  const [createOpen, setCreateOpen] = useState(false);
  const [form] = Form.useForm();
  const [downloading, setDownloading] = useState<string>();
  const actionRef = useRef<ActionType | undefined>(undefined);

  const download = async (t: ExportItem) => {
    setDownloading(t.export_id);
    try {
      const out = await get<{ file_id: string; file_name: string; content_type: string; data: string }>(
        `/exports/${t.export_id}/download`,
      );
      saveBase64File(out.data, out.file_name || t.file_name || "export", out.content_type || "application/octet-stream");
    } finally {
      setDownloading(undefined);
    }
  };

  const columns: ProColumns<ExportItem>[] = [
    { title: "任务ID", dataIndex: "export_id", width: 170 },
    { title: "报表", dataIndex: "report_type", width: 120, render: (_, r) => REPORT_TYPES.find((x) => x.value === r.report_type)?.label ?? r.report_type },
    { title: "格式", dataIndex: "format", width: 80, render: (_, r) => <Tag>{r.format}</Tag> },
    { title: "日期范围", width: 200, render: (_, r) => `${r.date_start} ~ ${r.date_end}` },
    {
      title: "状态",
      dataIndex: "status",
      width: 100,
      render: (_, r) => {
        const s = STATUS_TAG[r.status] ?? { color: "default", text: r.status };
        return <Tag color={s.color}>{s.text}</Tag>;
      },
    },
    { title: "行数", dataIndex: "row_count", width: 90 },
    { title: "耗时", dataIndex: "cost_ms", width: 90, render: (_, r) => (r.cost_ms ? `${r.cost_ms}ms` : "-") },
    { title: "文件", dataIndex: "file_name", ellipsis: true, render: (_, r) => (r.file_name ? <Tooltip title={r.file_name}>{r.file_name}</Tooltip> : "-") },
    {
      title: "操作",
      width: 100,
      valueType: "option",
      render: (_, r) =>
        r.status === "DONE" && r.file_id !== "0" ? [
          <Button key="dl" size="small" type="link" icon={<DownloadOutlined />}
            loading={downloading === r.export_id} onClick={() => void download(r)}>
            下载
          </Button>,
        ] : r.status === "FAILED" ? [
          <Tooltip key="err" title={r.error}><Tag color="error">查看原因</Tag></Tooltip>,
        ] : [],
    },
  ];

  return (
    <>
      <ProTable<ExportItem>
        headerTitle="下载中心"
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
            }}>发起导出</Button>
          </Perm>,
        ]}
      />

      <ModalForm
        title="发起异步导出"
        open={createOpen}
        onOpenChange={(o) => { if (!o) setCreateOpen(false); }}
        form={form}
        modalProps={{ destroyOnHidden: true }}
        onFinish={async (v) => {
          await post("/exports", v);
          message.success("导出任务已创建（异步渲染，稍后在列表刷新查看）");
          setCreateOpen(false);
          actionRef.current?.reload();
          return true;
        }}
      >
        <ProFormSelect name="report_type" label="报表类型" options={REPORT_TYPES} rules={[{ required: true }]} />
        <ProFormSelect
          name="format"
          label="格式"
          options={[{ value: "CSV", label: "CSV（任意行数）" }, { value: "XLSX", label: "XLSX（StreamWriter 流式）" }, { value: "PDF", label: "PDF（简单表格，行数封顶）" }]}
          rules={[{ required: true }]}
        />
        <Form.Item name="date_start" label="开始日" rules={[{ required: true }]}>
          <DatePicker allowClear={false} />
        </Form.Item>
        <Form.Item name="date_end" label="结束日" rules={[{ required: true }]}>
          <DatePicker allowClear={false} />
        </Form.Item>
        <Form.Item name="note" label="备注" hidden>
          <Input />
        </Form.Item>
      </ModalForm>
    </>
  );
}
