// Profile.tsx · 我的（S7-03）：驻站身份 + data_scope 信息 + 通知偏好占位。

import { Card, Descriptions, Tag } from "antd";
import type { StationWebMeResp } from "@micro/shared/types";

export default function ProfilePage(props: { me: StationWebMeResp | null }) {
  const me = props.me;
  return (
    <Card title="我的">
      <Descriptions column={1} bordered size="small">
        <Descriptions.Item label="UID">{me?.uid ?? "-"}</Descriptions.Item>
        <Descriptions.Item label="昵称">{me?.nickname || "-"}</Descriptions.Item>
        <Descriptions.Item label="驻站">
          {me?.station_id ? (
            <>
              <Tag color="blue">{me.station_no}</Tag> {me.station_name}
            </>
          ) : (
            <Tag>未绑定驻站（联系管理员在「场站-驻场人员」添加）</Tag>
          )}
        </Descriptions.Item>
        <Descriptions.Item label="角色">
          {(me?.roles ?? []).map((r) => (
            <Tag key={r}>{r}</Tag>
          ))}
        </Descriptions.Item>
        <Descriptions.Item label="数据域">
          <code style={{ fontSize: 12 }}>{me?.data_scope || "ALL"}</code>
        </Descriptions.Item>
      </Descriptions>
      <p style={{ color: "#999", fontSize: 12, marginTop: 12 }}>
        微信订阅消息（告警/工单提醒）在小程序端授权后生效（S9 接入，dev MOCKWX 模拟）。
      </p>
    </Card>
  );
}
