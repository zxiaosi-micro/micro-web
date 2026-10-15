// index.tsx · 首页：设备摘要 + 扫码激活 + 消息角标 + 快捷入口 + 订阅消息授权（S9-02 主包）。
import { useEffect, useState } from "react";
import Taro, { useDidShow } from "@tarojs/taro";
import { Button, Text, View } from "@tarojs/components";
import type { CustomerMeResp } from "@micro/shared/types/mobile-bff";
import { activateDevice, listDevices, listMessages } from "../../api";
import { cachedMe, isLoggedIn } from "../../auth";
import { useThemePage } from "../../i18n";
import { usePolling } from "../../polling";
import { requestAlertSubscribe } from "../../subscribe";
import "./index.scss";

/** 首页摘要：设备总数 + 未读消息数（一次轮询两路请求） */
interface HomeSummary {
  deviceTotal: number;
  unreadCount: number;
}

export default function Index() {
  const { t, rootClass } = useThemePage("page.home");
  const [me, setMe] = useState<CustomerMeResp | null>(null);

  const summary = usePolling<HomeSummary>(
    async () => {
      const [devices, messages] = await Promise.all([
        listDevices({ page: 1, size: 1 }),
        listMessages({ only_unread: true, page: 1, size: 1 }),
      ]);
      return { deviceTotal: devices.total, unreadCount: messages.unread_count };
    },
    { enabled: isLoggedIn() }, // 未登录（冷启动即跳登录页）不轮询
  );

  // 首页为启动页：未登录直接进登录页（wxLogin 静默 + 手机号绑定）
  useDidShow(() => {
    if (!isLoggedIn()) {
      void Taro.reLaunch({ url: "/pages/login/index" });
      return;
    }
    setMe(cachedMe());
  });

  useEffect(() => {
    if (isLoggedIn()) {
      setMe(cachedMe());
    }
  }, []);

  /** 扫码激活：scanCode → 确认 → POST /customer/devices/activate（质保起算事件） */
  async function onScanActivate(): Promise<void> {
    try {
      const res = await Taro.scanCode({ onlyFromCamera: false, scanType: ["qrCode", "barCode"] });
      const sn = res.result.trim();
      if (!sn) {
        return;
      }
      const conf = await Taro.showModal({
        title: t("scan.confirmTitle"),
        content: t("scan.confirmContent", { sn }),
      });
      if (!conf.confirm) {
        return;
      }
      await activateDevice({ sn });
      Taro.showToast({ title: t("scan.done"), icon: "success" });
      summary.refresh();
    } catch (e) {
      const raw = e instanceof Error ? `${e.message}` : String(e ?? "");
      if (raw.includes("cancel")) {
        return; // 用户取消扫码
      }
      Taro.showToast({ title: raw || t("scan.failed"), icon: "none" });
    }
  }

  const unread = summary.data?.unreadCount ?? 0;
  const deviceTotal = summary.data?.deviceTotal;

  return (
    <View className={`app-page ${rootClass}`}>
      <View className="app-card">
        <Text className="app-title">{t("home.hello", { name: me?.nickname ?? t("home.guest") })}</Text>
        <Text className="app-sub">
          {me?.has_party && me.party ? `${me.party.name} · ` : ""}{t("home.heroSub")}
        </Text>
      </View>

      <View className="app-card">
        <View className="app-row">
          <Text className="app-title">{t("home.summary")}</Text>
          <Text className="index-link" onClick={() => Taro.navigateTo({ url: "/pages/devices/index" })}>
            {t("common.viewAll")}
          </Text>
        </View>
        <Text className="app-sub">
          {deviceTotal === undefined ? t("home.devicePending") : t("home.deviceLine", { count: deviceTotal })}
        </Text>
        <Button className="index-scan" onClick={() => void onScanActivate()}>
          {t("home.scan")}
        </Button>
      </View>

      <View className="app-card">
        <View className="app-row">
          <Text className="app-title">{t("home.messages")}</Text>
          {unread > 0 && (
            <View className="app-badge">
              <Text className="app-badge-text">{unread > 99 ? "99+" : unread}</Text>
            </View>
          )}
        </View>
        <View className="app-btn-plain" onClick={() => Taro.navigateTo({ url: "/packages/profile/pages/messages/index" })}>
          <Text className="app-btn-plain-text">{unread > 0 ? t("home.viewMessagesUnread", { count: unread }) : t("home.viewMessages")}</Text>
        </View>
        <View className="app-btn-plain" onClick={() => void requestAlertSubscribe()}>
          <Text className="app-btn-plain-text">{t("home.subscribe")}</Text>
        </View>
      </View>

      <View className="index-grid">
        <View className="index-grid-item" onClick={() => Taro.navigateTo({ url: "/pages/devices/index" })}>
          <Text className="index-grid-title">{t("home.gdDevices")}</Text>
          <Text className="index-grid-sub">{t("home.gdDevicesSub")}</Text>
        </View>
        <View className="index-grid-item" onClick={() => Taro.navigateTo({ url: "/packages/station/pages/list/index" })}>
          <Text className="index-grid-title">{t("home.gdStations")}</Text>
          <Text className="index-grid-sub">{t("home.gdStationsSub")}</Text>
        </View>
        <View className="index-grid-item" onClick={() => Taro.navigateTo({ url: "/packages/service/pages/warranty/index" })}>
          <Text className="index-grid-title">{t("home.gdWarranty")}</Text>
          <Text className="index-grid-sub">{t("home.gdWarrantySub")}</Text>
        </View>
        <View className="index-grid-item" onClick={() => Taro.navigateTo({ url: "/packages/service/pages/tickets/index" })}>
          <Text className="index-grid-title">{t("home.gdTickets")}</Text>
          <Text className="index-grid-sub">{t("home.gdTicketsSub")}</Text>
        </View>
      </View>
    </View>
  );
}
