// Inventory.tsx · 库存中心（S4-05）：仓库 / 四态库存 / 出入库操作 / 流水 / 盘点 五个 Tab。
// 约定：ID string（E8）；分页表走 ProTable request（筛选参数走 params 联动，变更自动回第 1 页）。
// 盘点明细为自定义行内表单 Modal，保留 antd Modal；冒烟口径严禁并发（E1）。

import { useRef, useState } from "react";
import {
  App, Button, Form, Input, InputNumber, Modal, Select, Space, Table, Tabs, Tag,
} from "antd";
import { PlusOutlined } from "@ant-design/icons";
import type { ActionType, ProColumns } from "@ant-design/pro-components";
import { ModalForm, ProFormText, ProTable } from "@ant-design/pro-components";
import { get, Perm, post } from "@micro/shared";
import type {
  InventoryItem, StockRecordItem, StocktakeRecord, WarehouseItem,
} from "@micro/shared/types";

const STOCKTAKE_STATUS: Record<number, { text: string; color: string }> = {
  1: { text: "草稿", color: "default" },
  2: { text: "已提交", color: "blue" },
  3: { text: "已审批", color: "green" },
  4: { text: "已驳回", color: "red" },
};

const PAGED = { defaultPageSize: 10, showSizeChanger: true, pageSizeOptions: [10, 20, 50, 100] };

export default function InventoryPage() {
  return (
    <Tabs
      defaultActiveKey="stocks"
      items={[
        { key: "stocks", label: "四态库存", children: <StocksTab /> },
        { key: "warehouses", label: "仓库", children: <WarehousesTab /> },
        { key: "ops", label: "出入库操作", children: <OpsTab /> },
        { key: "records", label: "流水", children: <RecordsTab /> },
        { key: "stocktakes", label: "盘点", children: <StocktakesTab /> },
      ]}
    />
  );
}

function StocksTab() {
  const [warehouseId, setWarehouseId] = useState("");
  const [lowOnly, setLowOnly] = useState(false);
  const actionRef = useRef<ActionType | undefined>(undefined);

  const columns: ProColumns<InventoryItem>[] = [
    { title: "仓库", dataIndex: "warehouse_id" },
    { title: "SKU", dataIndex: "sku_id" },
    { title: "可用", dataIndex: "available", render: (_, r) => <b>{r.available}</b> },
    { title: "锁定", dataIndex: "locked" },
    { title: "在途", dataIndex: "in_transit" },
    { title: "残次", dataIndex: "defective" },
    { title: "低库存阈值", dataIndex: "low_stock_threshold" },
  ];

  return (
    <ProTable<InventoryItem>
      headerTitle="四态库存"
      rowKey="inventory_id"
      actionRef={actionRef}
      columns={columns}
      search={false}
      params={{ warehouseId, lowOnly }}
      request={async (params) => {
        const resp = await get<{ list: InventoryItem[]; total: number }>(
          `/inventory?page=${params.current ?? 1}&size=${params.pageSize ?? 10}&warehouse_id=${String(params.warehouseId ?? "")}&low_only=${params.lowOnly === true}`,
        );
        return { data: resp.list, total: resp.total, success: true };
      }}
      pagination={PAGED}
      toolBarRender={() => [
        <Input.Search
          key="wh"
          onSearch={(v) => setWarehouseId(v)}
          style={{ width: 240 }}
          allowClear
          placeholder="仓库 ID(空=全部)"
        />,
        <Select
          key="low"
          value={lowOnly ? "low" : "all"}
          style={{ width: 140 }}
          onChange={(v) => setLowOnly(v === "low")}
          options={[{ value: "all", label: "全部库存" }, { value: "low", label: "仅低库存预警" }]}
        />,
      ]}
    />
  );
}

