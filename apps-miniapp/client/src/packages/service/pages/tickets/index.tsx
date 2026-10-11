// service/tickets.tsx · 售后进度（分包 service）：我的工单列表 + 详情（流转日志时间线 + SLA 卡）。
import { useCallback, useEffect, useState } from "react";
import { Button, Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import type { CustomerTicketDetail, CustomerTicketItem, SlaTimerView } from "@micro/shared/types/mobile-bff";
import { getTicket, getTicketSla, listTickets } from "../../../../api";
import { TICKET_STATUS_LABEL, fmtTime, statusLabel, statusTone } from "../../../../ui";
import "./../warranty/index.scss";

export default function TicketsPage() {
  const [list, setList] = useState<CustomerTicketItem[]>([]);
  const [detail, setDetail] = useState<CustomerTicketDetail | null>(null);
  const [sla, setSla] = useState<SlaTimerView | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      const r = await listTickets({ page: 1, size: 50 });
      setList(r.list ?? []);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openDetail = async (id: string): Promise<void> => {
    try {
      const [d, s] = await Promise.all([
        getTicket(id),
        getTicketSla(id).catch(() => null),
      ]);
      setDetail(d);
      setSla(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : "详情加载失败");
    }
  };

  return (
    <View className="app-page">
      {error !== "" && <Text className="app-error">{error}</Text>}
      {loading && <Text className="app-empty">加载中…</Text>}

      {detail === null && (
        <>
          {!loading && list.length === 0 && error === "" && (
            <Text className="app-empty">暂无报修工单</Text>
          )}
          {list.map((t) => (
            <View className="app-card" key={t.ticket_id} onClick={() => void openDetail(t.ticket_id)}>
              <View className="sv-head">
                <Text className="sv-title">{t.title}</Text>
                <Text className={`app-tag ${statusTone(t.status)}`}>
                  {statusLabel(TICKET_STATUS_LABEL, t.status)}
                </Text>
              </View>
              <Text className="sv-meta">
                {t.ticket_no} · {t.sn || "—"}
              </Text>
              <Text className="sv-meta">报修于 {fmtTime(t.created_at)}</Text>
            </View>
          ))}
          <Button className="sv-btn" onClick={() => void Taro.navigateTo({ url: "/packages/service/pages/ticket-new/index" })}>
            新建报修
          </Button>
        </>
      )}

      {detail !== null && (
        <>
          <View className="app-card">
            <View className="sv-head">
              <Text className="sv-title">{detail.ticket.title}</Text>
              <Text className={`app-tag ${statusTone(detail.ticket.status)}`}>
                {statusLabel(TICKET_STATUS_LABEL, detail.ticket.status)}
              </Text>
            </View>
            <Text className="sv-meta">
              {detail.ticket.ticket_no} · {detail.ticket.sn || "—"}
            </Text>
            <Text className="sv-meta">报修于 {fmtTime(detail.ticket.created_at)}</Text>
          </View>

          {sla !== null && sla.resolve_due_at > 0 && (
            <View className="app-card">
              <Text className="dd-section">SLA 计时</Text>
              <View className="sv-sla-row">
                <Text className="sv-sla-key">响应截止</Text>
                <Text className="sv-sla-val">{sla.response_due_at > 0 ? fmtTime(sla.response_due_at) : "—"}</Text>
              </View>
              <View className="sv-sla-row">
                <Text className="sv-sla-key">解决截止</Text>
                <Text className="sv-sla-val">{sla.resolve_due_at > 0 ? fmtTime(sla.resolve_due_at) : "—"}</Text>
              </View>
              <View className="sv-sla-row">
                <Text className="sv-sla-key">升级次数</Text>
                <Text className="sv-sla-val">{String(sla.escalate_level)}</Text>
              </View>
            </View>
          )}

          <View className="app-card">
            <Text className="dd-section">处理进度</Text>
            {detail.logs.length === 0 && <Text className="app-empty">暂无流转记录</Text>}
            {detail.logs.map((g) => (
              <View className="sv-log" key={g.log_id}>
                <Text className="sv-log-action">
                  {g.action}（{statusLabel(TICKET_STATUS_LABEL, g.to_status)}）
                </Text>
                {g.note && <Text className="sv-log-note">{g.note}</Text>}
                <Text className="sv-log-note">{fmtTime(g.created_at)}</Text>
              </View>
            ))}
          </View>

          <Button className="sv-btn" onClick={() => setDetail(null)}>
            返回列表
          </Button>
        </>
      )}
    </View>
  );
}
