// Reports.tsx · 报表中心（S8-05）：六大日报 Tabs + 当日总览扇出 + 指标字典说明 + 手动对账。
// 数据源 = analytics 读模型（CQRS，报表不 JOIN 业务库）；口径见指标字典（列名 = metric_code）。

import { useMemo, useState } from "react";
import {
  Alert, App, Button, Card, Col, DatePicker, Descriptions, Popconfirm, Row, Space, Table, Tabs, Tag, Typography,
} from "antd";
import { FileDoneOutlined, ReloadOutlined, SyncOutlined } from "@ant-design/icons";
import { get, Perm, post } from "@micro/shared";
import { getLocale, usePrefs } from "@micro/shared/prefs";
import type {
  MetricDictItem, ReportOverviewItem, ReportRow,
} from "@micro/shared/types";

// 六大报表列配置（列 key = 指标字典 metric_code，口径在字典 Tooltip；label/titleKey 渲染期翻译）。
const REPORTS: { type: string; labelKey: string; dim?: string; cols: { key: string; titleKey: string; money?: boolean }[] }[] = [
  {
    type: "sales", labelKey: "rep.sales",
    cols: [
      { key: "orders_created", titleKey: "rep.ordersCreated" },
      { key: "orders_paid", titleKey: "rep.ordersPaid" },
      { key: "orders_cancelled", titleKey: "rep.ordersCancelled" },
      { key: "orders_pay_timeout", titleKey: "rep.ordersPayTimeout" },
      { key: "returns_approved", titleKey: "rep.returnsApproved" },
      { key: "shipments_signed", titleKey: "rep.shipmentsSigned" },
      { key: "devices_shipped", titleKey: "rep.devicesShipped" },
      { key: "gmv_paid", titleKey: "rep.gmvPaid", money: true },
    ],
  },
  {
    type: "inventory", labelKey: "rep.inventory", dim: "warehouse_id",
    cols: [
      { key: "stock_in_qty", titleKey: "rep.stockInQty" },
      { key: "stock_out_qty", titleKey: "rep.stockOutQty" },
      { key: "low_stock_events", titleKey: "rep.lowStockEvents" },
    ],
  },
  {
    type: "warranty", labelKey: "rep.warranty",
    cols: [
      { key: "warranties_started", titleKey: "rep.warrantiesStarted" },
      { key: "warranties_device", titleKey: "rep.warrantiesDevice" },
      { key: "warranties_station", titleKey: "rep.warrantiesStation" },
      { key: "devices_activated", titleKey: "rep.devicesActivated" },
    ],
  },
  {
    type: "sla", labelKey: "rep.sla", dim: "station_id",
    cols: [
      { key: "alerts_total", titleKey: "rep.alertsTotal" },
      { key: "alerts_p1", titleKey: "rep.p1" },
      { key: "alerts_p2", titleKey: "rep.p2" },
      { key: "alerts_p3", titleKey: "rep.p3" },
    ],
  },
  {
    type: "finance", labelKey: "rep.finance", dim: "channel",
    cols: [
      { key: "payments_count", titleKey: "rep.paymentsCount" },
      { key: "paid_amount", titleKey: "rep.paidAmount", money: true },
      { key: "refunds_count", titleKey: "rep.refundsCount" },
      { key: "refund_amount", titleKey: "rep.refundAmount", money: true },
    ],
  },
  {
    type: "station", labelKey: "rep.station", dim: "station_id",
    cols: [
      { key: "stations_created", titleKey: "rep.stationsCreated" },
      { key: "station_alerts", titleKey: "rep.stationAlerts" },
      { key: "alerts_p1", titleKey: "rep.p1Alert" },
    ],
  },
];

function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function ReportsPage() {
  const { t } = usePrefs();
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
      out.diff_total > 0 ? t("rep.reconDiff", { count: out.diff_total }) : t("rep.reconClean"),
    );
  };

  const rebuild = async () => {
    const out = await post<{ rebuild_version: string }>("/reports/rebuild", {});
    message.info(t("rep.rebuilt", { version: out.rebuild_version }));
  };

  return (
    <>
      <Space style={{ marginBottom: 16 }} wrap>
        <DatePicker
          value={date}
          onChange={(v) => { const d = v ?? fmtDate(new Date()); setDate(d); load(d); }}
          allowClear={false}
        />
        <Button icon={<ReloadOutlined />} onClick={() => load(date)} loading={loading}>{t("common.refresh")}</Button>
        <Perm code="analytics:recon:run">
          <Button icon={<SyncOutlined />} onClick={() => void runRecon()}>{t("rep.recon")}</Button>
        </Perm>
        <Perm code="analytics:recon:rebuild">
          <Popconfirm
            title={t("rep.rebuildConfirm")}
            okText={t("common.confirm")}
            cancelText={t("common.cancel")}
            onConfirm={() => void rebuild()}
          >
            <Button icon={<FileDoneOutlined />} danger>{t("rep.rebuild")}</Button>
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
        label: t(r.labelKey),
        children: <ReportTable reportType={r.type} date={date} cols={r.cols} dim={r.dim} dictOf={dictOf} />,
      }))} />
    </>
  );
}

function ReportTable(props: {
  reportType: string;
  date: string;
  cols: { key: string; titleKey: string; money?: boolean }[];
  dim?: string;
  dictOf: (code: string) => MetricDictItem | undefined;
}) {
  const { t } = usePrefs();
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
    { title: t("rep.statDate"), dataIndex: "stat_date", width: 110 },
  ];
  if (props.dim === "warehouse_id") columns.push({ title: t("rep.warehouseId"), dataIndex: "warehouse_id", width: 120 });
  if (props.dim === "station_id") columns.push({ title: t("rep.stationId"), dataIndex: "station_id", width: 160 });
  if (props.dim === "channel") columns.push({ title: t("rep.channel"), dataIndex: "channel", width: 100, render: (v: string) => (v ? <Tag>{v}</Tag> : "-") });
  for (const c of props.cols) {
    columns.push({
      title: (
        <span title={props.dictOf(c.key)?.caliber ?? c.key}>
          {t(c.titleKey)}
          {props.dictOf(c.key)?.recon === false && <Tag style={{ marginLeft: 4 }}>{t("rep.noRecon")}</Tag>}
        </span>
      ),
      key: c.key,
      render: (_: unknown, r: ReportRow) => (c.money ? Number(r.metrics?.[c.key] ?? 0).toLocaleString(getLocale(), { minimumFractionDigits: 2 }) : r.metrics?.[c.key] ?? "0"),
    });
  }

  return (
    <>
      {rows.length === 0 && !loading && (
        <Alert type="info" showIcon message={t("rep.noData")} style={{ marginBottom: 8 }} />
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
