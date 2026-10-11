// pages/inspections/index.tsx · 巡检页（S9-03）：任务列表 + 详情表单（每项 result 输入 + anomalous 开关 +
// Taro.getLocation gcj02 定位 + Taro.chooseImage 拍照占位 + 批量提交，展示 anomaly_count）。
// 交互正本为场站 Web Ops.tsx InspectionTab（含明细为空时的默认日巡 schema 兜底口径）。

import { useEffect, useState } from "react";
import { Button, Image, Input, Switch, Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import type { InspectionTaskGetResp, InspectionTaskView } from "@micro/shared/types";
import { ensureStationMe } from "../../auth";
import { getInspectionTask, listInspectionTasks, submitInspection } from "../../api";
import { usePolling } from "../../polling";
import { formatTs } from "../../time";
import "./index.scss";

const STATUS_CHIPS: { value: string; label: string }[] = [
  { value: "PENDING", label: "待执行" },
  { value: "", label: "全部" },
];

/** 拍照上限（占位阶段本机路径，接 file 服务上传后仍以此约束张数） */
const MAX_PHOTOS = 3;

/** 提交前明细为空时的默认日巡 schema 兜底（station_created 自动建计划的模板口径，同场站 Web） */
const DEFAULT_ITEM_NAMES = ["外观检查", "连接紧固", "异味异响"];

interface ItemValue {
  result: string;
  anomalous: boolean;
}

const EMPTY_LIST = { total: 0, list: [] as InspectionTaskView[] };

export default function InspectionsPage() {
  const [stationId, setStationId] = useState("");
  const [status, setStatus] = useState("PENDING");
  // 表单面板目标（小程序用自绘底部面板替代 Modal）
  const [activeTask, setActiveTask] = useState<InspectionTaskView | null>(null);
  const [detail, setDetail] = useState<InspectionTaskGetResp | null>(null);
  const [values, setValues] = useState<Record<string, ItemValue>>({});
  const [location, setLocation] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    void ensureStationMe().then((m) => {
      if (m && m.station_id) {
        setStationId(m.station_id);
      }
    });
  }, []);

  // 10s 轮询任务列表（station_id 未就绪返回空列表占位，轮询不停）
  const tasks = usePolling(async () => {
    if (!stationId) {
      return EMPTY_LIST;
    }
    return listInspectionTasks(stationId, status || undefined);
  });

  // 状态片切换 / 驻站上下文就绪 → 立即拉一轮
  useEffect(() => {
    if (stationId) {
      tasks.refresh();
    }
    // tasks.refresh 为稳定引用
  }, [stationId, status, tasks.refresh]);

  // 打开表单：拉任务详情 + 初始化每项 result/anomalous（明细为空走默认日巡 schema 兜底）
  useEffect(() => {
    if (!activeTask) {
      setDetail(null);
      setValues({});
      setLocation("");
      setPhotos([]);
      return;
    }
    const taskId = activeTask.task_id;
    void getInspectionTask(taskId)
      .then((out) => {
        const items =
          out.items && out.items.length > 0
            ? out.items
            : DEFAULT_ITEM_NAMES.map((name, i) => ({
                item_id: String(i),
                task_id: out.task?.task_id ?? taskId,
                name,
                result: "",
                anomalous: false,
                ticket_id: "0",
              }));
        setDetail({ ...out, items });
        const init: Record<string, ItemValue> = {};
        for (const it of items) {
          init[it.item_id] = { result: it.result ?? "", anomalous: it.anomalous };
        }
        setValues(init);
      })
      .catch((e: unknown) => {
        Taro.showToast({ title: e instanceof Error ? e.message : "获取巡检详情失败", icon: "none" });
        setActiveTask(null);
      });
  }, [activeTask]);

  const onGetLocation = async () => {
    try {
      const res = await Taro.getLocation({ type: "gcj02", isHighAccuracy: true });
      setLocation(`${res.longitude},${res.latitude}`);
      Taro.showToast({ title: "定位成功", icon: "success" });
    } catch {
      Taro.showToast({ title: "定位失败（需授权位置权限）", icon: "none" });
    }
  };

  const onChooseImage = async () => {
    if (photos.length >= MAX_PHOTOS) {
      Taro.showToast({ title: `最多 ${MAX_PHOTOS} 张`, icon: "none" });
      return;
    }
    try {
      const res = await Taro.chooseImage({
        count: MAX_PHOTOS - photos.length,
        sizeType: ["compressed"],
        sourceType: ["camera", "album"],
      });
      setPhotos((acc) => [...acc, ...res.tempFilePaths]);
    } catch {
      // 用户取消选图：静默
    }
  };

  const onSubmit = async () => {
    if (!activeTask || !detail) {
      return;
    }
    if (!location) {
      Taro.showToast({ title: "请先获取定位", icon: "none" });
      return;
    }
    setSubmitting(true);
    try {
      const items = detail.items.map((it) => {
        const v = values[it.item_id] ?? { result: "", anomalous: false };
        return { name: it.name, result: v.result, anomalous: v.anomalous };
      });
      // photos 传本机临时路径逗号串（占位；接 file 服务上传后换 file_id 列表）
      const out = await submitInspection(
        activeTask.task_id,
        items,
        location,
        photos.length > 0 ? photos.join(",") : undefined,
      );
      setSubmitting(false);
      await Taro.showModal({
        title: "巡检已提交",
        content: `异常 ${out.anomaly_count} 项${out.ticket_ids ? `，已生成工单：${out.ticket_ids}` : ""}`,
        showCancel: false,
      });
      setActiveTask(null);
      tasks.refresh();
    } catch (e) {
      setSubmitting(false);
      Taro.showToast({ title: e instanceof Error ? e.message : "提交失败", icon: "none" });
    }
  };

  return (
    <View className="app-page">
      <View className="ins-chips">
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

      {tasks.error && <Text className="app-error">{tasks.error.message}</Text>}
      {(tasks.data?.list ?? []).length === 0 && !tasks.loading && <Text className="app-empty">暂无巡检任务</Text>}
      {(tasks.data?.list ?? []).map((t) => (
        <View key={t.task_id} className="ins-item">
          <View className="ins-item-head">
            <Text className="ins-item-title">{t.title}</Text>
            {t.anomaly_count > 0 && (
              <View className="app-badge">
                <Text className="app-badge-text">异常 {t.anomaly_count}</Text>
              </View>
            )}
          </View>
          <View className="ins-item-meta">
            <Text className="app-sub">计划 {formatTs(t.scheduled_for)}</Text>
            <Text className="app-sub">{t.status}</Text>
          </View>
          {t.status === "PENDING" && (
            <View className="ins-actions">
              <Button className="app-btn ins-actions-btn" onClick={() => setActiveTask(t)}>
                <Text className="app-btn-text">批量提交</Text>
              </Button>
            </View>
          )}
        </View>
      ))}

      {activeTask !== null && (
        <View className="app-mask" onClick={() => setActiveTask(null)}>
          <View className="app-panel" onClick={(e) => e.stopPropagation()}>
            <Text className="app-title">巡检批量提交：{activeTask.title}</Text>
            {!detail && <Text className="app-empty">正在获取巡检明细…</Text>}
            {detail !== null &&
              detail.items.map((it) => {
                const v = values[it.item_id] ?? { result: "", anomalous: false };
                return (
                  <View key={it.item_id} className="ins-form-row">
                    <Text className="ins-form-name">{it.name}</Text>
                    <Input
                      className="app-input ins-form-input"
                      value={v.result}
                      onInput={(e) => setValues({ ...values, [it.item_id]: { ...v, result: e.detail.value } })}
                      placeholder="结果"
                    />
                    <View className="ins-form-switch">
                      <Switch
                        checked={v.anomalous}
                        onChange={(e) => setValues({ ...values, [it.item_id]: { ...v, anomalous: e.detail.value } })}
                      />
                    </View>
                  </View>
                );
              })}
            {detail !== null && <Text className="app-sub">开关打开=该项异常（提交后服务端自动生成工单）</Text>}

            <View className="ins-form-row">
              <Text className="ins-form-name">定位</Text>
              <Text className="app-sub" style={{ flex: 1, marginLeft: "16rpx" }}>
                {location || "未获取（gcj02）"}
              </Text>
              <Button className="app-btn-plain ins-actions-btn" onClick={() => void onGetLocation()}>
                <Text className="app-btn-plain-text">获取定位</Text>
              </Button>
            </View>

            <View className="ins-form-row">
              <Text className="ins-form-name">拍照</Text>
              <Button className="app-btn-plain ins-actions-btn" onClick={() => void onChooseImage()}>
                <Text className="app-btn-plain-text">拍照/选图（{photos.length}/{MAX_PHOTOS}）</Text>
              </Button>
            </View>
            {photos.length > 0 && (
              <View className="ins-photos">
                {photos.map((p, i) => (
                  <View key={p} className="ins-photo">
                    <Image src={p} mode="aspectFill" style={{ width: "100%", height: "100%" }} />
                    <Text className="ins-photo-del" onClick={() => setPhotos(photos.filter((_, idx) => idx !== i))}>
                      ×
                    </Text>
                  </View>
                ))}
              </View>
            )}

            <View className="ins-actions">
              <Button className="app-btn-plain ins-actions-btn" onClick={() => setActiveTask(null)}>
                <Text className="app-btn-plain-text">取消</Text>
              </Button>
              <Button
                className="app-btn ins-actions-btn"
                disabled={submitting || detail === null}
                onClick={() => void onSubmit()}
              >
                <Text className="app-btn-text">{submitting ? "提交中…" : "批量提交"}</Text>
              </Button>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}
