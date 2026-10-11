// pages/tickets/index.tsx · 工单页（S9-03）：列表（10s usePolling）+ 自领 accept + 处理 start + 提交 submit 弹层；
// 交互正本为场站 Web Ops.tsx TicketsTab（驻站人员自领语义：不做派单/详情抽屉，api.ts 已全量迁移端点）。
// 写操作成功后手动 refresh（02 §8.7 轮询规范）。

import { useEffect, useState } from "react";
import { Button, Text, Textarea, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import type { TicketView } from "@micro/shared/types";
import { ensureStationMe } from "../../auth";
import { acceptTicket, listTickets, startTicket, submitTicket } from "../../api";
import { usePolling } from "../../polling";
import "./index.scss";

/** 状态筛选片（对齐场站 Web TicketsTab 的 Select 选项） */
const STATUS_CHIPS: { value: string; label: string }[] = [
  { value: "DISPATCHED", label: "待接单" },
  { value: "ACCEPTED", label: "已接单" },
  { value: "PROCESSING", label: "处理中" },
  { value: "SUBMITTED", label: "待验收" },
  { value: "", label: "全部" },
];

const EMPTY_LIST = { total: 0, list: [] as TicketView[] };

export default function TicketsPage() {
  const [stationId, setStationId] = useState("");
  const [status, setStatus] = useState("DISPATCHED");
  // 提交处理结果弹层目标（小程序用自绘底部面板替代 Modal）
  const [submitTarget, setSubmitTarget] = useState<TicketView | null>(null);
  const [result, setResult] = useState("");

  useEffect(() => {
    void ensureStationMe().then((m) => {
      if (m && m.station_id) {
        setStationId(m.station_id);
      }
    });
  }, []);

  // 10s 轮询列表（station_id 未就绪返回空列表占位，轮询不停）
  const tickets = usePolling(async () => {
    if (!stationId) {
      return EMPTY_LIST;
    }
    return listTickets(stationId, status || undefined);
  });

  // 状态片切换 / 驻站上下文就绪 → 立即拉一轮
  useEffect(() => {
    if (stationId) {
      tickets.refresh();
    }
    // tickets.refresh 为稳定引用
  }, [stationId, status, tickets.refresh]);

  const act = async (fn: () => Promise<unknown>, okMsg: string) => {
    try {
      await fn();
      Taro.showToast({ title: okMsg, icon: "success" });
      tickets.refresh();
    } catch (e) {
      Taro.showToast({ title: e instanceof Error ? e.message : "操作失败", icon: "none" });
    }
  };

  const onSubmit = async () => {
    if (!submitTarget) {
      return;
    }
    if (!result.trim()) {
      Taro.showToast({ title: "请填写处理结果说明", icon: "none" });
      return;
    }
    await act(() => submitTicket(submitTarget.ticket_id, result.trim()), "已提交");
    setSubmitTarget(null);
    setResult("");
  };

  return (
    <View className="app-page">
      <View className="tk-chips">
        {STATUS_CHIPS.map((c) => (
          <View
            key={c.value || "all"}
            className={`app-chip ${status === c.value ? "app-chip-active" : ""}`}
            onClick={() => setStatus(c.value)}
          >
            <Text className={`app-chip-text ${status === c.value ? "app-chip-active-text" : ""}`}>{c.label}</Text>
          </View>
        ))}
      </View>

      {tickets.error && <Text className="app-error">{tickets.error.message}</Text>}
      {(tickets.data?.list ?? []).length === 0 && !tickets.loading && <Text className="app-empty">暂无工单</Text>}
      {(tickets.data?.list ?? []).map((t) => (
        <View key={t.ticket_id} className="tk-item">
          <View className="tk-item-head">
            <Text className="tk-item-no">{t.ticket_no}</Text>
            <Text className="tk-item-title">{t.title}</Text>
            <Text className={t.priority === "P1" ? "app-tag-danger-text" : "app-tag-text"}>{t.priority}</Text>
          </View>
          <View className="tk-item-meta">
            <Text className="app-sub">
              受理人 {t.assignee_name || "-"} · 升级 {t.escalate_level}
            </Text>
            <Text className="app-sub">{t.status}</Text>
          </View>
          <View className="tk-actions">
            {t.status === "DISPATCHED" && (
              <Button className="app-btn tk-actions-btn" onClick={() => void act(() => acceptTicket(t.ticket_id), "已接单")}>
                <Text className="app-btn-text">接单</Text>
              </Button>
            )}
            {t.status === "ACCEPTED" && (
              <Button className="app-btn tk-actions-btn" onClick={() => void act(() => startTicket(t.ticket_id), "已开工")}>
                <Text className="app-btn-text">开工</Text>
              </Button>
            )}
            {t.status === "PROCESSING" && (
              <Button
                className="app-btn tk-actions-btn"
                onClick={() => {
                  setResult("");
                  setSubmitTarget(t);
                }}
              >
                <Text className="app-btn-text">提交</Text>
              </Button>
            )}
          </View>
        </View>
      ))}

      {submitTarget !== null && (
        <View className="app-mask" onClick={() => setSubmitTarget(null)}>
          <View className="app-panel" onClick={(e) => e.stopPropagation()}>
            <Text className="app-title">提交处理结果：{submitTarget.ticket_no}</Text>
            <Textarea
              className="app-textarea tk-panel-textarea"
              value={result}
              onInput={(e) => setResult(e.detail.value)}
              placeholder="处理结果说明"
              maxlength={500}
              autoHeight
            />
            <View className="tk-actions">
              <Button className="app-btn-plain tk-actions-btn" onClick={() => setSubmitTarget(null)}>
                <Text className="app-btn-plain-text">取消</Text>
              </Button>
              <Button className="app-btn tk-actions-btn" onClick={() => void onSubmit()}>
                <Text className="app-btn-text">提交</Text>
              </Button>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}
