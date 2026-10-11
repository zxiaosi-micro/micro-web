// request.ts · 小程序统一请求层（Taro.request 版；02 §8.7 跨端请求层设计，与 shared/src/request.ts 同语义不同实现）。
//
// 职责（S9-02）：
//   - 统一信封 {code,msg,data}：code=0 成功；业务错误 HTTP 200；
//     认证码 10401~10406 → HTTP 401，权限 10408 → 403，限流 110429 → 429；
//   - Bearer 注入：token 存取器由 auth.ts 安装（configureRequest）；
//   - 401 分流（client 固定 CLIENT_MINI）：
//       10401 → **单飞刷新**（并发 401 只发一次 /auth/refresh，轮换式，成功重放原请求）；
//       10402 → 同端互斥踢下线：清登录态 + 互斥提示跳登录页（**禁止静默重登**——会与对端互踢成环）；
//       10403/10405 → 重登兜底：静默 wxLogin（onRelogin 单飞），成功重放原请求，失败跳登录页；
//   - 网络层失败（Taro.request fail，无 HTTP 响应）→ ApiError(code=-1, isNetworkError=true)。

import Taro from "@tarojs/taro";

export interface Envelope<T> {
  code: number;
  msg: string;
  data?: T;
}

/** 业务/认证错误码（与 micro-common errcode 同源，shared/src/request.ts 同步维护） */
export const CodeOK = 0;
export const CodeInvalidCredential = 10400; // 登录页报错
export const CodeTokenInvalid = 10401; // 静默单飞刷新
export const CodeSessionKicked = 10402; // 同端互斥踢下线 → 清态跳登录
export const CodeSessionRevoked = 10403; // 会话注销 → 静默 wxLogin 重登兜底
export const CodeAccountDisabled = 10404; // → 重登
export const CodeSessionExpired = 10405; // 会话过期 → 静默 wxLogin 重登兜底
export const CodeStepUpRequired = 10406; // 提级（占位回调）
export const CodeLoginLocked = 10407; // 登录页倒计时
export const CodePermissionDenied = 10408; // 403
export const CodeRateLimited = 110429; // 429

export const DEFAULT_BASE_URL = "http://127.0.0.1:8890/api/v1";
const REQUEST_TIMEOUT_MS = 15_000;
/** 微信登录 client 枚举（entry.api RefreshReq.options；与登录端一致，漂移即拒） */
export const WX_CLIENT = "CLIENT_MINI";

export class ApiError extends Error {
  readonly code: number;
  readonly httpStatus: number;
  /** true = Taro.request 层失败（断网/超时/DNS），无 HTTP 响应 */
  readonly isNetworkError: boolean;

  constructor(code: number, msg: string, httpStatus: number, isNetworkError = false) {
    super(msg);
    this.name = "ApiError";
    this.code = code;
    this.httpStatus = httpStatus;
    this.isNetworkError = isNetworkError;
  }
}

export function isNetworkError(e: unknown): boolean {
  return e instanceof ApiError && e.isNetworkError;
}

export interface RequestHooks {
  auth: TokenStore;
  /** 10402 互斥踢下线 → 清态后跳登录页（auth.ts 注入导航，模块内去重） */
  onSessionKicked?: () => void;
  /** 10403/10405 重登兜底：静默 wxLogin；返回 true 表示已重新登录（调用方重放原请求） */
  onRelogin?: () => Promise<boolean>;
  /** 静默重登也失败 → 跳登录页 */
  onForceLogout?: () => void;
  /** 10406 提级（后置增强，占位回调） */
  onStepUpRequired?: () => void;
}

export interface TokenStore {
  getAccessToken(): string | null;
  getRefreshToken(): string | null;
  setTokens(access: string, refresh: string): void;
  clear(): void;
}

let cfg: RequestHooks | null = null;

/** app.ts 启动时安装一次（auth.setupAuth 封装） */
export function configureRequest(config: RequestHooks): void {
  cfg = config;
}

function requireCfg(): RequestHooks {
  if (!cfg) {
    throw new Error("request: 先调用 configureRequest()");
  }
  return cfg;
}

// ---- 单飞刷新：并发 401 共享一次 /auth/refresh（client=CLIENT_MINI 轮换式） ----

let refreshing: Promise<void> | null = null;

