// Monitor.tsx · 监控页（S7-03）：场站聚合 + 设备清单（10s 轮询影子聚合，页面隐藏自动暂停）。

import { Card, Col, Progress, Row, Table, Tag } from "antd";
import { usePolling } from "@micro/shared";
import type { StationMonitorItem } from "@micro/shared/types";
import { stationMonitor } from "../api";

export default function MonitorPage(props: { stationId: string }) {
  const monitor = usePolling(() => stationMonitor(props.stationId), { intervalMs: 10_000 });

  const data = monitor.data;
  const columns = [
    { title: "SN", dataIndex: "sn", key: "sn" },
    {
      title: "在线",
      dataIndex: "online",
      key: "online",
      render: (v: boolean) => (v ? <Tag color="green">在线</Tag> : <Tag color="default">离线</Tag>),
    },
    { title: "SOC %", dataIndex: "soc", key: "soc", render: (v: number) => v ?? "-" },
    { title: "功率 kW", dataIndex: "power", key: "power", render: (v: number) => v ?? "-" },
    {
      title: "影子更新",
      dataIndex: "shadow_at",
      key: "shadow_at",
      render: (v: number) => (v ? new Date(v).toLocaleTimeString() : "-"),
    },
  ];

  return (
    <Row gutter={[16, 16]}>
      <Col span={6}>
        <Card loading={monitor.loading}>
          <div>设备数</div>
          <b style={{ fontSize: 28 }}>{data?.device_count ?? "-"}</b>
        </Card>
      </Col>
      <Col span={6}>
        <Card loading={monitor.loading}>
          <div>在线数</div>
          <b style={{ fontSize: 28 }}>{data?.online_count ?? "-"}</b>
        </Card>
      </Col>
      <Col span={6}>
        <Card loading={monitor.loading}>
          <div>平均 SOC</div>
          <Progress type="dashboard" percent={Math.round(data?.avg_soc ?? 0)} size={90} />
        </Card>
      </Col>
      <Col span={6}>
        <Card loading={monitor.loading}>
          <div>总功率 kW</div>
          <b style={{ fontSize: 28 }}>{data?.total_power ?? "-"}</b>
        </Card>
      </Col>
      <Col span={24}>
        <Card title="设备影子（10s 轮询）">
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
