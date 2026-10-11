// station/detail.tsx · 场站详情：基础信息 + 设备影子聚合监控（FR-STN-005 客户视角）。
import { useCallback, useEffect, useState } from "react";
import { Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import type { CustomerStationDetail } from "@micro/shared/types/mobile-bff";
import { getStationDetail } from "../../../../api";
import "../list/index.scss";

export default function StationDetail() {
  const [id, setId] = useState("");
  const [detail, setDetail] = useState<CustomerStationDetail | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async (stationId: string): Promise<void> => {
    try {
      setDetail(await getStationDetail(stationId));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    }
  }, []);

  useEffect(() => {
    const params = (Taro.getCurrentInstance().router?.params ?? {}) as Record<string, string | undefined>;
    if (params.id) {
      setId(params.id);
    }
  }, []);

  useEffect(() => {
    if (id !== "") {
      void load(id);
    }
  }, [id, load]);

  return (
    <View className="app-page">
      {error !== "" && <Text className="app-error">{error}</Text>}
      {!detail && error === "" && <Text className="app-empty">加载中…</Text>}
      {detail && (
        <>
          <View className="app-card">
            <View className="st-head">
              <Text className="st-name">{detail.station.name}</Text>
              <Text className="app-tag">{detail.station.status}</Text>
            </View>
            <Text className="st-meta">
              {detail.station.station_no} · {detail.station.type}
            </Text>
            <Text className="st-meta">{detail.station.address || "—"}</Text>
          </View>

          <View className="app-card">
            <Text className="dd-section">设备监控（影子聚合）</Text>
            {detail.devices.length === 0 && <Text className="app-empty">场站下暂无设备</Text>}
            {detail.devices.map((d) => (
              <View className="app-card st-item" key={d.device_id}>
                <View className="st-head">
                  <Text className="st-name">{d.sn}</Text>
                  <Text className={`st-online`}>{d.online ? "在线" : "离线"}</Text>
                </View>
                <View className="st-summary">
                  <View className="st-summary-item">
                    <Text className="st-summary-val">{d.soc}</Text>
                    <Text className="st-summary-key">SOC</Text>
                  </View>
                  <View className="st-summary-item">
                    <Text className="st-summary-val">{d.power}</Text>
                    <Text className="st-summary-key">功率 kW</Text>
                  </View>
                  <View className="st-summary-item">
                    <Text className="st-summary-val">{d.voltage}</Text>
                    <Text className="st-summary-key">电压 V</Text>
                  </View>
                  <View className="st-summary-item">
                    <Text className="st-summary-val">{d.temperature}</Text>
                    <Text className="st-summary-key">温度 ℃</Text>
                  </View>
                </View>
                <Text className="st-meta" onClick={() => Taro.navigateTo({ url: `/pages/device-detail/index?id=${d.device_id}` })}>
                  查看设备详情 ›
                </Text>
              </View>
            ))}
          </View>
        </>
      )}
    </View>
  );
}
