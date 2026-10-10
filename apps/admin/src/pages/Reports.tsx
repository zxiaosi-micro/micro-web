// Reports.tsx · 报表中心（S8-05）：六大日报 Tabs + 当日总览扇出 + 指标字典说明 + 手动对账。
// 数据源 = analytics 读模型（CQRS，报表不 JOIN 业务库）；口径见指标字典（列名 = metric_code）。

import { useMemo, useState } from "react";
import {
  Alert, App, Button, Card, Col, DatePicker, Descriptions, Popconfirm, Row, Space, Table, Tabs, Tag, Typography,
} from "antd";
import { FileDoneOutlined, ReloadOutlined, SyncOutlined } from "@ant-design/icons";
import { get, Perm, post } from "@micro/shared";
import type {
  MetricDictItem, ReportOverviewItem, ReportRow,
} from "@micro/shared/types";

// 六大报表列配置（列 key = 指标字典 metric_code，口径在字典 Tooltip）。
const REPORTS: { type: string; label: string; dim?: string; cols: { key: string; title: string; money?: boolean }[] }[] = [
  {
    type: "sales", label: "销售",
    cols: [
      { key: "orders_created", title: "新增订单" },
      { key: "orders_paid", title: "支付完成" },
      { key: "orders_cancelled", title: "取消" },
      { key: "orders_pay_timeout", title: "支付超时" },
      { key: "returns_approved", title: "退货通过" },
      { key: "shipments_signed", title: "签收" },
      { key: "devices_shipped", title: "签收设备" },
      { key: "gmv_paid", title: "实付GMV", money: true },
    ],
  },
  {
    type: "inventory", label: "库存", dim: "warehouse_id",
    cols: [
      { key: "stock_in_qty", title: "入库数量" },
      { key: "stock_out_qty", title: "出库数量" },
      { key: "low_stock_events", title: "低库存触发" },
    ],
  },
  {
    type: "warranty", label: "质保",
    cols: [
      { key: "warranties_started", title: "质保起算" },
      { key: "warranties_device", title: "设备质保" },
      { key: "warranties_station", title: "场站质保" },
      { key: "devices_activated", title: "设备激活" },
    ],
  },
  {
    type: "sla", label: "SLA", dim: "station_id",
    cols: [
      { key: "alerts_total", title: "告警数" },
      { key: "alerts_p1", title: "P1" },
      { key: "alerts_p2", title: "P2" },
      { key: "alerts_p3", title: "P3" },
    ],
  },
  {
    type: "finance", label: "财务", dim: "channel",
    cols: [
      { key: "payments_count", title: "支付笔数" },
      { key: "paid_amount", title: "实付金额", money: true },
      { key: "refunds_count", title: "退款笔数" },
      { key: "refund_amount", title: "退款金额", money: true },
    ],
  },
  {
    type: "station", label: "场站", dim: "station_id",
    cols: [
      { key: "stations_created", title: "新建场站" },
      { key: "station_alerts", title: "场站告警" },
      { key: "alerts_p1", title: "P1 告警" },
    ],
  },
];

