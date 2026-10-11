// Diag.tsx · 本地诊断面板（S9-05 运维 PC 专属，01 §8.6）。
//
// 本地能力（串口/CAN/BLE 诊断、固件烧录、导出打包）只在 Tauri 容器内可用——
// 探测 window.__TAURI_INTERNALS__ / __TAURI__（Tauri 2 注入全局，双探测）；
// 纯浏览器环境渲染占位拒绝卡（不引 @tauri-apps/api 依赖，动态取注入对象 invoke）。

import { Card, Descriptions, Typography } from "antd";

/** Tauri 注入探测（Tauri 2 为 __TAURI_INTERNALS__，兼容旧 __TAURI__） */
function tauriInvoke(): ((cmd: string, args?: Record<string, unknown>) => Promise<unknown>) | null {
  const w = window as unknown as Record<string, { invoke?: unknown }>;
  const internals = w.__TAURI_INTERNALS__;
  const legacy = w.__TAURI__;
  const fn = internals?.invoke ?? legacy?.invoke;
  return typeof fn === "function" ? (fn as never) : null;
}

export default function DiagPage() {
  const invoke = tauriInvoke();

  if (!invoke) {
    return (
      <Card>
        <Typography.Title level={4}>本地诊断</Typography.Title>
        <Typography.Paragraph type="warning">
          本地诊断能力（串口/CAN/BLE 诊断、固件烧录、文件导出）仅在
          <b>运维 PC（Tauri 客户端）</b>内可用——当前为浏览器环境，已拒绝加载（01 §8.6）。
        </Typography.Paragraph>
        <Typography.Paragraph type="secondary">
          请使用 micro-desktop 桌面应用打开管理后台；诊断数据仅本地处理，不上云。
        </Typography.Paragraph>
      </Card>
    );
  }

  return (
    <Card>
      <Typography.Title level={4}>本地诊断（Tauri 已就绪）</Typography.Title>
      <Typography.Paragraph type="secondary">
        以下能力经 Rust invoke 调用本地硬件；CAN 盒（SLCAN）与 JBD-over-BLE 透传按 ADR-19
        待实机校准，校准前 invoke 返回占位拒绝。
      </Typography.Paragraph>
      <Descriptions column={1} size="small" bordered>
        <Descriptions.Item label="串口诊断">
          diag_serial_basic_info（JBD 寄存器 0x03：电压/电流/SOC/温度/电芯电压）
        </Descriptions.Item>
        <Descriptions.Item label="串口扫描">list_serial_ports（CH340/CP210x 等 USB 桥）</Descriptions.Item>
        <Descriptions.Item label="CAN 盒">diag_slcan_read（SLCAN 骨架，实机校准后启用）</Descriptions.Item>
        <Descriptions.Item label="BLE">diag_ble_scan / diag_ble_basic_info（btleplug）</Descriptions.Item>
        <Descriptions.Item label="固件烧录">
          firmware_sha256 → flash_xmodem_1k（XMODEM-1K + 断点续传 + 进度事件 flash://progress）
        </Descriptions.Item>
        <Descriptions.Item label="导出打包">export_csv / export_xlsx / pack_logs（本地 $DOWNLOAD/$TEMP）</Descriptions.Item>
      </Descriptions>
      <Typography.Paragraph style={{ marginTop: 16 }}>
        功能面板随实机校准逐步开放（ADR-19：协议标准 + 模拟器为验收口径）；
        烧录操作请先核对固件 sha256 与设备 SN，进度事件实时展示于烧录弹窗。
      </Typography.Paragraph>
    </Card>
  );
}
