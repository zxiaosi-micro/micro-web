// service/tickets.tsx · 售后进度（分包 service）：我的工单列表 + 详情（流转日志时间线 + SLA 卡）。
import { useCallback, useEffect, useState } from "react";
import { Button, Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import type { CustomerTicketDetail, CustomerTicketItem, SlaTimerView } from "@micro/shared/types/mobile-bff";
import { getTicket, getTicketSla, listTickets } from "../../../../api";
import { fmtTime, statusTone, ticketStatusLabel } from "../../../../ui";
import "./../warranty/index.scss";
import { useThemePage } from "../../../../i18n";

export default function TicketsPage() {
  const { t, rootClass } = useThemePage("page.tickets");
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
      setError(e instanceof Error ? e.message : t("dev.loadFailed"));
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
      setError(e instanceof Error ? e.message : t("tk.detailFailed"));
    }
  };

  return (
    <View className={`app-page ${rootClass}`}>
      {error !== "" && <Text className="app-error">{error}</Text>}
      {loading && <Text className="app-empty">{t("common.loading")}</Text>}

      {detail === null && (
        <>
          {!loading && list.length === 0 && error === "" && (
            <Text className="app-empty">{t("tk.empty")}</Text>
          )}
          {list.map((tk) => (
            <View className="app-card" key={tk.ticket_id} onClick={() => void openDetail(tk.ticket_id)}>
              <View className="sv-head">
                <Text className="sv-title">{tk.title}</Text>
                <Text className={`app-tag ${statusTone(tk.status)}`}>
                  {ticketStatusLabel(tk.status)}
                </Text>
              </View>
              <Text className="sv-meta">
                {tk.ticket_no} · {tk.sn || "—"}
              </Text>
              <Text className="sv-meta">{t("tk.reportedAt", { time: fmtTime(tk.created_at) })}</Text>
            </View>
          ))}
          <Button className="sv-btn" onClick={() => void Taro.navigateTo({ url: "/packages/service/pages/ticket-new/index" })}>
            {t("tk.new")}
          </Button>
        </>
      )}

      {detail !== null && (
        <>
          <View className="app-card">
            <View className="sv-head">
              <Text className="sv-title">{detail.ticket.title}</Text>
              <Text className={`app-tag ${statusTone(detail.ticket.status)}`}>
                {ticketStatusLabel(detail.ticket.status)}
              </Text>
            </View>
            <Text className="sv-meta">
              {detail.ticket.ticket_no} · {detail.ticket.sn || "—"}
            </Text>
            <Text className="sv-meta">{t("tk.reportedAt", { time: fmtTime(detail.ticket.created_at) })}</Text>
          </View>

          {sla !== null && sla.resolve_due_at > 0 && (
            <View className="app-card">
              <Text className="dd-section">{t("tk.slaSection")}</Text>
              <View className="sv-sla-row">
                <Text className="sv-sla-key">{t("tk.slaResponse")}</Text>
                <Text className="sv-sla-val">{sla.response_due_at > 0 ? fmtTime(sla.response_due_at) : "—"}</Text>
              </View>
              <View className="sv-sla-row">
                <Text className="sv-sla-key">{t("tk.slaResolve")}</Text>
                <Text className="sv-sla-val">{sla.resolve_due_at > 0 ? fmtTime(sla.resolve_due_at) : "—"}</Text>
              </View>
              <View className="sv-sla-row">
                <Text className="sv-sla-key">{t("tk.slaEscalate")}</Text>
                <Text className="sv-sla-val">{String(sla.escalate_level)}</Text>
              </View>
            </View>
          )}

          <View className="app-card">
            <Text className="dd-section">{t("tk.progressSection")}</Text>
            {detail.logs.length === 0 && <Text className="app-empty">{t("tk.noLogs")}</Text>}
            {detail.logs.map((g) => (
              <View className="sv-log" key={g.log_id}>
                <Text className="sv-log-action">
                  {g.action}（{ticketStatusLabel(g.to_status)}）
                </Text>
                {g.note && <Text className="sv-log-note">{g.note}</Text>}
                <Text className="sv-log-note">{fmtTime(g.created_at)}</Text>
              </View>
            ))}
          </View>

          <Button className="sv-btn" onClick={() => setDetail(null)}>
            {t("tk.back")}
          </Button>
        </>
      )}
    </View>
  );
}