function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function ReportsPage() {
  const { message } = App.useApp();
  const [date, setDate] = useState(fmtDate(new Date()));
  const [overview, setOverview] = useState<ReportOverviewItem[]>();
  const [dict, setDict] = useState<MetricDictItem[]>([]);
  const [loading, setLoading] = useState(false);

  const load = (d: string) => {
    setLoading(true);
    void get<{ items: ReportOverviewItem[] }>(`/reports/overview?date=${d}`)
      .then((o) => setOverview(o.items ?? []))
      .finally(() => setLoading(false));
  };
  useMemo(() => {
    void load(date);
    void get<{ list: MetricDictItem[] }>("/reports/metrics").then((o) => setDict(o.list ?? []));
  }, [date]);

  const dictOf = (code: string): MetricDictItem | undefined => dict.find((d) => d.metric_code === code);

  const runRecon = async () => {
    const out = await post<{ diff_total: number }>("/reports/recon", { recon_date: date });
    message[out.diff_total > 0 ? "warning" : "success"](
      out.diff_total > 0 ? `对账发现 ${out.diff_total} 处差异（差异站内信已发，修复走补投递）` : "对账完成：差异率 0",
    );
  };

  const rebuild = async () => {
    const out = await post<{ rebuild_version: string }>("/reports/rebuild", {});
    message.info(`读模型已重建（版本 v${out.rebuild_version}）——重启 analytics 后新消费组从头回放；保留期外历史用 p4backfill 补`);
  };

  return (
    <>
      <Space style={{ marginBottom: 16 }} wrap>
        <DatePicker
          value={date}
          onChange={(v) => { const d = v ?? fmtDate(new Date()); setDate(d); load(d); }}
          allowClear={false}
        />
        <Button icon={<ReloadOutlined />} onClick={() => load(date)} loading={loading}>刷新</Button>
        <Perm code="analytics:recon:run">
          <Button icon={<SyncOutlined />} onClick={() => void runRecon()}>手动对账</Button>
        </Perm>
        <Perm code="analytics:recon:rebuild">
          <Popconfirm
            title="清空台账与六大日表并递增消费组版本号，重启后从头回放。确认重建？"
            onConfirm={() => void rebuild()}
          >
            <Button icon={<FileDoneOutlined />} danger>读模型重建</Button>
          </Popconfirm>
        </Perm>
      </Space>

      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        {(overview ?? []).map((o) => (
          <Col key={o.report_type} xs={24} md={12} xl={8}>
            <Card size="small" title={o.name} loading={loading}>
              <Descriptions size="small" column={2}>
                {Object.entries(o.metrics ?? {}).slice(0, 6).map(([k, v]) => (
                  <Descriptions.Item key={k} label={<Typography.Text type="secondary" style={{ fontSize: 12 }}>{dictOf(k)?.name ?? k}</Typography.Text>}>
                    {v}
                  </Descriptions.Item>
                ))}
              </Descriptions>
            </Card>
          </Col>
        ))}
      </Row>

      <Tabs items={REPORTS.map((r) => ({
        key: r.type,
        label: r.label,
        children: <ReportTable reportType={r.type} date={date} cols={r.cols} dim={r.dim} dictOf={dictOf} />,
      }))} />
    </>
  );
}

function ReportTable(props: {
  reportType: string;
  date: string;
  cols: { key: string; title: string; money?: boolean }[];
  dim?: string;
  dictOf: (code: string) => MetricDictItem | undefined;
}) {
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(false);

  useMemo(() => {
    setLoading(true);
    void get<{ rows: ReportRow[]; total: number }>(
      `/reports/${props.reportType}?date_start=${props.date}&date_end=${props.date}`,
    )
      .then((o) => setRows(o.rows ?? []))
      .finally(() => setLoading(false));
  }, [props.reportType, props.date]);

  const columns: Record<string, unknown>[] = [
    { title: "业务日", dataIndex: "stat_date", width: 110 },
  ];
  if (props.dim === "warehouse_id") columns.push({ title: "仓库ID", dataIndex: "warehouse_id", width: 120 });
  if (props.dim === "station_id") columns.push({ title: "场站ID", dataIndex: "station_id", width: 160 });
  if (props.dim === "channel") columns.push({ title: "渠道", dataIndex: "channel", width: 100, render: (v: string) => (v ? <Tag>{v}</Tag> : "-") });
  for (const c of props.cols) {
    columns.push({
      title: (
        <span title={props.dictOf(c.key)?.caliber ?? c.key}>
          {c.title}
          {props.dictOf(c.key)?.recon === false && <Tag style={{ marginLeft: 4 }}>不对账</Tag>}
        </span>
      ),
      key: c.key,
      render: (_: unknown, r: ReportRow) => (c.money ? Number(r.metrics?.[c.key] ?? 0).toLocaleString("zh-CN", { minimumFractionDigits: 2 }) : r.metrics?.[c.key] ?? "0"),
    });
  }

  return (
    <>
      {rows.length === 0 && !loading && (
        <Alert type="info" showIcon message="该日无数据（读模型按事件构建；对账/backfill 可补）" style={{ marginBottom: 8 }} />
      )}
      <Table
        rowKey={(r) => `${r.stat_date}-${r.station_id ?? 0}-${r.warehouse_id ?? 0}-${r.channel ?? ""}`}
        size="small"
        loading={loading}
        columns={columns as never}
        dataSource={rows}
        pagination={false}
      />
    </>
  );
}