function WarehousesTab() {
  const { message } = App.useApp();
  const [createOpen, setCreateOpen] = useState(false);
  const [form] = Form.useForm();
  const actionRef = useRef<ActionType | undefined>(undefined);

  const columns: ProColumns<WarehouseItem>[] = [
    { title: "编码", dataIndex: "code" },
    { title: "名称", dataIndex: "name" },
    { title: "地址", dataIndex: "address", render: (_, r) => r.address || "-" },
    { title: "状态", dataIndex: "status", render: (_, r) => (r.status === 1 ? <Tag color="green">启用</Tag> : <Tag>停用</Tag>) },
  ];

  return (
    <>
      <ProTable<WarehouseItem>
        headerTitle="仓库"
        rowKey="warehouse_id"
        actionRef={actionRef}
        columns={columns}
        search={false}
        request={async (params) => {
          const resp = await get<{ list: WarehouseItem[]; total: number }>(
            `/warehouses?page=${params.current ?? 1}&size=${params.pageSize ?? 10}`,
          );
          return { data: resp.list, total: resp.total, success: true };
        }}
        pagination={PAGED}
        toolBarRender={() => [
          <Perm key="create" code="inventory:warehouse:create">
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>新建仓库</Button>
          </Perm>,
        ]}
      />
      <ModalForm
        title="新建仓库"
        open={createOpen}
        onOpenChange={(o) => { if (!o) setCreateOpen(false); }}
        form={form}
        modalProps={{ destroyOnHidden: true }}
        onFinish={async (v) => {
          await post("/warehouses", v);
          message.success("已保存");
          setCreateOpen(false);
          actionRef.current?.reload();
          return true;
        }}
      >
        <ProFormText name="code" label="仓库编码" rules={[{ required: true }]} />
        <ProFormText name="name" label="仓库名称" rules={[{ required: true }]} />
        <ProFormText name="address" label="地址" />
      </ModalForm>
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

  const submit = async (v: Record<string, unknown>) => {
    if (!op) return false;
    const def = OPS.find((o) => o.key === op)!;
    await post(`/inventory/${op}`, { ...v, biz_type: def.bizType || undefined });
    message.success("操作成功(流水已生成)");
    setOp(null);
    form.resetFields();
    return true;
  };

  return (
    <>
      <p style={{ color: "#8c8c8c", fontSize: 13, marginBottom: 16 }}>
        所有出库统一由 inventory 执行(FR-INV-004);预留走防超卖双保险(02 §9.2)。
      </p>
      <Space wrap style={{ marginBottom: 16 }}>
        {OPS.map((o) => (
          <Perm key={o.key} code={o.perm}>
            <Button onClick={() => { setOp(o.key); form.resetFields(); }}>{o.label}</Button>
          </Perm>
        ))}
      </Space>
      <ModalForm
        title={OPS.find((o) => o.key === op)?.label ?? ""}
        open={op !== null}
        onOpenChange={(o) => { if (!o) setOp(null); }}
        form={form}
        modalProps={{ destroyOnHidden: true }}
        onFinish={submit}
      >
        <ProFormText name="warehouse_id" label="仓库 ID" rules={[{ required: true }]} />
        <ProFormText name="sku_id" label="SKU ID" rules={[{ required: true }]} />
        <Form.Item name="qty" label="数量" rules={[{ required: true }]}>
          <InputNumber min={1} style={{ width: "100%" }} />
        </Form.Item>
        {op === "spare-out" || op === "spare-return" ? (
          <ProFormText name="biz_no" label="工单号" rules={[{ required: true, message: "备件领用必须关联工单号" }]} />
        ) : (
          <ProFormText name="biz_no" label="业务单号(空=自动生成)" />
        )}
        <ProFormText name="remark" label="备注" />
      </ModalForm>
    </>
  );
}

function RecordsTab() {
  const [bizType, setBizType] = useState("");
  const actionRef = useRef<ActionType | undefined>(undefined);

  const columns: ProColumns<StockRecordItem>[] = [
    { title: "时间", dataIndex: "created_at", render: (_, r) => new Date(r.created_at).toLocaleString("zh-CN") },
    { title: "类型", dataIndex: "biz_type", render: (_, r) => <Tag>{r.biz_type}</Tag> },
    { title: "业务单号", dataIndex: "biz_no" },
    { title: "SKU", dataIndex: "sku_id" },
    { title: "变动", dataIndex: "qty" },
    { title: "可用(前→后)", render: (_, r) => `${r.before_available} → ${r.after_available}` },
    { title: "锁定(前→后)", render: (_, r) => `${r.before_locked} → ${r.after_locked}` },
    { title: "备注", dataIndex: "remark", render: (_, r) => r.remark || "-" },
  ];

  return (
    <ProTable<StockRecordItem>
      headerTitle="流水"
      rowKey="record_id"
      actionRef={actionRef}
      columns={columns}
      search={false}
      params={{ bizType }}
      request={async (params) => {
        const resp = await get<{ list: StockRecordItem[]; total: number }>(
          `/inventory/records?page=${params.current ?? 1}&size=${params.pageSize ?? 10}&biz_type=${String(params.bizType ?? "")}`,
        );
        return { data: resp.list, total: resp.total, success: true };
      }}
      pagination={PAGED}
      toolBarRender={() => [
        <Select
          key="biz"
          value={bizType || undefined}
          style={{ width: 200 }}
          onChange={(v) => setBizType(v ?? "")}
          allowClear
          placeholder="全部业务类型"
          options={["RESERVE", "RELEASE", "DEDUCT", "STOCK_IN", "RETURN_IN", "TRANSFER_IN", "SPARE_OUT", "SPARE_RETURN", "STOCKTAKE_ADJUST"].map((t) => ({ value: t, label: t }))}
        />,
      ]}
    />
  );
}

function StocktakesTab() {
  const { message } = App.useApp();
  const [createOpen, setCreateOpen] = useState(false);
  const [form] = Form.useForm();
  const [detail, setDetail] = useState<StocktakeRecord | null>(null);
  const [countForm] = Form.useForm();
  const actionRef = useRef<ActionType | undefined>(undefined);

  const columns: ProColumns<StocktakeRecord>[] = [
    { title: "盘点单", dataIndex: "stocktake_id" },
    { title: "仓库", dataIndex: "warehouse_id" },
    { title: "状态", dataIndex: "status", render: (_, r) => <Tag color={STOCKTAKE_STATUS[r.status]?.color}>{STOCKTAKE_STATUS[r.status]?.text ?? r.status}</Tag> },
    { title: "创建时间", dataIndex: "created_at", render: (_, r) => new Date(r.created_at).toLocaleString("zh-CN") },
    {
      title: "操作",
      valueType: "option",
      render: (_, r) => (
        <Button size="small" type="link" onClick={() => void openDetail(r.stocktake_id)}>明细</Button>
      ),
    },
  ];

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
    actionRef.current?.reload();
  };

  const approve = async (id: string, ok: boolean) => {
    await post(`/stocktakes/${id}/approve`, { approve: ok });
    message.success(ok ? "已审批,账面差异已调整" : "已驳回");
    setDetail(null);
    actionRef.current?.reload();
  };

  return (
    <>
      <ProTable<StocktakeRecord>
        headerTitle="盘点"
        rowKey="stocktake_id"
        actionRef={actionRef}
        columns={columns}
        search={false}
        request={async (params) => {
          const resp = await get<{ list: StocktakeRecord[]; total: number }>(
            `/stocktakes?page=${params.current ?? 1}&size=${params.pageSize ?? 10}`,
          );
          return { data: resp.list, total: resp.total, success: true };
        }}
        pagination={PAGED}
        toolBarRender={() => [
          <Perm key="create" code="inventory:stocktake:create">
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>创建盘点单</Button>
          </Perm>,
        ]}
      />

      <ModalForm
        title="创建盘点单"
        open={createOpen}
        onOpenChange={(o) => { if (!o) setCreateOpen(false); }}
        form={form}
        modalProps={{ destroyOnHidden: true }}
        onFinish={async (v) => {
          await post("/stocktakes", v);
          message.success("盘点单已创建(账面已快照)");
          setCreateOpen(false);
          actionRef.current?.reload();
          return true;
        }}
      >
        <ProFormText name="warehouse_id" label="仓库 ID" rules={[{ required: true }]} />
        <ProFormText name="remark" label="备注" />
      </ModalForm>

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
