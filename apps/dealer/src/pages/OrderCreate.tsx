// OrderCreate.tsx · 下单（S9-04）：购物车（本地行集合，批量增删 SKU+数量）+ 现结/账期 + 场站单开关。
// 链路同 admin Orders：POST /orders（Saga 步骤1）→ POST /orders/:no/pay（现结渠道）；账期 BANK_OFFLINE 由财务确认到账。

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  Descriptions,
  Input,
  InputNumber,
  Modal,
  Radio,
  Row,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
} from "antd";
import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import { usePrefs } from "@micro/shared/prefs";
import { getLocale } from "@micro/shared/prefs";
import type { InventoryItem, PriceItem, SkuItem } from "@micro/shared/types";
import { createOrder, listInventory, listPrices, listSkus, payOrder } from "../api";

type PayChannel = "WECHAT" | "ALIPAY" | "BANK_OFFLINE";

/** 购物车行（本地 state；单价 = 经销商价缺省回退零售价，与目录口径一致） */
interface CartLine {
  sku_id: string;
  sku_name: string;
  warehouse_id: string;
  qty: number;
  unitPrice: string | null; // null = 未设价（提交前拦截）
  priceSource: "DEALER" | "RETAIL" | "NONE";
}

/** 下单结果弹窗数据 */
interface OrderDone {
  orderNo: string;
  totalAmount: string;
  payExpireAt: number;
  channel: PayChannel;
  paymentNo: string;
}

