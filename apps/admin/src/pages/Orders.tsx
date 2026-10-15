// Orders.tsx · 交易中心（S5-02）：订单列表（支付倒计时）/ 详情（Saga 进度条 + 人工介入）/ 退货 / 发运。
// 约定：ID string（E8）；分页表走 ProTable；倒计时本地 1s tick（pay_expire_at 服务端权威）；严禁并发冒烟（E1）。
// 详情抽屉子表 / 创建订单 / 退货申请 / 发运录入为交互 Modal，保留 antd。

import { useRef, useState } from "react";
import { useInterval } from "ahooks";
import {
  App, Button, Descriptions, Drawer, Form, Input, InputNumber, Modal, Select, Space, Steps, Table, Tabs, Tag, Typography,
} from "antd";
import { PlusOutlined } from "@ant-design/icons";
import type { ActionType, ProColumns } from "@ant-design/pro-components";
import { ProTable } from "@ant-design/pro-components";
import { get, Perm, post } from "@micro/shared";
import { getLocale, t, usePrefs } from "@micro/shared/prefs";
import type { OrderView, SagaView } from "@micro/shared/types";

/** 订单状态 → 词条 key（色值留代码） */
const STATUS_TAG: Record<string, { key: string; color: string }> = {
  CREATED: { key: "order.stCreated", color: "default" },
  LOCKED: { key: "order.stLocked", color: "cyan" },
  PAYING: { key: "order.stPaying", color: "blue" },
  PAID: { key: "order.stPaid", color: "green" },
  STOCK_OUT: { key: "order.stStockOut", color: "geekblue" },
  CONTRACTED: { key: "order.stContracted", color: "purple" },
  DONE: { key: "order.stDone", color: "success" },
  CANCELLED: { key: "order.stCancelled", color: "default" },
  PAY_TIMEOUT: { key: "order.stPayTimeout", color: "red" },
};

function statusText(status: string): string {
  const m = STATUS_TAG[status];
  return m ? t(m.key) : status;
}

export default function OrdersPage(props: { defaultTab?: string }) {
  const { t } = usePrefs();
  return (
    <Tabs defaultActiveKey={props.defaultTab ?? "orders"} items={[
      { key: "orders", label: t("order.tabOrders"), children: <OrdersTab /> },
      { key: "returns", label: t("order.tabReturns"), children: <ReturnsTab /> },
      { key: "shipments", label: t("order.tabShipments"), children: <ShipmentsTab /> },
    ]} />
  );
}

// ---- 订单列表（倒计时）----

