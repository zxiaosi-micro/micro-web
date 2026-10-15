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
import { usePrefs } from "@micro/shared/prefs";
import { getLocale } from "@micro/shared/prefs";
import { enumLabel } from "@micro/shared/prefs";
import type { InventoryItem, OrderView, PartyItem } from "@micro/shared/types";
import { cancelOrder, getOrder, listInventory, listOrders, listParties, payOrder } from "../api";

/** 支付中状态（倒计时/支付/取消操作窗口，同 admin Orders 口径） */
const ACTIVE_STATUSES = ["CREATED", "LOCKED", "PAYING"];

const ORDER_STATUSES = ["CREATED", "LOCKED", "PAYING", "PAID", "STOCK_OUT", "CONTRACTED", "DONE", "CANCELLED", "PAY_TIMEOUT"];

function fmtCountdown(expireAt: number, expiredText: string): string {
  if (!expireAt) return "—";
  const diff = expireAt - Date.now();
  if (diff <= 0) return expiredText;
  const m = Math.floor(diff / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  return `${m}:${String(s).padStart(2, "0")}`;
}

// ---- Tab 1：订单列表（倒计时 + 详情 + 支付/取消） ----

function OrdersTab() {
  const { t } = usePrefs();
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
    message.success(t("ord.payStarted", { no: r.payment_no }));
    setDetail(null);
    actionRef.current?.reload();
  };

  const doCancel = async (o: OrderView) => {
    await cancelOrder(o.order_no, t("ord.dealerCancel"));
    message.success(t("ord.cancelled"));
    setDetail(null);
    actionRef.current?.reload();
  };

  const columns: ProColumns<OrderView>[] = [
    { title: t("ord.orderNo"), dataIndex: "order_no", search: false, render: (_, o) => <a onClick={() => void openDetail(o)}>{o.order_no}</a> },
    { title: t("ord.type"), dataIndex: "type", search: false, render: (_, o) => <Tag color={o.type === "STATION" ? "purple" : "blue"}>{o.type}</Tag> },
    { title: t("common.status"), dataIndex: "status", search: false, render: (_, o) => <Tag color={orderColor(o.status)}>{enumLabel("enum.order", o.status)}</Tag> },
    { title: t("ord.total"), dataIndex: "total_amount", search: false, render: (_, o) => <Typography.Text strong>¥{o.total_amount}</Typography.Text> },
    {
      title: t("ord.countdown"),
      dataIndex: "pay_expire_at",
      search: false,
      render: (_, o) =>
        ACTIVE_STATUSES.includes(o.status) ? (
          <Typography.Text type={o.pay_expire_at && o.pay_expire_at - Date.now() < 300000 ? "danger" : undefined}>{fmtCountdown(o.pay_expire_at, t("ord.expired"))}</Typography.Text>
        ) : (
          "—"
        ),
    },
    { title: t("ord.createdAt"), dataIndex: "created_at", search: false, render: (_, o) => (o.created_at ? new Date(o.created_at).toLocaleString(getLocale()) : "—") },
  ];

  return (
    <>
      <Typography.Text type="secondary" style={{ display: "block", marginBottom: 8 }}>
        {t("ord.hint")}
      </Typography.Text>
      <ProTable<OrderView>
        headerTitle={t("ord.tabOrders")}
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
          <Input.Search key="kw" onSearch={(v) => setKeyword(v)} style={{ width: 240 }} allowClear placeholder={t("ord.searchPlaceholder")} />,
          <Select
            key="status"
            value={status || "all"}
            style={{ width: 140 }}
            onChange={(v) => setStatus(v === "all" ? "" : v)}
            options={ORDER_STATUSES.map((s) => ({ value: s, label: enumLabel("enum.order", s) }))}
          />,
        ]}
      />

      <Drawer title={t("ord.detailTitle", { no: detail?.order_no ?? "" })} width={560} open={!!detail} onClose={() => setDetail(null)}>
        {detail && (
          <>
            <Descriptions column={2} size="small" bordered>
              <Descriptions.Item label={t("common.status")}>
                <Tag color={orderColor(detail.status)}>{enumLabel("enum.order", detail.status)}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label={t("ord.total")}>¥{detail.total_amount}</Descriptions.Item>
              <Descriptions.Item label={t("ord.type")}>{detail.type}</Descriptions.Item>
              <Descriptions.Item label={t("ord.createdAt")}>
                {detail.created_at ? new Date(detail.created_at).toLocaleString(getLocale()) : "—"}
              </Descriptions.Item>
            </Descriptions>
            <Typography.Title level={5} style={{ marginTop: 16 }}>{t("ord.items")}</Typography.Title>
            <Table
              rowKey="item_id"
              size="small"
              pagination={false}
              columns={[
                { title: "SKU", dataIndex: "sku_name" },
                { title: "SN", dataIndex: "sn", render: (v: string) => v || "—" },
                { title: t("ord.qty"), dataIndex: "qty" },
                { title: t("ord.unitPrice"), dataIndex: "unit_price" },
                { title: t("ord.outQty"), dataIndex: "out_qty" },
              ]}
              dataSource={detail.items ?? []}
            />
            {ACTIVE_STATUSES.includes(detail.status) && (
              <Space style={{ marginTop: 16 }}>
                <Select value={payChannel} style={{ width: 160 }} onChange={setPayChannel}
                  options={[
                    { value: "WECHAT", label: t("ord.payWechat") },
                    { value: "ALIPAY", label: t("ord.payAlipay") },
                    { value: "BANK_OFFLINE", label: t("ord.payBank") },
                  ]} />
                {detail.status !== "CREATED" && (
                  <Button type="primary" onClick={() => void doPay(detail)}>{t("ord.pay")}</Button>
                )}
                <Button danger onClick={() => void doCancel(detail)}>{t("ord.cancel")}</Button>
              </Space>
            )}
            {detail.status === "CREATED" && (
              <Typography.Text type="secondary" style={{ display: "block", marginTop: 8, fontSize: 12 }}>
                {t("ord.waitLock")}
              </Typography.Text>
            )}
          </>
        )}
      </Drawer>
    </>
  );
}

