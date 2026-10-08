// Products.tsx · 商品中心（S4-05）：商品/SKU/价格（版本切换）/质保策略 + 场站模板 BOM。
// 路由 products 与 station-products 共用本页（Tab 切换）；ID string（E8）。

import { useEffect, useMemo, useState } from "react";
import {
  App, Button, Form, Input, InputNumber, Modal, Select, Space, Table, Tabs, Tag, Typography,
} from "antd";
import { PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import { get, Perm, post, put } from "@micro/shared";
import type { BomItem, PriceItem, ProductItem, SkuItem, StationProductItem } from "@micro/shared/types";

const PRICE_TYPES = ["RETAIL", "DEALER", "TIER"] as const;

export default function ProductsPage({ defaultTab = "products" }: { defaultTab?: string }) {
  return (
    <Tabs defaultActiveKey={defaultTab} items={[
      { key: "products", label: "商品与价格", children: <ProductsTab /> },
      { key: "station", label: "场站模板", children: <StationTab /> },
    ]} />
  );
}

function ProductsTab() {
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
    { title: "编码", dataIndex: "code" },
    { title: "名称", dataIndex: "name" },
    { title: "类型", dataIndex: "type", render: (v: string) => <Tag color={v === "EXT_WARRANTY" ? "purple" : "blue"}>{v}</Tag> },
    {
      title: "操作",
      render: (_: unknown, r: SkuItem) => (
        <Space>
          <Button size="small" type="link" onClick={() => void loadPrices(r, false)}>价格</Button>
          <Perm code="catalog:price:set">
            <Button size="small" type="link" onClick={() => { setSelectedSku(r); setPriceOpen(true); }}>设价</Button>
          </Perm>
          <Perm code="catalog:warranty:update">
            <Button size="small" type="link" onClick={() => { setSelectedSku(r); setWarrantyOpen(true); }}>质保</Button>
          </Perm>
        </Space>
      ),
    },
  ], []);

  const submitProduct = async () => {
    const v = await productForm.validateFields();
    await post("/products", v);
    message.success("已保存");
    setProductOpen(false);
    void load();
  };

  const submitSku = async () => {
    const v = await skuForm.validateFields();
    await post("/skus", v);
    message.success("已保存");
    setSkuOpen(false);
    void load();
  };

  const submitPrice = async () => {
    if (!selectedSku) return;
    const v = await priceForm.validateFields();
    await post(`/skus/${selectedSku.sku_id}/prices`, v);
    message.success("价格已落库(新版本)");
    setPriceOpen(false);
    if (selectedSku) void loadPrices(selectedSku, false);
  };

  const submitWarranty = async () => {
    if (!selectedSku) return;
    const v = await warrantyForm.validateFields();
    await put(`/skus/${selectedSku.sku_id}/warranty-policy`, v);
    message.success("质保策略已保存");
    setWarrantyOpen(false);
  };

  return (
    <>
      <Space style={{ marginBottom: 16 }}>
        <Perm code="catalog:product:create">
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setProductOpen(true)}>新建商品</Button>
        </Perm>
        <Perm code="catalog:sku:create">
          <Button icon={<PlusOutlined />} onClick={() => setSkuOpen(true)}>新建 SKU</Button>
        </Perm>
        <Button icon={<ReloadOutlined />} onClick={() => void load()}>刷新</Button>
      </Space>
      <Table rowKey="product_id" size="small" pagination={false} dataSource={products} style={{ marginBottom: 16 }}
        columns={[
          { title: "商品", dataIndex: "name" },
          { title: "分类", dataIndex: "category", render: (v: string) => v || "-" },
          { title: "状态", dataIndex: "status", render: (v: number) => (v === 1 ? <Tag color="green">上架</Tag> : <Tag>下架</Tag>) },
        ]} />
      <Typography.Text strong>SKU 列表</Typography.Text>
      <Table rowKey="sku_id" size="small" pagination={false} dataSource={skus} style={{ marginTop: 8 }} columns={skuColumns} />
      {selectedSku && (
        <div style={{ marginTop: 16 }}>
          <Space>
            <Typography.Text strong>{`价格 · ${selectedSku.name}`}</Typography.Text>
            <Select size="small" value={priceHistory ? "history" : "latest"} style={{ width: 140 }}
              onChange={(v) => void loadPrices(selectedSku, v === "history")}
              options={[{ value: "latest", label: "当前价目表" }, { value: "history", label: "全版本历史" }]} />
          </Space>
          <Table rowKey="price_id" size="small" pagination={false} style={{ marginTop: 8 }} dataSource={prices}
            columns={[
              { title: "类型", dataIndex: "price_type" },
              { title: "阶梯量", dataIndex: "tier_qty" },
              { title: "价格(元)", dataIndex: "amount" },
              { title: "版本", dataIndex: "version", render: (v: number) => <Tag>v{v}</Tag> },
              { title: "时间", dataIndex: "created_at", render: (v: number) => (v ? new Date(v).toLocaleString("zh-CN") : "-") },
            ]} />
        </div>
      )}

      <Modal title="新建商品" open={productOpen} onOk={() => void submitProduct()} onCancel={() => setProductOpen(false)} destroyOnHidden>
        <Form form={productForm} layout="vertical">
          <Form.Item name="name" label="名称" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="category" label="分类"><Input /></Form.Item>
          <Form.Item name="remark" label="备注"><Input /></Form.Item>
        </Form>
      </Modal>
      <Modal title="新建 SKU" open={skuOpen} onOk={() => void submitSku()} onCancel={() => setSkuOpen(false)} destroyOnHidden>
        <Form form={skuForm} layout="vertical">
          <Form.Item name="product_id" label="商品 ID" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="code" label="SKU 编码" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="name" label="SKU 名称" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="type" label="类型" initialValue="STANDARD">
            <Select options={[{ value: "STANDARD", label: "STANDARD" }, { value: "EXT_WARRANTY", label: "EXT_WARRANTY" }]} />
          </Form.Item>
          <Form.Item name="spec" label="规格参数(JSON)"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>
      <Modal title={`设置价格 · ${selectedSku?.name ?? ""}`} open={priceOpen} onOk={() => void submitPrice()} onCancel={() => setPriceOpen(false)} destroyOnHidden>
        <Form form={priceForm} layout="vertical">
          <Form.Item name="price_type" label="价格类型" rules={[{ required: true }]}>
            <Select options={PRICE_TYPES.map((t) => ({ value: t, label: t }))} />
          </Form.Item>
          <Form.Item name="tier_qty" label="阶梯起量(仅 TIER)"><InputNumber min={0} style={{ width: "100%" }} /></Form.Item>
          <Form.Item name="amount" label="价格(元)" rules={[{ required: true }]}><Input /></Form.Item>
        </Form>
      </Modal>
      <Modal title={`质保策略 · ${selectedSku?.name ?? ""}`} open={warrantyOpen} onOk={() => void submitWarranty()} onCancel={() => setWarrantyOpen(false)} destroyOnHidden>
        <Form form={warrantyForm} layout="vertical">
          <Form.Item name="period_months" label="质保期(月)" rules={[{ required: true }]}><InputNumber min={1} style={{ width: "100%" }} /></Form.Item>
          <Form.Item name="start_rule" label="起算规则" initialValue="ACTIVATION" rules={[{ required: true }]}>
            <Select options={[{ value: "ACTIVATION", label: "激活日" }, { value: "RECEIPT", label: "签收日" }]} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}

