// prefs-common.ts · 六端公共词条（与各端自有 locales 合并；zh 为正本，en satisfies 同型）。
//
// 收录口径：跨端复用的字符串才进这里——六端枚举/状态映射、通用动作词与提示、
// 会话分流文案（三端 main.tsx 与小程序 auth.ts 重复）、平台标题。单端专属文案留在各端 locales。

/** 公共词条正本（en 以此约束同型） */
export const COMMON_ZH = {
  // 平台
  "app.title": "电池全生命周期平台",
  "app.brand": "电池管家",

  // 通用动作
  "common.save": "保存",
  "common.cancel": "取消",
  "common.confirm": "确认",
  "common.delete": "删除",
  "common.edit": "编辑",
  "common.search": "搜索",
  "common.actions": "操作",
  "common.status": "状态",
  "common.all": "全部",
  "common.create": "新建",
  "common.submit": "提交",
  "common.logout": "退出登录",
  "common.login": "登录",
  "common.resetPassword": "重置密码",
  "common.required": "必填",
  "common.unassigned": "未分配",
  "common.viewAll": "全部 ›",
  "common.refresh": "刷新",
  "common.detail": "详情",
  "common.back": "返回",

  // 通用提示
  "common.saved": "已保存",
  "common.updated": "已更新",
  "common.deleted": "已删除",
  "common.loading": "加载中…",
  "common.empty": "暂无数据",
  "common.confirmDelete": "确认删除该记录?",
  "common.opFailed": "操作失败，请稍后重试",
  "common.networkError": "网络异常，请检查服务端地址",
  "common.noShadow": "暂无影子数据",

  // 六端枚举（ctxkit.Client*）
  "enum.client.ADMIN_WEB": "管理后台",
  "enum.client.DEALER_WEB": "经销商",
  "enum.client.STATION_WEB": "场站",
  "enum.client.CLIENT_MINI": "客户端小程序",
  "enum.client.STATION_MINI": "场站小程序",
  "enum.client.OPS_APP": "运维 App",

  // 用户状态
  "enum.userStatus.1": "正常",
  "enum.userStatus.2": "禁用",
  "enum.userStatus.3": "锁定",

  // 设备生命周期（device 域白名单全态）
  "enum.device.PRODUCED": "已产出",
  "enum.device.IN_STOCK": "在库",
  "enum.device.OUT": "已出库",
  "enum.device.ACTIVATED": "已激活",
  "enum.device.RETIRED": "已退役",
  "enum.device.SCRAPPED": "已报废",

  // 订单状态（order 域 Saga 状态机）
  "enum.order.CREATED": "待锁定",
  "enum.order.LOCKED": "已锁库存",
  "enum.order.PAYING": "支付中",
  "enum.order.PAID": "已支付",
  "enum.order.STOCK_OUT": "已出库",
  "enum.order.CONTRACTED": "合同已建",
  "enum.order.DONE": "完成",
  "enum.order.CANCELLED": "已取消",
  "enum.order.PAY_TIMEOUT": "支付超时",

  // 工单状态（ops 域状态机）
  "enum.ticket.PENDING_DISPATCH": "待派单",
  "enum.ticket.DISPATCHED": "已派单",
  "enum.ticket.ACCEPTED": "已接单",
  "enum.ticket.PROCESSING": "处理中",
  "enum.ticket.SUBMITTED": "已提交",
  "enum.ticket.VERIFIED": "已验收",
  "enum.ticket.CLOSED": "已关闭",
  "enum.ticket.CANCELLED": "已取消",

  // 质保状态（contract 域）
  "enum.warranty.PENDING": "待生效",
  "enum.warranty.ACTIVE": "生效中",
  "enum.warranty.EXPIRED": "已到期",
  "enum.warranty.REFUNDED": "已退款",

  // 登录页基础（手机号/密码表单 + 锁定分流；端字典可覆盖 subtitle 等专属项）
  "login.mobile": "手机号",
  "login.password": "密码",
  "login.mobileRequired": "请输入手机号",
  "login.passwordRequired": "请输入密码",
  "login.lockedRetry": "已锁定,{{seconds}}s 后重试",
  "login.accountLocked": "账号已锁定",
  "login.failed": "登录失败",
  "login.footnote": "连续失败将触发账号锁定保护",

  // 会话分流（10402 互踢 / 强登失效；Web 三端 main.tsx 与小程序 auth.ts 共用）
  "session.kickedTitle": "账号在其他设备登录",
  "session.kickedContent": "当前会话已被顶下线,请重新登录。",
  "session.relogin": "重新登录",
  "session.expired": "登录状态已失效，请重新登录",
  "session.miniKicked": "账号在其他小程序端登录，您已被迫下线",
  "session.stepUpHint": "该操作需要二次验证（未开放）",
  "session.loggedOut": "已退出登录",

  // 偏好切换器
  "prefs.language": "语言",
  "prefs.theme": "深色模式",
  "prefs.light": "浅色",
  "prefs.dark": "深色",
} as const;

