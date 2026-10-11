// profile/me.tsx · 我的（分包 profile）：档案卡（party）+ 联系人 + 退出登录。
import { useCallback, useEffect, useState } from "react";
import { Button, Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import type { ContactView, CustomerMeResp } from "@micro/shared/types/mobile-bff";
import { cachedMe, fetchMe, logout } from "../../../../auth";
import { listContacts } from "../../../../api";
import "./index.scss";

export default function MePage() {
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
      setError(e instanceof Error ? e.message : "加载失败");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onLogout = (): void => {
    Taro.showModal({
      title: "退出登录",
      content: "确定退出当前账号？",
      success: (r) => {
        if (r.confirm) {
          void logout().then(() => Taro.redirectTo({ url: "/pages/login/index" }));
        }
      },
    });
  };

  return (
    <View className="app-page">
      {error !== "" && <Text className="app-error">{error}</Text>}
      {me && (
        <View className="app-card">
          <Text className="pf-party">{me.nickname || "微信用户"}</Text>
          <Text className="pf-meta">uid {me.uid}</Text>
          {me.mobile_masked && <Text className="pf-meta">{me.mobile_masked}</Text>}
        </View>
      )}

      {me?.has_party && me.party && (
        <View className="app-card">
          <Text className="pf-party">{me.party.name}</Text>
          <View className="pf-row">
            <Text className="pf-key">客户类型</Text>
            <Text className="pf-val">{(me.party.types ?? []).join(" / ")}</Text>
          </View>
          <View className="pf-row">
            <Text className="pf-key">状态</Text>
            <Text className="pf-val">{me.party.status === "NORMAL" ? "正常" : me.party.status}</Text>
          </View>
        </View>
      )}
      {me && !me.has_party && (
        <View className="app-card">
          <Text className="pf-meta">
            账号尚未绑定客户档案（平台运营建立档案并绑定后，设备/工单/场站数据自动关联）。
          </Text>
        </View>
      )}

      <View className="app-card">
        <Text className="pf-party" style={{ fontSize: "26px" }}>
          默认联系人
        </Text>
        {contacts.length === 0 && <Text className="pf-meta">暂无联系人（档案建立后由平台维护）</Text>}
        {contacts.map((c) => (
          <View className="pf-row" key={c.contact_id}>
            <Text className="pf-val">
              {c.name}
              {c.is_default ? "（默认）" : ""}
            </Text>
            <Text className="pf-val">{c.mobile || "—"}</Text>
          </View>
        ))}
      </View>

      <Button className="pf-logout" onClick={onLogout}>
        退出登录
      </Button>
    </View>
  );
}