function StationTab() {
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
    message.success("已创建");
    setCreateOpen(false);
    setItems([]);
    void load();
  };

  return (
    <>
      <Space style={{ marginBottom: 16 }}>
        <Perm code="catalog:station:create">
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>新建场站模板</Button>
        </Perm>
        <Button icon={<ReloadOutlined />} onClick={() => void load()}>刷新</Button>
      </Space>
      <Table rowKey="station_product_id" size="small" pagination={false} dataSource={list}
        columns={[
          { title: "模板名称", dataIndex: "name" },
          { title: "备注", dataIndex: "remark", render: (v: string) => v || "-" },
          {
            title: "操作",
            render: (_: unknown, r: StationProductItem) => (
              <Button size="small" type="link" onClick={() => void openDetail(r.station_product_id)}>BOM 明细</Button>
            ),
          },
        ]} />
      {detail && (
        <div style={{ marginTop: 16 }}>
          <Typography.Text strong>{`BOM · ${detail.name}`}</Typography.Text>
          <Table rowKey="sku_id" size="small" pagination={false} style={{ marginTop: 8 }}
            dataSource={(detail.items ?? []) as BomItem[]}
            columns={[
              { title: "SKU", dataIndex: "sku_name" },
              { title: "SKU ID", dataIndex: "sku_id" },
              { title: "数量", dataIndex: "qty" },
            ]} />
        </div>
      )}

      <Modal title="新建场站模板" open={createOpen} onOk={() => void submit()} onCancel={() => setCreateOpen(false)} width={640} destroyOnHidden>
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="模板名称" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="remark" label="备注"><Input /></Form.Item>
        </Form>
        <Typography.Text strong>BOM 明细</Typography.Text>
        <Space.Compact style={{ marginTop: 8, width: "100%" }}>
          <Form form={itemForm} layout="inline">
            <Form.Item name="sku_id" rules={[{ required: true }]}><Input placeholder="SKU ID" /></Form.Item>
            <Form.Item name="qty" rules={[{ required: true }]}><InputNumber min={1} placeholder="数量" /></Form.Item>
          </Form>
          <Button onClick={() => void addItem()}>添加</Button>
        </Space.Compact>
        <Table rowKey="sku_id" size="small" pagination={false} style={{ marginTop: 8 }} dataSource={items}
          columns={[
            { title: "SKU ID", dataIndex: "sku_id" },
            { title: "数量", dataIndex: "qty" },
            {
              title: "操作",
              render: (_: unknown, __: BomItem, i: number) => (
                <Button size="small" type="link" danger onClick={() => setItems((prev) => prev.filter((_, idx) => idx !== i))}>移除</Button>
              ),
            },
          ]} />
      </Modal>
    </>
  );
}
