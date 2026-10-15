// BIQuery.tsx · BI 自助查询（S10-02）：白名单引擎驱动的查询构建器 + 数仓 ETL 手动调度。
// 表/字段/维度/聚合/操作符全部来自白名单元数据（ListBIWhitelist），白名单外查询服务端拒绝。

import { useEffect, useMemo, useState } from "react";
import {
  Alert, App, Button, Card, DatePicker, Form, Input, Modal, Select, Space, Spin, Table, Typography,
} from "antd";
import { PlayCircleOutlined, PlusOutlined, ReloadOutlined, SyncOutlined } from "@ant-design/icons";
import { get, Perm, post } from "@micro/shared";
import { usePrefs } from "@micro/shared/prefs";
import type { BIRunResp, BIWhitelistResp, BIWhitelistTable, DwEtlRunResp } from "@micro/shared/types";

type QueryRow = { values: string[] };

export default function BIQueryPage() {
  const { t } = usePrefs();
  return (
    <Card
      title={t("bi.title")}
      extra={<EtlButton />}
    >
      <QueryBuilder />
    </Card>
  );
}

// ---- 查询构建器 ----

function QueryBuilder() {
  const { t } = usePrefs();
  const { message } = App.useApp();
  const [meta, setMeta] = useState<BIWhitelistTable[]>([]);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [table, setTable] = useState("");
  const [dims, setDims] = useState<string[]>([]);
  const [metrics, setMetrics] = useState<string[]>([]);
  const [filters, setFilters] = useState<{ column: string; op: string; value: string }[]>([]);
  const [orderBy, setOrderBy] = useState("");
  const [orderDesc, setOrderDesc] = useState(false);
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(20);
  const [resp, setResp] = useState<BIRunResp | null>(null);
  const [running, setRunning] = useState(false);

  const loadWhitelist = () => {
    setLoadingMeta(true);
    void get<BIWhitelistResp>("/bi/whitelist").then((r) => {
      setMeta(r.tables);
      if (r.tables.length > 0) setTable((tb) => tb || r.tables[0].table);
      setLoadingMeta(false);
    });
  };
  useEffect(loadWhitelist, []);

  const cur = useMemo(() => meta.find((tb) => tb.table === table), [meta, table]);
  const dimCols = useMemo(() => (cur?.columns ?? []).filter((c) => c.kind === "DIM" || c.kind === "BOTH"), [cur]);
  const metricCols = useMemo(() => (cur?.columns ?? []).filter((c) => (c.kind === "METRIC" || c.kind === "BOTH") && c.aggs), [cur]);
  const filterableCols = useMemo(() => (cur?.columns ?? []).filter((c) => c.ops), [cur]);

  const colMeta = (name: string) => cur?.columns.find((c) => c.column === name);
  const opsOf = (name: string) => colMeta(name)?.ops.split(",").filter(Boolean) ?? [];

  const run = (p = page, s = size) => {
    if (!table || (dims.length === 0 && metrics.length === 0)) {
      message.warning(t("bi.needDims"));
      return;
    }
    setRunning(true);
    void post<BIRunResp>("/bi/query", {
      table,
      dimensions: dims,
      metrics,
      filters: filters.map((f) => ({ column: f.column, op: f.op, values: [f.value] })),
      order_by: orderBy,
      order_desc: orderDesc,
      page: p,
      size: s,
    }).then((r) => {
      setResp(r);
      setRunning(false);
    }).catch(() => {
      setRunning(false);
    });
  };

  if (loadingMeta) return <Spin />;

  const columns = (resp?.columns ?? []).map((c, i) => ({
    title: c,
    dataIndex: `v${i}`,
    key: c,
  }));
  const dataSource = (resp?.rows ?? []).map((r: QueryRow, ri: number) => {
    const row: Record<string, string> = { key: String(ri) };
    r.values.forEach((v, i) => { row[`v${i}`] = v; });
    return row;
  });

  return (
    <>
      <Alert type="info" showIcon style={{ marginBottom: 16 }}
        message={t("bi.hint")} />
      <Space direction="vertical" style={{ width: "100%" }} size="middle">
        <Space wrap>
          <Select style={{ width: 220 }} value={table} onChange={(v) => { setTable(v); setDims([]); setMetrics([]); setFilters([]); setOrderBy(""); setResp(null); }}
            options={meta.map((tb) => ({ value: tb.table, label: `${tb.table}（${tb.comment}）` }))} />
          <Select mode="multiple" style={{ minWidth: 280 }} placeholder={t("bi.dims")} value={dims}
            onChange={(v) => { setDims(v); setOrderBy(""); }}
            options={dimCols.map((c) => ({ value: c.column, label: `${c.column}（${c.comment}）` }))} />
          <Select mode="multiple" style={{ minWidth: 280 }} placeholder={t("bi.metrics")} value={metrics}
            onChange={(v) => { setMetrics(v); setOrderBy(""); }}
            options={metricCols.flatMap((c) => c.aggs.split(",").map((a) => ({ value: `${a}:${c.column}`, label: `${a}:${c.column}` })))
              .concat([{ value: "COUNT:*", label: t("bi.countRows") }])} />
        </Space>
        {filters.map((f, i) => (
          <Space key={i} wrap>
            <Select style={{ width: 180 }} value={f.column}
              onChange={(v) => setFilters((fs) => fs.map((x, j) => (j === i ? { ...x, column: v, op: opsOf(v)[0] ?? "" } : x)))}
              options={filterableCols.map((c) => ({ value: c.column, label: c.column }))} />
            <Select style={{ width: 100 }} value={f.op}
              onChange={(v) => setFilters((fs) => fs.map((x, j) => (j === i ? { ...x, op: v } : x)))}
              options={opsOf(f.column).map((o) => ({ value: o, label: o }))} />
            <Input style={{ width: 220 }} placeholder={t("bi.value")} value={f.value}
              onChange={(e) => setFilters((fs) => fs.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} />
            <Button onClick={() => setFilters((fs) => fs.filter((_, j) => j !== i))}>{t("bi.removeFilter")}</Button>
          </Space>
        ))}
        <Space wrap>
          <Button icon={<PlusOutlined />} onClick={() => filterableCols.length > 0 && setFilters((fs) => [...fs, { column: filterableCols[0].column, op: opsOf(filterableCols[0].column)[0] ?? "", value: "" }])}>
            {t("bi.addFilter")}
          </Button>
          <Select style={{ width: 180 }} allowClear placeholder={t("bi.orderBy")} value={orderBy || undefined}
            onChange={(v) => setOrderBy(v ?? "")}
            options={[...dims.map((d) => ({ value: d, label: d })),
              ...metrics.map((m) => ({ value: m, label: m }))]} />
          <Select style={{ width: 90 }} value={orderDesc ? "desc" : "asc"} onChange={(v) => setOrderDesc(v === "desc")}
            options={[{ value: "asc", label: t("bi.asc") }, { value: "desc", label: t("bi.desc") }]} />
          <Button type="primary" icon={<PlayCircleOutlined />} loading={running} onClick={() => { setPage(1); run(1, size); }}>{t("bi.run")}</Button>
          <Button icon={<ReloadOutlined />} onClick={loadWhitelist}>{t("bi.reloadWhitelist")}</Button>
        </Space>
        <Table size="small" rowKey="key" columns={columns} dataSource={dataSource} loading={running}
          pagination={{
            current: page, pageSize: size, total: resp?.total ?? 0, showSizeChanger: true,
            onChange: (p, s) => { setPage(p); setSize(s); run(p, s); },
          }}
          locale={{ emptyText: t("bi.emptyResult") }} />
      </Space>
    </>
  );
}

// ---- 数仓 ETL 手动调度 ----

function EtlButton() {
  const { t } = usePrefs();
  const { message } = App.useApp();
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const [result, setResult] = useState<DwEtlRunResp | null>(null);
  const [running, setRunning] = useState(false);

  return (
    <>
      <Perm code="analytics:recon:run">
        <Button icon={<SyncOutlined />} onClick={() => { form.resetFields(); setResult(null); setOpen(true); }}>{t("bi.etl")}</Button>
      </Perm>
      <Modal title={t("bi.etlTitle")} open={open} destroyOnClose onCancel={() => setOpen(false)}
        footer={null}>
        <Form form={form} layout="inline" style={{ marginBottom: 16 }}
          onFinish={async (v) => {
            setRunning(true);
            try {
              const r = await post<DwEtlRunResp>("/dw/etl", {
                date_start: v.range[0].format("YYYY-MM-DD"),
                date_end: v.range[1].format("YYYY-MM-DD"),
              });
              setResult(r);
              message.success(t("bi.etlDone"));
            } finally {
              setRunning(false);
            }
          }}>
          <Form.Item name="range" rules={[{ required: true, message: t("bi.pickRange") }]}>
            <DatePicker.RangePicker />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={running} icon={<PlayCircleOutlined />}>{t("bi.execute")}</Button>
          </Form.Item>
        </Form>
        {result && (
          <Table size="small" rowKey="etl_date" pagination={false}
            columns={[
              { title: t("rep.statDate"), dataIndex: "etl_date" },
              { title: t("bi.dimDate"), dataIndex: "dim_date_rows" },
              { title: t("bi.dimTenant"), dataIndex: "dim_tenant_rows" },
              { title: t("bi.dimParty"), dataIndex: "dim_party_rows" },
              { title: t("bi.factOrder"), dataIndex: "fact_order_rows" },
              { title: t("bi.factPayment"), dataIndex: "fact_payment_rows" },
              { title: t("bi.costMs"), dataIndex: "cost_ms" },
            ]}
            dataSource={result.days} />
        )}
        <Typography.Paragraph type="secondary" style={{ marginTop: 12 }}>
          {t("bi.etlHint")}
        </Typography.Paragraph>
      </Modal>
    </>
  );
}
