// Payments.tsx · 财务中心（S5-03）：支付单（REVIEWING 高亮 + 对公复核弹窗）/ 退款 / 发票 / 对账任务。
// 约定：ID string（E8）；四个 Tab 均走 ProTable；对公复核走 step-up（SensitivePrefixes，BFF 侧强制）；严禁并发冒烟（E1）。

import { useRef, useState } from "react";
import {
  App, Button, Form, Input, Modal, Select, Space, Tabs, Tag, Typography,
} from "antd";
import type { ActionType, ProColumns } from "@ant-design/pro-components";
import { ProTable } from "@ant-design/pro-components";
import { get, Perm, post } from "@micro/shared";
import { getLocale, usePrefs } from "@micro/shared/prefs";
import type { InvoiceView, PaymentView, ReconcileTaskView, RefundView } from "@micro/shared/types";

const PAY_STATUS: Record<string, { key: string; color: string }> = {
  PAYING: { key: "pay.stPaying", color: "blue" },
  REVIEWING: { key: "pay.stReviewing", color: "orange" },
  PAID: { key: "pay.stPaid", color: "green" },
  REJECTED: { key: "pay.stRejected", color: "red" },
  SETTLED: { key: "pay.stSettled", color: "purple" },
  CLOSED: { key: "pay.stClosed", color: "default" },
};

const PAGED = { defaultPageSize: 10, showSizeChanger: true, pageSizeOptions: [10, 20, 50, 100] };

export default function PaymentsPage(props: { defaultTab?: string }) {
  const { t } = usePrefs();
  return (
    <Tabs defaultActiveKey={props.defaultTab ?? "payments"} items={[
      { key: "payments", label: t("pay.tabPayments"), children: <PaymentsTab /> },
      { key: "refunds", label: t("pay.tabRefunds"), children: <RefundsTab /> },
      { key: "invoices", label: t("pay.tabInvoices"), children: <InvoicesTab /> },
      { key: "reconcile", label: t("pay.tabReconcile"), children: <ReconcileTab /> },
    ]} />
  );
}

// ---- 支付单 ----

