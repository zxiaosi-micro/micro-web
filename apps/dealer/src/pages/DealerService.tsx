// DealerService.tsx · 代客服务（S9-04）：输入 SN → 查设备 → 质保展示 → 代报修（AFTER_SALE 工单）。
// 浏览器无扫码硬件，SN 以 Input 输入（运维 PC 内扫码走 Tauri /diag 能力，01 §8.6）。

import { useState } from "react";
import { App as AntApp, Button, Card, Descriptions, Form, Input, Space, Spin, Tag, Typography } from "antd";
import { SearchOutlined } from "@ant-design/icons";
import { ApiError } from "@micro/shared";
import { enumLabel, usePrefs } from "@micro/shared/prefs";
import type { DeviceView, WarrantyView } from "@micro/shared/types";
import { createTicket, listDevices, warrantiesByTarget } from "../api";

const WARRANTY_STATUS_COLOR: Record<string, string> = {
  PENDING: "default",
  ACTIVE: "green",
  EXPIRED: "red",
  REFUNDED: "orange",
};

export default function DealerServicePage() {
  const { t } = usePrefs();
  const { message } = AntApp.useApp();
  const [form] = Form.useForm<{ sn: string }>();
  const [device, setDevice] = useState<DeviceView | null>(null);
  const [warranties, setWarranties] = useState<WarrantyView[]>([]);
  const [loading, setLoading] = useState(false);
  const [repairing, setRepairing] = useState(false);

  const lookup = async (sn: string) => {
    setLoading(true);
    setDevice(null);
    setWarranties([]);
    try {
      const list = await listDevices(sn, { page: 1, size: 10 });
      const hit = list.list.find((d) => d.sn === sn) ?? list.list[0];
      if (!hit) {
        message.warning(t("svc.notFound", { sn }));
        return;
      }
      setDevice(hit);
      const w = await warrantiesByTarget(hit.sn);
      setWarranties(w.list ?? []);
    } catch (e) {
      message.error(e instanceof ApiError ? e.message : t("svc.queryFailed"));
    } finally {
      setLoading(false);
    }
  };

  // 代报修：AFTER_SALE 工单（content 带经销商代报标记；归属校验由 ops/device 服务端承担）
  const repair = async () => {
    if (!device) return;
    setRepairing(true);
    try {
      const r = await createTicket({
        type: "AFTER_SALE",
        title: t("svc.repairTitle", { sn: device.sn }),
        content: t("svc.repairContent"),
        sn: device.sn,
      });
      message.success(t("svc.repairCreated", { no: r.ticket_no }));
    } catch (e) {
      message.error(e instanceof ApiError ? e.message : t("svc.repairFailed"));
    } finally {
      setRepairing(false);
    }
  };

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Card title={t("svc.title")}>
        <Form
          form={form}
          layout="inline"
          onFinish={(v) => void lookup(v.sn.trim())}
          initialValues={{ sn: "" }}
        >
          <Form.Item name="sn" rules={[{ required: true, message: t("svc.snRule") }]}>
            <Input placeholder={t("svc.snPlaceholder")} style={{ width: 320 }} allowClear />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" icon={<SearchOutlined />} loading={loading}>
              {t("svc.search")}
            </Button>
          </Form.Item>
        </Form>
      </Card>

      {loading && <Spin style={{ display: "block", margin: "24px auto" }} />}

      {device && (
        <Card
          title={t("svc.deviceTitle", { sn: device.sn })}
          extra={
            <Button type="primary" danger loading={repairing} onClick={() => void repair()}>
              {t("svc.repair")}
            </Button>
          }
        >
          <Descriptions size="small" column={2}>
            <Descriptions.Item label="SN">{device.sn}</Descriptions.Item>
            <Descriptions.Item label={t("svc.model")}>{device.model || "—"}</Descriptions.Item>
            <Descriptions.Item label={t("common.status")}>
              <Tag>{enumLabel("enum.device", device.status)}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label={t("svc.sourceOrder")}>{device.order_no || "—"}</Descriptions.Item>
          </Descriptions>

          <Typography.Title level={5} style={{ marginTop: 16 }}>
            {t("svc.warranty")}
          </Typography.Title>
          {warranties.length === 0 && <Typography.Text type="secondary">{t("svc.noWarranty")}</Typography.Text>}
          <Space direction="vertical" size={8} style={{ width: "100%" }}>
            {warranties.map((w) => (
              <Card key={w.warranty_no} size="small">
                <Space wrap>
                  <Tag color={WARRANTY_STATUS_COLOR[w.status] ?? "default"}>{enumLabel("enum.warranty", w.status)}</Tag>
                  <span>{w.level === "STATION" ? t("svc.stationLevel") : t("svc.deviceLevel")}</span>
                  <span>{t("svc.target", { target: w.target_key || w.target_id || "—" })}</span>
                  <span>
                    {w.start_at ? new Date(w.start_at).toLocaleDateString() : t("svc.notStarted")} ~{" "}
                    {w.end_at ? new Date(w.end_at).toLocaleDateString() : "—"}
                  </span>
                  <span>{t("svc.months", { n: w.months })}</span>
                </Space>
              </Card>
            ))}
          </Space>
        </Card>
      )}
    </Space>
  );
}
