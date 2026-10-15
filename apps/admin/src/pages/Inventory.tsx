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
import { getLocale, usePrefs } from "@micro/shared/prefs";
import type {
  InventoryItem, StockRecordItem, StocktakeRecord, WarehouseItem,
} from "@micro/shared/types";

const PAGED = { defaultPageSize: 10, showSizeChanger: true, pageSizeOptions: [10, 20, 50, 100] };

/** 盘点状态 → 词条 key（色值留在代码） */
const STOCKTAKE_KEY: Record<number, { key: string; color: string }> = {
  1: { key: "inv.stDraft", color: "default" },
  2: { key: "inv.stSubmitted", color: "blue" },
  3: { key: "inv.stApproved", color: "green" },
  4: { key: "inv.stRejected", color: "red" },
};

export default function InventoryPage() {
  const { t } = usePrefs();
  return (
    <Tabs
      defaultActiveKey="stocks"
      items={[
        { key: "stocks", label: t("inv.tabStocks"), children: <StocksTab /> },
        { key: "warehouses", label: t("inv.tabWarehouses"), children: <WarehousesTab /> },
        { key: "ops", label: t("inv.tabOps"), children: <OpsTab /> },
        { key: "records", label: t("inv.tabRecords"), children: <RecordsTab /> },
        { key: "stocktakes", label: t("inv.tabStocktakes"), children: <StocktakesTab /> },
      ]}
    />
  );
}

function StocksTab() {
  const { t } = usePrefs();
  const [warehouseId, setWarehouseId] = useState("");
  const [lowOnly, setLowOnly] = useState(false);
  const actionRef = useRef<ActionType | undefined>(undefined);

  const columns: ProColumns<InventoryItem>[] = [
    { title: t("inv.warehouse"), dataIndex: "warehouse_id" },
    { title: "SKU", dataIndex: "sku_id" },
    { title: t("inv.available"), dataIndex: "available", render: (_, r) => <b>{r.available}</b> },
    { title: t("inv.locked"), dataIndex: "locked" },
    { title: t("inv.inTransit"), dataIndex: "in_transit" },
    { title: t("inv.defective"), dataIndex: "defective" },
    { title: t("inv.lowThreshold"), dataIndex: "low_stock_threshold" },
  ];

  return (
    <ProTable<InventoryItem>
      headerTitle={t("inv.tabStocks")}
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
          placeholder={t("inv.whPlaceholder")}
        />,
        <Select
          key="low"
          value={lowOnly ? "low" : "all"}
          style={{ width: 140 }}
          onChange={(v) => setLowOnly(v === "low")}
          options={[{ value: "all", label: t("inv.allStock") }, { value: "low", label: t("inv.lowOnly") }]}
        />,
      ]}
    />
  );
}

function WarehousesTab() {
  const { t } = usePrefs();
  const { message } = App.useApp();
  const [createOpen, setCreateOpen] = useState(false);
  const [form] = Form.useForm();
  const actionRef = useRef<ActionType | undefined>(undefined);

  const columns: ProColumns<WarehouseItem>[] = [
    { title: t("inv.whCode"), dataIndex: "code" },
    { title: t("inv.whName"), dataIndex: "name" },
    { title: t("parties.address"), dataIndex: "address", render: (_, r) => r.address || "-" },
    { title: t("common.status"), dataIndex: "status", render: (_, r) => (r.status === 1 ? <Tag color="green">{t("inv.enabled")}</Tag> : <Tag>{t("inv.disabled")}</Tag>) },
  ];

  return (
    <>
      <ProTable<WarehouseItem>
        headerTitle={t("inv.tabWarehouses")}
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
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>{t("inv.createWh")}</Button>
          </Perm>,
        ]}
      />
      <ModalForm
        title={t("inv.createWh")}
        open={createOpen}
        onOpenChange={(o) => { if (!o) setCreateOpen(false); }}
        form={form}
        modalProps={{ destroyOnHidden: true }}
        onFinish={async (v) => {
          await post("/warehouses", v);
          message.success(t("common.saved"));
          setCreateOpen(false);
          actionRef.current?.reload();
          return true;
        }}
      >
        <ProFormText name="code" label={t("inv.whCode")} rules={[{ required: true, message: t("common.required") }]} />
        <ProFormText name="name" label={t("inv.whName")} rules={[{ required: true, message: t("common.required") }]} />
        <ProFormText name="address" label={t("parties.address")} />
      </ModalForm>
    </>
  );
}

