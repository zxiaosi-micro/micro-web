// api.ts · 场站小程序接口封装（admin-bff 端点，S7-03 契约；类型正本 packages/shared/types/admin-bff.ts
// ——apitypes 生成物，从 "@micro/shared/types" 导入，禁止手写漂移；端点全量迁移自场站 Web apps/station/src/api.ts）。
//
// data_scope 锁定（S9-03）：契约带 station_id 的端点一律必传（requireStationId 守卫拒绝空值，
// station_id 来自 /station-web/me——登录即锁定本场站）；路径型详情端点（工单/巡检详情）契约无
// station_id 字段，越权由服务端 data_scope 兜底过滤。

import { get, post } from "./request";
import type {
  AlertBriefView,
  AlertPendingResp,
  AlertView,
  InspectionPlanView,
  InspectionSubmitItem,
  InspectionSubmitResp,
  InspectionTaskGetResp,
  InspectionTaskListResp,
  InspectionTaskView,
  SimpleResp,
  SlaTimerView,
  StationMonitorResp,
  StationWebMeResp,
  TicketGetResp,
  TicketPendingResp,
  TicketView,
} from "@micro/shared/types";

export type {
  AlertBriefView,
  AlertView,
  InspectionTaskView,
  SimpleResp,
  StationWebMeResp,
  TicketView,
};

/** data_scope 守卫：station_id 为空直接拒绝发请求（登录未完成/缓存损坏时的快速失败） */
function requireStationId(stationId: string): string {
  if (!stationId) {
    throw new Error("api: 未锁定场站（station_id 为空）——需先登录获取 /station-web/me");
  }
  return stationId;
}

// ---- 身份 ----

/** GET /station-web/me · 场站 Web 我的驻站（data_scope 锁定本场站） */
export const stationWebMe = () => get<StationWebMeResp>("/station-web/me");

/** GET /stations/:id/monitor · 场站聚合监控（功率/SOC/设备+影子） */
export const stationMonitor = (stationId: string) =>
  get<StationMonitorResp>(`/stations/${encodeURIComponent(requireStationId(stationId))}/monitor`);

// ---- 轮询增量（FR-OPS-010：10s，未读计数 + since_id） ----

/** 增量轮询游标（页面持有，unread 驱动角标） */
export interface PendingState {
  unread: number;
  sinceId: string;
}

/** 告警增量（since_id 之后的新告警） */
export const pendingAlerts = (stationId: string, sinceId: string) =>
  get<AlertPendingResp>(
    `/alerts/pending?station_id=${encodeURIComponent(requireStationId(stationId))}&since_id=${encodeURIComponent(sinceId)}&limit=20`,
  );

/** 工单增量（since_id 之后的新工单） */
export const pendingTickets = (stationId: string, sinceId: string) =>
  get<TicketPendingResp>(
    `/tickets/pending?station_id=${encodeURIComponent(requireStationId(stationId))}&since_id=${encodeURIComponent(sinceId)}&limit=20`,
  );

/** 增量累积折叠（页面持有的 since_id 只增不减；照场站 Web Workbench foldPending 模式） */
export function foldPending<T extends { alert_id?: string; ticket_id?: string }>(
  acc: T[],
  items: T[],
  key: "alert_id" | "ticket_id",
): T[] {
  const map = new Map(acc.map((x) => [String(x[key]), x]));
  for (const it of items) {
    map.set(String(it[key]), it);
  }
  return [...map.values()];
}

// ---- 告警 ----

export const listAlerts = (stationId: string, status?: string) =>
  get<{ total: number; list: AlertView[] }>(
    `/alerts?station_id=${encodeURIComponent(requireStationId(stationId))}${status ? `&status=${status}` : ""}&page=1&size=50`,
  );

