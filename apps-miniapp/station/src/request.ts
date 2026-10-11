// request.ts · 场站小程序统一请求层（Taro.request 版；02 §8.7 跨端请求层设计，与 shared/src/request.ts 同语义不同实现）。
//
// 职责（S9-03）：
//   - 统一信封 {code,msg,data}：code=0 成功；业务错误 HTTP 200；
//     认证码 10401~10406 → HTTP 401（10401/10403/10405 单飞刷新后重放）；
//   - Bearer 注入：token 存取器由 auth.ts 安装（configureRequest）；
//   - 401 单飞刷新：并发 401 只发一次 /auth/refresh（client 固定 ADMIN_WEB——走 admin-bff
//     登录语义，登录/互斥/锁定均在 admin-bff→identity 链路；10402 同端互斥/10403 会话注销 → 重登）；
//   - 网络层失败（Taro.request fail，非 HTTP 响应）→ ApiError(code=-1, isNetworkError=true)；
//   - baseURL 固定 dev 网关（admin-bff 8889，port_registry 正本）；无设置页不做运行时改址。

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
export const CodeSessionKicked = 10402; // 同端互斥踢下线 → 重登
export const CodeSessionRevoked = 10403; // 会话注销 → 重登
export const CodeAccountDisabled = 10404; // → 重登
export const CodeSessionExpired = 10405; // → 重登
export const CodeStepUpRequired = 10406; // 提级（小程序骨架仅回调占位）
export const CodeLoginLocked = 10407; // 登录页倒计时
export const CodePermissionDenied = 10408; // 403

/** 认证段：刷新可救（单飞重放） */
const REFRESHABLE_CODES = new Set<number>([CodeTokenInvalid, CodeSessionRevoked, CodeSessionExpired]);
/** 认证段：必须重登（清 token + 跳登录页） */
const FORCE_LOGOUT_CODES = new Set<number>([CodeSessionKicked, CodeSessionRevoked, CodeAccountDisabled, CodeSessionExpired]);

export const DEFAULT_BASE_URL = "http://127.0.0.1:8889/api/v1";
const REQUEST_TIMEOUT_MS = 15_000;

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
  /** 10402 同端互斥/会话失效 → 跳登录（auth.ts 注入导航，模块内做去重） */
  onForceLogout?: () => void;
  /** 10406 提级（小程序后置增强，占位回调） */
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

// ---- 单飞刷新：并发 401 共享一次 /auth/refresh（client=ADMIN_WEB，admin-bff 登录语义） ----

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
    data: { refresh_token: rt, client: "ADMIN_WEB" },
    header: { "Content-Type": "application/json" },
    timeout: REQUEST_TIMEOUT_MS,
  }).then(
    (res) => {
      const body = res.data as Envelope<{ tokens: { access_token: string; refresh_token: string } }>;
      if (body && body.code === CodeOK && body.data) {
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

/** 认证错误处理。返回 true 表示已恢复（刷新成功，调用方重放原请求） */
async function handleAuthError(code: number): Promise<boolean> {
  const c = requireCfg();
  if (REFRESHABLE_CODES.has(code)) {
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
  if (FORCE_LOGOUT_CODES.has(code)) {
    c.auth.clear();
    c.onForceLogout?.();
  }
  if (code === CodeStepUpRequired) {
    c.onStepUpRequired?.();
  }
  return false;
}

// ---- 请求入口 ----

type Method = "GET" | "POST" | "PUT" | "DELETE";

interface RequestOptions {
  method?: Method;
  data?: unknown;
  /** 内部重放守卫：401 刷新后只重放一次，防止刷新竞态导致无限循环 */
  _replayed?: boolean;
}

/**
 * 统一入口：Taro.request + 信封解包 + 401 单飞刷新重放。
 * 业务错误统一抛 ApiError（code/msg 保留）；HTTP 状态仅系统级异常有意义。
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
