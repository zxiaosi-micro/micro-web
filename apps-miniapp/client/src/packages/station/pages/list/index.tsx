// station/list.tsx · 我的场站列表（分包 station； CustomerStationListResp 无分页——本人场站单回查聚合）。
import { useEffect, useState } from "react";
import { Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import type { CustomerStationItem, CustomerStationListResp } from "@micro/shared/types/mobile-bff";
import { listStations } from "../../../../api";
import { useThemePage } from "../../../../i18n";
import "./index.scss";

export default function StationList() {
  const { t, rootClass } = useThemePage("page.stations");
  const [list, setList] = useState<CustomerStationItem[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    listStations()
      .then((r: CustomerStationListResp) => setList(r.list ?? []))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : t("dev.loadFailed")))
      .finally(() => setLoading(false));
  }, []);

  return (
    <View className={`app-page ${rootClass}`}>
      {error !== "" && <Text className="app-error">{error}</Text>}
      {loading && <Text className="app-empty">{t("common.loading")}</Text>}
      {!loading && list.length === 0 && error === "" && (
        <Text className="app-empty">{t("st.empty")}</Text>
      )}
      {list.map((s) => (
        <View
          className="app-card st-item"
          key={s.station_id}
          onClick={() => Taro.navigateTo({ url: `/packages/station/pages/detail/index?id=${s.station_id}` })}
        >
          <View className="st-head">
            <Text className="st-name">{s.name}</Text>
            <Text className="app-tag">{s.type}</Text>
          </View>
          <Text className="st-meta">
            {s.station_no} · {s.address || "—"}
          </Text>
          <Text className="st-meta">
            {t("st.capacity", { kwh: s.capacity_kwh, kw: s.power_kw })}
          </Text>
        </View>
      ))}
    </View>
  );
}
