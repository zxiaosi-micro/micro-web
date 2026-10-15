// Workbench.tsx · 工作台（S7-03）：未读告警/活跃工单计数 + 最新增量列表（10s 轮询）。
// 视觉：StatCard 数字滚动 + 响应式栅格（手机两列指标）。

import { useState } from "react";
import { Button, Card, Col, List, Row, Tag } from "antd";
import { AlertOutlined, FileDoneOutlined } from "@ant-design/icons";
import { usePolling } from "@micro/shared";
import { StatCard } from "@micro/shared/theme";
import { enumLabel, usePrefs } from "@micro/shared/prefs";
import { foldPending, pendingAlerts, pendingTickets, type PendingState } from "../api";

export default function WorkbenchPage(props: { stationId: string; onGoOps: () => void }) {
  const { t } = usePrefs();
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
      <Col xs={12} md={6}>
        <StatCard
          title={t("wb.unreadAlerts")}
          value={alertState.unread}
          icon={<AlertOutlined />}
          tone="#fa541c"
          delayMs={0}
        />
      </Col>
      <Col xs={12} md={6}>
        <StatCard
          title={t("wb.activeTickets")}
          value={ticketState.unread}
          icon={<FileDoneOutlined />}
          tone="#6d4df6"
          delayMs={80}
        />
      </Col>
      <Col xs={24} md={12}>
        <Card className="stat-card" style={{ animationDelay: "160ms" }}>
          <Button className="btn-brand-grad" type="primary" onClick={props.onGoOps}>
            {t("wb.goOps")}
          </Button>
          <div style={{ marginTop: 8, color: "var(--text-sub, #999)", fontSize: 12 }}>
            {t("wb.pollHint")}
          </div>
        </Card>
      </Col>

      <Col xs={24} lg={12}>
        <Card title={t("wb.latestAlerts")} extra={<Button type="link" onClick={alerts.refresh}>{t("common.refresh")}</Button>}>
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
            locale={{ emptyText: t("wb.noAlerts") }}
          />
        </Card>
      </Col>
      <Col xs={24} lg={12}>
        <Card title={t("wb.latestTickets")} extra={<Button type="link" onClick={tickets.refresh}>{t("common.refresh")}</Button>}>
          <List
            size="small"
            dataSource={ticketItems.slice(-20).reverse()}
            renderItem={(tk) => (
              <List.Item>
                <Tag color={tk.priority === "P1" ? "red" : "blue"}>{tk.priority}</Tag>
                <span style={{ flex: 1 }}>{tk.title}</span>
                <Tag>{enumLabel("enum.ticket", tk.status)}</Tag>
              </List.Item>
            )}
            locale={{ emptyText: t("wb.noTickets") }}
          />
        </Card>
      </Col>
    </Row>
  );
}
