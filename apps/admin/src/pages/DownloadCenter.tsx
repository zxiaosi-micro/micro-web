// DownloadCenter.tsx · 下载中心（S8-03/05）：异步导出任务列表 + 发起导出 + 产物下载。
// 导出走 export_requested 事件管道（analytics 渲染 → file 归档）；下载 base64 信封 → Blob。

import { useState } from "react";
import {
  App, Button, DatePicker, Form, Input, Modal, Select, Space, Table, Tag, Tooltip,
} from "antd";
import { DownloadOutlined, PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import { get, Perm, post, usePaged } from "@micro/shared";
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
  const { list, total, page, size, loading, setPage, setSize, refresh } = usePaged<ExportItem>(
    (p) => get<{ list: ExportItem[]; total: number }>(`/exports?page=${p.page}&size=${p.size}`),
  );

  const submit = async () => {
    const v = await form.validateFields();
    await post("/exports", v);
    message.success("导出任务已创建（异步渲染，稍后在列表刷新查看）");
    setCreateOpen(false);
    refresh();
  };

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

  const columns = [
    { title: "任务ID", dataIndex: "export_id", width: 170 },
    { title: "报表", dataIndex: "report_type", width: 120, render: (v: string) => REPORT_TYPES.find((r) => r.value === v)?.label ?? v },
    { title: "格式", dataIndex: "format", width: 80, render: (v: string) => <Tag>{v}</Tag> },
    { title: "日期范围", width: 200, render: (_: unknown, r: ExportItem) => `${r.date_start} ~ ${r.date_end}` },
    { title: "状态", dataIndex: "status", width: 100, render: (v: string) => {
      const s = STATUS_TAG[v] ?? { color: "default", text: v };
      return <Tag color={s.color}>{s.text}</Tag>;
    } },
    { title: "行数", dataIndex: "row_count", width: 90 },
    { title: "耗时", dataIndex: "cost_ms", width: 90, render: (v: number) => (v ? `${v}ms` : "-") },
    { title: "文件", dataIndex: "file_name", ellipsis: true, render: (v: string) => (v ? <Tooltip title={v}>{v}</Tooltip> : "-") },
    {
      title: "操作", width: 100,
      render: (_: unknown, r: ExportItem) =>
        r.status === "DONE" && r.file_id !== "0" ? (
          <Button size="small" type="link" icon={<DownloadOutlined />}
            loading={downloading === r.export_id} onClick={() => void download(r)}>
            下载
          </Button>
        ) : r.status === "FAILED" ? (
          <Tooltip title={r.error}><Tag color="error">查看原因</Tag></Tooltip>
        ) : null,
    },
  ];

  return (
    <>
      <Space style={{ marginBottom: 16 }}>
        <Perm code="analytics:export:create">
          <Button type="primary" icon={<PlusOutlined />} onClick={() => {
            form.setFieldsValue({ report_type: "sales", format: "CSV", date_start: fmtDate(new Date()), date_end: fmtDate(new Date()) });
            setCreateOpen(true);
          }}>发起导出</Button>
        </Perm>
        <Button icon={<ReloadOutlined />} onClick={refresh}>刷新</Button>
      </Space>
      <Table rowKey="export_id" columns={columns as never} dataSource={list} loading={loading}
        pagination={{ current: page, pageSize: size, total, showSizeChanger: true, onChange: (p, s) => { setPage(p); setSize(s); } }} />

      <Modal title="发起异步导出" open={createOpen} onCancel={() => setCreateOpen(false)} onOk={() => void submit()}>
        <Form form={form} layout="vertical">
          <Form.Item name="report_type" label="报表类型" rules={[{ required: true }]}>
            <Select options={REPORT_TYPES} />
          </Form.Item>
          <Form.Item name="format" label="格式" rules={[{ required: true }]}>
            <Select options={[{ value: "CSV", label: "CSV（任意行数）" }, { value: "XLSX", label: "XLSX（StreamWriter 流式）" }, { value: "PDF", label: "PDF（简单表格，行数封顶）" }]} />
          </Form.Item>
          <Space>
            <Form.Item name="date_start" label="开始日" rules={[{ required: true }]}>
              <DatePicker allowClear={false} />
            </Form.Item>
            <Form.Item name="date_end" label="结束日" rules={[{ required: true }]}>
              <DatePicker allowClear={false} />
            </Form.Item>
          </Space>
          <Form.Item name="note" label="备注" hidden>
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