/** 订单状态色（文案走 enum.order 公共词条） */
function orderColor(status: string): string {
  const colors: Record<string, string> = {
    CREATED: "default", LOCKED: "cyan", PAYING: "blue", PAID: "green", STOCK_OUT: "geekblue",
    CONTRACTED: "purple", DONE: "success", CANCELLED: "default", PAY_TIMEOUT: "red",
  };
  return colors[status] ?? "default";
}

// ---- Tab 2：库存（只读） ----

function InventoryTab() {
  const { t } = usePrefs();
  const [warehouseId, setWarehouseId] = useState("");
  const actionRef = useRef<ActionType | undefined>(undefined);

  const columns: ProColumns<InventoryItem>[] = [
    { title: t("ord.invSku"), dataIndex: "sku_id" },
    { title: t("ord.invWarehouse"), dataIndex: "warehouse_id" },
    { title: t("ord.invAvailable"), dataIndex: "available", render: (_, r) => <Typography.Text strong>{r.available}</Typography.Text> },
    { title: t("ord.invLocked"), dataIndex: "locked" },
    { title: t("ord.invTransit"), dataIndex: "in_transit" },
    { title: t("ord.invDefective"), dataIndex: "defective" },
    { title: t("ord.invThreshold"), dataIndex: "low_stock_threshold", render: (_, r) => r.low_stock_threshold || "—" },
    { title: t("ord.invUpdated"), dataIndex: "updated_at", render: (_, r) => (r.updated_at ? new Date(r.updated_at).toLocaleString(getLocale()) : "—") },
  ];

  return (
    <ProTable<InventoryItem>
      headerTitle={t("ord.tabInventory")}
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
          placeholder={t("ord.whPlaceholder")}
        />,
      ]}
    />
  );
}

// ---- Tab 3：客户（只读 + 新建客户占位） ----

function CustomersTab() {
  const { t } = usePrefs();
  const { message } = App.useApp();
  const [keyword, setKeyword] = useState("");
  const actionRef = useRef<ActionType | undefined>(undefined);

  const columns: ProColumns<PartyItem>[] = [
    { title: t("ord.custName"), dataIndex: "name", search: false },
    { title: t("ord.custType"), dataIndex: "type", search: false, render: (_, r) => (r.type ?? []).map((tp) => <Tag key={tp}>{tp}</Tag>) },
    { title: t("ord.custCredit"), dataIndex: "credit_code", search: false, render: (_, r) => r.credit_code || "—" },
    { title: t("ord.custRegion"), dataIndex: "region", search: false, render: (_, r) => r.region || "—" },
    { title: t("ord.custAddress"), dataIndex: "address", search: false, render: (_, r) => r.address || "—" },
  ];

  return (
    <ProTable<PartyItem>
      headerTitle={t("ord.tabCustomers")}
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
        <Input.Search key="kw" onSearch={(v) => setKeyword(v)} style={{ width: 240 }} allowClear placeholder={t("ord.custSearch")} />,
        // 占位：L2 待客户建档流程（FR-PTY-001 经销商可转客户，当前无建档端点授权）
        <Button key="create" type="primary" onClick={() => message.info(t("ord.custCreatePlaceholder"))}>
          {t("ord.custCreate")}
        </Button>,
      ]}
    />
  );
}

export default function OrdersPage() {
  const { t } = usePrefs();
  return (
    <Tabs
      defaultActiveKey="orders"
      items={[
        { key: "orders", label: t("ord.tabOrders"), children: <OrdersTab /> },
        { key: "inventory", label: t("ord.tabInventory"), children: <InventoryTab /> },
        { key: "customers", label: t("ord.tabCustomers"), children: <CustomersTab /> },
      ]}
    />
  );
}
