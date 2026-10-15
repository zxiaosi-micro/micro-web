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
import { getLocale, usePrefs } from "@micro/shared/prefs";
import type { RecycleItem, RetirementItem } from "@micro/shared/types";

const GRADE_META: Record<string, { key: string; color: string }> = {
  A: { key: "ret.gradeA", color: "green" },
  B: { key: "ret.gradeB", color: "orange" },
  C: { key: "ret.gradeC", color: "red" },
};

const DISPOSITION_KEY: Record<string, string> = {
  PENDING: "ret.dispPending",
  RESALE: "ret.dispResale",
  DERATE: "ret.dispDerate",
  RECYCLED: "ret.dispRecycled",
};

const PAGED = { defaultPageSize: 10, showSizeChanger: true, pageSizeOptions: [10, 20, 50, 100] };

export default function RetirementsPage() {
  const { t } = usePrefs();
  return (
    <Tabs defaultActiveKey="assessments" items={[
      { key: "assessments", label: t("ret.tabAssessments"), children: <AssessmentsTab /> },
      { key: "recycles", label: t("ret.tabRecycles"), children: <RecyclesTab /> },
    ]} />
  );
}

// ---- 退役评估 ----

function AssessmentsTab() {
  const { t } = usePrefs();
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
    { title: t("ret.assessmentNo"), dataIndex: "assessment_no" },
    { title: "SN", dataIndex: "sn" },
    { title: t("ret.round"), dataIndex: "round", width: 64 },
    { title: t("ret.soh"), dataIndex: "soh", render: (_, r) => (r.soh ? `${r.soh}` : "—") },
    { title: t("ret.cycles"), dataIndex: "cycle_count" },
    { title: t("ret.grade"), dataIndex: "grade", render: (_, r) => (r.grade ? <Tag color={GRADE_META[r.grade]?.color}>{GRADE_META[r.grade] ? t(GRADE_META[r.grade].key) : r.grade}</Tag> : <Tag>{t("ret.dispPending")}</Tag>) },
    { title: t("ret.disposition"), dataIndex: "disposition", render: (_, r) => (DISPOSITION_KEY[r.disposition] ? t(DISPOSITION_KEY[r.disposition]) : r.disposition) },
    { title: t("ret.inspectionTicket"), dataIndex: "inspection_ticket_no", render: (_, r) => r.inspection_ticket_no || "—" },
    { title: t("inv.createdAt"), dataIndex: "created_at", render: (_, r) => new Date(r.created_at).toLocaleString(getLocale()) },
    {
      title: t("common.actions"),
      valueType: "option",
      render: (_, r) => (
        <Space>
          {r.disposition === "PENDING" && !r.grade && (
            <Perm code="asset:device:retire">
              <Button size="small" type="primary" onClick={() => { submitForm.resetFields(); setSubmitTarget(r); }}>{t("ret.inputResult")}</Button>
            </Perm>
          )}
          {r.grade && r.disposition === "PENDING" && (
            <Perm code="asset:device:retire">
              <Button size="small" danger={r.grade === "C"} onClick={() => { decideForm.resetFields(); setDecideTarget(r); }}>{t("ret.decide")}</Button>
            </Perm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <>
      <ProTable<RetirementItem>
        headerTitle={t("ret.tabAssessments")}
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
          <Input.Search key="kw" onSearch={(v) => setKeyword(v)} style={{ width: 220 }} allowClear placeholder={t("ret.searchPlaceholder")} />,
          <Select key="grade" value={grade || "all"} style={{ width: 150 }} onChange={(v) => setGrade(v === "all" ? "" : v)}
            options={[{ value: "all", label: t("ret.allGrades") }, ...Object.entries(GRADE_META).map(([k, m]) => ({ value: k, label: t(m.key) }))]} />,
          <Select key="disp" value={disposition || "all"} style={{ width: 140 }} onChange={(v) => setDisposition(v === "all" ? "" : v)}
            options={[{ value: "all", label: t("ret.allDispositions") }, ...Object.entries(DISPOSITION_KEY).map(([k, key]) => ({ value: k, label: t(key) }))]} />,
          <Perm key="create" code="asset:device:retire">
            <Button type="primary" icon={<PlusOutlined />} onClick={() => { createForm.resetFields(); setCreateOpen(true); }}>{t("ret.startAssessment")}</Button>
          </Perm>,
        ]}
      />

      {/* 发起评估 */}
      <Modal title={t("ret.createTitle")} open={createOpen} destroyOnClose okText={t("common.confirm")} cancelText={t("common.cancel")} onCancel={() => setCreateOpen(false)}
        onOk={async () => {
          const v = await createForm.validateFields();
          const out = await post<{ assessment_no: string }>(`/devices/${v.device_id}/retirement`, {
            inspection_ticket_no: v.inspection_ticket_no ?? "", remark: v.remark ?? "",
          });
          message.success(t("ret.created", { no: out.assessment_no }));
          setCreateOpen(false);
          actionRef.current?.reload();
        }}>
        <Typography.Paragraph type="secondary">{t("ret.createHint")}</Typography.Paragraph>
        <Form form={createForm} layout="vertical">
          <Form.Item name="device_id" label={t("ret.deviceId")} rules={[{ required: true, message: t("ret.deviceIdRequired") }]}>
            <Input placeholder={t("ret.deviceIdPlaceholder")} />
          </Form.Item>
          <Form.Item name="inspection_ticket_no" label={t("ret.ticketOptional")}>
            <Input placeholder="TK..." />
          </Form.Item>
          <Form.Item name="remark" label={t("parties.remark")}><Input /></Form.Item>
        </Form>
      </Modal>

      {/* 检测结果录入（录入即评级） */}
      <Modal title={t("ret.resultTitle", { no: submitTarget?.assessment_no ?? "" })} open={!!submitTarget} destroyOnClose okText={t("common.confirm")} cancelText={t("common.cancel")}
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
          message.success(t("ret.graded", { grade: out.grade, reason: out.reason }));
          setSubmitTarget(null);
          actionRef.current?.reload();
        }}>
        <Form form={submitForm} layout="vertical" initialValues={{ consistency_ok: true, source: "MANUAL" }}>
          <Space size="middle">
            <Form.Item name="soh" label={t("ret.soh")} rules={[{ required: true, message: t("ret.sohRequired") }]}>
              <InputNumber min={0} max={100} style={{ width: 120 }} />
            </Form.Item>
            <Form.Item name="cycle_count" label={t("ret.cycles")} rules={[{ required: true, message: t("ret.cyclesRequired") }]}>
              <InputNumber min={0} style={{ width: 120 }} />
            </Form.Item>
            <Form.Item name="resistance_mohm" label={t("ret.resistance")}>
              <InputNumber min={0} style={{ width: 120 }} />
            </Form.Item>
          </Space>
          <Form.Item name="consistency_ok" label={t("ret.consistency")} valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="source" label={t("ret.source")}>
            <Select style={{ width: 160 }} options={[
              { value: "MANUAL", label: t("ret.srcManual") },
              { value: "TELEMETRY", label: t("ret.srcTelemetry") },
              { value: "BENCH", label: t("ret.srcBench") },
            ]} />
          </Form.Item>
          <Typography.Paragraph type="secondary">
            {t("ret.safetyHint")}
          </Typography.Paragraph>
        </Form>
      </Modal>

      {/* 评级处置 */}
      <Modal title={t("ret.decideTitle", { no: decideTarget?.assessment_no ?? "", grade: decideTarget?.grade ?? "" })} open={!!decideTarget}
        destroyOnClose okText={t("common.confirm")} cancelText={t("common.cancel")} onCancel={() => setDecideTarget(null)}
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
              ? t("ret.recycled", { no: out.recycle_no, trace: out.trace_code ?? "", status: out.device_status })
              : t("ret.decided", { disposition: out.disposition, status: out.device_status }));
          setDecideTarget(null);
          actionRef.current?.reload();
        }}>
        <Form form={decideForm} layout="vertical"
          initialValues={{ target: decideTarget?.grade === "A" ? "RESALE" : decideTarget?.grade === "B" ? "DERATE" : "RECYCLE" }}>
          <Form.Item name="target" label={t("ret.target")} rules={[{ required: true, message: t("common.required") }]}>
            <Select options={[
              { value: "RESALE", label: t("ret.targetResale") },
              { value: "DERATE", label: t("ret.targetDerate") },
              { value: "RECYCLE", label: t("ret.targetRecycle") },
            ]} />
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(a, b) => a.target !== b.target}>
            {({ getFieldValue }) => getFieldValue("target") === "RECYCLE" ? (
              <>
                <Form.Item name="recycler_party_id" label={t("ret.recyclerId")}>
                  <Input placeholder={t("ret.recyclerPlaceholder")} />
                </Form.Item>
                <Form.Item name="residual_value" label={t("ret.residualValue")}>
                  <InputNumber min={0} style={{ width: 160 }} />
                </Form.Item>
              </>
            ) : null}
          </Form.Item>
          <Form.Item name="remark" label={t("parties.remark")}><Input /></Form.Item>
        </Form>
      </Modal>
    </>
  );
}

