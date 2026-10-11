// profile/messages.tsx · 消息中心（分包 profile）：列表 + 未读角标 + 已读。
import { useCallback, useEffect, useState } from "react";
import { Text, View } from "@tarojs/components";
import type { MessageView } from "@micro/shared/types/mobile-bff";
import { listMessages, markMessageRead } from "../../../../api";
import { fmtTime } from "../../../../ui";
import "./index.scss";

export default function MessagesPage() {
  const [list, setList] = useState<MessageView[]>([]);
  const [unread, setUnread] = useState(0);
  const [error, setError] = useState("");

  const load = useCallback(async (): Promise<void> => {
    try {
      const [all, r] = await Promise.all([
        listMessages({ page: 1, size: 50 }),
        listMessages({ page: 1, size: 1, only_unread: true }),
      ]);
      setList(all.list ?? []);
      setUnread(r.unread_count ?? 0);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const markRead = async (id: string): Promise<void> => {
    try {
      await markMessageRead(id);
      void load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "已读失败");
    }
  };

  return (
    <View className="app-page">
      {error !== "" && <Text className="app-error">{error}</Text>}
      <Text className="pf-unread">未读 {unread}</Text>
      {list.length === 0 && error === "" && <Text className="app-empty">暂无消息</Text>}
      {list.map((m) => (
        <View
          className={`app-card ${m.is_read ? "" : "pf-unread-card"}`}
          key={m.message_id}
          onClick={() => {
            if (!m.is_read) {
              void markRead(m.message_id);
            }
          }}
        >
          <View className="pf-head">
            <Text className="pf-title">{m.title}</Text>
            {!m.is_read && <Text className="pf-dot" />}
          </View>
          <Text className="pf-content">{m.content}</Text>
          <Text className="pf-meta">
            {fmtTime(m.created_at)} · {m.biz_type || "系统"}
          </Text>
        </View>
      ))}
    </View>
  );
}