function fmtCountdown(expireAt: number): string {
  if (!expireAt) return "—";
  const diff = expireAt - Date.now();
  if (diff <= 0) return t("order.expired");
  const m = Math.floor(diff / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function OrdersTab() {
  const { t } = usePrefs();
  const { message } = App.useApp();
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState("");
  const [detail, setDetail] = useState<OrderView | null>(null);
  const [saga, setSaga] = useState<SagaView | null>(null);
  const [payTarget, setPayTarget] = useState<OrderView | null>(null);
  const [, setTick] = useState(0);
  const actionRef = useRef<ActionType | undefined>(undefined);

  // 倒计时 1s tick（仅列表挂载期间；ahooks useInterval 自动管理清理）
  useInterval(() => setTick((v) => v + 1), 1000);

  const openDetail = async (o: OrderView) => {
    const [d, s] = await Promise.all([
      get<OrderView>(`/orders/${o.order_no}`),
      get<{ saga: SagaView }>(`/orders/${o.order_no}/saga`).catch(() => null),
    ]);
    setDetail(d);
    setSaga(s?.saga ?? null);
  };

  const sagaSteps = saga?.steps.map((s) => ({
    title: s.name,
    description: s.idem_key,
    status: (s.status === "DONE" ? "finish"
      : s.status === "RUNNING" ? "process"
        : s.status === "MANUAL" ? "error"
          : s.status === "SKIPPED" ? "wait" : "wait") as "finish" | "process" | "error" | "wait",
  })) ?? [];

  const columns: ProColumns<OrderView>[] = [
    { title: t("order.orderNo"), dataIndex: "order_no", search: false, render: (_, o) => <a onClick={() => void openDetail(o)}>{o.order_no}</a> },
    { title: t("order.type"), dataIndex: "type", search: false },
    { title: t("common.status"), dataIndex: "status", search: false, render: (_, o) => <Tag color={STATUS_TAG[o.status]?.color}>{statusText(o.status)}</Tag> },
    { title: t("order.total"), dataIndex: "total_amount", search: false, render: (_, o) => <Typography.Text strong>¥{o.total_amount}</Typography.Text> },
    {
      title: t("order.payCountdown"),
      dataIndex: "pay_expire_at",
      search: false,
      render: (_, o) =>
        ["CREATED", "LOCKED", "PAYING"].includes(o.status)
          ? <Typography.Text type={o.pay_expire_at && o.pay_expire_at - Date.now() < 300000 ? "danger" : undefined}>{fmtCountdown(o.pay_expire_at)}</Typography.Text>
          : "—",
    },
    { title: t("inv.createdAt"), dataIndex: "created_at", search: false, render: (_, o) => (o.created_at ? new Date(o.created_at).toLocaleString(getLocale()) : "—") },
  ];

  return (
    <>
      <ProTable<OrderView>
        headerTitle={t("order.tabOrders")}
        rowKey="order_id"
        actionRef={actionRef}
        columns={columns}
        search={false}
        params={{ keyword, status }}
        request={async (params) => {
          const resp = await get<{ list: OrderView[]; total: number }>(
            `/orders?page=${params.current ?? 1}&size=${params.pageSize ?? 10}&keyword=${encodeURIComponent(keyword)}&status=${status}`,
          );
          return { data: resp.list, total: resp.total, success: true };
        }}
        pagination={{ defaultPageSize: 10, showSizeChanger: true, pageSizeOptions: [10, 20, 50, 100] }}
        toolBarRender={() => [
          <Input.Search key="kw" onSearch={(v) => setKeyword(v)} style={{ width: 240 }} allowClear placeholder={t("order.orderNo")} />,
          <Select key="status" value={status || "all"} style={{ width: 140 }} onChange={(v) => setStatus(v === "all" ? "" : v)}
            options={Object.entries(STATUS_TAG).map(([k, m]) => ({ value: k, label: t(m.key) }))} />,
          <Perm key="create" code="trade:order:create">
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setPayTarget({ order_no: "__new__" } as OrderView)}>{t("order.create")}</Button>
          </Perm>,
        ]}
      />

      <Drawer title={t("order.detailTitle", { no: detail?.order_no ?? "" })} width={640} open={!!detail} onClose={() => { setDetail(null); setSaga(null); }}>
        {detail && (
          <>
            <Descriptions column={2} size="small" bordered>
              <Descriptions.Item label={t("common.status")}><Tag color={STATUS_TAG[detail.status]?.color}>{statusText(detail.status)}</Tag></Descriptions.Item>
              <Descriptions.Item label={t("order.total")}>¥{detail.total_amount}</Descriptions.Item>
              <Descriptions.Item label={t("order.type")}>{detail.type}</Descriptions.Item>
              <Descriptions.Item label={t("order.buyer")}>{detail.buyer_party_id || "—"}</Descriptions.Item>
            </Descriptions>
            <Typography.Title level={5} style={{ marginTop: 16 }}>{t("order.items")}</Typography.Title>
            <Table rowKey="item_id" size="small" pagination={false} columns={[
              { title: "SKU", dataIndex: "sku_id" },
              { title: t("order.sn"), dataIndex: "sn" },
              { title: t("inv.qty"), dataIndex: "qty" },
              { title: t("order.unitPrice"), dataIndex: "unit_price" },
              { title: t("order.outQty"), dataIndex: "out_qty" },
            ]} dataSource={detail.items ?? []} />
            <Typography.Title level={5} style={{ marginTop: 16 }}>{t("order.sagaProgress")}</Typography.Title>
            {saga ? (
              <>
                <Steps direction="vertical" size="small" current={saga.current_step - 1} items={sagaSteps} />
                {saga.last_error && <Typography.Text type="danger">{t("order.lastError", { error: saga.last_error })}</Typography.Text>}
                <div style={{ marginTop: 8 }}>
                  <Perm code="trade:order:retry">
                    <Button danger size="small" onClick={async () => {
                      await post(`/sagas/${saga.saga_id}/retry`, { remark: "前端人工重推" });
                      message.success(t("order.retried"));
                      setDetail(null);
                      actionRef.current?.reload();
                    }}>{t("order.manualRetry")}</Button>
                  </Perm>
                </div>
              </>
            ) : <Typography.Text type="secondary">{t("order.noSaga")}</Typography.Text>}
            {["LOCKED"].includes(detail.status) && (
              <Perm code="trade:order:pay">
                <Button type="primary" style={{ marginTop: 16 }} onClick={async () => {
                  const r = await post<{ payment_no: string; pay_params: string }>(`/orders/${detail.order_no}/pay`, { channel: "WECHAT" });
                  message.success(t("order.payStarted", { no: r.payment_no }));
                  setDetail(null);
                  actionRef.current?.reload();
                }}>{t("order.pay")}</Button>
              </Perm>
            )}
            {["CREATED", "LOCKED", "PAYING"].includes(detail.status) && (
              <Perm code="trade:order:cancel">
                <Button danger style={{ marginTop: 16, marginLeft: 8 }} onClick={async () => {
                  await post(`/orders/${detail.order_no}/cancel`, { reason: "用户取消" });
                  message.success(t("order.cancelled"));
                  setDetail(null);
                  actionRef.current?.reload();
                }}>{t("order.cancel")}</Button>
              </Perm>
            )}
          </>
        )}
      </Drawer>

      <CreateOrderModal open={payTarget?.order_no === "__new__"} onClose={() => setPayTarget(null)} onDone={() => { setPayTarget(null); actionRef.current?.reload(); }} />
    </>
  );
}

function CreateOrderModal(props: { open: boolean; onClose: () => void; onDone: () => void }) {
  const { t } = usePrefs();
  const [form] = Form.useForm();
  const { message } = App.useApp();
  return (
    <Modal title={t("order.createTitle")} open={props.open} destroyOnClose onCancel={props.onClose} okText={t("common.confirm")} cancelText={t("common.cancel")} onOk={async () => {
      const v = await form.validateFields();
      const items = String(v.items_raw ?? "").split("\n").filter(Boolean).map((line: string) => {
        const [sku_id, warehouse_id, qty, sn] = line.split(",").map((x) => x.trim());
        return { sku_id, warehouse_id, qty: Number(qty), sn: sn ?? "" };
      });
      await post("/orders", { type: v.type, items, remark: v.remark ?? "" });
      message.success(t("order.created"));
      form.resetFields();
      props.onDone();
    }}>
      <Form form={form} layout="vertical">
        <Form.Item name="type" label={t("order.type")} initialValue="DEVICE" rules={[{ required: true, message: t("common.required") }]}>
          <Select options={["DEVICE", "STATION", "PURCHASE"].map((v) => ({ value: v, label: v }))} />
        </Form.Item>
        <Form.Item name="items_raw" label={t("order.itemsRaw")} rules={[{ required: true, message: t("common.required") }]}>
          <Input.TextArea rows={3} placeholder={"101,1,2,SN00123\n101,1,1,SN00124"} />
        </Form.Item>
        <Form.Item name="remark" label={t("parties.remark")}><Input /></Form.Item>
      </Form>
    </Modal>
  );
}

// ---- 退货 ----

interface ReturnOrderView {
  order_id: string;
  order_no: string;
  status: string;
  created_at: number;
}

function ReturnsTab() {
  const { t } = usePrefs();
  const { message } = App.useApp();
  const [createOpen, setCreateOpen] = useState(false);
  const actionRef = useRef<ActionType | undefined>(undefined);

  const columns: ProColumns<ReturnOrderView>[] = [
    { title: t("order.returnNo"), dataIndex: "order_no" },
    { title: t("common.status"), dataIndex: "status", render: (_, r) => <Tag color={STATUS_TAG[r.status]?.color}>{statusText(r.status)}</Tag> },
    { title: t("inv.createdAt"), dataIndex: "created_at", render: (_, r) => (r.created_at ? new Date(r.created_at).toLocaleString(getLocale()) : "—") },
  ];

  return (
    <>
      <Typography.Text type="secondary" style={{ display: "block", marginBottom: 8 }}>
        {t("order.returnHint")}
      </Typography.Text>
      <ProTable<ReturnOrderView>
        headerTitle={t("order.tabReturns")}
        rowKey="order_id"
        actionRef={actionRef}
        columns={columns}
        search={false}
        request={async (params) => {
          const resp = await get<{ list: ReturnOrderView[]; total: number }>(
            `/orders?page=${params.current ?? 1}&size=${params.pageSize ?? 10}&type=RETURN`,
          );
          return { data: resp.list, total: resp.total, success: true };
        }}
        pagination={{ defaultPageSize: 10, showSizeChanger: true }}
        toolBarRender={() => [
          <Perm key="create" code="trade:return:create">
            <Button type="primary" onClick={() => setCreateOpen(true)}>{t("order.returnApply")}</Button>
          </Perm>,
        ]}
      />
      <Modal title={t("order.returnApply")} open={createOpen} destroyOnClose onCancel={() => setCreateOpen(false)} okText={t("common.confirm")} cancelText={t("common.cancel")} onOk={async () => {
        // 基线：退货申请经原单号 + SKU/数量（表单直填）
        const orderNo = (document.getElementById("ret-order-no") as HTMLInputElement | null)?.value ?? "";
        const skuId = (document.getElementById("ret-sku") as HTMLInputElement | null)?.value ?? "";
        const qty = Number((document.getElementById("ret-qty") as HTMLInputElement | null)?.value ?? 0);
        await post("/return-orders", { order_no: orderNo, items: [{ sku_id: skuId, qty }], reason: t("order.returnApply") });
        message.success(t("order.returnCreated"));
        setCreateOpen(false);
        actionRef.current?.reload();
      }}>
        <Form layout="vertical">
          <Form.Item label={t("order.originNo")}><Input id="ret-order-no" placeholder="ORD..." /></Form.Item>
          <Form.Item label="SKU ID"><Input id="ret-sku" /></Form.Item>
          <Form.Item label={t("inv.qty")}><InputNumber id="ret-qty" min={1} style={{ width: "100%" }} /></Form.Item>
        </Form>
      </Modal>
    </>
  );
}

// ---- 发运（发货单 / 轨迹 / 签收）----

function ShipmentsTab() {
  const { t } = usePrefs();
  const { message } = App.useApp();
  const [createOpen, setCreateOpen] = useState(false);
  const [form] = Form.useForm();
  return (
    <>
      <Typography.Paragraph type="secondary">
        {t("order.shipHint")}
      </Typography.Paragraph>
      <Perm code="trade:shipment:create">
        <Button type="primary" onClick={() => setCreateOpen(true)}>{t("order.shipCreate")}</Button>
      </Perm>
      <Modal title={t("order.shipCreate")} open={createOpen} destroyOnClose onCancel={() => setCreateOpen(false)} okText={t("common.confirm")} cancelText={t("common.cancel")} onOk={async () => {
        const v = await form.validateFields();
        const items = String(v.items_raw ?? "").split("\n").filter(Boolean).map((line: string) => {
          const [sku_id, qty, sn] = line.split(",").map((x) => x.trim());
          return { sku_id, qty: Number(qty), sn: sn ?? "" };
        });
        const r = await post<{ shipment_no: string }>("/shipments", {
          order_no: v.order_no, warehouse_id: v.warehouse_id, items, carrier: v.carrier ?? "",
        });
        message.success(t("order.shipCreated", { no: r.shipment_no }));
        form.resetFields();
        setCreateOpen(false);
      }}>
        <Form form={form} layout="vertical">
          <Form.Item name="order_no" label={t("order.orderNo")} rules={[{ required: true, message: t("common.required") }]}><Input placeholder="ORD..." /></Form.Item>
          <Form.Item name="warehouse_id" label={t("order.shipWh")} rules={[{ required: true, message: t("common.required") }]}><Input /></Form.Item>
          <Form.Item name="items_raw" label={t("order.shipItemsRaw")} rules={[{ required: true, message: t("common.required") }]}>
            <Input.TextArea rows={2} placeholder={"101,2,SN00123"} />
          </Form.Item>
          <Form.Item name="carrier" label={t("order.carrier")}><Input /></Form.Item>
        </Form>
      </Modal>
      <div style={{ marginTop: 16 }}>
        <Typography.Title level={5}>{t("order.traceTitle")}</Typography.Title>
        <Space.Compact style={{ width: 360 }}>
          <Input id="ship-no" placeholder={t("order.shipNoPlaceholder")} />
        </Space.Compact>
        <Space style={{ marginTop: 8, display: "flex" }}>
          <Perm code="trade:shipment:trace">
            <Button onClick={async () => {
              const no = (document.getElementById("ship-no") as HTMLInputElement).value;
              await post(`/shipments/${no}/traces`, { node: "华东分拨中心", description: "已发出" });
              message.success(t("order.traceAdded"));
            }}>{t("order.addTrace")}</Button>
          </Perm>
          <Perm code="trade:shipment:sign">
            <Button type="primary" onClick={async () => {
              const no = (document.getElementById("ship-no") as HTMLInputElement).value;
              await post(`/shipments/${no}/confirm-signed`, { signed_by: "管理员" });
              message.success(t("order.signed"));
            }}>{t("order.sign")}</Button>
          </Perm>
        </Space>
      </div>
    </>
  );
}
