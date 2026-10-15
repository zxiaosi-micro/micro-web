// Monitor.tsx · 监控页（S7-03）：场站聚合 + 设备清单（10s 轮询影子聚合，页面隐藏自动暂停）。

import { Card, Col, Progress, Row, Table, Tag } from "antd";
import { usePolling } from "@micro/shared";
import { getLocale, usePrefs } from "@micro/shared/prefs";
import type { StationMonitorItem } from "@micro/shared/types";
import { stationMonitor } from "../api";

export default function MonitorPage(props: { stationId: string }) {
  const { t } = usePrefs();
  const monitor = usePolling(() => stationMonitor(props.stationId), { intervalMs: 10_000 });

  const data = monitor.data;
  const columns = [
    { title: "SN", dataIndex: "sn", key: "sn" },
    {
      title: t("mon.onlineCol"),
      dataIndex: "online",
      key: "online",
      render: (v: boolean) => (v ? <Tag color="green">{t("mon.online")}</Tag> : <Tag color="default">{t("mon.offline")}</Tag>),
    },
    { title: t("mon.socCol"), dataIndex: "soc", key: "soc", render: (v: number) => v ?? "-" },
    { title: t("mon.powerCol"), dataIndex: "power", key: "power", render: (v: number) => v ?? "-" },
    {
      title: t("mon.shadowAt"),
      dataIndex: "shadow_at",
      key: "shadow_at",
      render: (v: number) => (v ? new Date(v).toLocaleTimeString(getLocale()) : "-"),
    },
  ];

  return (
    <Row gutter={[16, 16]}>
      <Col span={6}>
        <Card loading={monitor.loading}>
          <div>{t("mon.deviceCount")}</div>
          <b style={{ fontSize: 28 }}>{data?.device_count ?? "-"}</b>
        </Card>
      </Col>
      <Col span={6}>
        <Card loading={monitor.loading}>
          <div>{t("mon.onlineCount")}</div>
          <b style={{ fontSize: 28 }}>{data?.online_count ?? "-"}</b>
        </Card>
      </Col>
      <Col span={6}>
        <Card loading={monitor.loading}>
          <div>{t("mon.avgSoc")}</div>
          <Progress type="dashboard" percent={Math.round(data?.avg_soc ?? 0)} size={90} />
        </Card>
      </Col>
      <Col span={6}>
        <Card loading={monitor.loading}>
          <div>{t("mon.totalPower")}</div>
          <b style={{ fontSize: 28 }}>{data?.total_power ?? "-"}</b>
        </Card>
      </Col>
      <Col span={24}>
        <Card title={t("mon.shadowCard")}>
          <Table<StationMonitorItem>
            rowKey={(r) => String(r.sn)}
            loading={monitor.loading}
            dataSource={(data?.items as StationMonitorItem[]) ?? []}
            columns={columns as never}
            pagination={false}
          />
        </Card>
      </Col>
    </Row>
  );
}