function PaymentsTab() {
  const { t } = usePrefs();
  const { message } = App.useApp();
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState("");
  const [reviewTarget, setReviewTarget] = useState<PaymentView | null>(null);
  const [form] = Form.useForm();
  const actionRef = useRef<ActionType | undefined>(undefined);

  const columns: ProColumns<PaymentView>[] = [
    { title: t("pay.paymentNo"), dataIndex: "payment_no", search: false },
    { title: t("order.orderNo"), dataIndex: "order_no", search: false },
    { title: t("pay.channel"), dataIndex: "channel", search: false },
    { title: t("common.status"), dataIndex: "status", search: false, render: (_, r) => <Tag color={PAY_STATUS[r.status]?.color}>{PAY_STATUS[r.status] ? t(PAY_STATUS[r.status].key) : r.status}</Tag> },
    { title: t("pay.receivable"), dataIndex: "amount", search: false, render: (_, r) => `¥${r.amount}` },
    { title: t("pay.received"), dataIndex: "paid_amount", search: false, render: (_, r) => (r.paid_amount ? `¥${r.paid_amount}` : "—") },
    { title: t("pay.channelTxn"), dataIndex: "channel_txn_id", search: false, render: (_, r) => r.channel_txn_id || "—" },
    { title: t("pay.paidAt"), dataIndex: "paid_at", search: false, render: (_, r) => (r.paid_at ? new Date(r.paid_at).toLocaleString(getLocale()) : "—") },
    {
      title: t("common.actions"),
      valueType: "option",
      render: (_, r) => (
        <Space>
          {r.status === "PAYING" && (
            <Perm code="finance:payment:confirm">
              <Button size="small" onClick={async () => {
                await post(`/payments/${r.payment_no}/confirm`, { paid_amount: r.amount, source: "MOCK", channel_txn_id: `MOCK-${Date.now()}` });
                message.success(t("pay.mockDone"));
                actionRef.current?.reload();
              }}>{t("pay.mockConfirm")}</Button>
            </Perm>
          )}
          {r.status === "REVIEWING" && (
            <Perm code="finance:payment:approve">
              <Button size="small" type="primary" onClick={() => { setReviewTarget(r); form.resetFields(); }}>{t("pay.review")}</Button>
            </Perm>
          )}
          {r.status === "PAID" && (
            <Perm code="finance:payment:settle">
              <Button size="small" onClick={async () => {
                await post(`/payments/${r.payment_no}/settle`, {});
                message.success(t("pay.settled"));
                actionRef.current?.reload();
              }}>{t("pay.settle")}</Button>
            </Perm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <>
      <ProTable<PaymentView>
        headerTitle={t("pay.tabPayments")}
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
          <Input.Search key="kw" onSearch={(v) => setKeyword(v)} style={{ width: 240 }} allowClear placeholder={t("pay.searchPlaceholder")} />,
          <Select key="status" value={status || "all"} style={{ width: 140 }} onChange={(v) => setStatus(v === "all" ? "" : v)}
            options={Object.entries(PAY_STATUS).map(([k, m]) => ({ value: k, label: t(m.key) }))} />,
        ]}
      />

      <Modal title={t("pay.reviewTitle", { no: reviewTarget?.payment_no ?? "" })} open={!!reviewTarget}
        destroyOnClose onCancel={() => setReviewTarget(null)} okText={t("common.confirm")} cancelText={t("common.cancel")} onOk={async () => {
          const v = await form.validateFields();
          await post(`/payments/${reviewTarget?.payment_no}/approve`, { approve: v.approve, remark: v.remark ?? "" });
          message.success(v.approve ? t("pay.reviewPassed") : t("pay.reviewRejected"));
          setReviewTarget(null);
          actionRef.current?.reload();
        }}>
        <Typography.Paragraph type="secondary">
          {t("pay.createdBy", { by: reviewTarget?.created_by ?? "—" })}
        </Typography.Paragraph>
        <Form form={form} layout="vertical">
          <Form.Item name="approve" label={t("pay.reviewResult")} initialValue={true}>
            <Select options={[{ value: true, label: t("pay.reviewPass") }, { value: false, label: t("pay.reviewReject") }]} />
          </Form.Item>
          <Form.Item name="remark" label={t("pay.reviewRemark")}><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>
    </>
  );
}

// ---- 退款 ----

function RefundsTab() {
  const { t } = usePrefs();
  const { message } = App.useApp();
  const [createOpen, setCreateOpen] = useState(false);
  const [form] = Form.useForm();
  const actionRef = useRef<ActionType | undefined>(undefined);

  const columns: ProColumns<RefundView>[] = [
    { title: t("pay.refundNo"), dataIndex: "refund_no" },
    { title: t("pay.originPayment"), dataIndex: "payment_no" },
    { title: t("order.orderNo"), dataIndex: "order_no" },
    { title: t("pay.returnNo"), dataIndex: "return_no", render: (_, r) => r.return_no || "—" },
    { title: t("pay.amount"), dataIndex: "amount", render: (_, r) => `¥${r.amount}` },
    { title: t("pay.channel"), dataIndex: "channel" },
    {
      title: t("common.status"),
      dataIndex: "status",
      render: (_, r) => (
        <Tag color={r.status === "SUCCESS" ? "green" : r.status === "FAILED" ? "red" : "processing"}>{r.status}</Tag>
      ),
    },
    { title: t("inv.createdAt"), dataIndex: "created_at", render: (_, r) => new Date(r.created_at).toLocaleString(getLocale()) },
  ];

  return (
    <>
      <Typography.Text type="secondary" style={{ display: "block", marginBottom: 8 }}>
        {t("pay.refundHint")}
      </Typography.Text>
      <ProTable<RefundView>
        headerTitle={t("pay.tabRefunds")}
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
            <Button type="primary" onClick={() => setCreateOpen(true)}>{t("pay.manualRefund")}</Button>
          </Perm>,
        ]}
      />
      <Modal title={t("pay.refundTitle")} open={createOpen} destroyOnClose onCancel={() => setCreateOpen(false)} okText={t("common.confirm")} cancelText={t("common.cancel")} onOk={async () => {
        const v = await form.validateFields();
        const r = await post<{ refund_no: string }>("/refunds", v);
        message.success(t("pay.refundAccepted", { no: r.refund_no }));
        form.resetFields();
        setCreateOpen(false);
        actionRef.current?.reload();
      }}>
        <Form form={form} layout="vertical">
          <Form.Item name="payment_no" label={t("pay.originPaymentNo")} rules={[{ required: true, message: t("common.required") }]}><Input placeholder="PAY..." /></Form.Item>
          <Form.Item name="amount" label={t("pay.refundAmount")} rules={[{ required: true, message: t("common.required") }]}><Input placeholder="1299.50" /></Form.Item>
          <Form.Item name="reason" label={t("pay.reason")}><Input /></Form.Item>
        </Form>
      </Modal>
    </>
  );
}

// ---- 发票 ----

