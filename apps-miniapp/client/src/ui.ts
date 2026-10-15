// ui.ts · 展示辅助：状态/级别标签（文案走 shared prefs 公共词条）+ 时间格式化（纯函数，无组件）。
// ID 一律字符串渲染（E8）；时间戳为 epoch 毫秒（与场站 Web 同口径）；金额为 DECIMAL 字符串原样渲染。
import { enumLabel } from "@micro/shared/prefs";

/** 设备生命周期状态（device 域白名单；词条正本 prefs-common enum.device） */
export function deviceStatusLabel(status: string): string {
  return enumLabel("enum.device", status);
}

/** 工单状态（ops 域状态机；词条正本 prefs-common enum.ticket） */
export function ticketStatusLabel(status: string): string {
  return enumLabel("enum.ticket", status);
}

/** 质保状态（contract 域；词条正本 prefs-common enum.warranty） */
export function warrantyStatusLabel(status: string): string {
  return enumLabel("enum.warranty", status);
}

/** 通用合同/订单状态兜底：前缀段走公共词条，未命中原样展示 */
export function statusLabel(prefix: string, status: string): string {
  return enumLabel(prefix, status);
}

/** 状态 → 标签色类名（app-tag / app-tag-warn / app-tag-danger） */
export function statusTone(status: string): string {
  if (["PROCESSING", "ACTIVE", "ACTIVATED", "VERIFIED"].includes(status)) {
    return "app-tag";
  }
  if (["PENDING_DISPATCH", "DISPATCHED", "PENDING", "SUBMITTED", "ACCEPTED"].includes(status)) {
    return "app-tag-warn";
  }
  if (["EXPIRED", "CANCELLED", "REFUNDED", "SCRAPPED", "RETIRED"].includes(status)) {
    return "app-tag-danger";
  }
  return "app-tag";
}

const pad2 = (n: number): string => String(n).padStart(2, "0");

/** epoch 毫秒 → "YYYY-MM-DD HH:mm"（显式取值拼接，避免 iOS JavaScriptCore 对非常规串的解析差异） */
export function fmtTime(ts: number): string {
  if (!ts) {
    return "-";
  }
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** 影子时间串（RFC3339/带 T 串）→ "YYYY-MM-DD HH:mm:ss"；空串=影子无数据 */
export function fmtShadowTs(ts: string): string {
  if (!ts) {
    return "暂无影子数据";
  }
  return ts.slice(0, 19).replace("T", " ");
}

/** 影子指标取值展示（数值原样，保持生成物 float64 语义） */
export function fmtMetricValue(v: number): string {
  return String(v);
}

/** 趋势图时间轴短格式（"MM-DD HH:mm"） */
export function fmtTimeShort(ts: string): string {
  if (!ts) {
    return "-";
  }
  const t = ts.replace("T", " ");
  return t.length >= 16 ? t.slice(5, 16) : t;
}
