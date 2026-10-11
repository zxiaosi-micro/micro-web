// device-detail.tsx · 设备详情：影子指标网格 + 质保列表 + 遥测趋势（CSS 条形图）+ 场站归属。
// 数据：getDeviceDetail（含 shadow/warranties/station）+ getDeviceTrend（1min 桶降采样，24h）。
import { useCallback, useEffect, useState } from "react";
import { Button, Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import type { CustomerDeviceDetail, TrendPoint } from "@micro/shared/types/mobile-bff";
import { getDeviceDetail, getDeviceTrend } from "../../api";
import { DEVICE_STATUS_LABEL, WARRANTY_STATUS_LABEL, fmtTime, fmtTimeShort, statusLabel, statusTone } from "../../ui";
import "./index.scss";

/** 趋势图取值键（CSS 条形高度归一用） */
const TREND_BARS = 24;

export default function DeviceDetail() {
  const [id, setId] = useState("");
  const [detail, setDetail] = useState<CustomerDeviceDetail | null>(null);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [error, setError] = useState("");

  const load = useCallback(async (deviceId: string): Promise<void> => {
    try {
      const [d, t] = await Promise.all([
        getDeviceDetail(deviceId),
        getDeviceTrend(deviceId, 24).catch(() => ({ points: [] as TrendPoint[] })),
      ]);
      setDetail(d);
      setTrend(t.points ?? []);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    }
  }, []);

  useLoadParam(setId);

  useEffect(() => {
    if (id !== "") {
      void load(id);
    }
  }, [id, load]);

  // 趋势条形归一（power 主轴；空序列隐藏图表）
  const powers = trend.map((p) => p.power);
  const maxPower = Math.max(...powers, 0.0001);
  const bars = trend.slice(-TREND_BARS);

  return (
    <View className="app-page">
      {error !== "" && <Text className="app-error">{error}</Text>}
      {!detail && error === "" && <Text className="app-empty">加载中…</Text>}
      {detail && (
        <>
          <View className="app-card">
            <View className="dd-head">
              <Text className="dd-sn">{detail.device.sn}</Text>
              <Text className={`app-tag ${statusTone(detail.device.status)}`}>
                {statusLabel(DEVICE_STATUS_LABEL, detail.device.status)}
              </Text>
            </View>
            <View className="dd-row">
              <Text className="dd-key">型号</Text>
              <Text className="dd-val">{detail.device.model || "—"}</Text>
            </View>
            <View className="dd-row">
              <Text className="dd-key">激活时间</Text>
              <Text className="dd-val">{detail.device.activated_at ? fmtTime(detail.device.activated_at) : "未激活"}</Text>
            </View>
            {detail.station && (
              <View
                className="dd-row dd-station"
                onClick={() =>
                  Taro.navigateTo({ url: `/packages/station/pages/detail/index?id=${detail.station?.station_id ?? ""}` })
                }
              >
                <Text className="dd-key">所属场站</Text>
                <Text className="dd-val dd-link">{detail.station.name || detail.station.station_no}</Text>
              </View>
            )}
          </View>

          <View className="app-card">
            <Text className="dd-section">实时影子</Text>
            {detail.shadow.metrics.length === 0 && (
              <Text className="app-empty">暂无上报数据（弱网设备上报后 5 分钟内可见）</Text>
            )}
            <View className="dd-metrics">
              {detail.shadow.metrics.map((m) => (
                <View className="dd-metric" key={m.key}>
                  <Text className="dd-metric-val">{m.value}</Text>
                  <Text className="dd-metric-key">{m.key}</Text>
                </View>
              ))}
            </View>
            {detail.shadow.ts !== "" && (
              <Text className="dd-ts">更新于 {fmtTime(Number(detail.shadow.ts))}</Text>
            )}
          </View>

          <View className="app-card">
            <Text className="dd-section">遥测趋势（24h · 每分钟桶 · kW）</Text>
            {bars.length === 0 && <Text className="app-empty">暂无趋势数据</Text>}
            {bars.length > 0 && (
              <View className="dd-trend">
                {bars.map((p) => (
                  <View
                    className="dd-bar"
                    key={p.ts}
                    style={{ height: `${Math.max(4, (p.power / maxPower) * 100)}%` }}
                  />
                ))}
              </View>
            )}
            {bars.length > 0 && (
              <Text className="dd-ts">
                {fmtTimeShort(bars[0].ts)} ~ {fmtTimeShort(bars[bars.length - 1].ts)}
              </Text>
            )}
          </View>

          <View className="app-card">
            <Text className="dd-section">质保</Text>
            {detail.warranties.length === 0 && <Text className="app-empty">暂无质保记录</Text>}
            {detail.warranties.map((w) => (
              <View className="dd-warranty" key={w.warranty_id}>
                <View className="dd-head">
                  <Text className="dd-warranty-no">{w.warranty_no}</Text>
                  <Text className={`app-tag ${statusTone(w.status)}`}>{statusLabel(WARRANTY_STATUS_LABEL, w.status)}</Text>
                </View>
                <Text className="dd-warranty-range">
                  {w.start_at ? fmtTime(w.start_at) : "未起算"} ~ {w.end_at ? fmtTime(w.end_at) : "—"} · {w.months} 个月
                </Text>
              </View>
            ))}
            <Button
              className="dd-btn"
              onClick={() => Taro.navigateTo({ url: `/packages/service/pages/extension/index?warranty=` })}
            >
              购买延保
            </Button>
          </View>

          <View className="app-card">
            <Button
              className="dd-btn dd-btn-primary"
              onClick={() => Taro.navigateTo({ url: `/packages/service/pages/ticket-new/index?deviceId=${detail.device.device_id}&sn=${detail.device.sn}` })}
            >
              报修此设备
            </Button>
          </View>
        </>
      )}
    </View>
  );
}

/** 读路由参数（Taro Router：当前页实例参数） */
function useLoadParam(setter: (v: string) => void): void {
  useEffect(() => {
    const params = (Taro.getCurrentInstance().router?.params ?? {}) as Record<string, string | undefined>;
    if (params.id) {
      setter(params.id);
    }
  }, [setter]);
}
