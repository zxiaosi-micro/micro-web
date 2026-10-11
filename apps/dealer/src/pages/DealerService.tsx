// DealerService.tsx · 代客服务（S9-04）：输入 SN → 查设备 → 质保展示 → 代报修（AFTER_SALE 工单）。
// 浏览器无扫码硬件，SN 以 Input 输入（运维 PC 内扫码走 Tauri /diag 能力，01 §8.6）。

import { useState } from "react";
import { App as AntApp, Button, Card, Descriptions, Form, Input, Space, Spin, Tag, Typography } from "antd";
import { SearchOutlined } from "@ant-design/icons";
import { ApiError } from "@micro/shared";
import type { DeviceView, WarrantyView } from "@micro/shared/types";
import { createTicket, listDevices, warrantiesByTarget } from "../api";

const STATUS_LABEL: Record<string, string> = {
  PRODUCED: "已生产",
  IN_STOCK: "在库",
  OUT: "已出库",
  ACTIVATED: "已激活",
  RETIRED: "已退役",
  SCRAPPED: "已报废",
};

const WARRANTY_STATUS_COLOR: Record<string, string> = {
  PENDING: "default",
  ACTIVE: "green",
  EXPIRED: "red",
  REFUNDED: "orange",
};

export default function DealerServicePage() {
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
        message.warning(`未找到 SN ${sn} 的设备`);
        return;
      }
      setDevice(hit);
      const w = await warrantiesByTarget(hit.sn);
      setWarranties(w.list ?? []);
    } catch (e) {
      message.error(e instanceof ApiError ? e.message : "查询失败");
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
        title: `经销商代报修 ${device.sn}`,
        content: "由经销商 Web 代客发起报修，请客服跟进确认故障详情。",
        sn: device.sn,
      });
      message.success(`报修工单已创建：${r.ticket_no}`);
    } catch (e) {
      message.error(e instanceof ApiError ? e.message : "报修失败");
    } finally {
      setRepairing(false);
    }
  };

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Card title="扫 SN 查设备（01 §8.3 代客服务）">
        <Form
          form={form}
          layout="inline"
          onFinish={(v) => void lookup(v.sn.trim())}
          initialValues={{ sn: "" }}
        >
          <Form.Item name="sn" rules={[{ required: true, message: "输入设备 SN" }]}>
            <Input placeholder="设备 SN" style={{ width: 320 }} allowClear />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" icon={<SearchOutlined />} loading={loading}>
              查询
            </Button>
          </Form.Item>
        </Form>
      </Card>

      {loading && <Spin style={{ display: "block", margin: "24px auto" }} />}

      {device && (
        <Card
          title={`设备 ${device.sn}`}
          extra={
            <Button type="primary" danger loading={repairing} onClick={() => void repair()}>
              代报修
            </Button>
          }
        >
          <Descriptions size="small" column={2}>
            <Descriptions.Item label="SN">{device.sn}</Descriptions.Item>
            <Descriptions.Item label="型号">{device.model || "—"}</Descriptions.Item>
            <Descriptions.Item label="状态">
              <Tag>{STATUS_LABEL[device.status] ?? device.status}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="来源订单">{device.order_no || "—"}</Descriptions.Item>
          </Descriptions>

          <Typography.Title level={5} style={{ marginTop: 16 }}>
            质保
          </Typography.Title>
          {warranties.length === 0 && <Typography.Text type="secondary">无质保记录</Typography.Text>}
          <Space direction="vertical" size={8} style={{ width: "100%" }}>
            {warranties.map((w) => (
              <Card key={w.warranty_no} size="small">
                <Space wrap>
                  <Tag color={WARRANTY_STATUS_COLOR[w.status] ?? "default"}>{w.status}</Tag>
                  <span>{w.level === "STATION" ? "场站级" : "设备级"}</span>
                  <span>对象：{w.target_key || w.target_id || "—"}</span>
                  <span>
                    {w.start_at ? new Date(w.start_at).toLocaleDateString() : "未起算"} ~{" "}
                    {w.end_at ? new Date(w.end_at).toLocaleDateString() : "—"}
                  </span>
                  <span>{w.months} 个月</span>
                </Space>
              </Card>
            ))}
          </Space>
        </Card>
      )}
    </Space>
  );
}
