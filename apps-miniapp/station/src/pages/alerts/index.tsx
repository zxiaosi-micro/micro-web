// pages/alerts/index.tsx · 告警页（S9-03）：列表（10s usePolling 增量刷新）+ 确认 + 转工单；
// 交互正本为场站 Web Ops.tsx AlertsTab（小程序不实现 close/archive，api.ts 已全量迁移端点）。
// 写操作成功后手动 refresh（02 §8.7 轮询规范）。

import { useEffect, useState } from "react";
import { Button, Switch, Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import type { AlertView } from "@micro/shared/types";
import { ensureStationMe } from "../../auth";
import { ackAlert, listAlerts, transferAlert } from "../../api";
import { usePolling } from "../../polling";
import { useThemePage } from "../../i18n";
import { formatTs } from "../../time";
import "./index.scss";

/** 状态筛选片（对齐场站 Web AlertsTab 的 Select 选项；label 渲染期翻译） */
const STATUS_CHIPS: { value: string; labelKey: string }[] = [
  { value: "OPEN", labelKey: "al.stOpen" },
  { value: "ACKED", labelKey: "al.stAcked" },
  { value: "CLOSED", labelKey: "al.stClosed" },
  { value: "", labelKey: "al.all" },
];

const EMPTY_LIST = { total: 0, list: [] as AlertView[] };

export default function AlertsPage() {
  const { t, rootClass } = useThemePage("page.alerts");
  const [stationId, setStationId] = useState("");
  const [status, setStatus] = useState("OPEN");
  // 转工单面板目标（小程序用自绘底部面板替代 Modal）
  const [transferTarget, setTransferTarget] = useState<AlertView | null>(null);
  const [autoDispatch, setAutoDispatch] = useState(true);

  useEffect(() => {
    void ensureStationMe().then((m) => {
      if (m && m.station_id) {
        setStationId(m.station_id);
      }
    });
  }, []);

  // 10s 轮询列表（station_id 未就绪返回空列表占位，轮询不停）
  const alerts = usePolling(async () => {
    if (!stationId) {
      return EMPTY_LIST;
    }
    return listAlerts(stationId, status || undefined);
  });

  // 状态片切换 / 驻站上下文就绪 → 立即拉一轮
  useEffect(() => {
    if (stationId) {
      alerts.refresh();
    }
    // alerts.refresh 为稳定引用
  }, [stationId, status, alerts.refresh]);

  const onAck = async (a: AlertView) => {
    try {
      await ackAlert(a.alert_id);
      Taro.showToast({ title: t("al.ackDone"), icon: "success" });
      alerts.refresh();
    } catch (e) {
      Taro.showToast({ title: e instanceof Error ? e.message : t("al.ackFailed"), icon: "none" });
    }
  };

  const onTransfer = async () => {
    if (!transferTarget) {
      return;
    }
    try {
      const out = await transferAlert(transferTarget.alert_id, autoDispatch);
      Taro.showToast({ title: t("al.generated", { no: out.ticket_no, auto: autoDispatch ? t("al.generatedAuto") : "" }), icon: "none" });
      setTransferTarget(null);
      alerts.refresh();
    } catch (e) {
      Taro.showToast({ title: e instanceof Error ? e.message : t("al.transferFailed"), icon: "none" });
    }
  };

  return (
    <View className={`app-page ${rootClass}`}>
      <View className="al-chips">
        {STATUS_CHIPS.map((c) => (
          <View
            key={c.value || "all"}
            className={`app-chip ${status === c.value ? "app-chip-active" : ""}`}
            onClick={() => setStatus(c.value)}
          >
            <Text className={`app-chip-text ${status === c.value ? "app-chip-active-text" : ""}`}>{t(c.labelKey)}</Text>
          </View>
        ))}
      </View>

      {alerts.error && <Text className="app-error">{alerts.error.message}</Text>}
      {(alerts.data?.list ?? []).length === 0 && !alerts.loading && <Text className="app-empty">{t("al.empty")}</Text>}
      {(alerts.data?.list ?? []).map((a) => (
        <View key={a.alert_id} className="al-item">
          <View className="al-item-head">
            <Text
              className={
                a.level === "P1" ? "app-tag-danger-text" : a.level === "P2" ? "app-tag-warn-text" : "app-tag-text"
              }
            >
              {a.level}
            </Text>
            <Text className="al-item-title">{a.title}</Text>
            <Text className="app-sub">{a.status}</Text>
          </View>
          <View className="al-item-meta">
            <Text className="app-sub">
              {a.source} · 聚合 {a.aggregate_count} · 首次 {formatTs(a.first_seen_at)}
            </Text>
          </View>
          {(a.status === "OPEN" || a.status === "ACKED") && (
            <View className="al-actions">
              {a.status === "OPEN" && (
                <Button className="app-btn-plain al-actions-btn" onClick={() => void onAck(a)}>
                  <Text className="app-btn-plain-text">确认</Text>
                </Button>
              )}
              <Button className="app-btn al-actions-btn" onClick={() => setTransferTarget(a)}>
                <Text className="app-btn-text">{t("al.toTicket")}</Text>
              </Button>
            </View>
          )}
        </View>
      ))}

      {transferTarget !== null && (
        <View className="app-mask" onClick={() => setTransferTarget(null)}>
          <View className="app-panel" onClick={(e) => e.stopPropagation()}>
            <Text className="al-panel-title">{t("al.transferTitle")}</Text>
            <Text className="app-sub">{transferTarget.title}</Text>
            <View className="al-panel-row">
              <Text className="app-title">{t("al.autoDispatch")}</Text>
              <Switch checked={autoDispatch} onChange={(e) => setAutoDispatch(e.detail.value)} />
            </View>
            <Text className="app-sub">{t("al.autoDispatch")}</Text>
            <View className="al-panel-btns">
              <Button className="app-btn-plain al-panel-btn" onClick={() => setTransferTarget(null)}>
                <Text className="app-btn-plain-text">取消</Text>
              </Button>
              <Button className="app-btn al-panel-btn al-panel-btn-last" onClick={() => void onTransfer()}>
                <Text className="app-btn-text">{autoDispatch ? t("al.generateAuto") : t("al.generate")}</Text>
              </Button>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}