// ---- 回收单 ----

function RecyclesTab() {
  const { t } = usePrefs();
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState("");
  const actionRef = useRef<ActionType | undefined>(undefined);

  const columns: ProColumns<RecycleItem>[] = [
    { title: t("ret.recycleNo"), dataIndex: "recycle_no" },
    { title: "SN", dataIndex: "sn" },
    { title: t("ret.traceCode"), dataIndex: "trace_code", render: (_, r) => <Typography.Text code>{r.trace_code}</Typography.Text> },
    { title: t("ret.recycler"), dataIndex: "recycler_party_id", render: (_, r) => r.recycler_party_id || "—" },
    { title: t("ret.residualValue"), dataIndex: "residual_value", render: (_, r) => `¥${r.residual_value}` },
    { title: t("ret.evidence"), dataIndex: "evidence_file_id", render: (_, r) => (r.evidence_file_id ? t("ret.archived") : "—") },
    { title: t("common.status"), dataIndex: "status" },
    { title: t("inv.createdAt"), dataIndex: "created_at", render: (_, r) => new Date(r.created_at).toLocaleString(getLocale()) },
  ];

  return (
    <ProTable<RecycleItem>
      headerTitle={t("ret.tabRecycles")}
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
        <Input.Search key="kw" onSearch={(v) => setKeyword(v)} style={{ width: 260 }} allowClear placeholder={t("ret.recycleSearchPlaceholder")} />,
        <Select key="status" value={status || "all"} style={{ width: 140 }} onChange={(v) => setStatus(v === "all" ? "" : v)}
          options={[
            { value: "all", label: t("ret.allStatus") },
            { value: "CREATED", label: t("ret.stCreated") },
            { value: "TRANSFERRED", label: t("ret.stTransferred") },
            { value: "SETTLED", label: t("ret.stSettled") },
          ]} />,
      ]}
    />
  );
}
