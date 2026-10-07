// request.ts · 统一请求层（02 §12.1 shared 核心四件之一）。
//
// 职责（02 §3.3 / §9.5 / S3-04）：
//   - 统一信封 {code,msg,data}：code=0 成功；业务错误 HTTP 200；
//     认证码 10401~10406 → HTTP 401，权限 10408 → 403，限流 110429 → 429；
//   - Bearer 注入：从 auth 存取器取 access token；
//   - 401 分流：10401/10403/10405 → **单飞刷新**（并发 401 只发一次 /auth/refresh，
//     排队等待后重放原请求）；10402 → 互斥弹窗回调（登出）；10406 → 提级弹窗回调；
//   - ID 一律字符串渲染由类型约束（apitypes 生成物）。

export interface Envelope<T> {
  code: number;
  msg: string;
  data?: T;
}

/** 业务/认证错误码（与 micro-common errcode 同源） */
export const CodeOK = 0;
export const CodeInvalidCredential = 10400; // 登录页报错
export const CodeTokenInvalid = 10401; // 静默单飞刷新
export const CodeSessionKicked = 10402; // 互斥弹窗
export const CodeSessionRevoked = 10403; // 跳登录
export const CodeAccountDisabled = 10404;
export const CodeSessionExpired = 10405; // 跳登录
export const CodeStepUpRequired = 10406; // 提级弹窗
export const CodeLoginLocked = 10407; // 登录页倒计时
export const CodePermissionDenied = 10408; // 403
export const CodeRateLimited = 110429; // 429

export interface RequestConfig {
  /** access/refresh token 存取（sessionStorage/localStorage 自定义） */
  auth: TokenStore;
  /** 基础地址（dev 经 vite proxy 则留空） */
  baseURL?: string;
  /** 10402 互斥弹窗（仅触发一次，由实现方去重） */
  onSessionKicked?: () => void;
  /** 10406 提级弹窗（操作上下文由实现方持有） */
  onStepUpRequired?: () => void;
  /** 强制跳登录（10403/10404/刷新亦失败） */
  onForceLogout?: () => void;
}

export interface TokenStore {
  getAccessToken(): string | null;
  getRefreshToken(): string | null;
  setTokens(access: string, refresh: string): void;
  clear(): void;
}

export class ApiError extends Error {
  readonly code: number;
  readonly httpStatus: number;

  constructor(code: number, msg: string, httpStatus: number) {
    super(msg);
    this.name = "ApiError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

/** 单飞刷新状态（模块级：并发 401 共享一次 refresh） */
let refreshing: Promise<void> | null = null;

export function isRefreshing(): boolean {
  return refreshing !== null;
}

/** 全局配置（app 入口 install 一次） */
let cfg: RequestConfig | null = null;

export function configureRequest(config: RequestConfig): void {
  cfg = config;
}

export function getConfig(): RequestConfig {
  if (!cfg) {
    throw new Error("request: 先调用 configureRequest()");
  }
  return cfg;
}

/**
 * request 统一入口。fetch + 信封解包 + 401 单飞刷新 + 认证分流。
 * 业务错误以 ApiError 抛出（code/msg 语义保留），HTTP 状态仅在系统级异常有意义。
 */
export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const c = getConfig();
  const url = c.baseURL ? c.baseURL + path : path;
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  const token = c.auth.getAccessToken();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const resp = await fetch(url, { ...init, headers });
  let body: Envelope<T>;
  try {
    body = (await resp.json()) as Envelope<T>;
  } catch {
    // 非 JSON（网关 502 等）：按系统错误处理
    throw new ApiError(-1, `HTTP ${resp.status}`, resp.status);
  }

  if (body.code === CodeOK) {
    return body.data as T;
  }

  // ---- 认证分流（02 §9.5：10401 静默刷新 / 10402 互斥弹窗 / 10406 提级）----
  if (resp.status === 401) {
    const handled = await handleAuthError(body.code);
    if (handled) {
      // 刷新成功 → 重放一次原请求（此时新 token 已就位）
      return request<T>(path, init);
    }
  }
  throw new ApiError(body.code, body.msg, resp.status);
}

/**
 * 认证错误处理。返回 true 表示已恢复（刷新成功，调用方应重放请求）。
 * 10401/10403/10405：单飞刷新（等待中的并发请求排队）；10402/10404/10406：交给 UI 回调。
 */
async function handleAuthError(code: number): Promise<boolean> {
  const c = getConfig();
  switch (code) {
    case CodeTokenInvalid:
    case CodeSessionRevoked:
    case CodeSessionExpired: {
      // 单飞：已有刷新在途则直接排队等待
      if (refreshing) {
        try {
          await refreshing;
          return true;
        } catch {
          return false;
        }
      }
      refreshing = doRefresh();
      try {
        await refreshing;
        return true;
      } catch {
        return false;
      } finally {
        refreshing = null;
      }
    }
    case CodeSessionKicked:
      c.auth.clear();
      c.onSessionKicked?.();
      c.onForceLogout?.();
      return false;
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

async function doRefresh(): Promise<void> {
  const c = getConfig();
  const rt = c.auth.getRefreshToken();
  if (!rt) {
    c.onForceLogout?.();
    throw new ApiError(CodeSessionRevoked, "无 refresh token", 401);
  }
  const resp = await fetch(`${c.baseURL ?? ""}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: rt }),
  });
  const body = (await resp.json()) as Envelope<{ tokens: { access_token: string; refresh_token: string } }>;
  if (body.code !== CodeOK || !body.data) {
    c.auth.clear();
    c.onForceLogout?.();
    throw new ApiError(body.code, body.msg, resp.status);
  }
  c.auth.setTokens(body.data.tokens.access_token, body.data.tokens.refresh_token);
}

// ---- 便捷方法 ----

export function get<T>(path: string): Promise<T> {
  return request<T>(path);
}

export function post<T>(path: string, data?: unknown): Promise<T> {
  return request<T>(path, { method: "POST", body: data === undefined ? undefined : JSON.stringify(data) });
}

export function put<T>(path: string, data?: unknown): Promise<T> {
  return request<T>(path, { method: "PUT", body: data === undefined ? undefined : JSON.stringify(data) });
}

export function del<T>(path: string): Promise<T> {
  return request<T>(path, { method: "DELETE" });
}
