// Orders.tsx · 我的订单/库存/客户（S9-04）：一页三 Tab。
// 订单 buyer 过滤靠服务端 data_scope；支付倒计时本地 1s tick（pay_expire_at 服务端权威）；库存/客户只读。
// 三个 Tab 均走 ProTable request（api.ts 封装函数原样调用）。

import { useRef, useState } from "react";
import { useInterval } from "ahooks";
import {
  App,
  Button,
  Descriptions,
  Drawer,
  Input,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
} from "antd";
import type { ActionType, ProColumns } from "@ant-design/pro-components";
import { ProTable } from "@ant-design/pro-components";
import type { InventoryItem, OrderView, PartyItem } from "@micro/shared/types";
import { cancelOrder, getOrder, listInventory, listOrders, listParties, payOrder } from "../api";

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

/** 支付中状态（倒计时/支付/取消操作窗口，同 admin Orders 口径） */
const ACTIVE_STATUSES = ["CREATED", "LOCKED", "PAYING"];

function fmtCountdown(expireAt: number): string {
  if (!expireAt) return "—";
  const diff = expireAt - Date.now();
  if (diff <= 0) return "已到期";
  const m = Math.floor(diff / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  return `${m}:${String(s).padStart(2, "0")}`;
}

// ---- Tab 1：订单列表（倒计时 + 详情 + 支付/取消） ----

function OrdersTab() {
  const { message } = App.useApp();
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState("");
  const [detail, setDetail] = useState<OrderView | null>(null);
  const [payChannel, setPayChannel] = useState("WECHAT");
  const [, setTick] = useState(0);
  const actionRef = useRef<ActionType | undefined>(undefined);

  // 倒计时 1s tick（仅列表挂载期间；ahooks useInterval 自动管理清理）
  useInterval(() => setTick((v) => v + 1), 1000);

  const openDetail = async (o: OrderView) => {
    setDetail(await getOrder(o.order_no));
  };

  const doPay = async (o: OrderView) => {
    const r = await payOrder(o.order_no, payChannel);
    message.success(`支付单 ${r.payment_no} 已发起`);
    setDetail(null);
    actionRef.current?.reload();
  };

  const doCancel = async (o: OrderView) => {
    await cancelOrder(o.order_no, "经销商取消");
    message.success("已取消（库存已补偿释放）");
    setDetail(null);
    actionRef.current?.reload();
  };

  const columns: ProColumns<OrderView>[] = [
    { title: "订单号", dataIndex: "order_no", search: false, render: (_, o) => <a onClick={() => void openDetail(o)}>{o.order_no}</a> },
    { title: "类型", dataIndex: "type", search: false, render: (_, o) => <Tag color={o.type === "STATION" ? "purple" : "blue"}>{o.type}</Tag> },
    { title: "状态", dataIndex: "status", search: false, render: (_, o) => <Tag color={STATUS_TAG[o.status]?.color}>{STATUS_TAG[o.status]?.text ?? o.status}</Tag> },
    { title: "总额", dataIndex: "total_amount", search: false, render: (_, o) => <Typography.Text strong>¥{o.total_amount}</Typography.Text> },
    {
      title: "支付倒计时",
      dataIndex: "pay_expire_at",
      search: false,
      render: (_, o) =>
        ACTIVE_STATUSES.includes(o.status) ? (
          <Typography.Text type={o.pay_expire_at && o.pay_expire_at - Date.now() < 300000 ? "danger" : undefined}>{fmtCountdown(o.pay_expire_at)}</Typography.Text>
        ) : (
          "—"
        ),
    },
    { title: "创建时间", dataIndex: "created_at", search: false, render: (_, o) => (o.created_at ? new Date(o.created_at).toLocaleString("zh-CN") : "—") },
  ];

  return (
    <>
      <Typography.Text type="secondary" style={{ display: "block", marginBottom: 8 }}>
        仅显示本方订单（buyer 过滤由服务端 data_scope 承担）。
      </Typography.Text>
      <ProTable<OrderView>
        headerTitle="我的订单"
        rowKey="order_id"
        actionRef={actionRef}
        columns={columns}
        search={false}
        params={{ keyword, status }}
        request={async (params) => {
          const resp = await listOrders(keyword, status, { page: params.current ?? 1, size: params.pageSize ?? 10 });
          return { data: resp.list, total: resp.total, success: true };
        }}
        pagination={{ defaultPageSize: 10, showSizeChanger: true, pageSizeOptions: [10, 20, 50, 100] }}
        toolBarRender={() => [
          <Input.Search key="kw" onSearch={(v) => setKeyword(v)} style={{ width: 240 }} allowClear placeholder="订单号" />,
          <Select
            key="status"
            value={status || "all"}
            style={{ width: 140 }}
            onChange={(v) => setStatus(v === "all" ? "" : v)}
            options={Object.entries(STATUS_TAG).map(([k, t]) => ({ value: k, label: t.text }))}
          />,
        ]}
      />

      <Drawer title={`订单 ${detail?.order_no ?? ""}`} width={560} open={!!detail} onClose={() => setDetail(null)}>
        {detail && (
          <>
            <Descriptions column={2} size="small" bordered>
              <Descriptions.Item label="状态">
                <Tag color={STATUS_TAG[detail.status]?.color}>{STATUS_TAG[detail.status]?.text ?? detail.status}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="总额">¥{detail.total_amount}</Descriptions.Item>
              <Descriptions.Item label="类型">{detail.type}</Descriptions.Item>
              <Descriptions.Item label="创建时间">
                {detail.created_at ? new Date(detail.created_at).toLocaleString("zh-CN") : "—"}
              </Descriptions.Item>
            </Descriptions>
            <Typography.Title level={5} style={{ marginTop: 16 }}>明细</Typography.Title>
            <Table
              rowKey="item_id"
              size="small"
              pagination={false}
              columns={[
                { title: "SKU", dataIndex: "sku_name" },
                { title: "SN", dataIndex: "sn", render: (v: string) => v || "—" },
                { title: "数量", dataIndex: "qty" },
                { title: "单价", dataIndex: "unit_price" },
                { title: "已出库", dataIndex: "out_qty" },
              ]}
              dataSource={detail.items ?? []}
            />
            {ACTIVE_STATUSES.includes(detail.status) && (
              <Space style={{ marginTop: 16 }}>
                <Select value={payChannel} style={{ width: 160 }} onChange={setPayChannel}
                  options={[
                    { value: "WECHAT", label: "现结 · 微信支付" },
                    { value: "ALIPAY", label: "现结 · 支付宝" },
                    { value: "BANK_OFFLINE", label: "账期 · 对公转账" },
                  ]} />
                {detail.status !== "CREATED" && (
                  <Button type="primary" onClick={() => void doPay(detail)}>发起支付</Button>
                )}
                <Button danger onClick={() => void doCancel(detail)}>取消订单</Button>
              </Space>
            )}
            {detail.status === "CREATED" && (
              <Typography.Text type="secondary" style={{ display: "block", marginTop: 8, fontSize: 12 }}>
                待服务端 Saga 锁定库存后方可支付。
              </Typography.Text>
            )}
          </>
        )}
      </Drawer>
    </>
  );
}

// ---- Tab 2：库存（只读） ----

function InventoryTab() {
  const [warehouseId, setWarehouseId] = useState("");
  const actionRef = useRef<ActionType | undefined>(undefined);

  const columns: ProColumns<InventoryItem>[] = [
    { title: "SKU", dataIndex: "sku_id" },
    { title: "仓库", dataIndex: "warehouse_id" },
    { title: "可售", dataIndex: "available", render: (_, r) => <Typography.Text strong>{r.available}</Typography.Text> },
    { title: "锁定", dataIndex: "locked" },
    { title: "在途", dataIndex: "in_transit" },
    { title: "不良", dataIndex: "defective" },
    { title: "低库存阈值", dataIndex: "low_stock_threshold", render: (_, r) => r.low_stock_threshold || "—" },
    { title: "更新时间", dataIndex: "updated_at", render: (_, r) => (r.updated_at ? new Date(r.updated_at).toLocaleString("zh-CN") : "—") },
  ];

  return (
    <ProTable<InventoryItem>
      headerTitle="库存"
      rowKey="inventory_id"
      actionRef={actionRef}
      columns={columns}
      search={false}
      params={{ warehouseId }}
      request={async (params) => {
        const resp = await listInventory("", warehouseId, { page: params.current ?? 1, size: params.pageSize ?? 10 });
        return { data: resp.list, total: resp.total, success: true };
      }}
      pagination={{ defaultPageSize: 10, showSizeChanger: true, pageSizeOptions: [10, 20, 50, 100] }}
      toolBarRender={() => [
        <Input.Search
          key="wh"
          onSearch={(v) => setWarehouseId(v)}
          style={{ width: 200 }}
          allowClear
          placeholder="仓库 ID 过滤"
        />,
      ]}
    />
  );
}

// ---- Tab 3：客户（只读 + 新建客户占位） ----

function CustomersTab() {
  const { message } = App.useApp();
  const [keyword, setKeyword] = useState("");
  const actionRef = useRef<ActionType | undefined>(undefined);

  const columns: ProColumns<PartyItem>[] = [
    { title: "名称", dataIndex: "name", search: false },
    { title: "类型", dataIndex: "type", search: false, render: (_, r) => (r.type ?? []).map((t) => <Tag key={t}>{t}</Tag>) },
    { title: "信用代码", dataIndex: "credit_code", search: false, render: (_, r) => r.credit_code || "—" },
    { title: "区域", dataIndex: "region", search: false, render: (_, r) => r.region || "—" },
    { title: "地址", dataIndex: "address", search: false, render: (_, r) => r.address || "—" },
  ];

  return (
    <ProTable<PartyItem>
      headerTitle="客户"
      rowKey="party_id"
      actionRef={actionRef}
      columns={columns}
      params={{ keyword }}
      request={async (params) => {
        const resp = await listParties("CUSTOMER", keyword, { page: params.current ?? 1, size: params.pageSize ?? 10 });
        return { data: resp.list, total: resp.total, success: true };
      }}
      pagination={{ defaultPageSize: 10, showSizeChanger: true, pageSizeOptions: [10, 20, 50, 100] }}
      toolBarRender={() => [
        <Input.Search key="kw" onSearch={(v) => setKeyword(v)} style={{ width: 240 }} allowClear placeholder="客户名称/信用代码" />,
        // 占位：L2 待客户建档流程（FR-PTY-001 经销商可转客户，当前无建档端点授权）
        <Button key="create" type="primary" onClick={() => message.info("占位：客户建档跳转待 L2（经销商可转客户，FR-PTY-001）")}>
          新建客户
        </Button>,
      ]}
    />
  );
}

export default function OrdersPage() {
  return (
    <Tabs
      defaultActiveKey="orders"
      items={[
        { key: "orders", label: "我的订单", children: <OrdersTab /> },
        { key: "inventory", label: "库存", children: <InventoryTab /> },
        { key: "customers", label: "客户", children: <CustomersTab /> },
      ]}
    />
  );
}
