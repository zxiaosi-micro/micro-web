// Retirements.tsx · 退役评估（S10-01 梯次利用 + 回收）：评估列表（发起/检测录入/评级处置）+ 回收单。
// 评级定稿：A（SOH≥80 且循环<1500 且一致达标）→二次销售 / B（70~80）→降容备电 / C（<70 或安全不过）→报废回收。
// 约定：ID string（E8）；金额 DECIMAL string；C 级处置生成回收单（监管溯源码留痕）。
// 两个 Tab 表格走 ProTable（筛选 params 联动）；三个业务 Modal 含条件字段，保留 antd Modal。

import { useRef, useState } from "react";
import {
  App, Button, Form, Input, InputNumber, Modal, Select, Space, Switch, Tabs, Tag, Typography,
} from "antd";
import { PlusOutlined } from "@ant-design/icons";
import type { ActionType, ProColumns } from "@ant-design/pro-components";
import { ProTable } from "@ant-design/pro-components";
import { get, Perm, post } from "@micro/shared";
import type { RecycleItem, RetirementItem } from "@micro/shared/types";

const GRADE_META: Record<string, { text: string; color: string }> = {
  A: { text: "A · 二次销售", color: "green" },
  B: { text: "B · 降容备电", color: "orange" },
  C: { text: "C · 报废回收", color: "red" },
};

const DISPOSITION_META: Record<string, string> = {
  PENDING: "待检测",
  RESALE: "已二次销售",
  DERATE: "降容备电",
  RECYCLED: "已回收",
};

const PAGED = { defaultPageSize: 10, showSizeChanger: true, pageSizeOptions: [10, 20, 50, 100] };

export default function RetirementsPage() {
  return (
    <Tabs defaultActiveKey="assessments" items={[
      { key: "assessments", label: "退役评估", children: <AssessmentsTab /> },
      { key: "recycles", label: "回收单", children: <RecyclesTab /> },
    ]} />
  );
}

// ---- 退役评估 ----

