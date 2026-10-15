// devices.tsx · 设备列表：影子卡片列表 + 关键字搜索 + 分页（下拉刷新 / 触底加载更多）+ i18n/主题。
// 列表端点仅含设备基本信息，逐台并发补拉影子（当前页规模 ≤10 可控），卡片直显 SOC/功率等关键指标。
import { useCallback, useEffect, useRef, useState } from "react";
import Taro, { usePullDownRefresh, useReachBottom } from "@tarojs/taro";
import { Input, Text, View } from "@tarojs/components";
import type { CustomerDeviceItem, MetricView, ShadowView } from "@micro/shared/types/mobile-bff";
import { getDeviceShadow, listDevices } from "../../api";
import { fmtMetricValue, fmtShadowTs, fmtTime, statusTone, deviceStatusLabel } from "../../ui";
import { useThemePage } from "../../i18n";
import "./index.scss";

const PAGE_SIZE = 10;
/** 影子卡片优先展示的指标键（电池平台关注点；无命中回退前 4 个指标） */
const PREFERRED_KEYS = ["soc", "power", "voltage", "temperature"];

/** 影子卡片 = 设备基本信息 + 影子（影子拉取失败置 null，卡片降级只显基本信息） */
interface ShadowCard {
  device: CustomerDeviceItem;
  shadow: ShadowView | null;
}

export default function Devices() {
  const { t, rootClass } = useThemePage("page.devices");
  const [keyword, setKeyword] = useState("");
  const kwRef = useRef("");
  const [cards, setCards] = useState<ShadowCard[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  /** 拉取一页设备并并发补影子；replace=true 首页重置，否则追加 */
  const load = useCallback(async (nextPage: number, kw: string, replace: boolean): Promise<void> => {
    setLoading(true);
    setError("");
    try {
      const resp = await listDevices({ keyword: kw || undefined, page: nextPage, size: PAGE_SIZE });
      const shadows = await Promise.all(
        resp.list.map((d) => getDeviceShadow(d.device_id).catch(() => null)),
      );
      const merged: ShadowCard[] = resp.list.map((d, i) => ({ device: d, shadow: shadows[i] }));
      setCards((prev) => (replace ? merged : [...prev, ...merged]));
      setTotal(resp.total);
      setPage(nextPage);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("dev.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(1, "", true);
  }, [load]);

  // 下拉刷新 / 触底加载更多（Taro 页面级生命周期，闭包随渲染取最新 state）
  usePullDownRefresh(() => {
    void load(1, kwRef.current, true).finally(() => Taro.stopPullDownRefresh());
  });
  useReachBottom(() => {
    if (loading || cards.length >= total) {
      return;
    }
    void load(page + 1, kwRef.current, false);
  });

  function onSearch(): void {
    kwRef.current = keyword.trim();
    void load(1, kwRef.current, true);
  }

  return (
    <View className={`app-page ${rootClass}`}>
      <View className="app-card dev-search">
        <Input
          className="app-input dev-search-input"
          type="text"
          placeholder={t("dev.searchPlaceholder")}
          value={keyword}
          onInput={(e) => setKeyword(e.detail.value)}
          onConfirm={onSearch}
        />
        <View className="dev-search-btn" onClick={onSearch}>
          <Text className="dev-search-btn-text">{t("common.search")}</Text>
        </View>
      </View>

      {error !== "" && <Text className="app-error">{error}</Text>}
      {!loading && cards.length === 0 && error === "" && (
        <Text className="app-empty">{t("dev.empty")}</Text>
      )}

      {cards.map((c) => (
        <View
          className="app-card"
          key={c.device.device_id}
          onClick={() => Taro.navigateTo({ url: `/pages/device-detail/index?id=${c.device.device_id}` })}
        >
          <View className="app-row">
            <Text className="app-title">SN {c.device.sn}</Text>
            <View className={statusTone(c.device.status)}>
              <Text className={`${statusTone(c.device.status)}-text`}>
                {deviceStatusLabel(c.device.status)}
              </Text>
            </View>
          </View>
          <Text className="app-sub">
            {c.device.model} · {t("dev.activatedAt", { time: fmtTime(c.device.activated_at) })}
          </Text>
          {c.shadow && c.shadow.ts !== "" && (
            <View className="dev-shadow">
              <Text className="dev-shadow-ts">{t("dev.shadowPrefix", { time: fmtShadowTs(c.shadow.ts) })}</Text>
              <View className="dev-metrics">
                {pickMetrics(c.shadow).map((m) => (
                  <View className="dev-metric" key={m.key}>
                    <Text className="dev-metric-value">{fmtMetricValue(m.value)}</Text>
                    <Text className="dev-metric-key">{m.key}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}
        </View>
      ))}

      {loading && <Text className="app-loading">{t("common.loading")}</Text>}
      {!loading && cards.length > 0 && cards.length >= total && (
        <Text className="app-empty">{t("dev.loadedAll", { total })}</Text>
      )}
    </View>
  );
}

/** 影子指标挑选：优先 soc/power/voltage/temperature，无命中回退前 4 个 */
function pickMetrics(shadow: ShadowView): MetricView[] {
  const byKey = new Map(shadow.metrics.map((m) => [m.key, m]));
  const picked = PREFERRED_KEYS.map((k) => byKey.get(k)).filter(
    (m): m is MetricView => m !== undefined,
  );
  return picked.length > 0 ? picked : shadow.metrics.slice(0, 4);
}