export type CommonKey = keyof typeof COMMON_ZH;

/** 英文公共词条（satisfies 约束与 zh 同型，漏键编译期报错） */
export const COMMON_EN: Record<CommonKey, string> = {
  "app.title": "Battery Lifecycle Platform",
  "app.brand": "Battery Manager",

  "common.save": "Save",
  "common.cancel": "Cancel",
  "common.confirm": "Confirm",
  "common.delete": "Delete",
  "common.edit": "Edit",
  "common.search": "Search",
  "common.actions": "Actions",
  "common.status": "Status",
  "common.all": "All",
  "common.create": "New",
  "common.submit": "Submit",
  "common.logout": "Log Out",
  "common.login": "Log In",
  "common.resetPassword": "Reset Password",
  "common.required": "Required",
  "common.unassigned": "Unassigned",
  "common.viewAll": "All ›",
  "common.refresh": "Refresh",
  "common.detail": "Detail",
  "common.back": "Back",

  "common.saved": "Saved",
  "common.updated": "Updated",
  "common.deleted": "Deleted",
  "common.loading": "Loading...",
  "common.empty": "No data",
  "common.confirmDelete": "Delete this record?",
  "common.opFailed": "Operation failed, please retry later",
  "common.networkError": "Network error, check the server address",
  "common.noShadow": "No shadow data",

  "enum.client.ADMIN_WEB": "Admin Console",
  "enum.client.DEALER_WEB": "Dealer Portal",
  "enum.client.STATION_WEB": "Station Portal",
  "enum.client.CLIENT_MINI": "Customer Mini Program",
  "enum.client.STATION_MINI": "Station Mini Program",
  "enum.client.OPS_APP": "Ops App",

  "enum.userStatus.1": "Active",
  "enum.userStatus.2": "Disabled",
  "enum.userStatus.3": "Locked",

  "enum.device.PRODUCED": "Produced",
  "enum.device.IN_STOCK": "In Stock",
  "enum.device.OUT": "Shipped",
  "enum.device.ACTIVATED": "Activated",
  "enum.device.RETIRED": "Retired",
  "enum.device.SCRAPPED": "Scrapped",

  "enum.order.CREATED": "Pending Lock",
  "enum.order.LOCKED": "Stock Locked",
  "enum.order.PAYING": "Paying",
  "enum.order.PAID": "Paid",
  "enum.order.STOCK_OUT": "Shipped",
  "enum.order.CONTRACTED": "Contract Created",
  "enum.order.DONE": "Done",
  "enum.order.CANCELLED": "Cancelled",
  "enum.order.PAY_TIMEOUT": "Pay Timeout",

  "enum.ticket.PENDING_DISPATCH": "Pending Dispatch",
  "enum.ticket.DISPATCHED": "Dispatched",
  "enum.ticket.ACCEPTED": "Accepted",
  "enum.ticket.PROCESSING": "Processing",
  "enum.ticket.SUBMITTED": "Submitted",
  "enum.ticket.VERIFIED": "Verified",
  "enum.ticket.CLOSED": "Closed",
  "enum.ticket.CANCELLED": "Cancelled",

  "enum.warranty.PENDING": "Pending",
  "enum.warranty.ACTIVE": "Active",
  "enum.warranty.EXPIRED": "Expired",
  "enum.warranty.REFUNDED": "Refunded",

  // Login page basics (mobile/password form + lockout branching; app dicts may override subtitle etc.)
  "login.mobile": "Mobile",
  "login.password": "Password",
  "login.mobileRequired": "Enter mobile number",
  "login.passwordRequired": "Enter password",
  "login.lockedRetry": "Locked, retry in {{seconds}}s",
  "login.accountLocked": "Account locked",
  "login.failed": "Login failed",
  "login.footnote": "Consecutive failures trigger account lockout",

  "session.kickedTitle": "Signed in on another device",
  "session.kickedContent": "This session has been kicked offline. Please log in again.",
  "session.relogin": "Log In Again",
  "session.expired": "Session expired, please log in again",
  "session.miniKicked": "Signed in on another mini program device, you are now offline",
  "session.stepUpHint": "Step-up verification required (not yet available)",
  "session.loggedOut": "Logged out",

  "prefs.language": "Language",
  "prefs.theme": "Dark Mode",
  "prefs.light": "Light",
  "prefs.dark": "Dark",
};