function AssessmentsTab() {
  const { message } = App.useApp();
  const [keyword, setKeyword] = useState("");
  const [grade, setGrade] = useState("");
  const [disposition, setDisposition] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [submitTarget, setSubmitTarget] = useState<RetirementItem | null>(null);
  const [decideTarget, setDecideTarget] = useState<RetirementItem | null>(null);
  const [createForm] = Form.useForm();
  const [submitForm] = Form.useForm();
  const [decideForm] = Form.useForm();
  const actionRef = useRef<ActionType | undefined>(undefined);

  const columns: ProColumns<RetirementItem>[] = [
    { title: "评估单号", dataIndex: "assessment_no" },
    { title: "SN", dataIndex: "sn" },
    { title: "轮次", dataIndex: "round", width: 64 },
    { title: "SOH%", dataIndex: "soh", render: (_, r) => (r.soh ? `${r.soh}` : "—") },
    { title: "循环数", dataIndex: "cycle_count" },
    { title: "评级", dataIndex: "grade", render: (_, r) => (r.grade ? <Tag color={GRADE_META[r.grade]?.color}>{GRADE_META[r.grade]?.text ?? r.grade}</Tag> : <Tag>待检测</Tag>) },
    { title: "处置", dataIndex: "disposition", render: (_, r) => DISPOSITION_META[r.disposition] ?? r.disposition },
    { title: "检测工单", dataIndex: "inspection_ticket_no", render: (_, r) => r.inspection_ticket_no || "—" },
    { title: "发起时间", dataIndex: "created_at", render: (_, r) => new Date(r.created_at).toLocaleString() },
    {
      title: "操作",
      valueType: "option",
      render: (_, r) => (
        <Space>
          {r.disposition === "PENDING" && !r.grade && (
            <Perm code="asset:device:retire">
              <Button size="small" type="primary" onClick={() => { submitForm.resetFields(); setSubmitTarget(r); }}>检测结果录入</Button>
            </Perm>
          )}
          {r.grade && r.disposition === "PENDING" && (
            <Perm code="asset:device:retire">
              <Button size="small" danger={r.grade === "C"} onClick={() => { decideForm.resetFields(); setDecideTarget(r); }}>评级处置</Button>
            </Perm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <>
      <ProTable<RetirementItem>
        headerTitle="退役评估"
        rowKey="assessment_id"
        actionRef={actionRef}
        columns={columns}
        search={false}
        params={{ keyword, grade, disposition }}
        request={async (params) => {
          const resp = await get<{ list: RetirementItem[]; total: number }>(
            `/retirements?page=${params.current ?? 1}&size=${params.pageSize ?? 10}&keyword=${encodeURIComponent(keyword)}&grade=${grade}&disposition=${disposition}`,
          );
          return { data: resp.list, total: resp.total, success: true };
        }}
        pagination={PAGED}
        toolBarRender={() => [
          <Input.Search key="kw" onSearch={(v) => setKeyword(v)} style={{ width: 220 }} allowClear placeholder="评估单号/SN" />,
          <Select key="grade" value={grade || "all"} style={{ width: 150 }} onChange={(v) => setGrade(v === "all" ? "" : v)}
            options={[{ value: "all", label: "全部评级" }, ...Object.entries(GRADE_META).map(([k, t]) => ({ value: k, label: t.text }))]} />,
          <Select key="disp" value={disposition || "all"} style={{ width: 140 }} onChange={(v) => setDisposition(v === "all" ? "" : v)}
            options={[{ value: "all", label: "全部处置" }, ...Object.entries(DISPOSITION_META).map(([k, t]) => ({ value: k, label: t }))]} />,
          <Perm key="create" code="asset:device:retire">
            <Button type="primary" icon={<PlusOutlined />} onClick={() => { createForm.resetFields(); setCreateOpen(true); }}>发起评估</Button>
          </Perm>,
        ]}
      />

      {/* 发起评估 */}
      <Modal title="发起退役评估" open={createOpen} destroyOnClose onCancel={() => setCreateOpen(false)}
        onOk={async () => {
          const v = await createForm.validateFields();
          const out = await post<{ assessment_no: string }>(`/devices/${v.device_id}/retirement`, {
            inspection_ticket_no: v.inspection_ticket_no ?? "", remark: v.remark ?? "",
          });
          message.success(`评估单 ${out.assessment_no} 已发起（复用 ops 检测工单）`);
          setCreateOpen(false);
          actionRef.current?.reload();
        }}>
        <Typography.Paragraph type="secondary">设备须处于 ACTIVATED/RETIRED；同一设备同时仅一笔未完结评估。检测数据经 ops 检测工单执行后回填。</Typography.Paragraph>
        <Form form={createForm} layout="vertical">
          <Form.Item name="device_id" label="设备 ID" rules={[{ required: true, message: "请输入设备 ID" }]}>
            <Input placeholder="设备 ID（设备管理页复制）" />
          </Form.Item>
          <Form.Item name="inspection_ticket_no" label="检测工单号（ops，可空）">
            <Input placeholder="TK..." />
          </Form.Item>
          <Form.Item name="remark" label="备注"><Input /></Form.Item>
        </Form>
      </Modal>

      {/* 检测结果录入（录入即评级） */}
      <Modal title={`检测结果录入 — ${submitTarget?.assessment_no ?? ""}`} open={!!submitTarget} destroyOnClose
        onCancel={() => setSubmitTarget(null)}
        onOk={async () => {
          const v = await submitForm.validateFields();
          const out = await post<{ grade: string; reason: string }>(`/retirements/${submitTarget?.assessment_id}/result`, {
            soh: String(v.soh), cycle_count: v.cycle_count ?? 0,
            resistance_mohm: v.resistance_mohm ? String(v.resistance_mohm) : "",
            consistency_ok: !!v.consistency_ok,
            safety_items: (v.safety_items ?? []).map((s: { item: string; pass: boolean }) => ({ item: s.item, pass: !!s.pass })),
            source: v.source || "MANUAL",
          });
          message.success(`评级 ${out.grade}：${out.reason}`);
          setSubmitTarget(null);
          actionRef.current?.reload();
        }}>
        <Form form={submitForm} layout="vertical" initialValues={{ consistency_ok: true, source: "MANUAL" }}>
          <Space size="middle">
            <Form.Item name="soh" label="SOH %" rules={[{ required: true, message: "请输入 SOH" }]}>
              <InputNumber min={0} max={100} style={{ width: 120 }} />
            </Form.Item>
            <Form.Item name="cycle_count" label="循环数" rules={[{ required: true, message: "请输入循环数" }]}>
              <InputNumber min={0} style={{ width: 120 }} />
            </Form.Item>
            <Form.Item name="resistance_mohm" label="内阻 mΩ">
              <InputNumber min={0} style={{ width: 120 }} />
            </Form.Item>
          </Space>
          <Form.Item name="consistency_ok" label="一致性达标（压差/温差阈值内）" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="source" label="检测来源">
            <Select style={{ width: 160 }} options={[
              { value: "MANUAL", label: "人工（MANUAL）" },
              { value: "TELEMETRY", label: "遥测（TELEMETRY）" },
              { value: "BENCH", label: "台架（BENCH）" },
            ]} />
          </Form.Item>
          <Typography.Paragraph type="secondary">
            安全检测项：任一不过直接评 C（过充/短路/绝缘/热失控等；无项视为通过）。本表单简化为逐项录入，可留空。
          </Typography.Paragraph>
        </Form>
      </Modal>

      {/* 评级处置 */}
      <Modal title={`评级处置 — ${decideTarget?.assessment_no ?? ""}（${decideTarget?.grade ?? ""} 级）`} open={!!decideTarget}
        destroyOnClose onCancel={() => setDecideTarget(null)}
        onOk={async () => {
          const v = await decideForm.validateFields();
          const out = await post<{ grade: string; disposition: string; recycle_no?: string; trace_code?: string; device_status: string }>(
            `/retirements/${decideTarget?.assessment_id}/decide`, {
              target: v.target, recycler_party_id: v.recycler_party_id ?? "",
              residual_value: v.residual_value ? String(v.residual_value) : "",
              remark: v.remark ?? "",
            });
          message.success(
            out.recycle_no
              ? `已报废走回收单 ${out.recycle_no}（溯源码 ${out.trace_code}），设备 ${out.device_status}`
              : `处置完成：${out.disposition}，设备 ${out.device_status}`);
          setDecideTarget(null);
          actionRef.current?.reload();
        }}>
        <Form form={decideForm} layout="vertical"
          initialValues={{ target: decideTarget?.grade === "A" ? "RESALE" : decideTarget?.grade === "B" ? "DERATE" : "RECYCLE" }}>
          <Form.Item name="target" label="处置分支" rules={[{ required: true }]}>
            <Select options={[
              { value: "RESALE", label: "二次销售（A：RETIRED→IN_STOCK，新单新质保）" },
              { value: "DERATE", label: "降容备电（B：不给销售质保）" },
              { value: "RECYCLE", label: "报废回收（C：生成回收单+溯源码）" },
            ]} />
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(a, b) => a.target !== b.target}>
            {({ getFieldValue }) => getFieldValue("target") === "RECYCLE" ? (
              <>
                <Form.Item name="recycler_party_id" label="回收商参与方 ID（RECYCLER 类型）">
                  <Input placeholder="party ID（参与方管理）" />
                </Form.Item>
                <Form.Item name="residual_value" label="残值 ¥">
                  <InputNumber min={0} style={{ width: 160 }} />
                </Form.Item>
              </>
            ) : null}
          </Form.Item>
          <Form.Item name="remark" label="备注"><Input /></Form.Item>
        </Form>
      </Modal>
    </>
  );
}

// ---- 回收单 ----

function RecyclesTab() {
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState("");
  const actionRef = useRef<ActionType | undefined>(undefined);

  const columns: ProColumns<RecycleItem>[] = [
    { title: "回收单号", dataIndex: "recycle_no" },
    { title: "SN", dataIndex: "sn" },
    { title: "监管溯源码", dataIndex: "trace_code", render: (_, r) => <Typography.Text code>{r.trace_code}</Typography.Text> },
    { title: "回收商", dataIndex: "recycler_party_id", render: (_, r) => r.recycler_party_id || "—" },
    { title: "残值", dataIndex: "residual_value", render: (_, r) => `¥${r.residual_value}` },
    { title: "凭证", dataIndex: "evidence_file_id", render: (_, r) => (r.evidence_file_id ? "已归档" : "—") },
    { title: "状态", dataIndex: "status" },
    { title: "创建时间", dataIndex: "created_at", render: (_, r) => new Date(r.created_at).toLocaleString() },
  ];

  return (
    <ProTable<RecycleItem>
      headerTitle="回收单"
      rowKey="recycle_id"
      actionRef={actionRef}
      columns={columns}
      search={false}
      params={{ keyword, status }}
      request={async (params) => {
        const resp = await get<{ list: RecycleItem[]; total: number }>(
          `/recycle-orders?page=${params.current ?? 1}&size=${params.pageSize ?? 10}&keyword=${encodeURIComponent(keyword)}&status=${status}`,
        );
        return { data: resp.list, total: resp.total, success: true };
      }}
      pagination={PAGED}
      toolBarRender={() => [
        <Input.Search key="kw" onSearch={(v) => setKeyword(v)} style={{ width: 260 }} allowClear placeholder="回收单号/SN/溯源码" />,
        <Select key="status" value={status || "all"} style={{ width: 140 }} onChange={(v) => setStatus(v === "all" ? "" : v)}
          options={[
            { value: "all", label: "全部状态" },
            { value: "CREATED", label: "已建单" },
            { value: "TRANSFERRED", label: "已移交" },
            { value: "SETTLED", label: "已结算" },
          ]} />,
      ]}
    />
  );
}
