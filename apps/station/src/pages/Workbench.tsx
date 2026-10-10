// Workbench.tsx · 工作台（S7-03）：未读告警/活跃工单计数 + 最新增量列表（10s 轮询）。

import { useState } from "react";
import { Badge, Button, Card, Col, List, Row, Statistic, Tag } from "antd";
import { usePolling } from "@micro/shared";
import { foldPending, pendingAlerts, pendingTickets, type PendingState } from "../api";

export default function WorkbenchPage(props: { stationId: string; onGoOps: () => void }) {
  const [alertState, setAlertState] = useState<PendingState>({ unread: 0, sinceId: "0" });
  const [ticketState, setTicketState] = useState<PendingState>({ unread: 0, sinceId: "0" });
  const [alertItems, setAlertItems] = useState<import("@micro/shared/types").AlertBriefView[]>([]);
  const [ticketItems, setTicketItems] = useState<import("@micro/shared/types").TicketBriefView[]>([]);

  // 告警 10s 轮询增量（页面隐藏自动暂停由 usePolling 承担，ADR-02）
  const alerts = usePolling(async () => {
    const out = await pendingAlerts(props.stationId, alertState.sinceId);
    setAlertItems((acc) => foldPending(acc, out.items ?? [], "alert_id"));
    setAlertState({ unread: out.unread_count, sinceId: out.max_id || alertState.sinceId });
    return out;
  });

  // 工单 10s 轮询增量（同构）
  const tickets = usePolling(async () => {
    const out = await pendingTickets(props.stationId, ticketState.sinceId);
    setTicketItems((acc) => foldPending(acc, out.items ?? [], "ticket_id"));
    setTicketState({ unread: out.unread_count, sinceId: out.max_id || ticketState.sinceId });
    return out;
  });

  return (
    <Row gutter={[16, 16]}>
      <Col span={6}>
        <Card>
          <Badge count={alertState.unread} overflowCount={999}>
            <Statistic title="未读告警" value={alertState.unread} />
          </Badge>
        </Card>
      </Col>
      <Col span={6}>
        <Card>
          <Statistic title="活跃工单" value={ticketState.unread} />
        </Card>
      </Col>
      <Col span={12}>
        <Card>
          <Button type="primary" onClick={props.onGoOps}>
            进入运维处理
          </Button>
          <div style={{ marginTop: 8, color: "#999", fontSize: 12 }}>
            10s 轮询增量刷新（页面隐藏自动暂停）
          </div>
        </Card>
      </Col>

      <Col span={12}>
        <Card title="最新告警" extra={<Button type="link" onClick={alerts.refresh}>刷新</Button>}>
          <List
            size="small"
            dataSource={alertItems.slice(-20).reverse()}
            renderItem={(a) => (
              <List.Item>
                <Tag color={a.level === "P1" ? "red" : a.level === "P2" ? "orange" : "blue"}>{a.level}</Tag>
                <span style={{ flex: 1 }}>{a.title}</span>
                <Tag>{a.status}</Tag>
              </List.Item>
            )}
            locale={{ emptyText: "暂无告警" }}
          />
        </Card>
      </Col>
      <Col span={12}>
        <Card title="最新工单" extra={<Button type="link" onClick={tickets.refresh}>刷新</Button>}>
          <List
            size="small"
            dataSource={ticketItems.slice(-20).reverse()}
            renderItem={(t) => (
              <List.Item>
                <Tag color={t.priority === "P1" ? "red" : "blue"}>{t.priority}</Tag>
                <span style={{ flex: 1 }}>{t.title}</span>
                <Tag>{t.status}</Tag>
              </List.Item>
            )}
            locale={{ emptyText: "暂无工单" }}
          />
        </Card>
      </Col>
    </Row>
  );
}
