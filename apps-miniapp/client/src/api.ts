// api.ts · mobile-bff /customer/* 端点封装（S9-02；契约正本 micro-server/services/mobile-bff/api/entry.api，
// 类型正本 packages/shared/types/mobile-bff.ts——apitypes 生成物，禁止手写漂移）。
// requireParty：服务端按 party_id 隔离一切查询；本文件只做在线直发，端点与 .api 一一对应。

import { get, post } from "./request";
import type {
  ActivateDeviceReq,
  BindPhoneReq,
  ContactListResp,
  ContractListReq,
  ContractListResp,
  CreateExtensionOrderReq,
  CreateExtensionOrderResp,
  CreateTicketReq,
  CreateTicketResp,
  CustomerDeviceDetail,
  CustomerDeviceListReq,
  CustomerDeviceListResp,
  CustomerMeResp,
  CustomerStationDetail,
  CustomerStationListResp,
  CustomerTicketDetail,
  CustomerTicketListReq,
  CustomerTicketListResp,
  ExtensionSkuListResp,
  MessageListReq,
  MessageListResp,
  SimpleResp,
  ShadowView,
  SlaTimerView,
  TrendResp,
  WarrantyListReq,
  WarrantyListResp,
} from "@micro/shared/types/mobile-bff";

// 类型再导出供页面使用（不经过聚合入口 @micro/shared/types——与 admin-bff 有同名类型冲突）
export type {
  ContactView,
  ContractView,
  CustomerDeviceItem,
  CustomerMeResp,
  CustomerStationItem,
  CustomerTicketItem,
  ExtensionSkuView,
  MessageView,
  ShadowView,
  SlaTimerView,
  WarrantyView,
} from "@micro/shared/types/mobile-bff";

// ---- 身份/档案 ----

/** GET /customer/me · 我的档案（requireParty 入口） */
export function getMe(): Promise<CustomerMeResp> {
  return get<CustomerMeResp>("/customer/me");
}

/** POST /customer/bind-phone · 绑定手机号（登录后补绑） */
export function bindPhoneNumber(req: BindPhoneReq): Promise<SimpleResp> {
  return post<SimpleResp>("/customer/bind-phone", { phone: req.phone });
}

/** GET /customer/contacts · 我的联系人 */
export function listContacts(): Promise<ContactListResp> {
  return get<ContactListResp>("/customer/contacts");
}

// ---- 设备 ----

/** GET /customer/devices · 我的设备（party_id 隔离，分页） */
export function listDevices(req: CustomerDeviceListReq = {}): Promise<CustomerDeviceListResp> {
  return get<CustomerDeviceListResp>(`/customer/devices${buildQuery(req)}`);
}

/** POST /customer/devices/activate · 扫码激活设备（绑定本人 party，质保起算事件） */
export function activateDevice(req: ActivateDeviceReq): Promise<SimpleResp> {
  return post<SimpleResp>("/customer/devices/activate", { sn: req.sn });
}

/** GET /customer/devices/:id · 设备详情（影子+质保+场站归属） */
export function getDeviceDetail(id: string): Promise<CustomerDeviceDetail> {
  return get<CustomerDeviceDetail>(`/customer/devices/${encodeURIComponent(id)}`);
}

/** GET /customer/devices/:id/shadow · 设备影子（10s 轮询准实时） */
export function getDeviceShadow(id: string): Promise<ShadowView> {
  return get<ShadowView>(`/customer/devices/${encodeURIComponent(id)}/shadow`);
}

/** GET /customer/devices/:id/trend · 遥测趋势（TDengine 热点五指标，hours 1~720 默认 24） */
export function getDeviceTrend(id: string, hours = 24): Promise<TrendResp> {
  return get<TrendResp>(`/customer/devices/${encodeURIComponent(id)}/trend${buildQuery({ hours })}`);
}

// ---- 场站 ----

/** GET /customer/stations · 我的场站（本人场站单回查） */
export function listStations(): Promise<CustomerStationListResp> {
  return get<CustomerStationListResp>("/customer/stations");
}

/** GET /customer/stations/:id · 场站详情（设备影子聚合监控） */
export function getStationDetail(id: string): Promise<CustomerStationDetail> {
  return get<CustomerStationDetail>(`/customer/stations/${encodeURIComponent(id)}`);
}

// ---- 质保/合同/延保 ----

/** GET /customer/warranties · 我的质保（设备/场站双层归并，分页） */
export function listWarranties(req: WarrantyListReq = {}): Promise<WarrantyListResp> {
  return get<WarrantyListResp>(`/customer/warranties${buildQuery(req)}`);
}

/** GET /customer/contracts · 我的合同（buyer_party_id 隔离，分页） */
export function listContracts(req: ContractListReq = {}): Promise<ContractListResp> {
  return get<ContractListResp>(`/customer/contracts${buildQuery(req)}`);
}

/** GET /customer/extension-skus · 延保商品（EXT_WARRANTY SKU + 零售价） */
export function listExtensionSkus(): Promise<ExtensionSkuListResp> {
  return get<ExtensionSkuListResp>("/customer/extension-skus");
}

/**
 * POST /customer/extension-orders · 延保购买（下单 + 微信支付）。
 * dev pay_params 为 mock URL JSON；正式 Taro.requestPayment 需正式 appid+商户号（04 §3 F1）。
 */
export function createExtensionOrder(req: CreateExtensionOrderReq): Promise<CreateExtensionOrderResp> {
  return post<CreateExtensionOrderResp>("/customer/extension-orders", {
    base_warranty_id: req.base_warranty_id,
    sku_id: req.sku_id,
    qty: req.qty,
  });
}

// ---- 工单 ----

/** POST /customer/tickets · 报修（AFTER_SALE 工单，requireParty 校验设备归属；photos 为照片 URL/文件 ID） */
export function createTicket(req: CreateTicketReq): Promise<CreateTicketResp> {
  return post<CreateTicketResp>("/customer/tickets", {
    device_id: req.device_id,
    sn: req.sn,
    title: req.title,
    content: req.content,
    photos: req.photos,
  });
}

/** GET /customer/tickets · 我的工单（party_id 隔离，分页） */
export function listTickets(req: CustomerTicketListReq = {}): Promise<CustomerTicketListResp> {
  return get<CustomerTicketListResp>(`/customer/tickets${buildQuery(req)}`);
}

/** GET /customer/tickets/:id · 工单进度详情（含流转日志） */
export function getTicket(id: string): Promise<CustomerTicketDetail> {
  return get<CustomerTicketDetail>(`/customer/tickets/${encodeURIComponent(id)}`);
}

/** GET /customer/tickets/:id/sla · 工单 SLA 计时（快照冻结只读） */
export function getTicketSla(id: string): Promise<SlaTimerView> {
  return get<SlaTimerView>(`/customer/tickets/${encodeURIComponent(id)}/sla`);
}

// ---- 消息 ----

/** GET /customer/messages · 我的消息（未读计数 + 分页） */
export function listMessages(req: MessageListReq = {}): Promise<MessageListResp> {
  return get<MessageListResp>(`/customer/messages${buildQuery(req)}`);
}

/** POST /customer/messages/:id/read · 消息已读（仅本人） */
export function markMessageRead(id: string): Promise<SimpleResp> {
  return post<SimpleResp>(`/customer/messages/${encodeURIComponent(id)}/read`);
}

// ---- 辅助 ----



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
