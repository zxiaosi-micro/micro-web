// api.ts · 经销商 Web 接口封装（S9-04 admin-bff 端点；类型取 apitypes 生成物 admin-bff.ts）。
// 所有端点已对照 admin-bff/api/entry.api 核实存在；后端未提供的业务（信用额度/返利/续签）页面用占位展示。

import { get, post } from "@micro/shared";

// 类型从 apitypes 生成物取（生成物即正本，不手写；02 §12.5）
import type {
  DealerExtItem,
  DeviceListResp,
  InventoryListResp,
  InvoiceListResp,
  OrderCreateReq,
  OrderCreateResp,
  OrderListResp,
  OrderPayResp,
  OrderView,
  PartyDetailResp,
  PartyItem,
  PartyListResp,
  PriceListResp,
  SkuItem,
  SkuListResp,
  TicketCreateReq,
  TicketCreateResp,
  WarrantyTargetResp,
} from "@micro/shared/types";

export type { DealerExtItem, OrderView, PartyItem, SkuItem };

/** 通用分页参数 */
export interface PageQuery {
  page: number;
  size: number;
}

// ---- 本方档案（工作台/对账：data_scope 锁定本方，type=DEALER 列表首行即本经销商） ----

/** 参与方列表（type 过滤；买家过滤/本方隔离由服务端 data_scope 承担） */
export const listParties = (type: string, keyword: string, p: PageQuery) =>
  get<PartyListResp>(
    `/parties?page=${p.page}&size=${p.size}&type=${encodeURIComponent(type)}&keyword=${encodeURIComponent(keyword)}`,
  );

/** 参与方详情（档案 + 联系方式） */
export const getParty = (id: string) => get<PartyDetailResp>(`/parties/${id}`);

/** 经销商扩展（等级/授权区域/返利规则；信用额度字段后端未提供——页面以"—"占位） */
export const getDealerExt = (id: string) => get<{ dealer_ext: DealerExtItem }>(`/parties/${id}/dealer-ext`);

/** 本方经销商档案（工作台/对账共用；ext=null 表示未建档） */
export async function fetchSelfDealer(): Promise<{ party: PartyItem; ext: DealerExtItem | null } | null> {
  const r = await listParties("DEALER", "", { page: 1, size: 1 });
  const self = r.list[0];
  if (!self) {
    return null;
  }
  const [d, ext] = await Promise.all([
    getParty(self.party_id),
    getDealerExt(self.party_id).catch(() => null),
  ]);
  const item = ext?.dealer_ext;
  return { party: d.party, ext: item && item.party_id ? item : null };
}

// ---- 商品目录（经销商价回退零售价 + 可售库存聚合） ----

/** SKU 目录（keyword 模糊匹配） */
export const listSkus = (keyword: string, p: PageQuery) =>
  get<SkuListResp>(`/skus?page=${p.page}&size=${p.size}&keyword=${encodeURIComponent(keyword)}`);

/** 当前价目表（latest_only=true；经销商价缺省回退零售价在页面侧判定） */
export const listPrices = (skuId: string) =>
  get<PriceListResp>(`/prices?sku_id=${encodeURIComponent(skuId)}&latest_only=true`);

/** 库存（sku_id/warehouse_id 过滤；可售 = available 跨仓聚合在页面侧求和） */
export const listInventory = (skuId: string, warehouseId: string, p: PageQuery) =>
  get<InventoryListResp>(
    `/inventory?page=${p.page}&size=${p.size}&sku_id=${encodeURIComponent(skuId)}&warehouse_id=${encodeURIComponent(warehouseId)}`,
  );

// ---- 订单（下单/支付/取消，同 admin Orders 下单链路） ----

/** 订单列表（status 过滤；keyword 匹配订单号） */
export const listOrders = (keyword: string, status: string, p: PageQuery) =>
  get<OrderListResp>(
    `/orders?page=${p.page}&size=${p.size}&keyword=${encodeURIComponent(keyword)}&status=${status}`,
  );

/** 订单详情（含明细与 Saga 状态） */
export const getOrder = (orderNo: string) => get<OrderView>(`/orders/${orderNo}`);

/** 创建订单（服务端价格快照；下单后须等 Saga 锁库存完成才可支付） */
export const createOrder = (req: OrderCreateReq) => post<OrderCreateResp>("/orders", req);

/** 支付订单（要求 Saga 已 LOCKED；前端有界等待后调用） */
export const payOrder = (orderNo: string, channel: string) =>
  post<OrderPayResp>(`/orders/${orderNo}/pay`, { channel });

/** 取消订单（CREATED 可直取消；超时由服务端自动取消） */
export const cancelOrder = (orderNo: string, reason: string) =>
  post<unknown>(`/orders/${orderNo}/cancel`, { reason });

// ---- 代客服务（SN 查设备 → 质保 → 代报修） ----

/** 设备列表（SN keyword 检索，代客报修入口） */
export const listDevices = (keyword: string, p: PageQuery) =>
  get<DeviceListResp>(`/devices?page=${p.page}&size=${p.size}&keyword=${encodeURIComponent(keyword)}`);

/** 按目标查质保（端点 /warranty-by-target：target_type=DEVICE + sn） */
export const warrantiesByTarget = (sn: string) =>
  get<WarrantyTargetResp>(`/warranty-by-target?target_type=DEVICE&sn=${encodeURIComponent(sn)}`);

/** 代客报修（SN 归属校验由服务端承担） */
export const createTicket = (req: TicketCreateReq) => post<TicketCreateResp>("/tickets", req);

// ---- 对账（发票列表；周期对账单 FR-FIN-005 L2 无端点——页面占位） ----

/** 发票列表（对账页数据源） */
export const listInvoices = (status: string, p: PageQuery) =>
  get<InvoiceListResp>(`/invoices?page=${p.page}&size=${p.size}&status=${status}`);
