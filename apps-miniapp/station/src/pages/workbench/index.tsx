// pages/workbench/index.tsx · 工作台（S9-03）：/station-web/me 取 station_id 锁定 +
// pendingAlerts/pendingTickets 10s 增量轮询折叠（照场站 Web Workbench foldPending 模式）+ 未读角标。

import { useEffect, useState } from "react";
import { Button, Text, View } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import type { AlertBriefView, StationWebMeResp, TicketBriefView } from "@micro/shared/types";
import { ensureStationMe, isLoggedIn } from "../../auth";
import {
  foldPending,
  pendingAlerts,
  pendingTickets,
  type PendingState,
} from "../../api";
import { usePolling } from "../../polling";
import { useThemePage } from "../../i18n";
import "./index.scss";

const LOGIN_PAGE = "/pages/login/index";
const EMPTY_PENDING = { unread_count: 0, max_id: "0", items: [] as never[] };

export default function WorkbenchPage() {
  const { t, rootClass } = useThemePage("page.workbench");
  const [me, setMe] = useState<StationWebMeResp | null>(() => null);
  const [stationId, setStationId] = useState("");
  const [alertState, setAlertState] = useState<PendingState>({ unread: 0, sinceId: "0" });
  const [ticketState, setTicketState] = useState<PendingState>({ unread: 0, sinceId: "0" });
  const [alertItems, setAlertItems] = useState<AlertBriefView[]>([]);
  const [ticketItems, setTicketItems] = useState<TicketBriefView[]>([]);

  // 未登录直接弹回登录页（正常路径是登录页 reLaunch 进来，此处兜底直开场景）
  useDidShow(() => {
    if (!isLoggedIn()) {
      Taro.reLaunch({ url: LOGIN_PAGE });
    }
  });

  // 驻站上下文：缓存优先，缺失拉网络（data_scope 锁定本场站）
  useEffect(() => {
    void ensureStationMe().then((m) => {
      if (m && m.station_id) {
        setMe(m);
        setStationId(m.station_id);
      }
    });
  }, []);

  // 告警 10s 轮询增量（页面隐藏自动暂停由 usePolling 承担，ADR-02；station_id 未就绪返回空增量占位）
  const alerts = usePolling(async () => {
    if (!stationId) {
      return EMPTY_PENDING;
    }
    const out = await pendingAlerts(stationId, alertState.sinceId);
    setAlertItems((acc) => foldPending(acc, out.items ?? [], "alert_id"));
    setAlertState({ unread: out.unread_count, sinceId: out.max_id || alertState.sinceId });
    return out;
  });

  // 工单 10s 轮询增量（同构）
  const tickets = usePolling(async () => {
    if (!stationId) {
      return EMPTY_PENDING;
    }
    const out = await pendingTickets(stationId, ticketState.sinceId);
    setTicketItems((acc) => foldPending(acc, out.items ?? [], "ticket_id"));
    setTicketState({ unread: out.unread_count, sinceId: out.max_id || ticketState.sinceId });
    return out;
  });

  // 驻站上下文就绪后立即拉一轮（不等下一个轮询周期）
  useEffect(() => {
    if (stationId) {
      alerts.refresh();
      tickets.refresh();
    }
    // alerts/tickets 的 refresh 为稳定引用
  }, [stationId, alerts.refresh, tickets.refresh]);

  const goAlerts = () => Taro.navigateTo({ url: "/pages/alerts/index" });
  const goTickets = () => Taro.navigateTo({ url: "/pages/tickets/index" });
  const goInspections = () => Taro.navigateTo({ url: "/pages/inspections/index" });

  return (
    <View className={`app-page ${rootClass}`}>
      <View className="app-card">
        <Text className="app-title">{me?.station_name || t("wb.loadingStation")}</Text>
        <Text className="app-sub">
          {me ? `${me.station_no} · ${me.nickname} · data_scope=${me.data_scope}` : t("wb.loadingMe")}
        </Text>
      </View>

      <View className="wb-stat-row">
        <View className="wb-stat-card">
          <View className="wb-stat-value-row">
            <Text className="wb-stat-value">{alertState.unread}</Text>
            {alertState.unread > 0 && (
              <View className="app-badge">
                <Text className="app-badge-text">{alertState.unread}</Text>
              </View>
            )}
          </View>
          <Text className="wb-stat-label">{t("wb.unreadAlerts")}</Text>
        </View>
        <View className="wb-stat-card wb-stat-card-last">
          <View className="wb-stat-value-row">
            <Text className="wb-stat-value">{ticketState.unread}</Text>
          </View>
          <Text className="wb-stat-label">{t("wb.activeTickets")}</Text>
        </View>
      </View>

      <View className="wb-nav-row">
        <Button className="app-btn wb-nav-btn" onClick={goAlerts}>
          <Text className="app-btn-text">{t("wb.goAlerts")}</Text>
        </Button>
        <Button className="app-btn wb-nav-btn" onClick={goTickets}>
          <Text className="app-btn-text">{t("wb.goTickets")}</Text>
        </Button>
        <Button className="app-btn wb-nav-btn wb-nav-btn-last" onClick={goInspections}>
          <Text className="app-btn-text">{t("wb.goInspections")}</Text>
        </Button>
      </View>

      <View className="app-card">
        <View className="app-row">
          <Text className="app-title">{t("wb.latestAlerts")}</Text>
          <Text className="app-sub" onClick={alerts.refresh}>
            {t("wb.refresh")}
          </Text>
        </View>
        {alertItems.length === 0 && <Text className="app-empty">{t("wb.noAlerts")}</Text>}
        {alertItems
          .slice(-20)
          .reverse()
          .map((a) => (
            <View key={a.alert_id} className="wb-item">
              <Text className={a.level === "P1" ? "app-tag-danger-text" : a.level === "P2" ? "app-tag-warn-text" : "app-tag-text"}>
                {a.level}
              </Text>
              <Text className="wb-item-title">{a.title}</Text>
              <Text className="app-sub">{a.status}</Text>
            </View>
          ))}
      </View>

      <View className="app-card">
        <View className="app-row">
          <Text className="app-title">{t("wb.latestTickets")}</Text>
          <Text className="app-sub" onClick={tickets.refresh}>
            {t("wb.refresh")}
          </Text>
        </View>
        {ticketItems.length === 0 && <Text className="app-empty">{t("wb.noTickets")}</Text>}
        {ticketItems
          .slice(-20)
          .reverse()
          .map((tk) => (
            <View key={tk.ticket_id} className="wb-item">
              <Text className={tk.priority === "P1" ? "app-tag-danger-text" : "app-tag-text"}>{tk.priority}</Text>
              <Text className="wb-item-title">{tk.title}</Text>
              <Text className="app-sub">{tk.status}</Text>
            </View>
          ))}
      </View>
    </View>
  );
}
