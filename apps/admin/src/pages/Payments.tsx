// Payments.tsx · 财务中心（S5-03）：支付单（REVIEWING 高亮 + 对公复核弹窗）/ 退款 / 发票 / 对账任务。
// 约定：ID string（E8）；对公复核走 step-up（SensitivePrefixes，BFF 侧强制）；严禁并发冒烟（E1）。

import { useState } from "react";
import {
  App, Button, Form, Input, Modal, Select, Space, Table, Tabs, Tag, Typography,
} from "antd";
import { ReloadOutlined } from "@ant-design/icons";
import { get, Perm, post, usePaged } from "@micro/shared";
import type { InvoiceView, PaymentView, ReconcileTaskView, RefundView } from "@micro/shared/types";

const PAY_STATUS: Record<string, { text: string; color: string }> = {
  PAYING: { text: "支付中", color: "blue" },
  REVIEWING: { text: "待复核", color: "orange" },
  PAID: { text: "已支付", color: "green" },
  REJECTED: { text: "复核驳回", color: "red" },
  SETTLED: { text: "已核销", color: "purple" },
  CLOSED: { text: "已关闭", color: "default" },
};

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

  const { list, total, page, size, loading, setPage, setSize, refresh } = usePaged<PaymentView>(
    (p) => get<{ list: PaymentView[]; total: number }>(`/payments?page=${p.page}&size=${p.size}&keyword=${encodeURIComponent(keyword)}&status=${status}`),
  );

  return (
    <>
      <Space style={{ marginBottom: 16 }}>
        <Input.Search onSearch={(v) => { setKeyword(v); setPage(1); }} style={{ width: 240 }} allowClear placeholder="支付单号/订单号" />
        <Select value={status || "all"} style={{ width: 140 }} onChange={(v) => setStatus(v === "all" ? "" : v)}
          options={Object.entries(PAY_STATUS).map(([k, t]) => ({ value: k, label: t.text }))} />
        <Button icon={<ReloadOutlined />} onClick={refresh}>刷新</Button>
      </Space>
      <Table rowKey="payment_no" rowClassName={(r) => (r.status === "REVIEWING" ? "ant-table-row-warning" : "")} columns={[
        { title: "支付单号", dataIndex: "payment_no" },
        { title: "订单号", dataIndex: "order_no" },
        { title: "渠道", dataIndex: "channel" },
        { title: "状态", dataIndex: "status", render: (v: string) => <Tag color={PAY_STATUS[v]?.color}>{PAY_STATUS[v]?.text ?? v}</Tag> },
        { title: "应收", dataIndex: "amount", render: (v: string) => `¥${v}` },
        { title: "实收", dataIndex: "paid_amount", render: (v: string) => (v ? `¥${v}` : "—") },
        { title: "渠道流水", dataIndex: "channel_txn_id", render: (v: string) => v || "—" },
        { title: "支付时间", dataIndex: "paid_at", render: (v: number) => (v ? new Date(v).toLocaleString() : "—") },
        {
          title: "操作", render: (_: unknown, r: PaymentView) => (
            <Space>
              {r.status === "PAYING" && (
                <Perm code="finance:payment:confirm">
                  <Button size="small" onClick={async () => {
                    await post(`/payments/${r.payment_no}/confirm`, { paid_amount: r.amount, source: "MOCK", channel_txn_id: `MOCK-${Date.now()}` });
                    message.success("已确认（dev 模拟网关）"); refresh();
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
                    message.success("已核销"); refresh();
                  }}>核销</Button>
                </Perm>
              )}
            </Space>
          ),
        },
      ]} dataSource={list} loading={loading}
        pagination={{ current: page, pageSize: size, total, showSizeChanger: true, onChange: (p, s) => { setPage(p); setSize(s); } }} />

      <Modal title={`对公复核（职责分离）— ${reviewTarget?.payment_no ?? ""}`} open={!!reviewTarget}
        destroyOnClose onCancel={() => setReviewTarget(null)} onOk={async () => {
          const v = await form.validateFields();
          await post(`/payments/${reviewTarget?.payment_no}/approve`, { approve: v.approve, remark: v.remark ?? "" });
          message.success(v.approve ? "复核通过（order_paid 已发）" : "已驳回");
          setReviewTarget(null); refresh();
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
  const { list, total, page, size, loading, setPage, setSize, refresh } = usePaged<RefundView>(
    (p) => get<{ list: RefundView[]; total: number }>(`/refunds?page=${p.page}&size=${p.size}`),
  );
  return (
    <>
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ReloadOutlined />} onClick={refresh}>刷新</Button>
        <Perm code="finance:refund:create">
          <Button type="primary" onClick={() => setCreateOpen(true)}>手工退款</Button>
        </Perm>
      </Space>
      <Typography.Text type="secondary" style={{ display: "block", marginBottom: 8 }}>
        退款原路退回（原支付渠道）；退货审批自动触发链路见订单域；幂等键 payment_no+return_no。
      </Typography.Text>
      <Table rowKey="refund_no" columns={[
        { title: "退款单号", dataIndex: "refund_no" },
        { title: "原支付单", dataIndex: "payment_no" },
        { title: "订单号", dataIndex: "order_no" },
        { title: "退货单", dataIndex: "return_no", render: (v: string) => v || "—" },
        { title: "金额", dataIndex: "amount", render: (v: string) => `¥${v}` },
        { title: "渠道", dataIndex: "channel" },
        { title: "状态", dataIndex: "status", render: (v: string) => (
          <Tag color={v === "SUCCESS" ? "green" : v === "FAILED" ? "red" : "processing"}>{v}</Tag>) },
        { title: "创建时间", dataIndex: "created_at", render: (v: number) => new Date(v).toLocaleString() },
      ]} dataSource={list} loading={loading}
        pagination={{ current: page, pageSize: size, total, onChange: (p, s) => { setPage(p); setSize(s); } }} />
      <Modal title="手工退款（原路退回）" open={createOpen} destroyOnClose onCancel={() => setCreateOpen(false)} onOk={async () => {
        const v = await form.validateFields();
        const r = await post<{ refund_no: string }>("/refunds", v);
        message.success(`退款单 ${r.refund_no} 已受理`);
        form.resetFields(); setCreateOpen(false); refresh();
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
  const { list, total, page, size, loading, setPage, setSize, refresh } = usePaged<InvoiceView>(
    (p) => get<{ list: InvoiceView[]; total: number }>(`/invoices?page=${p.page}&size=${p.size}`),
  );
  return (
    <>
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ReloadOutlined />} onClick={refresh}>刷新</Button>
        <Perm code="finance:invoice:issue">
          <Button type="primary" onClick={() => setCreateOpen(true)}>开票</Button>
        </Perm>
      </Space>
      <Table rowKey="invoice_no" columns={[
        { title: "发票号", dataIndex: "invoice_no" },
        { title: "支付单", dataIndex: "payment_no" },
        { title: "订单号", dataIndex: "order_no" },
        { title: "抬头", dataIndex: "title" },
        { title: "税号", dataIndex: "tax_no", render: (v: string) => v || "—" },
        { title: "金额", dataIndex: "amount", render: (v: string) => `¥${v}` },
        { title: "状态", dataIndex: "status", render: (v: string) => (
          <Tag color={v === "ISSUED" ? "green" : "red"}>{v === "ISSUED" ? "已开具" : "已红冲"}</Tag>) },
        {
          title: "操作", render: (_: unknown, r: InvoiceView) => r.status === "ISSUED" ? (
            <Perm code="finance:invoice:reverse">
              <Button size="small" danger onClick={async () => {
                await post(`/invoices/${r.invoice_no}/reverse`, { reason: "手工红冲" });
                message.success("已红冲"); refresh();
              }}>红冲</Button>
            </Perm>
          ) : null,
        },
      ]} dataSource={list} loading={loading}
        pagination={{ current: page, pageSize: size, total, onChange: (p, s) => { setPage(p); setSize(s); } }} />
      <Modal title="开票" open={createOpen} destroyOnClose onCancel={() => setCreateOpen(false)} onOk={async () => {
        const v = await form.validateFields();
        await post("/invoices", v);
        message.success("发票已开具"); form.resetFields(); setCreateOpen(false); refresh();
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
  const { list, total, page, size, loading, setPage, setSize, refresh } = usePaged<ReconcileTaskView>(
    (p) => get<{ list: ReconcileTaskView[]; total: number }>(`/reconcile-tasks?page=${p.page}&size=${p.size}`),
  );
  return (
    <>
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ReloadOutlined />} onClick={refresh}>刷新</Button>
      </Space>
      <Typography.Text type="secondary" style={{ display: "block", marginBottom: 8 }}>
        差异修复只允许补投递重放（REPLAY），禁止裸删（E10）；库存日结见 tools/reconcile。
      </Typography.Text>
      <Table rowKey="task_id" columns={[
        { title: "任务号", dataIndex: "task_no" },
        { title: "类型", dataIndex: "type" },
        { title: "业务日期", dataIndex: "biz_date" },
        { title: "状态", dataIndex: "status", render: (v: string) => (
          <Tag color={v === "OPEN" ? "orange" : "green"}>{v === "OPEN" ? "待处理" : "已处理"}</Tag>) },
        { title: "差异报告", dataIndex: "diff_report", ellipsis: true },
        { title: "处理方式", dataIndex: "resolution", render: (v: string) => v || "—" },
        {
          title: "操作", render: (_: unknown, r: ReconcileTaskView) => r.status === "OPEN" ? (
            <Space>
              <Perm code="finance:reconcile:resolve">
                <Button size="small" type="primary" onClick={async () => {
                  await post(`/reconcile-tasks/${r.task_id}/resolve`, { resolution: "REPLAY", remark: "补投递重放" });
                  message.success("已按补投递重放处理"); refresh();
                }}>补投递重放</Button>
                <Button size="small" onClick={async () => {
                  await post(`/reconcile-tasks/${r.task_id}/resolve`, { resolution: "IGNORE", remark: "人工核对无差异" });
                  message.success("已忽略"); refresh();
                }}>忽略</Button>
              </Perm>
            </Space>
          ) : null,
        },
      ]} dataSource={list} loading={loading}
        pagination={{ current: page, pageSize: size, total, onChange: (p, s) => { setPage(p); setSize(s); } }} />
    </>
  );
}
