// Profile.tsx · 我的（S7-03）：驻站身份 + data_scope 信息 + 通知偏好占位。

import { Card, Descriptions, Tag } from "antd";
import { usePrefs } from "@micro/shared/prefs";
import type { StationWebMeResp } from "@micro/shared/types";

export default function ProfilePage(props: { me: StationWebMeResp | null }) {
  const { t } = usePrefs();
  const me = props.me;
  return (
    <Card title={t("profile.title")}>
      <Descriptions column={1} bordered size="small">
        <Descriptions.Item label={t("profile.uid")}>{me?.uid ?? "-"}</Descriptions.Item>
        <Descriptions.Item label={t("profile.nickname")}>{me?.nickname || "-"}</Descriptions.Item>
        <Descriptions.Item label={t("profile.station")}>
          {me?.station_id ? (
            <>
              <Tag color="blue">{me.station_no}</Tag> {me.station_name}
            </>
          ) : (
            <Tag>{t("profile.noStation")}</Tag>
          )}
        </Descriptions.Item>
        <Descriptions.Item label={t("profile.roles")}>
          {(me?.roles ?? []).map((r) => (
            <Tag key={r}>{r}</Tag>
          ))}
        </Descriptions.Item>
        <Descriptions.Item label={t("profile.dataScope")}>
          <code style={{ fontSize: 12 }}>{me?.data_scope || "ALL"}</code>
        </Descriptions.Item>
      </Descriptions>
      <p style={{ color: "var(--text-sub, #999)", fontSize: 12, marginTop: 12 }}>
        {t("profile.subHint")}
      </p>
    </Card>
  );
}
