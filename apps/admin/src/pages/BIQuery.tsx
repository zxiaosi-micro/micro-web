// BIQuery.tsx · BI 自助查询（S10-02）：白名单引擎驱动的查询构建器 + 数仓 ETL 手动调度。
// 表/字段/维度/聚合/操作符全部来自白名单元数据（ListBIWhitelist），白名单外查询服务端拒绝。

import { useEffect, useMemo, useState } from "react";
import {
  Alert, App, Button, Card, DatePicker, Form, Input, Modal, Select, Space, Spin, Table, Typography,
} from "antd";
import { PlayCircleOutlined, PlusOutlined, ReloadOutlined, SyncOutlined } from "@ant-design/icons";
import { get, Perm, post } from "@micro/shared";
import type { BIRunResp, BIWhitelistResp, BIWhitelistTable, DwEtlRunResp } from "@micro/shared/types";

type QueryRow = { values: string[] };

export default function BIQueryPage() {
  return (
    <Card
      title="BI 自助查询（数仓星型模型 · 白名单引擎）"
      extra={<EtlButton />}
    >
      <QueryBuilder />
    </Card>
  );
}

// ---- 查询构建器 ----

function QueryBuilder() {
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
      if (r.tables.length > 0) setTable((t) => t || r.tables[0].table);
      setLoadingMeta(false);
    });
  };
  useEffect(loadWhitelist, []);

  const cur = useMemo(() => meta.find((t) => t.table === table), [meta, table]);
  const dimCols = useMemo(() => (cur?.columns ?? []).filter((c) => c.kind === "DIM" || c.kind === "BOTH"), [cur]);
  const metricCols = useMemo(() => (cur?.columns ?? []).filter((c) => (c.kind === "METRIC" || c.kind === "BOTH") && c.aggs), [cur]);
  const filterableCols = useMemo(() => (cur?.columns ?? []).filter((c) => c.ops), [cur]);

  const colMeta = (name: string) => cur?.columns.find((c) => c.column === name);
  const opsOf = (name: string) => colMeta(name)?.ops.split(",").filter(Boolean) ?? [];

  const run = (p = page, s = size) => {
    if (!table || (dims.length === 0 && metrics.length === 0)) {
      message.warning("请选择维度或指标（至少一项）");
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
        message="表/字段/聚合/操作符均来自服务端白名单（参数化防注入）；指标写法 AGG:列名（如 SUM:total_amount，全表计数 COUNT:*）。" />
      <Space direction="vertical" style={{ width: "100%" }} size="middle">
        <Space wrap>
          <Select style={{ width: 220 }} value={table} onChange={(v) => { setTable(v); setDims([]); setMetrics([]); setFilters([]); setOrderBy(""); setResp(null); }}
            options={meta.map((t) => ({ value: t.table, label: `${t.table}（${t.comment}）` }))} />
          <Select mode="multiple" style={{ minWidth: 280 }} placeholder="维度（group by）" value={dims}
            onChange={(v) => { setDims(v); setOrderBy(""); }}
            options={dimCols.map((c) => ({ value: c.column, label: `${c.column}（${c.comment}）` }))} />
          <Select mode="multiple" style={{ minWidth: 280 }} placeholder="指标（AGG:列）" value={metrics}
            onChange={(v) => { setMetrics(v); setOrderBy(""); }}
            options={metricCols.flatMap((c) => c.aggs.split(",").map((a) => ({ value: `${a}:${c.column}`, label: `${a}:${c.column}` })))
              .concat([{ value: "COUNT:*", label: "COUNT:*（行数）" }])} />
        </Space>
        {filters.map((f, i) => (
          <Space key={i} wrap>
            <Select style={{ width: 180 }} value={f.column}
              onChange={(v) => setFilters((fs) => fs.map((x, j) => (j === i ? { ...x, column: v, op: opsOf(v)[0] ?? "" } : x)))}
              options={filterableCols.map((c) => ({ value: c.column, label: c.column }))} />
            <Select style={{ width: 100 }} value={f.op}
              onChange={(v) => setFilters((fs) => fs.map((x, j) => (j === i ? { ...x, op: v } : x)))}
              options={opsOf(f.column).map((o) => ({ value: o, label: o }))} />
            <Input style={{ width: 220 }} placeholder="值" value={f.value}
              onChange={(e) => setFilters((fs) => fs.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} />
            <Button onClick={() => setFilters((fs) => fs.filter((_, j) => j !== i))}>移除</Button>
          </Space>
        ))}
        <Space wrap>
          <Button icon={<PlusOutlined />} onClick={() => filterableCols.length > 0 && setFilters((fs) => [...fs, { column: filterableCols[0].column, op: opsOf(filterableCols[0].column)[0] ?? "", value: "" }])}>
            加过滤条件
          </Button>
          <Select style={{ width: 180 }} allowClear placeholder="排序" value={orderBy || undefined}
            onChange={(v) => setOrderBy(v ?? "")}
            options={[...dims.map((d) => ({ value: d, label: d })),
              ...metrics.map((m) => ({ value: m, label: m }))]} />
          <Select style={{ width: 90 }} value={orderDesc ? "desc" : "asc"} onChange={(v) => setOrderDesc(v === "desc")}
            options={[{ value: "asc", label: "升序" }, { value: "desc", label: "降序" }]} />
          <Button type="primary" icon={<PlayCircleOutlined />} loading={running} onClick={() => { setPage(1); run(1, size); }}>执行查询</Button>
          <Button icon={<ReloadOutlined />} onClick={loadWhitelist}>刷新白名单</Button>
        </Space>
        <Table size="small" rowKey="key" columns={columns} dataSource={dataSource} loading={running}
          pagination={{
            current: page, pageSize: size, total: resp?.total ?? 0, showSizeChanger: true,
            onChange: (p, s) => { setPage(p); setSize(s); run(p, s); },
          }}
          locale={{ emptyText: "执行查询后展示结果" }} />
      </Space>
    </>
  );
}

// ---- 数仓 ETL 手动调度 ----

function EtlButton() {
  const { message } = App.useApp();
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const [result, setResult] = useState<DwEtlRunResp | null>(null);
  const [running, setRunning] = useState(false);

  return (
    <>
      <Perm code="analytics:recon:run">
        <Button icon={<SyncOutlined />} onClick={() => { form.resetFields(); setResult(null); setOpen(true); }}>数仓 ETL</Button>
      </Perm>
      <Modal title="数仓 ETL 手动触发（重跑幂等）" open={open} destroyOnClose onCancel={() => setOpen(false)}
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
              message.success("ETL 完成（重跑同值 affected=0，幂等）");
            } finally {
              setRunning(false);
            }
          }}>
          <Form.Item name="range" rules={[{ required: true, message: "选择日期区间" }]}>
            <DatePicker.RangePicker />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={running} icon={<PlayCircleOutlined />}>执行</Button>
          </Form.Item>
        </Form>
        {result && (
          <Table size="small" rowKey="etl_date" pagination={false}
            columns={[
              { title: "业务日", dataIndex: "etl_date" },
              { title: "日历维", dataIndex: "dim_date_rows" },
              { title: "租户维", dataIndex: "dim_tenant_rows" },
              { title: "参与方维", dataIndex: "dim_party_rows" },
              { title: "订单事实", dataIndex: "fact_order_rows" },
              { title: "支付事实", dataIndex: "fact_payment_rows" },
              { title: "耗时ms", dataIndex: "cost_ms" },
            ]}
            dataSource={result.days} />
        )}
        <Typography.Paragraph type="secondary" style={{ marginTop: 12 }}>
          日调度：服务内 cron 每小时补跑昨日缺失批次（K8s CronJob 候选形态，ADR-09 阶段二）；此处可手动补历史区间。
        </Typography.Paragraph>
      </Modal>
    </>
  );
}
