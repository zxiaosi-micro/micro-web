// station/detail.tsx · 场站详情：基础信息 + 设备影子聚合监控（FR-STN-005 客户视角）。
import { useCallback, useEffect, useState } from "react";
import { Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import type { CustomerStationDetail } from "@micro/shared/types/mobile-bff";
import { getStationDetail } from "../../../../api";
import { useThemePage } from "../../../../i18n";
import "../list/index.scss";

export default function StationDetail() {
  const { t, rootClass } = useThemePage("page.stationDetail");
  const [id, setId] = useState("");
  const [detail, setDetail] = useState<CustomerStationDetail | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async (stationId: string): Promise<void> => {
    try {
      setDetail(await getStationDetail(stationId));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : t("dev.loadFailed"));
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
    <View className={`app-page ${rootClass}`}>
      {error !== "" && <Text className="app-error">{error}</Text>}
      {!detail && error === "" && <Text className="app-empty">{t("common.loading")}</Text>}
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
            <Text className="dd-section">{t("st.monitorSection")}</Text>
            {detail.devices.length === 0 && <Text className="app-empty">{t("st.noDevices")}</Text>}
            {detail.devices.map((d) => (
              <View className="app-card st-item" key={d.device_id}>
                <View className="st-head">
                  <Text className="st-name">{d.sn}</Text>
                  <Text className={`st-online`}>{d.online ? t("st.online") : t("st.offline")}</Text>
                </View>
                <View className="st-summary">
                  <View className="st-summary-item">
                    <Text className="st-summary-val">{d.soc}</Text>
                    <Text className="st-summary-key">SOC</Text>
                  </View>
                  <View className="st-summary-item">
                    <Text className="st-summary-val">{d.power}</Text>
                    <Text className="st-summary-key">{t("st.power")}</Text>
                  </View>
                  <View className="st-summary-item">
                    <Text className="st-summary-val">{d.voltage}</Text>
                    <Text className="st-summary-key">{t("st.voltage")}</Text>
                  </View>
                  <View className="st-summary-item">
                    <Text className="st-summary-val">{d.temperature}</Text>
                    <Text className="st-summary-key">{t("st.temp")}</Text>
                  </View>
                </View>
                <Text className="st-meta" onClick={() => Taro.navigateTo({ url: `/pages/device-detail/index?id=${d.device_id}` })}>
                  {t("st.viewDevice")}
                </Text>
              </View>
            ))}
          </View>
        </>
      )}
    </View>
  );
}
