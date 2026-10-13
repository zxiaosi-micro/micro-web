// api.ts · 场站 Web 接口封装（S7-03 BFF 端点；类型取 apitypes 生成物 admin-bff.ts）。

import { get, post } from "@micro/shared";

// 类型从 apitypes 生成物取（生成物即正本，不手写；02 §12.5）
import type {
  AlertPendingResp,
  AlertView,
  InspectionPlanView,
  InspectionTaskGetResp,
  InspectionTaskListResp,
  InspectionTaskView,
  SlaTimerView,
  StationMonitorResp,
  StationView,
  StationWebMeResp,
  TicketBriefView,
  TicketGetResp,
  TicketPendingResp,
  TicketView,
} from "@micro/shared/types";

export type { AlertView, TicketView, InspectionTaskView, StationView };

/** 场站 Web 我的驻站（data_scope 锁定本场站） */
export const stationWebMe = () => get<StationWebMeResp>("/station-web/me");

/** 场站聚合监控（功率/SOC/设备+影子） */
export const stationMonitor = (stationId: string) =>
  get<StationMonitorResp>(`/stations/${stationId}/monitor`);

// ---- 轮询增量（FR-OPS-010：10s，未读计数 + since_id） ----

/** 增量轮询游标（页面持有，unread 驱动角标） */
export interface PendingState {
  unread: number;
  sinceId: string;
}

/** 告警增量（since_id 之后的新告警，配合 foldPending 累积） */
export const pendingAlerts = (stationId: string, sinceId: string) =>
  get<AlertPendingResp>(
    `/alerts/pending?station_id=${encodeURIComponent(stationId)}&since_id=${encodeURIComponent(sinceId)}&limit=20`,
  );

/** 工单增量（since_id 之后的新工单） */
export const pendingTickets = (stationId: string, sinceId: string) =>
  get<TicketPendingResp>(
    `/tickets/pending?station_id=${encodeURIComponent(stationId)}&since_id=${encodeURIComponent(sinceId)}&limit=20`,
  );

/** 增量累积折叠（页面持有的 since_id 只增不减） */
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
    `/alerts?station_id=${encodeURIComponent(stationId)}${status ? `&status=${status}` : ""}&page=1&size=50`,
  );

/** 确认告警（OPEN→ACK，责任人认领） */
export const ackAlert = (alertId: string) => post(`/alerts/${alertId}/ack`, {});
/** 告警转工单（auto_dispatch=true 自动派单，false 待派单池） */
export const transferAlert = (alertId: string, autoDispatch: boolean) =>
  post<{ ticket_id: string; ticket_no: string }>(`/alerts/${alertId}/transfer`, {
    auto_dispatch: autoDispatch,
  });
/** 关闭告警（需原因；RESOLVED 终态） */
export const closeAlert = (alertId: string, reason: string) =>
  post(`/alerts/${alertId}/close`, { reason });

// ---- 工单 ----

export const listTickets = (stationId: string, status?: string) =>
  get<{ total: number; list: TicketView[] }>(
    `/tickets?station_id=${encodeURIComponent(stationId)}${status ? `&status=${status}` : ""}&page=1&size=50`,
  );

export const getTicket = (ticketId: string) => get<TicketGetResp>(`/tickets/${ticketId}`);
/** 受理工单（ASSIGNED→ACCEPTED，状态机动作） */
export const acceptTicket = (id: string) => post(`/tickets/${id}/accept`, {});
/** 开工（ACCEPTED→STARTED） */
export const startTicket = (id: string) => post(`/tickets/${id}/start`, {});
/** 提交结果（STARTED→DONE，离线重放同款幂等语义） */
export const submitTicket = (id: string, result: string) => post(`/tickets/${id}/submit`, { result });
/** 派单候选（区域+技能匹配的驻站员工清单） */
export const matchStaff = (stationId: string) =>
  get<{ list: { user_id: string; name: string; staff_type: string }[] }>(
    `/tickets/match-staff?station_id=${encodeURIComponent(stationId)}`,
  );
/** 派单（assigneeUid 空 = 自动匹配；PENDING_DISPATCH→ASSIGNED） */
export const dispatchTicket = (id: string, assigneeUid: string) =>
  post<{ assignee_uid: string; assignee_name: string }>(`/tickets/${id}/dispatch`, {
    assignee_uid: assigneeUid || undefined,
  });
/** SLA 计时器视图（响应/解决剩余时间，超时升级倒计时） */
export const slaTimer = (ticketId: string) => get<{ timer: SlaTimerView }>(`/tickets/${ticketId}/sla-timer`);

// ---- 巡检 ----

export const listInspectionTasks = (stationId: string, status?: string) =>
  get<InspectionTaskListResp>(
    `/inspection/tasks?station_id=${encodeURIComponent(stationId)}${status ? `&status=${status}` : ""}&page=1&size=50`,
  );
export const getInspectionTask = (taskId: string) =>
  get<InspectionTaskGetResp>(`/inspection/tasks/${taskId}`);
export const listInspectionPlans = (stationId: string) =>
  get<{ total: number; list: InspectionPlanView[] }>(
    `/inspection/plans?station_id=${encodeURIComponent(stationId)}&page=1&size=50`,
  );
/** 巡检批量提交（异常项由后端自动转 PENDING_DISPATCH 工单，返回 ticket_ids） */
export const submitInspection = (
  taskId: string,
  items: { name: string; result: string; anomalous: boolean }[],
  location: string,
) =>
  post<{ anomaly_count: number; ticket_ids: string }>(`/inspection/tasks/${taskId}/submit`, {
    items,
    location,
  });