function doRefresh(): Promise<void> {
  const c = requireCfg();
  const rt = c.auth.getRefreshToken();
  if (!rt) {
    return Promise.reject(new ApiError(CodeSessionRevoked, "无 refresh token", 401));
  }
  return Taro.request({
    url: `${DEFAULT_BASE_URL}/auth/refresh`,
    method: "POST",
    data: { refresh_token: rt, client: WX_CLIENT },
    header: { "Content-Type": "application/json" },
    timeout: REQUEST_TIMEOUT_MS,
  }).then(
    (res) => {
      const body = res.data as Envelope<{ tokens: { access_token: string; refresh_token: string } }>;
      if (body && typeof body === "object" && body.code === CodeOK && body.data) {
        c.auth.setTokens(body.data.tokens.access_token, body.data.tokens.refresh_token);
        return;
      }
      // 刷新被拒（token 轮换失效/客户端漂移）→ 清登录态走重登
      c.auth.clear();
      c.onForceLogout?.();
      throw new ApiError(body?.code ?? CodeSessionRevoked, body?.msg ?? "刷新失败", res.statusCode);
    },
    () => {
      throw new ApiError(-1, "网络异常，刷新失败", 0, true);
    },
  );
}

/**
 * 认证错误处理。返回 true 表示已恢复（调用方重放原请求）。
 * 10401 单飞刷新；10403/10405 静默 wxLogin 重登兜底；10402 互斥清态跳登录；10404 清态跳登录。
 */
async function handleAuthError(code: number): Promise<boolean> {
  const c = requireCfg();
  switch (code) {
    case CodeTokenInvalid: {
      // 单飞：已有刷新在途则直接排队等待结果
      if (!refreshing) {
        refreshing = doRefresh().finally(() => {
          refreshing = null;
        });
      }
      try {
        await refreshing;
        return true;
      } catch {
        return false;
      }
    }
    case CodeSessionKicked:
      // 同端互斥：静默重登会与对端互踢成环，必须人工重登
      c.auth.clear();
      c.onSessionKicked?.();
      return false;
    case CodeSessionRevoked:
    case CodeSessionExpired: {
      // 已注销/过期会话的 refresh token 同生共死，刷新必败 → 静默重登兜底
      c.auth.clear();
      if (c.onRelogin) {
        try {
          return await c.onRelogin();
        } catch {
          return false;
        }
      }
      c.onForceLogout?.();
      return false;
    }
    case CodeAccountDisabled:
      c.auth.clear();
      c.onForceLogout?.();
      return false;
    case CodeStepUpRequired:
      c.onStepUpRequired?.();
      return false;
    default:
      return false;
  }
}

// ---- 请求入口 ----

type Method = "GET" | "POST" | "PUT" | "DELETE";

interface RequestOptions {
  method?: Method;
  data?: unknown;
  /** 内部重放守卫：401 恢复后只重放一次，防止刷新/重登竞态导致无限循环 */
  _replayed?: boolean;
}

/**
 * 统一入口：Taro.request + 信封解包 + 401 单飞刷新/静默重登重放。
 * 业务错误统一抛 ApiError（code/msg 保留）；HTTP 状态仅系统级异常有意义。
 * ID 一律字符串渲染由 apitypes 类型约束（E8）。
 */
async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const c = requireCfg();
  const method = options.method ?? "GET";
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = c.auth.getAccessToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let res: Taro.request.SuccessCallbackResult<unknown>;
  try {
    res = await Taro.request({
      url: `${DEFAULT_BASE_URL}${path}`,
      method,
      data: options.data as Record<string, unknown> | undefined,
      header: headers,
      timeout: REQUEST_TIMEOUT_MS,
    });
  } catch (err) {
    // 传输层失败：断网/超时（无 statusCode）
    const errMsg = err instanceof Error ? err.message : String(err);
    throw new ApiError(-1, `网络异常：${errMsg}`, 0, true);
  }

  const body = res.data as Envelope<T> | string | undefined;
  if (typeof body !== "object" || body === null) {
    // 非 JSON（网关 502 页等）按系统错误处理
    throw new ApiError(-1, `HTTP ${res.statusCode}`, res.statusCode);
  }

  if (body.code === CodeOK) {
    return body.data as T;
  }

  if (res.statusCode === 401 && !options._replayed) {
    const recovered = await handleAuthError(body.code);
    if (recovered) {
      return request<T>(path, { ...options, _replayed: true });
    }
  }
  throw new ApiError(body.code, body.msg, res.statusCode);
}

// ---- 便捷方法 ----

export function get<T>(path: string): Promise<T> {
  return request<T>(path, { method: "GET" });
}

export function post<T>(path: string, data?: unknown): Promise<T> {
  return request<T>(path, { method: "POST", data });
}
