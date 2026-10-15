// Products.tsx · 商品中心（S4-05）：商品/SKU/价格（版本切换）/质保策略 + 场站模板 BOM。
// 路由 products 与 station-products 共用本页（Tab 切换）；ID string（E8）。

import { useEffect, useMemo, useState } from "react";
import {
  App, Button, Form, Input, InputNumber, Modal, Select, Space, Table, Tabs, Tag, Typography,
} from "antd";
import { PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import { get, Perm, post, put } from "@micro/shared";
import { getLocale, usePrefs } from "@micro/shared/prefs";
import type { BomItem, PriceItem, ProductItem, SkuItem, StationProductItem } from "@micro/shared/types";

const PRICE_TYPES = ["RETAIL", "DEALER", "TIER"] as const;

export default function ProductsPage({ defaultTab = "products" }: { defaultTab?: string }) {
  const { t } = usePrefs();
  return (
    <Tabs defaultActiveKey={defaultTab} items={[
      { key: "products", label: t("products.tabProducts"), children: <ProductsTab /> },
      { key: "station", label: t("products.tabStation"), children: <StationTab /> },
    ]} />
  );
}

function ProductsTab() {
  const { t } = usePrefs();
  const { message } = App.useApp();
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [skus, setSkus] = useState<SkuItem[]>([]);
  const [selectedSku, setSelectedSku] = useState<SkuItem | null>(null);
  const [prices, setPrices] = useState<PriceItem[]>([]);
  const [priceHistory, setPriceHistory] = useState(false);
  const [productOpen, setProductOpen] = useState(false);
  const [skuOpen, setSkuOpen] = useState(false);
  const [priceOpen, setPriceOpen] = useState(false);
  const [warrantyOpen, setWarrantyOpen] = useState(false);
  const [productForm] = Form.useForm();
  const [skuForm] = Form.useForm();
  const [priceForm] = Form.useForm();
  const [warrantyForm] = Form.useForm();

  const load = async () => {
    const [p, s] = await Promise.all([
      get<{ list: ProductItem[] }>("/products?page=1&size=100"),
      get<{ list: SkuItem[] }>("/skus?page=1&size=100"),
    ]);
    setProducts(p.list ?? []);
    setSkus(s.list ?? []);
  };

  useEffect(() => {
    void load();
  }, []);

  const loadPrices = async (sku: SkuItem, history: boolean) => {
    setSelectedSku(sku);
    setPriceHistory(history);
    const r = await get<{ list: PriceItem[] }>(`/prices?sku_id=${sku.sku_id}&latest_only=${history ? "false" : "true"}`);
    setPrices(r.list ?? []);
  };

  const skuColumns = useMemo(() => [
    { title: t("products.skuCode"), dataIndex: "code" },
    { title: t("parties.name"), dataIndex: "name" },
    { title: t("parties.type"), dataIndex: "type", render: (v: string) => <Tag color={v === "EXT_WARRANTY" ? "purple" : "blue"}>{v}</Tag> },
    {
      title: t("common.actions"),
      render: (_: unknown, r: SkuItem) => (
        <Space>
          <Button size="small" type="link" onClick={() => void loadPrices(r, false)}>{t("products.priceType")}</Button>
          <Perm code="catalog:price:set">
            <Button size="small" type="link" onClick={() => { setSelectedSku(r); setPriceOpen(true); }}>{t("products.setPrice")}</Button>
          </Perm>
          <Perm code="catalog:warranty:update">
            <Button size="small" type="link" onClick={() => { setSelectedSku(r); setWarrantyOpen(true); }}>{t("products.warranty")}</Button>
          </Perm>
        </Space>
      ),
    },
  ], [t]);

  const submitProduct = async () => {
    const v = await productForm.validateFields();
    await post("/products", v);
    message.success(t("common.saved"));
    setProductOpen(false);
    void load();
  };

  const submitSku = async () => {
    const v = await skuForm.validateFields();
    await post("/skus", v);
    message.success(t("common.saved"));
    setSkuOpen(false);
    void load();
  };

  const submitPrice = async () => {
    if (!selectedSku) return;
    const v = await priceForm.validateFields();
    await post(`/skus/${selectedSku.sku_id}/prices`, v);
    message.success(t("products.priceSaved"));
    setPriceOpen(false);
    if (selectedSku) void loadPrices(selectedSku, false);
  };

  const submitWarranty = async () => {
    if (!selectedSku) return;
    const v = await warrantyForm.validateFields();
    await put(`/skus/${selectedSku.sku_id}/warranty-policy`, v);
    message.success(t("products.warrantySaved"));
    setWarrantyOpen(false);
  };

  return (
    <>
      <Space style={{ marginBottom: 16 }}>
        <Perm code="catalog:product:create">
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setProductOpen(true)}>{t("products.createProduct")}</Button>
        </Perm>
        <Perm code="catalog:sku:create">
          <Button icon={<PlusOutlined />} onClick={() => setSkuOpen(true)}>{t("products.createSku")}</Button>
        </Perm>
        <Button icon={<ReloadOutlined />} onClick={() => void load()}>{t("common.refresh")}</Button>
      </Space>
      <Table rowKey="product_id" size="small" pagination={false} dataSource={products} style={{ marginBottom: 16 }}
        columns={[
          { title: t("products.productOf"), dataIndex: "name" },
          { title: t("products.category"), dataIndex: "category", render: (v: string) => v || "-" },
          { title: t("common.status"), dataIndex: "status", render: (v: number) => (v === 1 ? <Tag color="green">{t("products.onShelf")}</Tag> : <Tag>{t("products.offShelf")}</Tag>) },
        ]} />
      <Typography.Text strong>{t("products.skuList")}</Typography.Text>
      <Table rowKey="sku_id" size="small" pagination={false} dataSource={skus} style={{ marginTop: 8 }} columns={skuColumns} />
      {selectedSku && (
        <div style={{ marginTop: 16 }}>
          <Space>
            <Typography.Text strong>{t("products.priceOf", { name: selectedSku.name })}</Typography.Text>
            <Select size="small" value={priceHistory ? "history" : "latest"} style={{ width: 140 }}
              onChange={(v) => void loadPrices(selectedSku, v === "history")}
              options={[{ value: "latest", label: t("products.latest") }, { value: "history", label: t("products.history") }]} />
          </Space>
          <Table rowKey="price_id" size="small" pagination={false} style={{ marginTop: 8 }} dataSource={prices}
            columns={[
              { title: t("products.priceType"), dataIndex: "price_type" },
              { title: t("products.tierQty"), dataIndex: "tier_qty" },
              { title: t("products.price"), dataIndex: "amount" },
              { title: t("products.version"), dataIndex: "version", render: (v: number) => <Tag>v{v}</Tag> },
              { title: t("parties.time"), dataIndex: "created_at", render: (v: number) => (v ? new Date(v).toLocaleString(getLocale()) : "-") },
            ]} />
        </div>
      )}

      <Modal title={t("products.createProduct")} open={productOpen} onOk={() => void submitProduct()} onCancel={() => setProductOpen(false)} okText={t("common.confirm")} cancelText={t("common.cancel")} destroyOnHidden>
        <Form form={productForm} layout="vertical">
          <Form.Item name="name" label={t("parties.name")} rules={[{ required: true, message: t("common.required") }]}><Input /></Form.Item>
          <Form.Item name="category" label={t("products.category")}><Input /></Form.Item>
          <Form.Item name="remark" label={t("parties.remark")}><Input /></Form.Item>
        </Form>
      </Modal>
      <Modal title={t("products.createSku")} open={skuOpen} onOk={() => void submitSku()} onCancel={() => setSkuOpen(false)} okText={t("common.confirm")} cancelText={t("common.cancel")} destroyOnHidden>
        <Form form={skuForm} layout="vertical">
          <Form.Item name="product_id" label={t("products.productId")} rules={[{ required: true, message: t("common.required") }]}><Input /></Form.Item>
          <Form.Item name="code" label={t("products.skuCode")} rules={[{ required: true, message: t("common.required") }]}><Input /></Form.Item>
          <Form.Item name="name" label={t("products.skuName")} rules={[{ required: true, message: t("common.required") }]}><Input /></Form.Item>
          <Form.Item name="type" label={t("parties.type")} initialValue="STANDARD">
            <Select options={[{ value: "STANDARD", label: "STANDARD" }, { value: "EXT_WARRANTY", label: "EXT_WARRANTY" }]} />
          </Form.Item>
          <Form.Item name="spec" label={t("products.spec")}><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>
      <Modal title={t("products.priceTitle", { name: selectedSku?.name ?? "" })} open={priceOpen} onOk={() => void submitPrice()} onCancel={() => setPriceOpen(false)} okText={t("common.confirm")} cancelText={t("common.cancel")} destroyOnHidden>
        <Form form={priceForm} layout="vertical">
          <Form.Item name="price_type" label={t("products.priceType")} rules={[{ required: true, message: t("common.required") }]}>
            <Select options={PRICE_TYPES.map((pt) => ({ value: pt, label: pt }))} />
          </Form.Item>
          <Form.Item name="tier_qty" label={t("products.tierHint")}><InputNumber min={0} style={{ width: "100%" }} /></Form.Item>
          <Form.Item name="amount" label={t("products.price")} rules={[{ required: true, message: t("common.required") }]}><Input /></Form.Item>
        </Form>
      </Modal>
      <Modal title={t("products.warrantyTitle", { name: selectedSku?.name ?? "" })} open={warrantyOpen} onOk={() => void submitWarranty()} onCancel={() => setWarrantyOpen(false)} okText={t("common.confirm")} cancelText={t("common.cancel")} destroyOnHidden>
        <Form form={warrantyForm} layout="vertical">
          <Form.Item name="period_months" label={t("products.warrantyMonths")} rules={[{ required: true, message: t("common.required") }]}><InputNumber min={1} style={{ width: "100%" }} /></Form.Item>
          <Form.Item name="start_rule" label={t("products.startRule")} initialValue="ACTIVATION" rules={[{ required: true, message: t("common.required") }]}>
            <Select options={[{ value: "ACTIVATION", label: t("products.startActivation") }, { value: "RECEIPT", label: t("products.startReceipt") }]} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}

function StationTab() {
  const { t } = usePrefs();
  const { message } = App.useApp();
  const [list, setList] = useState<StationProductItem[]>([]);
  const [detail, setDetail] = useState<StationProductItem | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [items, setItems] = useState<BomItem[]>([]);
  const [form] = Form.useForm();
  const [itemForm] = Form.useForm();

  const load = async () => {
    const r = await get<{ list: StationProductItem[] }>("/station-products?page=1&size=100");
    setList(r.list ?? []);
  };

  useEffect(() => {
    void load();
  }, []);

  const openDetail = async (id: string) => {
    const r = await get<{ station_product: StationProductItem }>(`/station-products/${id}`);
    setDetail(r.station_product);
  };

  const addItem = async () => {
    const v = await itemForm.validateFields();
    setItems((prev) => [...prev, { sku_id: v.sku_id, qty: v.qty, sku_name: "" }]);
    itemForm.resetFields();
  };

  const submit = async () => {
    const v = await form.validateFields();
    await post("/station-products", { ...v, items });
    message.success(t("common.saved"));
    setCreateOpen(false);
    setItems([]);
    void load();
  };

  return (
    <>
      <Space style={{ marginBottom: 16 }}>
        <Perm code="catalog:station:create">
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>{t("products.createStationTpl")}</Button>
        </Perm>
        <Button icon={<ReloadOutlined />} onClick={() => void load()}>{t("common.refresh")}</Button>
      </Space>
      <Table rowKey="station_product_id" size="small" pagination={false} dataSource={list}
        columns={[
          { title: t("products.tplName"), dataIndex: "name" },
          { title: t("parties.remark"), dataIndex: "remark", render: (v: string) => v || "-" },
          {
            title: t("common.actions"),
            render: (_: unknown, r: StationProductItem) => (
              <Button size="small" type="link" onClick={() => void openDetail(r.station_product_id)}>{t("products.bomDetail")}</Button>
            ),
          },
        ]} />
      {detail && (
        <div style={{ marginTop: 16 }}>
          <Typography.Text strong>{t("products.bomOf", { name: detail.name })}</Typography.Text>
          <Table rowKey="sku_id" size="small" pagination={false} style={{ marginTop: 8 }}
            dataSource={(detail.items ?? []) as BomItem[]}
            columns={[
              { title: "SKU", dataIndex: "sku_name" },
              { title: "SKU ID", dataIndex: "sku_id" },
              { title: t("products.qty"), dataIndex: "qty" },
            ]} />
        </div>
      )}

      <Modal title={t("products.createStationTpl")} open={createOpen} onOk={() => void submit()} onCancel={() => setCreateOpen(false)} width={640} okText={t("common.confirm")} cancelText={t("common.cancel")} destroyOnHidden>
        <Form form={form} layout="vertical">
          <Form.Item name="name" label={t("products.tplName")} rules={[{ required: true, message: t("common.required") }]}><Input /></Form.Item>
          <Form.Item name="remark" label={t("parties.remark")}><Input /></Form.Item>
        </Form>
        <Typography.Text strong>{t("products.bomDetail")}</Typography.Text>
        <Space.Compact style={{ marginTop: 8, width: "100%" }}>
          <Form form={itemForm} layout="inline">
            <Form.Item name="sku_id" rules={[{ required: true, message: t("common.required") }]}><Input placeholder="SKU ID" /></Form.Item>
            <Form.Item name="qty" rules={[{ required: true, message: t("common.required") }]}><InputNumber min={1} placeholder={t("products.qty")} /></Form.Item>
          </Form>
          <Button onClick={() => void addItem()}>{t("products.add")}</Button>
        </Space.Compact>
        <Table rowKey="sku_id" size="small" pagination={false} style={{ marginTop: 8 }} dataSource={items}
          columns={[
            { title: "SKU ID", dataIndex: "sku_id" },
            { title: t("products.qty"), dataIndex: "qty" },
            {
              title: t("common.actions"),
              render: (_: unknown, __: BomItem, i: number) => (
                <Button size="small" type="link" danger onClick={() => setItems((prev) => prev.filter((_, idx) => idx !== i))}>{t("products.remove")}</Button>
              ),
            },
          ]} />
      </Modal>
    </>
  );
}