export default function OrderCreatePage() {
  const { t } = usePrefs();
  const { message } = App.useApp();
  const [skus, setSkus] = useState<SkuItem[]>([]);
  const [invBySku, setInvBySku] = useState<Map<string, InventoryItem[]>>(new Map());
  const [pickSkuId, setPickSkuId] = useState<string | null>(null);
  const [pickQty, setPickQty] = useState(1);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [channel, setChannel] = useState<PayChannel>("WECHAT");
  const [stationOrder, setStationOrder] = useState(false);
  const [remark, setRemark] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<OrderDone | null>(null);

  // 价格缓存（sku_id → 当前价目表；DEALER 缺省回退 RETAIL）
  const priceCacheRef = useRef<Map<string, PriceItem[]>>(new Map());

  const payChannels: { value: PayChannel; label: string }[] = [
    { value: "WECHAT", label: t("ord.payWechat") },
    { value: "ALIPAY", label: t("ord.payAlipay") },
    { value: "BANK_OFFLINE", label: t("ord.payBank") },
  ];

  useEffect(() => {
    // 购物车数据源：SKU 全量（size=100 dev 量级）+ 库存聚合（warehouse 选择与可售校验）
    void (async () => {
      const [s, inv] = await Promise.all([
        listSkus("", { page: 1, size: 100 }),
        listInventory("", "", { page: 1, size: 100 }),
      ]);
      setSkus(s.list ?? []);
      const map = new Map<string, InventoryItem[]>();
      for (const it of inv.list ?? []) {
        const arr = map.get(it.sku_id) ?? [];
        arr.push(it);
        map.set(it.sku_id, arr);
      }
      setInvBySku(map);
    })();
  }, []);

  const skuNameOf = (id: string) => skus.find((x) => x.sku_id === id)?.name ?? id;

  const loadPrices = async (skuId: string): Promise<PriceItem[]> => {
    const cached = priceCacheRef.current.get(skuId);
    if (cached) {
      return cached;
    }
    const r = await listPrices(skuId).catch(() => null);
    const list = r?.list ?? [];
    priceCacheRef.current.set(skuId, list);
    return list;
  };

  const addToCart = async () => {
    if (!pickSkuId) {
      void message.warning(t("mk.needSku"));
      return;
    }
    if (pickQty < 1) {
      void message.warning(t("mk.needQty"));
      return;
    }
    // 发货仓：取该 SKU 首个有可售库存的仓（无可售记录则拦截——OrderItemInputApi.warehouse_id 必填）
    const invRows = invBySku.get(pickSkuId) ?? [];
    const warehouse = invRows.find((x) => x.available > 0) ?? invRows[0];
    if (!warehouse) {
      void message.warning(t("mk.noStock"));
      return;
    }
    const prices = await loadPrices(pickSkuId);
    const dealer = prices.find((x) => x.price_type === "DEALER");
    const retail = prices.find((x) => x.price_type === "RETAIL");
    if (!dealer && !retail) {
      void message.warning(t("mk.noPrice"));
      return;
    }
    const line: CartLine = {
      sku_id: pickSkuId,
      sku_name: skuNameOf(pickSkuId),
      warehouse_id: warehouse.warehouse_id,
      qty: pickQty,
      unitPrice: (dealer ?? retail)?.amount ?? null,
      priceSource: dealer ? "DEALER" : "RETAIL",
    };
    // 同 SKU + 同仓合并数量
    setCart((prev) => {
      const idx = prev.findIndex((x) => x.sku_id === line.sku_id && x.warehouse_id === line.warehouse_id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], qty: next[idx].qty + line.qty };
        return next;
      }
      return [...prev, line];
    });
    setPickSkuId(null);
    setPickQty(1);
  };

  const totalAmount = useMemo(
    () => cart.reduce((sum, x) => sum + Number(x.unitPrice ?? 0) * x.qty, 0).toFixed(2),
    [cart],
  );

  const submit = async () => {
    if (cart.length === 0) {
      void message.warning(t("mk.emptyCart"));
      return;
    }
    if (cart.some((x) => !x.unitPrice)) {
      void message.warning(t("mk.hasNoPrice"));
      return;
    }
    setSubmitting(true);
    try {
      // type：DEVICE 零售 / STATION 场站单（模板选择占位，见下方 Alert）
      const r = await createOrder({
        type: stationOrder ? "STATION" : "DEVICE",
        items: cart.map((x) => ({ sku_id: x.sku_id, warehouse_id: x.warehouse_id, qty: x.qty })),
        remark,
      });
      // 现结：紧跟发起支付（Saga 锁库后进入 PAYING）；账期：生成支付单由财务确认
      if (channel === "BANK_OFFLINE") {
        message.success(t("mk.createdBill", { no: r.order_no }));
        setDone({ orderNo: r.order_no, totalAmount: r.total_amount, payExpireAt: r.pay_expire_at, channel, paymentNo: "" });
      } else {
        const pay = await payOrder(r.order_no, channel);
        message.success(t("mk.createdPaid", { no: r.order_no, pay: pay.payment_no }));
        setDone({ orderNo: r.order_no, totalAmount: r.total_amount, payExpireAt: r.pay_expire_at, channel, paymentNo: pay.payment_no });
      }
      setCart([]);
      setRemark("");
    } finally {
      setSubmitting(false);
    }
  };

  const cartColumns = [
    { title: "SKU", dataIndex: "sku_id", render: (v: string, r: CartLine) => `${r.sku_name}（${v}）` },
    { title: t("mk.warehouse"), dataIndex: "warehouse_id" },
    {
      title: t("mk.qty"),
      dataIndex: "qty",
      render: (v: number, r: CartLine, i: number) => (
        <InputNumber
          min={1}
          value={v}
          onChange={(n) =>
            setCart((prev) => prev.map((x, idx) => (idx === i ? { ...x, qty: Math.max(1, n ?? 1) } : x)))
          }
        />
      ),
    },
    {
      title: t("mk.unitPrice"),
      dataIndex: "unitPrice",
      render: (v: string | null, r: CartLine) =>
        v ? (
          <Space size={4}>
            <span>¥{v}</span>
            {r.priceSource === "DEALER" ? <Tag color="green">{t("cat.dealerTag")}</Tag> : <Tag>{t("cat.retailTag")}</Tag>}
          </Space>
        ) : (
          <Tag color="red">{t("cat.noPrice")}</Tag>
        ),
    },
    {
      title: t("mk.subtotal"),
      render: (_: unknown, r: CartLine) => (r.unitPrice ? `¥${(Number(r.unitPrice) * r.qty).toFixed(2)}` : "—"),
    },
    {
      title: t("common.actions"),
      render: (_: unknown, _r: CartLine, i: number) => (
        <Button size="small" type="link" danger icon={<DeleteOutlined />}
          onClick={() => setCart((prev) => prev.filter((_, idx) => idx !== i))}>
          {t("mk.remove")}
        </Button>
      ),
    },
  ];

  return (
    <>
      <Typography.Title level={4}>{t("mk.title")}</Typography.Title>
      <Row gutter={[16, 16]}>
        <Col span={16}>
          <Card title={t("mk.cart")} extra={
            <Space.Compact>
              <Select
                showSearch
                style={{ width: 280 }}
                placeholder={t("mk.pickSku")}
                value={pickSkuId ?? undefined}
                optionFilterProp="label"
                onChange={(v) => setPickSkuId(v)}
                options={skus.map((s) => ({ value: s.sku_id, label: `${s.code} ${s.name}` }))}
              />
              <InputNumber min={1} value={pickQty} onChange={(n) => setPickQty(Math.max(1, n ?? 1))} />
              <Button type="primary" icon={<PlusOutlined />} onClick={() => void addToCart()}>{t("mk.add")}</Button>
            </Space.Compact>
          }>
            <Table rowKey={(r: CartLine) => `${r.sku_id}-${r.warehouse_id}`} size="small" pagination={false}
              columns={cartColumns} dataSource={cart} locale={{ emptyText: t("mk.cartEmpty") }} />
            <div style={{ marginTop: 12, textAlign: "right" }}>
              <Typography.Text strong style={{ fontSize: 16 }}>{t("mk.total", { amount: totalAmount })}</Typography.Text>
            </div>
          </Card>
        </Col>
        <Col span={8}>
          <Card title={t("mk.payTitle")}>
            <Radio.Group value={channel} onChange={(e) => setChannel(e.target.value as PayChannel)}>
              <Space direction="vertical">
                {payChannels.map((c) => (
                  <Radio key={c.value} value={c.value}>{c.label}</Radio>
                ))}
              </Space>
            </Radio.Group>
            {channel === "BANK_OFFLINE" && (
              <Typography.Text type="secondary" style={{ display: "block", marginTop: 8, fontSize: 12 }}>
                {t("mk.bankHint")}
              </Typography.Text>
            )}
          </Card>
          <Card title={t("mk.optionsTitle")} style={{ marginTop: 16 }}>
            <Space direction="vertical" style={{ width: "100%" }}>
              <Space>
                <span>{t("mk.stationOrder")}</span>
                <Switch checked={stationOrder} onChange={setStationOrder} />
                {stationOrder && <Tag color="purple">type=STATION</Tag>}
              </Space>
              {stationOrder && (
                <Alert
                  type="info"
                  showIcon
                  message={t("mk.stationAlert")}
                  description={t("mk.stationAlertDesc")}
                />
              )}
              <Input.TextArea
                rows={2}
                value={remark}
                onChange={(e) => setRemark(e.target.value)}
                placeholder={t("mk.remarkPlaceholder")}
              />
              <Button type="primary" block loading={submitting} disabled={cart.length === 0} onClick={() => void submit()}>
                {t("mk.submit", { amount: totalAmount })}
              </Button>
            </Space>
          </Card>
        </Col>
      </Row>

      <Modal
        title={t("mk.doneTitle")}
        open={!!done}
        okText={t("common.confirm")}
        cancelText={t("common.cancel")}
        footer={[
          <Button key="stay" onClick={() => setDone(null)}>{t("mk.continue")}</Button>,
          <Button key="orders" type="primary" onClick={() => {
            setDone(null);
            window.location.hash = "#/orders";
          }}>{t("mk.goOrders")}</Button>,
        ]}
        onCancel={() => setDone(null)}
      >
        {done && (
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label={t("mk.orderNo")}>{done.orderNo}</Descriptions.Item>
            <Descriptions.Item label={t("mk.totalLabel")}>¥{done.totalAmount}</Descriptions.Item>
            <Descriptions.Item label={t("mk.payDeadline")}>
              {done.payExpireAt ? new Date(done.payExpireAt).toLocaleString(getLocale()) : "—"}
            </Descriptions.Item>
            <Descriptions.Item label={t("mk.payMethod")}>
              {payChannels.find((c) => c.value === done.channel)?.label ?? done.channel}
            </Descriptions.Item>
            <Descriptions.Item label={t("mk.paymentLabel")}>
              {done.paymentNo || t("mk.paymentBankNote")}
            </Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </>
  );
}
