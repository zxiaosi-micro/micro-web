// profile/me.tsx · 我的（分包 profile）：档案卡（party）+ 联系人 + 偏好设置（语言/主题）+ 退出登录。
import { useCallback, useEffect, useState } from "react";
import { Button, Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import type { ContactView, CustomerMeResp } from "@micro/shared/types/mobile-bff";
import { cachedMe, fetchMe, logout } from "../../../../auth";
import { listContacts } from "../../../../api";
import { useThemePage } from "../../../../i18n";
import PrefsRow from "../../../../prefs-row";
import "./index.scss";

export default function MePage() {
  const { t, rootClass } = useThemePage("page.me");
  const [me, setMe] = useState<CustomerMeResp | null>(cachedMe());
  const [contacts, setContacts] = useState<ContactView[]>([]);
  const [error, setError] = useState("");

  const load = useCallback(async (): Promise<void> => {
    try {
      const [m, c] = await Promise.all([
        fetchMe().catch(() => cachedMe()),
        listContacts().catch(() => ({ list: [] as ContactView[] })),
      ]);
      setMe(m);
      setContacts(c.list ?? []);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : t("me.loadFailed"));
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const onLogout = (): void => {
    Taro.showModal({
      title: t("me.logout"),
      content: t("me.logoutConfirm"),
      success: (r) => {
        if (r.confirm) {
          void logout().then(() => Taro.redirectTo({ url: "/pages/login/index" }));
        }
      },
    });
  };

  return (
    <View className={`app-page ${rootClass}`}>
      {error !== "" && <Text className="app-error">{error}</Text>}
      {me && (
        <View className="app-card">
          <Text className="pf-party">{me.nickname || t("me.guest")}</Text>
          <Text className="pf-meta">uid {me.uid}</Text>
          {me.mobile_masked && <Text className="pf-meta">{me.mobile_masked}</Text>}
        </View>
      )}

      {me?.has_party && me.party && (
        <View className="app-card">
          <Text className="pf-party">{me.party.name}</Text>
          <View className="pf-row">
            <Text className="pf-key">{t("me.partyType")}</Text>
            <Text className="pf-val">{(me.party.types ?? []).join(" / ")}</Text>
          </View>
          <View className="pf-row">
            <Text className="pf-key">{t("me.status")}</Text>
            <Text className="pf-val">{me.party.status === "NORMAL" ? t("me.statusNormal") : me.party.status}</Text>
          </View>
        </View>
      )}
      {me && !me.has_party && (
        <View className="app-card">
          <Text className="pf-meta">
            {t("me.noParty")}
          </Text>
        </View>
      )}

      <View className="app-card">
        <Text className="pf-party" style={{ fontSize: "26px" }}>
          {t("me.contacts")}
        </Text>
        {contacts.length === 0 && <Text className="pf-meta">{t("me.noContacts")}</Text>}
        {contacts.map((c) => (
          <View className="pf-row" key={c.contact_id}>
            <Text className="pf-val">
              {c.name}
              {c.is_default ? t("me.default") : ""}
            </Text>
            <Text className="pf-val">{c.mobile || "—"}</Text>
          </View>
        ))}
      </View>

      <PrefsRow />

      <Button className="pf-logout" onClick={onLogout}>
        {t("me.logout")}
      </Button>
    </View>
  );
}
