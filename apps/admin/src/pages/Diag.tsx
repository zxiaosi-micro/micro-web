// Diag.tsx · 本地诊断面板（S9-05 运维 PC 专属，01 §8.6）。
//
// 本地能力（串口/CAN/BLE 诊断、固件烧录、导出打包）只在 Tauri 容器内可用——
// 探测 window.__TAURI_INTERNALS__ / __TAURI__（Tauri 2 注入全局，双探测）；
// 纯浏览器环境渲染占位拒绝卡（不引 @tauri-apps/api 依赖，动态取注入对象 invoke）。

import { Card, Descriptions, Typography } from "antd";
import { usePrefs } from "@micro/shared/prefs";

/** Tauri 注入探测（Tauri 2 为 __TAURI_INTERNALS__，兼容旧 __TAURI__） */
function tauriInvoke(): ((cmd: string, args?: Record<string, unknown>) => Promise<unknown>) | null {
  const w = window as unknown as Record<string, { invoke?: unknown }>;
  const internals = w.__TAURI_INTERNALS__;
  const legacy = w.__TAURI__;
  const fn = internals?.invoke ?? legacy?.invoke;
  return typeof fn === "function" ? (fn as never) : null;
}

export default function DiagPage() {
  const { t } = usePrefs();
  const invoke = tauriInvoke();

  if (!invoke) {
    return (
      <Card>
        <Typography.Title level={4}>{t("diag.browserTitle")}</Typography.Title>
        <Typography.Paragraph type="warning">
          {t("diag.browserHint")}
          <b>{t("diag.browserHintBold")}</b>
          {t("diag.browserHintTail")}
        </Typography.Paragraph>
        <Typography.Paragraph type="secondary">
          {t("diag.useDesktop")}
        </Typography.Paragraph>
      </Card>
    );
  }

  return (
    <Card>
      <Typography.Title level={4}>{t("diag.tauriTitle")}</Typography.Title>
      <Typography.Paragraph type="secondary">
        {t("diag.tauriHint")}
      </Typography.Paragraph>
      <Descriptions column={1} size="small" bordered>
        <Descriptions.Item label={t("diag.serial")}>
          diag_serial_basic_info（JBD 寄存器 0x03：电压/电流/SOC/温度/电芯电压）
        </Descriptions.Item>
        <Descriptions.Item label={t("diag.serialScan")}>{t("diag.serialScanDesc")}</Descriptions.Item>
        <Descriptions.Item label={t("diag.canBox")}>{t("diag.canBoxDesc")}</Descriptions.Item>
        <Descriptions.Item label="BLE">diag_ble_scan / diag_ble_basic_info（btleplug）</Descriptions.Item>
        <Descriptions.Item label={t("diag.flash")}>
          firmware_sha256 → flash_xmodem_1k（XMODEM-1K + 断点续传 + 进度事件 flash://progress）
        </Descriptions.Item>
        <Descriptions.Item label={t("diag.export")}>{t("diag.exportDesc")}</Descriptions.Item>
      </Descriptions>
      <Typography.Paragraph style={{ marginTop: 16 }}>
        {t("diag.footnote")}
      </Typography.Paragraph>
    </Card>
  );
}
