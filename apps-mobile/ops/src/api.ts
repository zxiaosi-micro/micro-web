// api.ts · mobile-bff app/* 端点封装（契约正本 micro-server/services/mobile-bff/api/entry.api，
// 类型正本 packages/shared/types/mobile-bff.ts——apitypes 生成物，禁止手写漂移）。
// 工单三动作（accept/start/submit）由 offline.ts 在无网时接管入队，本文件只做在线直发。

import { get, post } from "./request";
import type {
  AppAckAlertReq,
  AppAlertBrief,
  AppInspectionListReq,
  AppInspectionListResp,
  AppInspectionSubmitReq,
  AppInspectionSubmitResp,
  AppInspectionTask,
  AppMeResp,
  AppPendingAlertsReq,
  AppPendingAlertsResp,
  AppPendingTicketsReq,
  AppPendingTicketsResp,
  AppSubmitTicketReq,
  AppTicketDetailResp,
  AppTicketItem,
  AppTicketListReq,
  AppTicketListResp,
  SimpleResp,
} from "@micro/shared/types/mobile-bff";

// ---- 身份 ----

/** GET /app/me · 运维 App 我的身份 */
export function getMe(): Promise<AppMeResp> {
  return get<AppMeResp>("/app/me");
}

// ---- 工单 ----

/** GET /app/tickets · 我的工单列表（assignee=我） */
export function listTickets(req: AppTicketListReq = {}): Promise<AppTicketListResp> {
  return get<AppTicketListResp>(`/app/tickets${buildQuery(req)}`);
}

/** GET /app/tickets/:id · 工单详情（含流转日志） */
export function getTicket(id: string): Promise<AppTicketDetailResp> {
  return get<AppTicketDetailResp>(`/app/tickets/${encodeURIComponent(id)}`);
}

/** GET /app/tickets/pending · 工单待办增量（FR-OPS-010 轮询；since_id=上次 max_id） */
export function pendingTickets(req: AppPendingTicketsReq = {}): Promise<AppPendingTicketsResp> {
  return get<AppPendingTicketsResp>(`/app/tickets/pending${buildQuery(req)}`);
}

/** POST /app/tickets/:id/accept · 接单（无网走 offline.enqueueDraft("accept")） */
export function acceptTicket(id: string): Promise<SimpleResp> {
  return post<SimpleResp>(`/app/tickets/${encodeURIComponent(id)}/accept`);
}

/** POST /app/tickets/:id/start · 开工（无网走 offline.enqueueDraft("start")） */
export function startTicket(id: string): Promise<SimpleResp> {
  return post<SimpleResp>(`/app/tickets/${encodeURIComponent(id)}/start`);
}

/**
 * POST /app/tickets/:id/submit · 提交处理结果。
 * client_action_id 幂等：离线草稿恢复同步时重放同一 client_action_id，
 * 服务端已受理则直接返回 ok（重放成功也返回 ok），不产生重复流转日志。
 */
export function submitTicket(req: AppSubmitTicketReq): Promise<SimpleResp> {
  return post<SimpleResp>(`/app/tickets/${encodeURIComponent(req.id)}/submit`, {
    result: req.result,
    client_action_id: req.client_action_id,
  });
}

// ---- 告警 ----

/** GET /app/alerts/pending · 告警待办增量（10s 轮询，FR-OPS-010） */
export function pendingAlerts(req: AppPendingAlertsReq = {}): Promise<AppPendingAlertsResp> {
  return get<AppPendingAlertsResp>(`/app/alerts/pending${buildQuery(req)}`);
}

/** POST /app/alerts/:id/ack · 告警确认（note 可选） */
export function ackAlert(req: AppAckAlertReq): Promise<SimpleResp> {
  return post<SimpleResp>(`/app/alerts/${encodeURIComponent(req.id)}/ack`, { note: req.note });
}

// ---- 巡检 ----

/** GET /app/inspections · 我的巡检任务列表 */
export function listInspections(req: AppInspectionListReq = {}): Promise<AppInspectionListResp> {
  return get<AppInspectionListResp>(`/app/inspections${buildQuery(req)}`);
}

/** GET /app/inspections/:id · 巡检任务详情（含明细项） */
export function getInspection(id: string): Promise<AppInspectionTask> {
  return get<AppInspectionTask>(`/app/inspections/${encodeURIComponent(id)}`);
}

/** POST /app/inspections/:id/submit · 批量提交（定位+拍照，异常项服务端自动转工单） */
export function submitInspection(req: AppInspectionSubmitReq): Promise<AppInspectionSubmitResp> {
  return post<AppInspectionSubmitResp>(`/app/inspections/${encodeURIComponent(req.id)}/submit`, {
    items: req.items,
    location: req.location,
    photos: req.photos,
    remark: req.remark,
  });
}

// ---- 告警列表辅助（App 骨架用 pending 集合当列表源；类型再导出供页面使用） ----

export type { AppAlertBrief, AppInspectionTask, AppTicketItem };

/** GET 查询串拼装（undefined/空串剔除；ID 一律字符串渲染，E8） */
function buildQuery(req: object): string {
  const pairs: string[] = [];
  for (const [k, v] of Object.entries(req)) {
    if (v !== undefined && v !== null && v !== "") {
      pairs.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
    }
  }
  return pairs.length > 0 ? `?${pairs.join("&")}` : "";
}
