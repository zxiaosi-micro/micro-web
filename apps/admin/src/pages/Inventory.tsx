// Inventory.tsx · 库存中心（S4-05）：仓库 / 四态库存 / 出入库操作 / 流水 / 盘点 五个 Tab。
// 约定：ID string（E8）；usePaged 分页；操作后 refresh()；冒烟口径严禁并发（E1）。

import { useState } from "react";
import {
  App, Button, Form, Input, InputNumber, Modal, Select, Space, Table, Tabs, Tag, Typography,
} from "antd";
import { PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import { get, Perm, post, usePaged } from "@micro/shared";
import type {
  InventoryItem, StockRecordItem, StocktakeRecord, WarehouseItem,
} from "@micro/shared/types";

const STOCKTAKE_STATUS: Record<number, { text: string; color: string }> = {
  1: { text: "草稿", color: "default" },
  2: { text: "已提交", color: "blue" },
  3: { text: "已审批", color: "green" },
  4: { text: "已驳回", color: "red" },
};

export default function InventoryPage() {
  return (
    <Tabs defaultActiveKey="stocks" items={[
      { key: "stocks", label: "四态库存", children: <StocksTab /> },
      { key: "warehouses", label: "仓库", children: <WarehousesTab /> },
      { key: "ops", label: "出入库操作", children: <OpsTab /> },
      { key: "records", label: "流水", children: <RecordsTab /> },
      { key: "stocktakes", label: "盘点", children: <StocktakesTab /> },
    ]} />
  );
}

function StocksTab() {
  const [warehouseId, setWarehouseId] = useState("");
  const [lowOnly, setLowOnly] = useState(false);
  const { list, total, page, size, loading, setPage, setSize, refresh } = usePaged<InventoryItem>(
    (p) => get<{ list: InventoryItem[]; total: number }>(`/inventory?page=${p.page}&size=${p.size}&warehouse_id=${warehouseId}&low_only=${lowOnly}`),
  );
  return (
    <>
      <Space style={{ marginBottom: 16 }}>
        <Input.Search onSearch={(v) => { setWarehouseId(v); setPage(1); }} style={{ width: 240 }} allowClear placeholder="仓库 ID(空=全部)" />
        <Select value={lowOnly ? "low" : "all"} style={{ width: 140 }}
          onChange={(v) => setLowOnly(v === "low")}
          options={[{ value: "all", label: "全部库存" }, { value: "low", label: "仅低库存预警" }]} />
        <Button icon={<ReloadOutlined />} onClick={refresh}>刷新</Button>
      </Space>
      <Table rowKey="inventory_id" columns={[
        { title: "仓库", dataIndex: "warehouse_id" },
        { title: "SKU", dataIndex: "sku_id" },
        { title: "可用", dataIndex: "available", render: (v: number) => <Typography.Text strong>{v}</Typography.Text> },
        { title: "锁定", dataIndex: "locked" },
        { title: "在途", dataIndex: "in_transit" },
        { title: "残次", dataIndex: "defective" },
        { title: "低库存阈值", dataIndex: "low_stock_threshold" },
      ]} dataSource={list} loading={loading}
        pagination={{ current: page, pageSize: size, total, showSizeChanger: true, onChange: (p, s) => { setPage(p); setSize(s); } }} />
    </>
  );
}

function WarehousesTab() {
  const { message } = App.useApp();
  const [createOpen, setCreateOpen] = useState(false);
  const [form] = Form.useForm();
  const { list, total, page, size, loading, setPage, setSize, refresh } = usePaged<WarehouseItem>(
    (p) => get<{ list: WarehouseItem[]; total: number }>(`/warehouses?page=${p.page}&size=${p.size}`),
  );

  const submit = async () => {
    const v = await form.validateFields();
    await post("/warehouses", v);
    message.success("已保存");
    setCreateOpen(false);
    refresh();
  };

  return (
    <>
      <Space style={{ marginBottom: 16 }}>
        <Perm code="inventory:warehouse:create">
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>新建仓库</Button>
        </Perm>
        <Button icon={<ReloadOutlined />} onClick={refresh}>刷新</Button>
      </Space>
      <Table rowKey="warehouse_id" columns={[
        { title: "编码", dataIndex: "code" },
        { title: "名称", dataIndex: "name" },
        { title: "地址", dataIndex: "address", render: (v: string) => v || "-" },
        { title: "状态", dataIndex: "status", render: (v: number) => (v === 1 ? <Tag color="green">启用</Tag> : <Tag>停用</Tag>) },
      ]} dataSource={list} loading={loading}
        pagination={{ current: page, pageSize: size, total, showSizeChanger: true, onChange: (p, s) => { setPage(p); setSize(s); } }} />
      <Modal title="新建仓库" open={createOpen} onOk={() => void submit()} onCancel={() => setCreateOpen(false)} destroyOnHidden>
        <Form form={form} layout="vertical">
          <Form.Item name="code" label="仓库编码" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="name" label="仓库名称" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="address" label="地址"><Input /></Form.Item>
        </Form>
      </Modal>
    </>
  );
}

function OpsTab() {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [op, setOp] = useState<string | null>(null);

  const OPS = [
    { key: "stock-in", label: "入库", perm: "inventory:stock:in", bizType: "STOCK_IN" },
    { key: "reserve", label: "预留", perm: "inventory:stock:reserve", bizType: "ORDER" },
    { key: "release", label: "释放", perm: "inventory:stock:release", bizType: "ORDER" },
    { key: "deduct", label: "出库发货", perm: "inventory:stock:deduct", bizType: "ORDER" },
    { key: "spare-out", label: "备件领用", perm: "inventory:stock:spare-out", bizType: "" },
    { key: "spare-return", label: "备件退库", perm: "inventory:stock:spare-return", bizType: "" },
  ] as const;

  const submit = async () => {
    if (!op) return;
    const v = await form.validateFields();
    const def = OPS.find((o) => o.key === op)!;
    await post(`/inventory/${op}`, { ...v, biz_type: def.bizType || undefined });
    message.success("操作成功(流水已生成)");
    setOp(null);
    form.resetFields();
  };

  return (
    <>
      <Typography.Paragraph type="secondary">所有出库统一由 inventory 执行(FR-INV-004);预留走防超卖双保险(02 §9.2)。</Typography.Paragraph>
      <Space wrap>
        {OPS.map((o) => (
          <Perm key={o.key} code={o.perm}>
            <Button onClick={() => { setOp(o.key); form.resetFields(); }}>{o.label}</Button>
          </Perm>
        ))}
      </Space>
      <Modal title={OPS.find((o) => o.key === op)?.label ?? ""} open={op !== null} onOk={() => void submit()} onCancel={() => setOp(null)} destroyOnHidden>
        <Form form={form} layout="vertical">
          <Form.Item name="warehouse_id" label="仓库 ID" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="sku_id" label="SKU ID" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="qty" label="数量" rules={[{ required: true }]}><InputNumber min={1} style={{ width: "100%" }} /></Form.Item>
          {op === "spare-out" || op === "spare-return" ? (
            <Form.Item name="biz_no" label="工单号" rules={[{ required: true, message: "备件领用必须关联工单号" }]}><Input /></Form.Item>
          ) : (
            <Form.Item name="biz_no" label="业务单号(空=自动生成)"><Input /></Form.Item>
          )}
          <Form.Item name="remark" label="备注"><Input /></Form.Item>
        </Form>
      </Modal>
    </>
  );
}

function RecordsTab() {
  const [bizType, setBizType] = useState("");
  const { list, total, page, size, loading, setPage, setSize, refresh } = usePaged<StockRecordItem>(
    (p) => get<{ list: StockRecordItem[]; total: number }>(`/inventory/records?page=${p.page}&size=${p.size}&biz_type=${bizType}`),
  );
  return (
    <>
      <Space style={{ marginBottom: 16 }}>
        <Select value={bizType} style={{ width: 200 }} onChange={(v) => { setBizType(v); setPage(1); }} allowClear
          placeholder="全部业务类型"
          options={["RESERVE", "RELEASE", "DEDUCT", "STOCK_IN", "RETURN_IN", "TRANSFER_IN", "SPARE_OUT", "SPARE_RETURN", "STOCKTAKE_ADJUST"].map((t) => ({ value: t, label: t }))} />
        <Button icon={<ReloadOutlined />} onClick={refresh}>刷新</Button>
      </Space>
      <Table rowKey="record_id" size="small" columns={[
        { title: "时间", dataIndex: "created_at", render: (v: number) => new Date(v).toLocaleString("zh-CN") },
        { title: "类型", dataIndex: "biz_type", render: (v: string) => <Tag>{v}</Tag> },
        { title: "业务单号", dataIndex: "biz_no" },
        { title: "SKU", dataIndex: "sku_id" },
        { title: "变动", dataIndex: "qty" },
        { title: "可用(前→后)", render: (_: unknown, r: StockRecordItem) => `${r.before_available} → ${r.after_available}` },
        { title: "锁定(前→后)", render: (_: unknown, r: StockRecordItem) => `${r.before_locked} → ${r.after_locked}` },
        { title: "备注", dataIndex: "remark", render: (v: string) => v || "-" },
      ]} dataSource={list} loading={loading}
        pagination={{ current: page, pageSize: size, total, showSizeChanger: true, onChange: (p, s) => { setPage(p); setSize(s); } }} />
    </>
  );
}

function StocktakesTab() {
  const { message } = App.useApp();
  const [createOpen, setCreateOpen] = useState(false);
  const [form] = Form.useForm();
  const [detail, setDetail] = useState<StocktakeRecord | null>(null);
  const [countForm] = Form.useForm();
  const { list, total, page, size, loading, setPage, setSize, refresh } = usePaged<StocktakeRecord>(
    (p) => get<{ list: StocktakeRecord[]; total: number }>(`/stocktakes?page=${p.page}&size=${p.size}`),
  );

  const submit = async () => {
    const v = await form.validateFields();
    await post("/stocktakes", v);
    message.success("盘点单已创建(账面已快照)");
    setCreateOpen(false);
    refresh();
  };

  const openDetail = async (id: string) => {
    const r = await get<{ stocktake: StocktakeRecord }>(`/stocktakes/${id}`);
    setDetail(r.stocktake);
    countForm.setFieldsValue(
      Object.fromEntries((r.stocktake.items ?? []).map((it) => [`sku_${it.sku_id}`, it.counted_qty >= 0 ? it.counted_qty : it.book_qty])),
    );
  };

  const submitCount = async () => {
    if (!detail) return;
    const values = await countForm.validateFields();
    const items = (detail.items ?? []).map((it) => ({
      sku_id: it.sku_id,
      counted_qty: values[`sku_${it.sku_id}`] ?? it.counted_qty,
    }));
    await post(`/stocktakes/${detail.stocktake_id}/submit`, { items });
    message.success("实盘已提交");
    setDetail(null);
    refresh();
  };

  const approve = async (id: string, ok: boolean) => {
    await post(`/stocktakes/${id}/approve`, { approve: ok });
    message.success(ok ? "已审批,账面差异已调整" : "已驳回");
    setDetail(null);
    refresh();
  };

  return (
    <>
      <Space style={{ marginBottom: 16 }}>
        <Perm code="inventory:stocktake:create">
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>创建盘点单</Button>
        </Perm>
        <Button icon={<ReloadOutlined />} onClick={refresh}>刷新</Button>
      </Space>
      <Table rowKey="stocktake_id" columns={[
        { title: "盘点单", dataIndex: "stocktake_id" },
        { title: "仓库", dataIndex: "warehouse_id" },
        { title: "状态", dataIndex: "status", render: (v: number) => <Tag color={STOCKTAKE_STATUS[v]?.color}>{STOCKTAKE_STATUS[v]?.text ?? v}</Tag> },
        { title: "创建时间", dataIndex: "created_at", render: (v: number) => new Date(v).toLocaleString("zh-CN") },
        {
          title: "操作",
          render: (_: unknown, r: StocktakeRecord) => (
            <Button size="small" type="link" onClick={() => void openDetail(r.stocktake_id)}>明细</Button>
          ),
        },
      ]} dataSource={list} loading={loading}
        pagination={{ current: page, pageSize: size, total, showSizeChanger: true, onChange: (p, s) => { setPage(p); setSize(s); } }} />

      <Modal title="创建盘点单" open={createOpen} onOk={() => void submit()} onCancel={() => setCreateOpen(false)} destroyOnHidden>
        <Form form={form} layout="vertical">
          <Form.Item name="warehouse_id" label="仓库 ID" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="remark" label="备注"><Input /></Form.Item>
        </Form>
      </Modal>
      <Modal title="盘点明细" open={detail !== null} onCancel={() => setDetail(null)} footer={null} width={640} destroyOnHidden>
        {detail && (
          <>
            <Table rowKey="item_id" size="small" pagination={false}
              dataSource={(detail.items ?? []) as Array<{ item_id: string; sku_id: string; book_qty: number; counted_qty: number; diff_qty: number }>}
              columns={[
                { title: "SKU", dataIndex: "sku_id" },
                { title: "账面", dataIndex: "book_qty" },
                {
                  title: "实盘",
                  render: (_: unknown, it) => (
                    <Form form={countForm}>
                      <Form.Item name={`sku_${it.sku_id}`} noStyle><InputNumber min={0} style={{ width: 90 }} /></Form.Item>
                    </Form>
                  ),
                },
                { title: "差异", dataIndex: "diff_qty" },
              ]} />
            <Space style={{ marginTop: 12 }}>
              {detail.status === 1 || detail.status === 2 ? (
                <Perm code="inventory:stocktake:submit">
                  <Button type="primary" onClick={() => void submitCount()}>提交实盘</Button>
                </Perm>
              ) : null}
              {detail.status === 2 ? (
                <>
                  <Perm code="inventory:stocktake:approve">
                    <Button type="primary" onClick={() => void approve(detail.stocktake_id, true)}>审批通过</Button>
                    <Button danger onClick={() => void approve(detail.stocktake_id, false)}>驳回</Button>
                  </Perm>
                </>
              ) : null}
            </Space>
          </>
        )}
      </Modal>
    </>
  );
}
