// Payments.tsx · 财务中心（S5-03）：支付单（REVIEWING 高亮 + 对公复核弹窗）/ 退款 / 发票 / 对账任务。
// 约定：ID string（E8）；四个 Tab 均走 ProTable；对公复核走 step-up（SensitivePrefixes，BFF 侧强制）；严禁并发冒烟（E1）。

import { useRef, useState } from "react";
import {
  App, Button, Form, Input, Modal, Select, Space, Tabs, Tag, Typography,
} from "antd";
import type { ActionType, ProColumns } from "@ant-design/pro-components";
import { ProTable } from "@ant-design/pro-components";
import { get, Perm, post } from "@micro/shared";
import type { InvoiceView, PaymentView, ReconcileTaskView, RefundView } from "@micro/shared/types";

const PAY_STATUS: Record<string, { text: string; color: string }> = {
  PAYING: { text: "支付中", color: "blue" },
  REVIEWING: { text: "待复核", color: "orange" },
  PAID: { text: "已支付", color: "green" },
  REJECTED: { text: "复核驳回", color: "red" },
  SETTLED: { text: "已核销", color: "purple" },
  CLOSED: { text: "已关闭", color: "default" },
};

const PAGED = { defaultPageSize: 10, showSizeChanger: true, pageSizeOptions: [10, 20, 50, 100] };

export default function PaymentsPage(props: { defaultTab?: string }) {
  return (
    <Tabs defaultActiveKey={props.defaultTab ?? "payments"} items={[
      { key: "payments", label: "支付单", children: <PaymentsTab /> },
      { key: "refunds", label: "退款", children: <RefundsTab /> },
      { key: "invoices", label: "发票", children: <InvoicesTab /> },
      { key: "reconcile", label: "对账任务", children: <ReconcileTab /> },
    ]} />
  );
}

// ---- 支付单 ----