function InvoicesTab() {
  const { t } = usePrefs();
  const { message } = App.useApp();
  const [createOpen, setCreateOpen] = useState(false);
  const [form] = Form.useForm();
  const actionRef = useRef<ActionType | undefined>(undefined);

  const columns: ProColumns<InvoiceView>[] = [
    { title: t("pay.invoiceNo"), dataIndex: "invoice_no" },
    { title: t("pay.originPayment"), dataIndex: "payment_no" },
    { title: t("order.orderNo"), dataIndex: "order_no" },
    { title: t("pay.invoiceTitle"), dataIndex: "title" },
    { title: t("pay.taxNo"), dataIndex: "tax_no", render: (_, r) => r.tax_no || "—" },
    { title: t("pay.amount"), dataIndex: "amount", render: (_, r) => `¥${r.amount}` },
    {
      title: t("common.status"),
      dataIndex: "status",
      render: (_, r) => (
        <Tag color={r.status === "ISSUED" ? "green" : "red"}>{r.status === "ISSUED" ? t("pay.stIssued") : t("pay.stReversed")}</Tag>
      ),
    },
    {
      title: t("common.actions"),
      valueType: "option",
      render: (_, r) => r.status === "ISSUED" ? [
        <Perm key="reverse" code="finance:invoice:reverse">
          <Button size="small" danger onClick={async () => {
            await post(`/invoices/${r.invoice_no}/reverse`, { reason: t("pay.reverse") });
            message.success(t("pay.reversed"));
            actionRef.current?.reload();
          }}>{t("pay.reverse")}</Button>
        </Perm>,
      ] : [],
    },
  ];

  return (
    <>
      <ProTable<InvoiceView>
        headerTitle={t("pay.tabInvoices")}
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
            <Button type="primary" onClick={() => setCreateOpen(true)}>{t("pay.issue")}</Button>
          </Perm>,
        ]}
      />
      <Modal title={t("pay.issue")} open={createOpen} destroyOnClose onCancel={() => setCreateOpen(false)} okText={t("common.confirm")} cancelText={t("common.cancel")} onOk={async () => {
        const v = await form.validateFields();
        await post("/invoices", v);
        message.success(t("pay.invoiceCreated"));
        form.resetFields();
        setCreateOpen(false);
        actionRef.current?.reload();
      }}>
        <Form form={form} layout="vertical">
          <Form.Item name="payment_no" label={t("pay.paymentNo")} rules={[{ required: true, message: t("common.required") }]}><Input placeholder="PAY..." /></Form.Item>
          <Form.Item name="title" label={t("pay.invoiceTitle")} rules={[{ required: true, message: t("common.required") }]}><Input /></Form.Item>
          <Form.Item name="tax_no" label={t("pay.taxNo")}><Input /></Form.Item>
        </Form>
      </Modal>
    </>
  );
}

// ---- 对账任务 ----

function ReconcileTab() {
  const { t } = usePrefs();
  const { message } = App.useApp();
  const actionRef = useRef<ActionType | undefined>(undefined);

  const columns: ProColumns<ReconcileTaskView>[] = [
    { title: t("pay.taskNo"), dataIndex: "task_no" },
    { title: t("inv.bizType"), dataIndex: "type" },
    { title: t("pay.bizDate"), dataIndex: "biz_date" },
    {
      title: t("common.status"),
      dataIndex: "status",
      render: (_, r) => (
        <Tag color={r.status === "OPEN" ? "orange" : "green"}>{r.status === "OPEN" ? t("pay.stOpen") : t("pay.stHandled")}</Tag>
      ),
    },
    { title: t("pay.diffReport"), dataIndex: "diff_report", ellipsis: true },
    { title: t("pay.resolution"), dataIndex: "resolution", render: (_, r) => r.resolution || "—" },
    {
      title: t("common.actions"),
      valueType: "option",
      render: (_, r) => r.status === "OPEN" ? [
        <Space key="ops">
          <Perm code="finance:reconcile:resolve">
            <Button size="small" type="primary" onClick={async () => {
              await post(`/reconcile-tasks/${r.task_id}/resolve`, { resolution: "REPLAY", remark: "补投递重放" });
              message.success(t("pay.replayed"));
              actionRef.current?.reload();
            }}>{t("pay.replay")}</Button>
            <Button size="small" onClick={async () => {
              await post(`/reconcile-tasks/${r.task_id}/resolve`, { resolution: "IGNORE", remark: "人工核对无差异" });
              message.success(t("pay.ignored"));
              actionRef.current?.reload();
            }}>{t("pay.ignore")}</Button>
          </Perm>
        </Space>,
      ] : [],
    },
  ];

  return (
    <>
      <Typography.Text type="secondary" style={{ display: "block", marginBottom: 8 }}>
        {t("pay.reconHint")}
      </Typography.Text>
      <ProTable<ReconcileTaskView>
        headerTitle={t("pay.tabReconcile")}
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