function OpsTab() {
  const { t } = usePrefs();
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [op, setOp] = useState<string | null>(null);

  const OPS = [
    { key: "stock-in", label: t("inv.opStockIn"), perm: "inventory:stock:in", bizType: "STOCK_IN" },
    { key: "reserve", label: t("inv.opReserve"), perm: "inventory:stock:reserve", bizType: "ORDER" },
    { key: "release", label: t("inv.opRelease"), perm: "inventory:stock:release", bizType: "ORDER" },
    { key: "deduct", label: t("inv.opDeduct"), perm: "inventory:stock:deduct", bizType: "ORDER" },
    { key: "spare-out", label: t("inv.opSpareOut"), perm: "inventory:stock:spare-out", bizType: "" },
    { key: "spare-return", label: t("inv.opSpareReturn"), perm: "inventory:stock:spare-return", bizType: "" },
  ] as const;

  const submit = async (v: Record<string, unknown>) => {
    if (!op) return false;
    const def = OPS.find((o) => o.key === op)!;
    await post(`/inventory/${op}`, { ...v, biz_type: def.bizType || undefined });
    message.success(t("inv.opDone"));
    setOp(null);
    form.resetFields();
    return true;
  };

  return (
    <>
      <p style={{ color: "var(--text-sub)", fontSize: 13, marginBottom: 16 }}>
        {t("inv.opsHint")}
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
        <ProFormText name="warehouse_id" label={t("inv.warehouse")} rules={[{ required: true, message: t("common.required") }]} />
        <ProFormText name="sku_id" label="SKU ID" rules={[{ required: true, message: t("common.required") }]} />
        <Form.Item name="qty" label={t("inv.qty")} rules={[{ required: true, message: t("common.required") }]}>
          <InputNumber min={1} style={{ width: "100%" }} />
        </Form.Item>
        {op === "spare-out" || op === "spare-return" ? (
          <ProFormText name="biz_no" label={t("inv.ticketNo")} rules={[{ required: true, message: t("inv.ticketRequired") }]} />
        ) : (
          <ProFormText name="biz_no" label={t("inv.bizNo")} />
        )}
        <ProFormText name="remark" label={t("parties.remark")} />
      </ModalForm>
    </>
  );
}

function RecordsTab() {
  const { t } = usePrefs();
  const [bizType, setBizType] = useState("");
  const actionRef = useRef<ActionType | undefined>(undefined);

  const columns: ProColumns<StockRecordItem>[] = [
    { title: t("inv.time"), dataIndex: "created_at", render: (_, r) => new Date(r.created_at).toLocaleString(getLocale()) },
    { title: t("inv.bizType"), dataIndex: "biz_type", render: (_, r) => <Tag>{r.biz_type}</Tag> },
    { title: t("inv.bizNoCol"), dataIndex: "biz_no" },
    { title: "SKU", dataIndex: "sku_id" },
    { title: t("inv.change"), dataIndex: "qty" },
    { title: t("inv.availDiff"), render: (_, r) => `${r.before_available} → ${r.after_available}` },
    { title: t("inv.lockDiff"), render: (_, r) => `${r.before_locked} → ${r.after_locked}` },
    { title: t("parties.remark"), dataIndex: "remark", render: (_, r) => r.remark || "-" },
  ];

  return (
    <ProTable<StockRecordItem>
      headerTitle={t("inv.tabRecords")}
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
          placeholder={t("inv.allBizTypes")}
          options={["RESERVE", "RELEASE", "DEDUCT", "STOCK_IN", "RETURN_IN", "TRANSFER_IN", "SPARE_OUT", "SPARE_RETURN", "STOCKTAKE_ADJUST"].map((bt) => ({ value: bt, label: bt }))}
        />,
      ]}
    />
  );
}