/** POST /alerts/:id/ack · 确认告警（OPEN→ACK） */
export const ackAlert = (alertId: string) => post<SimpleResp>(`/alerts/${alertId}/ack`, {});
/** POST /alerts/:id/transfer · 告警转工单（auto_dispatch=true 自动派单） */
export const transferAlert = (alertId: string, autoDispatch: boolean) =>
  post<{ ticket_id: string; ticket_no: string }>(`/alerts/${alertId}/transfer`, {
    auto_dispatch: autoDispatch,
  });
/** POST /alerts/:id/close · 关闭告警（需原因，RESOLVED 终态） */
export const closeAlert = (alertId: string, reason: string) =>
  post<SimpleResp>(`/alerts/${alertId}/close`, { reason });

// ---- 工单 ----

export const listTickets = (stationId: string, status?: string) =>
  get<{ total: number; list: TicketView[] }>(
    `/tickets?station_id=${encodeURIComponent(requireStationId(stationId))}${status ? `&status=${status}` : ""}&page=1&size=50`,
  );

/** GET /tickets/:id · 工单详情（含流转日志；契约无 station_id 字段，服务端 data_scope 兜底） */
export const getTicket = (ticketId: string) => get<TicketGetResp>(`/tickets/${ticketId}`);
/** POST /tickets/:id/accept · 受理工单（状态机动作，ASSIGNED→ACCEPTED） */
export const acceptTicket = (id: string) => post<SimpleResp>(`/tickets/${id}/accept`, {});
/** POST /tickets/:id/start · 开工（ACCEPTED→STARTED） */
export const startTicket = (id: string) => post<SimpleResp>(`/tickets/${id}/start`, {});
/** POST /tickets/:id/submit · 提交结果（STARTED→DONE） */
export const submitTicket = (id: string, result: string) => post<SimpleResp>(`/tickets/${id}/submit`, { result });
/** GET /tickets/match-staff · 派单候选（区域+技能匹配） */
export const matchStaff = (stationId: string) =>
  get<{ list: { user_id: string; name: string; staff_type: string }[] }>(
    `/tickets/match-staff?station_id=${encodeURIComponent(requireStationId(stationId))}`,
  );
/** POST /tickets/:id/dispatch · 派单（assigneeUid 空 = 自动匹配） */
export const dispatchTicket = (id: string, assigneeUid: string) =>
  post<{ assignee_uid: string; assignee_name: string }>(`/tickets/${id}/dispatch`, {
    assignee_uid: assigneeUid || undefined,
  });
/** GET /tickets/:id/sla-timer · SLA 计时器视图（响应/解决剩余时间） */
export const slaTimer = (ticketId: string) => get<{ timer: SlaTimerView }>(`/tickets/${ticketId}/sla-timer`);

// ---- 巡检 ----

export const listInspectionTasks = (stationId: string, status?: string) =>
  get<InspectionTaskListResp>(
    `/inspection/tasks?station_id=${encodeURIComponent(requireStationId(stationId))}${status ? `&status=${status}` : ""}&page=1&size=50`,
  );
export const getInspectionTask = (taskId: string) =>
  get<InspectionTaskGetResp>(`/inspection/tasks/${taskId}`);
export const listInspectionPlans = (stationId: string) =>
  get<{ total: number; list: InspectionPlanView[] }>(
    `/inspection/plans?station_id=${encodeURIComponent(requireStationId(stationId))}&page=1&size=50`,
  );
/**
 * POST /inspection/tasks/:id/submit · 批量提交（异常项服务端自动转工单）。
 * location 为 "lng,lat"（gcj02，Taro.getLocation 实采）；photos 为本机临时路径逗号串——
 * 拍照占位（S9-03 骨架不接 file 服务上传，接通后换 file_id 列表）。
 */
export const submitInspection = (
  taskId: string,
  items: InspectionSubmitItem[],
  location: string,
  photos?: string,
) =>
  post<InspectionSubmitResp>(`/inspection/tasks/${taskId}/submit`, {
    items,
    location,
    photos: photos || undefined,
  });
