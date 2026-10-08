// Orders.tsx · 交易中心（S5-02）：订单列表（支付倒计时）/ 详情（Saga 进度条 + 人工介入）/ 退货 / 发运。
// 约定：ID string（E8）；usePaged 分页；倒计时本地 1s tick（pay_expire_at 服务端权威）；严禁并发冒烟（E1）。

import { useEffect, useState } from "react";
import {
  App, Button, Descriptions, Drawer, Form, Input, InputNumber, Modal, Select, Space, Steps, Table, Tabs, Tag, Typography,
} from "antd";
import { PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import { get, Perm, post, usePaged } from "@micro/shared";
import type { OrderView, SagaView } from "@micro/shared/types";

const STATUS_TAG: Record<string, { text: string; color: string }> = {
  CREATED: { text: "待锁定", color: "default" },
  LOCKED: { text: "已锁库存", color: "cyan" },
  PAYING: { text: "支付中", color: "blue" },
  PAID: { text: "已支付", color: "green" },
  STOCK_OUT: { text: "已出库", color: "geekblue" },
  CONTRACTED: { text: "合同已建", color: "purple" },
  DONE: { text: "完成", color: "success" },
  CANCELLED: { text: "已取消", color: "default" },
  PAY_TIMEOUT: { text: "支付超时", color: "red" },
};

export default function OrdersPage(props: { defaultTab?: string }) {
  return (
    <Tabs defaultActiveKey={props.defaultTab ?? "orders"} items={[
      { key: "orders", label: "订单", children: <OrdersTab /> },
      { key: "returns", label: "退货", children: <ReturnsTab /> },
      { key: "shipments", label: "发运", children: <ShipmentsTab /> },
    ]} />
  );
}

// ---- 订单列表（倒计时）----

function fmtCountdown(expireAt: number): string {
  if (!expireAt) return "—";
  const diff = expireAt - Date.now();
  if (diff <= 0) return "已到期";
  const m = Math.floor(diff / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function OrdersTab() {
  const { message } = App.useApp();
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState("");
  const [detail, setDetail] = useState<OrderView | null>(null);
  const [saga, setSaga] = useState<SagaView | null>(null);
  const [payTarget, setPayTarget] = useState<OrderView | null>(null);
  const [, setTick] = useState(0);

  // 倒计时 1s tick（仅列表挂载期间）
  useEffect(() => {
    const t = setInterval(() => setTick((v) => v + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const { list, total, page, size, loading, setPage, setSize, refresh } = usePaged<OrderView>(
    (p) => get<{ list: OrderView[]; total: number }>(`/orders?page=${p.page}&size=${p.size}&keyword=${encodeURIComponent(keyword)}&status=${status}`),
  );

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

  return (
    <>
      <Space style={{ marginBottom: 16 }}>
        <Input.Search onSearch={(v) => { setKeyword(v); setPage(1); }} style={{ width: 240 }} allowClear placeholder="订单号" />
        <Select value={status || "all"} style={{ width: 140 }} onChange={(v) => setStatus(v === "all" ? "" : v)}
          options={Object.entries(STATUS_TAG).map(([k, t]) => ({ value: k, label: t.text }))} />
        <Button icon={<ReloadOutlined />} onClick={refresh}>刷新</Button>
        <Perm code="trade:order:create">
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setPayTarget({ order_no: "__new__" } as OrderView)}>创建订单</Button>
        </Perm>
      </Space>
      <Table rowKey="order_id" columns={[
        { title: "订单号", dataIndex: "order_no", render: (v: string, o: OrderView) => <a onClick={() => void openDetail(o)}>{v}</a> },
        { title: "类型", dataIndex: "type" },
        { title: "状态", dataIndex: "status", render: (v: string) => <Tag color={STATUS_TAG[v]?.color}>{STATUS_TAG[v]?.text ?? v}</Tag> },
        { title: "总额", dataIndex: "total_amount", render: (v: string) => <Typography.Text strong>¥{v}</Typography.Text> },
        { title: "支付倒计时", dataIndex: "pay_expire_at", render: (v: number, o: OrderView) =>
          ["CREATED", "LOCKED", "PAYING"].includes(o.status)
            ? <Typography.Text type={v && v - Date.now() < 300000 ? "danger" : undefined}>{fmtCountdown(v)}</Typography.Text>
            : "—" },
        { title: "创建时间", dataIndex: "created_at", render: (v: number) => v ? new Date(v).toLocaleString() : "—" },
      ]} dataSource={list} loading={loading}
        pagination={{ current: page, pageSize: size, total, showSizeChanger: true, onChange: (p, s) => { setPage(p); setSize(s); } }} />

      <Drawer title={`订单 ${detail?.order_no ?? ""}`} width={640} open={!!detail} onClose={() => { setDetail(null); setSaga(null); }}>
        {detail && (
          <>
            <Descriptions column={2} size="small" bordered>
              <Descriptions.Item label="状态"><Tag color={STATUS_TAG[detail.status]?.color}>{STATUS_TAG[detail.status]?.text ?? detail.status}</Tag></Descriptions.Item>
              <Descriptions.Item label="总额">¥{detail.total_amount}</Descriptions.Item>
              <Descriptions.Item label="类型">{detail.type}</Descriptions.Item>
              <Descriptions.Item label="买方">{detail.buyer_party_id || "—"}</Descriptions.Item>
            </Descriptions>
            <Typography.Title level={5} style={{ marginTop: 16 }}>明细</Typography.Title>
            <Table rowKey="item_id" size="small" pagination={false} columns={[
              { title: "SKU", dataIndex: "sku_id" },
              { title: "SN", dataIndex: "sn" },
              { title: "数量", dataIndex: "qty" },
              { title: "单价", dataIndex: "unit_price" },
              { title: "已出库", dataIndex: "out_qty" },
            ]} dataSource={detail.items ?? []} />
            <Typography.Title level={5} style={{ marginTop: 16 }}>Saga 进度</Typography.Title>
            {saga ? (
              <>
                <Steps direction="vertical" size="small" current={saga.current_step - 1} items={sagaSteps} />
                {saga.last_error && <Typography.Text type="danger">最近错误：{saga.last_error}</Typography.Text>}
                <div style={{ marginTop: 8 }}>
                  <Perm code="trade:order:retry">
                    <Button danger size="small" onClick={async () => {
                      await post(`/sagas/${saga.saga_id}/retry`, { remark: "前端人工重推" });
                      message.success("已重推");
                      setDetail(null); refresh();
                    }}>人工介入重推</Button>
                  </Perm>
                </div>
              </>
            ) : <Typography.Text type="secondary">无编排（非下单链路）</Typography.Text>}
            {["LOCKED"].includes(detail.status) && (
              <Perm code="trade:order:pay">
                <Button type="primary" style={{ marginTop: 16 }} onClick={async () => {
                  const r = await post<{ payment_no: string; pay_params: string }>(`/orders/${detail.order_no}/pay`, { channel: "WECHAT" });
                  message.success(`支付单 ${r.payment_no} 已发起`);
                  setDetail(null); refresh();
                }}>发起支付（WECHAT）</Button>
              </Perm>
            )}
            {["CREATED", "LOCKED", "PAYING"].includes(detail.status) && (
              <Perm code="trade:order:cancel">
                <Button danger style={{ marginTop: 16, marginLeft: 8 }} onClick={async () => {
                  await post(`/orders/${detail.order_no}/cancel`, { reason: "用户取消" });
                  message.success("已取消（库存已补偿释放）");
                  setDetail(null); refresh();
                }}>取消订单</Button>
              </Perm>
            )}
          </>
        )}
      </Drawer>

      <CreateOrderModal open={payTarget?.order_no === "__new__"} onClose={() => setPayTarget(null)} onDone={() => { setPayTarget(null); refresh(); }} />
    </>
  );
}

function CreateOrderModal(props: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [form] = Form.useForm();
  const { message } = App.useApp();
  return (
    <Modal title="创建订单（Saga 步骤1）" open={props.open} destroyOnClose onCancel={props.onClose} onOk={async () => {
      const v = await form.validateFields();
      const items = String(v.items_raw ?? "").split("\n").filter(Boolean).map((line: string) => {
        const [sku_id, warehouse_id, qty, sn] = line.split(",").map((x) => x.trim());
        return { sku_id, warehouse_id, qty: Number(qty), sn: sn ?? "" };
      });
      await post("/orders", { type: v.type, items, remark: v.remark ?? "" });
      message.success("订单已创建（Saga 推进中）");
      form.resetFields();
      props.onDone();
    }}>
      <Form form={form} layout="vertical">
        <Form.Item name="type" label="类型" initialValue="DEVICE" rules={[{ required: true }]}>
          <Select options={["DEVICE", "STATION", "PURCHASE"].map((v) => ({ value: v, label: v }))} />
        </Form.Item>
        <Form.Item name="items_raw" label="明细（每行：sku_id,warehouse_id,qty[,sn]）" rules={[{ required: true }]}>
          <Input.TextArea rows={3} placeholder={"101,1,2,SN00123\n101,1,1,SN00124"} />
        </Form.Item>
        <Form.Item name="remark" label="备注"><Input /></Form.Item>
      </Form>
    </Modal>
  );
}

// ---- 退货 ----

function ReturnsTab() {
  const { message } = App.useApp();
  const [createOpen, setCreateOpen] = useState(false);
  const { list, total, page, size, loading, setPage, setSize, refresh } = usePaged<Record<string, unknown>>(
    (p) => get(`/orders?page=${p.page}&size=${p.size}&type=RETURN`),
  );
  return (
    <>
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ReloadOutlined />} onClick={refresh}>刷新</Button>
        <Perm code="trade:return:create">
          <Button type="primary" onClick={() => setCreateOpen(true)}>退货申请</Button>
        </Perm>
      </Space>
      <Typography.Text type="secondary" style={{ display: "block", marginBottom: 8 }}>
        退货单以 RETURN 类型订单呈现；审批通过后由 finance 自动原路退回（order_return_approved → payment_refunded 回写 REFUNDED）。
      </Typography.Text>
      <Table rowKey="order_id" columns={[
        { title: "退货单号", dataIndex: "order_no" },
        { title: "状态", dataIndex: "status", render: (v: string) => <Tag color={STATUS_TAG[v]?.color}>{STATUS_TAG[v]?.text ?? v}</Tag> },
        { title: "创建时间", dataIndex: "created_at", render: (v: number) => v ? new Date(v).toLocaleString() : "—" },
      ]} dataSource={list} loading={loading}
        pagination={{ current: page, pageSize: size, total, onChange: (p, s) => { setPage(p); setSize(s); } }} />
      <Modal title="退货申请" open={createOpen} destroyOnClose onCancel={() => setCreateOpen(false)} onOk={async () => {
        // 基线：退货申请经原单号 + SKU/数量（表单直填）
        const orderNo = (document.getElementById("ret-order-no") as HTMLInputElement | null)?.value ?? "";
        const skuId = (document.getElementById("ret-sku") as HTMLInputElement | null)?.value ?? "";
        const qty = Number((document.getElementById("ret-qty") as HTMLInputElement | null)?.value ?? 0);
        await post("/return-orders", { order_no: orderNo, items: [{ sku_id: skuId, qty }], reason: "退货申请" });
        message.success("退货单已建（待审批）");
        setCreateOpen(false); refresh();
      }}>
        <Form layout="vertical">
          <Form.Item label="原销售单号"><Input id="ret-order-no" placeholder="ORD..." /></Form.Item>
          <Form.Item label="SKU ID"><Input id="ret-sku" /></Form.Item>
          <Form.Item label="数量"><InputNumber id="ret-qty" min={1} style={{ width: "100%" }} /></Form.Item>
        </Form>
      </Modal>
    </>
  );
}

// ---- 发运（发货单 / 轨迹 / 签收）----

function ShipmentsTab() {
  const { message } = App.useApp();
  const [createOpen, setCreateOpen] = useState(false);
  const [form] = Form.useForm();
  return (
    <>
      <Space style={{ marginBottom: 16 }}>
        <Perm code="trade:shipment:create">
          <Button type="primary" onClick={() => setCreateOpen(true)}>创建发货单</Button>
        </Perm>
      </Space>
      <Typography.Text type="secondary">
        发货单按订单维度管理：创建 → 追加轨迹（手工基线）→ 签收确认（shipment_signed 事件驱动质保起算）。
        发货单明细随订单详情展示；本页提供操作入口。
      </Typography.Text>
      <Modal title="创建发货单" open={createOpen} destroyOnClose onCancel={() => setCreateOpen(false)} onOk={async () => {
        const v = await form.validateFields();
        const items = String(v.items_raw ?? "").split("\n").filter(Boolean).map((line: string) => {
          const [sku_id, qty, sn] = line.split(",").map((x) => x.trim());
          return { sku_id, qty: Number(qty), sn: sn ?? "" };
        });
        const r = await post<{ shipment_no: string }>("/shipments", {
          order_no: v.order_no, warehouse_id: v.warehouse_id, items, carrier: v.carrier ?? "",
        });
        message.success(`发货单 ${r.shipment_no} 已建`);
        form.resetFields(); setCreateOpen(false);
      }}>
        <Form form={form} layout="vertical">
          <Form.Item name="order_no" label="订单号" rules={[{ required: true }]}><Input placeholder="ORD..." /></Form.Item>
          <Form.Item name="warehouse_id" label="发货仓 ID" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="items_raw" label="明细（每行：sku_id,qty[,sn]）" rules={[{ required: true }]}>
            <Input.TextArea rows={2} placeholder={"101,2,SN00123"} />
          </Form.Item>
          <Form.Item name="carrier" label="承运方"><Input /></Form.Item>
        </Form>
      </Modal>
      <div style={{ marginTop: 16 }}>
        <Typography.Title level={5}>轨迹录入 / 签收</Typography.Title>
        <Space.Compact style={{ width: 360 }}>
          <Input id="ship-no" placeholder="发货单号 SHP..." />
        </Space.Compact>
        <Space style={{ marginTop: 8, display: "flex" }}>
          <Perm code="trade:shipment:trace">
            <Button onClick={async () => {
              const no = (document.getElementById("ship-no") as HTMLInputElement).value;
              await post(`/shipments/${no}/traces`, { node: "华东分拨中心", description: "已发出" });
              message.success("轨迹已录入");
            }}>录入轨迹</Button>
          </Perm>
          <Perm code="trade:shipment:sign">
            <Button type="primary" onClick={async () => {
              const no = (document.getElementById("ship-no") as HTMLInputElement).value;
              await post(`/shipments/${no}/confirm-signed`, { signed_by: "管理员" });
              message.success("已签收（质保起算事件已发）");
            }}>签收确认</Button>
          </Perm>
        </Space>
      </div>
    </>
  );
}