function StocktakesTab() {
  const { t } = usePrefs();
  const { message } = App.useApp();
  const [createOpen, setCreateOpen] = useState(false);
  const [form] = Form.useForm();
  const [detail, setDetail] = useState<StocktakeRecord | null>(null);
  const [countForm] = Form.useForm();
  const actionRef = useRef<ActionType | undefined>(undefined);

  const columns: ProColumns<StocktakeRecord>[] = [
    { title: t("inv.stocktakeNo"), dataIndex: "stocktake_id" },
    { title: t("inv.warehouse"), dataIndex: "warehouse_id" },
    { title: t("common.status"), dataIndex: "status", render: (_, r) => <Tag color={STOCKTAKE_KEY[r.status]?.color}>{STOCKTAKE_KEY[r.status] ? t(STOCKTAKE_KEY[r.status].key) : r.status}</Tag> },
    { title: t("inv.createdAt"), dataIndex: "created_at", render: (_, r) => new Date(r.created_at).toLocaleString(getLocale()) },
    {
      title: t("common.actions"),
      valueType: "option",
      render: (_, r) => (
        <Button size="small" type="link" onClick={() => void openDetail(r.stocktake_id)}>{t("inv.stDetail")}</Button>
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
    message.success(t("inv.submitCountDone"));
    setDetail(null);
    actionRef.current?.reload();
  };

  const approve = async (id: string, ok: boolean) => {
    await post(`/stocktakes/${id}/approve`, { approve: ok });
    message.success(ok ? t("inv.approved") : t("inv.rejected"));
    setDetail(null);
    actionRef.current?.reload();
  };

  return (
    <>
      <ProTable<StocktakeRecord>
        headerTitle={t("inv.tabStocktakes")}
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
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>{t("inv.createStocktake")}</Button>
          </Perm>,
        ]}
      />

      <ModalForm
        title={t("inv.createStocktake")}
        open={createOpen}
        onOpenChange={(o) => { if (!o) setCreateOpen(false); }}
        form={form}
        modalProps={{ destroyOnHidden: true }}
        onFinish={async (v) => {
          await post("/stocktakes", v);
          message.success(t("inv.stocktakeCreated"));
          setCreateOpen(false);
          actionRef.current?.reload();
          return true;
        }}
      >
        <ProFormText name="warehouse_id" label={t("inv.warehouse")} rules={[{ required: true, message: t("common.required") }]} />
        <ProFormText name="remark" label={t("parties.remark")} />
      </ModalForm>

      <Modal title={t("inv.stocktakeDetail")} open={detail !== null} onCancel={() => setDetail(null)} footer={null} width={640} destroyOnHidden>
        {detail && (
          <>
            <Table rowKey="item_id" size="small" pagination={false}
              dataSource={(detail.items ?? []) as Array<{ item_id: string; sku_id: string; book_qty: number; counted_qty: number; diff_qty: number }>}
              columns={[
                { title: "SKU", dataIndex: "sku_id" },
                { title: t("inv.book"), dataIndex: "book_qty" },
                {
                  title: t("inv.counted"),
                  render: (_: unknown, it) => (
                    <Form form={countForm}>
                      <Form.Item name={`sku_${it.sku_id}`} noStyle><InputNumber min={0} style={{ width: 90 }} /></Form.Item>
                    </Form>
                  ),
                },
                { title: t("inv.diff"), dataIndex: "diff_qty" },
              ]} />
            <Space style={{ marginTop: 12 }}>
              {detail.status === 1 || detail.status === 2 ? (
                <Perm code="inventory:stocktake:submit">
                  <Button type="primary" onClick={() => void submitCount()}>{t("inv.submitCount")}</Button>
                </Perm>
              ) : null}
              {detail.status === 2 ? (
                <>
                  <Perm code="inventory:stocktake:approve">
                    <Button type="primary" onClick={() => void approve(detail.stocktake_id, true)}>{t("inv.approve")}</Button>
                    <Button danger onClick={() => void approve(detail.stocktake_id, false)}>{t("inv.reject")}</Button>
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