function PaymentsTab() {
  const { message } = App.useApp();
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState("");
  const [reviewTarget, setReviewTarget] = useState<PaymentView | null>(null);
  const [form] = Form.useForm();
  const actionRef = useRef<ActionType | undefined>(undefined);

  const columns: ProColumns<PaymentView>[] = [
    { title: "支付单号", dataIndex: "payment_no", search: false },
    { title: "订单号", dataIndex: "order_no", search: false },
    { title: "渠道", dataIndex: "channel", search: false },
    { title: "状态", dataIndex: "status", search: false, render: (_, r) => <Tag color={PAY_STATUS[r.status]?.color}>{PAY_STATUS[r.status]?.text ?? r.status}</Tag> },
    { title: "应收", dataIndex: "amount", search: false, render: (_, r) => `¥${r.amount}` },
    { title: "实收", dataIndex: "paid_amount", search: false, render: (_, r) => (r.paid_amount ? `¥${r.paid_amount}` : "—") },
    { title: "渠道流水", dataIndex: "channel_txn_id", search: false, render: (_, r) => r.channel_txn_id || "—" },
    { title: "支付时间", dataIndex: "paid_at", search: false, render: (_, r) => (r.paid_at ? new Date(r.paid_at).toLocaleString() : "—") },
    {
      title: "操作",
      valueType: "option",
      render: (_, r) => (
        <Space>
          {r.status === "PAYING" && (
            <Perm code="finance:payment:confirm">
              <Button size="small" onClick={async () => {
                await post(`/payments/${r.payment_no}/confirm`, { paid_amount: r.amount, source: "MOCK", channel_txn_id: `MOCK-${Date.now()}` });
                message.success("已确认（dev 模拟网关）");
                actionRef.current?.reload();
              }}>模拟到账</Button>
            </Perm>
          )}
          {r.status === "REVIEWING" && (
            <Perm code="finance:payment:approve">
              <Button size="small" type="primary" onClick={() => { setReviewTarget(r); form.resetFields(); }}>复核</Button>
            </Perm>
          )}
          {r.status === "PAID" && (
            <Perm code="finance:payment:settle">
              <Button size="small" onClick={async () => {
                await post(`/payments/${r.payment_no}/settle`, {});
                message.success("已核销");
                actionRef.current?.reload();
              }}>核销</Button>
            </Perm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <>
      <ProTable<PaymentView>
        headerTitle="支付单"
        rowKey="payment_no"
        actionRef={actionRef}
        columns={columns}
        search={false}
        rowClassName={(r) => (r.status === "REVIEWING" ? "ant-table-row-warning" : "")}
        params={{ keyword, status }}
        request={async (params) => {
          const resp = await get<{ list: PaymentView[]; total: number }>(
            `/payments?page=${params.current ?? 1}&size=${params.pageSize ?? 10}&keyword=${encodeURIComponent(keyword)}&status=${status}`,
          );
          return { data: resp.list, total: resp.total, success: true };
        }}
        pagination={PAGED}
        toolBarRender={() => [
          <Input.Search key="kw" onSearch={(v) => setKeyword(v)} style={{ width: 240 }} allowClear placeholder="支付单号/订单号" />,
          <Select key="status" value={status || "all"} style={{ width: 140 }} onChange={(v) => setStatus(v === "all" ? "" : v)}
            options={Object.entries(PAY_STATUS).map(([k, t]) => ({ value: k, label: t.text }))} />,
        ]}
      />

      <Modal title={`对公复核（职责分离）— ${reviewTarget?.payment_no ?? ""}`} open={!!reviewTarget}
        destroyOnClose onCancel={() => setReviewTarget(null)} onOk={async () => {
          const v = await form.validateFields();
          await post(`/payments/${reviewTarget?.payment_no}/approve`, { approve: v.approve, remark: v.remark ?? "" });
          message.success(v.approve ? "复核通过（order_paid 已发）" : "已驳回");
          setReviewTarget(null);
          actionRef.current?.reload();
        }}>
        <Typography.Paragraph type="secondary">
          录入人：{reviewTarget?.created_by ?? "—"}（复核人不得与录入人相同，服务端强制）
        </Typography.Paragraph>
        <Form form={form} layout="vertical">
          <Form.Item name="approve" label="复核结论" initialValue={true}>
            <Select options={[{ value: true, label: "通过（→ 已支付）" }, { value: false, label: "驳回（→ REJECTED）" }]} />
          </Form.Item>
          <Form.Item name="remark" label="复核意见"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>
    </>
  );
}

// ---- 退款 ----

function RefundsTab() {
  const { message } = App.useApp();
  const [createOpen, setCreateOpen] = useState(false);
  const [form] = Form.useForm();
  const actionRef = useRef<ActionType | undefined>(undefined);

  const columns: ProColumns<RefundView>[] = [
    { title: "退款单号", dataIndex: "refund_no" },
    { title: "原支付单", dataIndex: "payment_no" },
    { title: "订单号", dataIndex: "order_no" },
    { title: "退货单", dataIndex: "return_no", render: (_, r) => r.return_no || "—" },
    { title: "金额", dataIndex: "amount", render: (_, r) => `¥${r.amount}` },
    { title: "渠道", dataIndex: "channel" },
    {
      title: "状态",
      dataIndex: "status",
      render: (_, r) => (
        <Tag color={r.status === "SUCCESS" ? "green" : r.status === "FAILED" ? "red" : "processing"}>{r.status}</Tag>
      ),
    },
    { title: "创建时间", dataIndex: "created_at", render: (_, r) => new Date(r.created_at).toLocaleString() },
  ];

  return (
    <>
      <Typography.Text type="secondary" style={{ display: "block", marginBottom: 8 }}>
        退款原路退回（原支付渠道）；退货审批自动触发链路见订单域；幂等键 payment_no+return_no。
      </Typography.Text>
      <ProTable<RefundView>
        headerTitle="退款"
        rowKey="refund_no"
        actionRef={actionRef}
        columns={columns}
        search={false}
        request={async (params) => {
          const resp = await get<{ list: RefundView[]; total: number }>(
            `/refunds?page=${params.current ?? 1}&size=${params.pageSize ?? 10}`,
          );
          return { data: resp.list, total: resp.total, success: true };
        }}
        pagination={PAGED}
        toolBarRender={() => [
          <Perm key="create" code="finance:refund:create">
            <Button type="primary" onClick={() => setCreateOpen(true)}>手工退款</Button>
          </Perm>,
        ]}
      />
      <Modal title="手工退款（原路退回）" open={createOpen} destroyOnClose onCancel={() => setCreateOpen(false)} onOk={async () => {
        const v = await form.validateFields();
        const r = await post<{ refund_no: string }>("/refunds", v);
        message.success(`退款单 ${r.refund_no} 已受理`);
        form.resetFields();
        setCreateOpen(false);
        actionRef.current?.reload();
      }}>
        <Form form={form} layout="vertical">
          <Form.Item name="payment_no" label="原支付单号" rules={[{ required: true }]}><Input placeholder="PAY..." /></Form.Item>
          <Form.Item name="amount" label="退款金额" rules={[{ required: true }]}><Input placeholder="1299.50" /></Form.Item>
          <Form.Item name="reason" label="原因"><Input /></Form.Item>
        </Form>
      </Modal>
    </>
  );
}

// ---- 发票 ----

function InvoicesTab() {
  const { message } = App.useApp();
  const [createOpen, setCreateOpen] = useState(false);
  const [form] = Form.useForm();
  const actionRef = useRef<ActionType | undefined>(undefined);

  const columns: ProColumns<InvoiceView>[] = [
    { title: "发票号", dataIndex: "invoice_no" },
    { title: "支付单", dataIndex: "payment_no" },
    { title: "订单号", dataIndex: "order_no" },
    { title: "抬头", dataIndex: "title" },
    { title: "税号", dataIndex: "tax_no", render: (_, r) => r.tax_no || "—" },
    { title: "金额", dataIndex: "amount", render: (_, r) => `¥${r.amount}` },
    {
      title: "状态",
      dataIndex: "status",
      render: (_, r) => (
        <Tag color={r.status === "ISSUED" ? "green" : "red"}>{r.status === "ISSUED" ? "已开具" : "已红冲"}</Tag>
      ),
    },
    {
      title: "操作",
      valueType: "option",
      render: (_, r) => r.status === "ISSUED" ? [
        <Perm key="reverse" code="finance:invoice:reverse">
          <Button size="small" danger onClick={async () => {
            await post(`/invoices/${r.invoice_no}/reverse`, { reason: "手工红冲" });
            message.success("已红冲");
            actionRef.current?.reload();
          }}>红冲</Button>
        </Perm>,
      ] : [],
    },
  ];

  return (
    <>
      <ProTable<InvoiceView>
        headerTitle="发票"
        rowKey="invoice_no"
        actionRef={actionRef}
        columns={columns}
        search={false}
        request={async (params) => {
          const resp = await get<{ list: InvoiceView[]; total: number }>(
            `/invoices?page=${params.current ?? 1}&size=${params.pageSize ?? 10}`,
          );
          return { data: resp.list, total: resp.total, success: true };
        }}
        pagination={PAGED}
        toolBarRender={() => [
          <Perm key="issue" code="finance:invoice:issue">
            <Button type="primary" onClick={() => setCreateOpen(true)}>开票</Button>
          </Perm>,
        ]}
      />
      <Modal title="开票" open={createOpen} destroyOnClose onCancel={() => setCreateOpen(false)} onOk={async () => {
        const v = await form.validateFields();
        await post("/invoices", v);
        message.success("发票已开具");
        form.resetFields();
        setCreateOpen(false);
        actionRef.current?.reload();
      }}>
        <Form form={form} layout="vertical">
          <Form.Item name="payment_no" label="支付单号" rules={[{ required: true }]}><Input placeholder="PAY..." /></Form.Item>
          <Form.Item name="title" label="抬头" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="tax_no" label="税号"><Input /></Form.Item>
        </Form>
      </Modal>
    </>
  );
}

// ---- 对账任务 ----

function ReconcileTab() {
  const { message } = App.useApp();
  const actionRef = useRef<ActionType | undefined>(undefined);

  const columns: ProColumns<ReconcileTaskView>[] = [
    { title: "任务号", dataIndex: "task_no" },
    { title: "类型", dataIndex: "type" },
    { title: "业务日期", dataIndex: "biz_date" },
    {
      title: "状态",
      dataIndex: "status",
      render: (_, r) => (
        <Tag color={r.status === "OPEN" ? "orange" : "green"}>{r.status === "OPEN" ? "待处理" : "已处理"}</Tag>
      ),
    },
    { title: "差异报告", dataIndex: "diff_report", ellipsis: true },
    { title: "处理方式", dataIndex: "resolution", render: (_, r) => r.resolution || "—" },
    {
      title: "操作",
      valueType: "option",
      render: (_, r) => r.status === "OPEN" ? [
        <Space key="ops">
          <Perm code="finance:reconcile:resolve">
            <Button size="small" type="primary" onClick={async () => {
              await post(`/reconcile-tasks/${r.task_id}/resolve`, { resolution: "REPLAY", remark: "补投递重放" });
              message.success("已按补投递重放处理");
              actionRef.current?.reload();
            }}>补投递重放</Button>
            <Button size="small" onClick={async () => {
              await post(`/reconcile-tasks/${r.task_id}/resolve`, { resolution: "IGNORE", remark: "人工核对无差异" });
              message.success("已忽略");
              actionRef.current?.reload();
            }}>忽略</Button>
          </Perm>
        </Space>,
      ] : [],
    },
  ];

  return (
    <>
      <Typography.Text type="secondary" style={{ display: "block", marginBottom: 8 }}>
        差异修复只允许补投递重放（REPLAY），禁止裸删（E10）；库存日结见 tools/reconcile。
      </Typography.Text>
      <ProTable<ReconcileTaskView>
        headerTitle="对账任务"
        rowKey="task_id"
        actionRef={actionRef}
        columns={columns}
        search={false}
        request={async (params) => {
          const resp = await get<{ list: ReconcileTaskView[]; total: number }>(
            `/reconcile-tasks?page=${params.current ?? 1}&size=${params.pageSize ?? 10}`,
          );
          return { data: resp.list, total: resp.total, success: true };
        }}
        pagination={PAGED}
      />
    </>
  );
}
