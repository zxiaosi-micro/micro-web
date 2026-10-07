// auth.ts · 登录态管理（shared 核心四件之二）：token 存取 + 登录/登出 API。
//
// 存储策略：token 存 sessionStorage（标签页隔离，XSS 暴露窗口 ≤ 会话）；
// 30min access + 单飞刷新由 request.ts 托管，本模块只做存取与登录动作。

import { ApiError, CodeInvalidCredential, CodeLoginLocked, configureRequest, get, post, type TokenStore } from "./request";
import type { LoginResp, MeResp, StepUpResp } from "../types/admin-bff";

const ACCESS_KEY = "micro.access";
const REFRESH_KEY = "micro.refresh";
const ME_KEY = "micro.me";

export const tokenStore: TokenStore = {
  getAccessToken: () => sessionStorage.getItem(ACCESS_KEY),
  getRefreshToken: () => sessionStorage.getItem(REFRESH_KEY),
  setTokens: (access, refresh) => {
    sessionStorage.setItem(ACCESS_KEY, access);
    sessionStorage.setItem(REFRESH_KEY, refresh);
  },
  clear: () => {
    sessionStorage.removeItem(ACCESS_KEY);
    sessionStorage.removeItem(REFRESH_KEY);
    sessionStorage.removeItem(ME_KEY);
  },
};

/** 安装请求层（app 入口调用一次；UI 回调由 app 提供） */
export function setupAuth(hooks: {
  /** API 基础路径(dev 走 vite 代理 /api/v1;prod 网关同域反代可留空) */
  baseURL?: string;
  onSessionKicked?: () => void;
  onStepUpRequired?: () => void;
  onForceLogout?: () => void;
}): void {
  configureRequest({ auth: tokenStore, ...hooks });
}

export interface LoginResult {
  ok: boolean;
  /** 10407 锁定剩余秒数（倒计时）；10400 凭证错误 msg 直接展示 */
  lockedSeconds?: number;
  message?: string;
  me?: LoginResp;
}

export async function login(mobile: string, password: string): Promise<LoginResult> {
  try {
    const resp = await post<LoginResp>("/auth/login", { mobile, password });
    tokenStore.setTokens(resp.tokens.access_token, resp.tokens.refresh_token);
    await fetchMe(); // 登录即拉 /auth/me 预热
    return { ok: true, me: resp };
  } catch (e) {
    if (e instanceof ApiError) {
      if (e.code === CodeLoginLocked) {
        const m = e.message.match(/(\d+)\s*秒/);
        return { ok: false, lockedSeconds: m ? parseInt(m[1], 10) : 1800, message: e.message };
      }
      if (e.code === CodeInvalidCredential) {
        return { ok: false, message: e.message };
      }
      return { ok: false, message: e.message };
    }
    return { ok: false, message: "网络异常,请稍后重试" };
  }
}

/** 当前用户（/auth/me；未登录返回 null） */
export async function fetchMe(): Promise<MeResp | null> {
  if (!tokenStore.getAccessToken()) {
    return null;
  }
  try {
    const resp = await get<MeResp>("/auth/me");
    sessionStorage.setItem(ME_KEY, JSON.stringify(resp));
    return resp;
  } catch {
    return null;
  }
}

export function cachedMe(): MeResp | null {
  const raw = sessionStorage.getItem(ME_KEY);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as MeResp;
  } catch {
    return null;
  }
}

export function logout(): Promise<void> {
  const p = post<unknown>("/auth/logout").catch(() => undefined); // 尽力而为
  tokenStore.clear();
  return p.then(() => undefined);
}

/** step-up 二级认证：成功后调用方应立即重试原操作（新 access 已落 store） */
export async function stepUp(password: string): Promise<{ ok: boolean; message?: string }> {
  try {
    const resp = await post<StepUpResp>("/auth/step-up", { password });
    const at = tokenStore.getAccessToken();
    const rt = tokenStore.getRefreshToken();
    if (at && rt) {
      tokenStore.setTokens(resp.access_token, rt); // 换发 level=2 access
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof ApiError ? e.message : "网络异常" };
  }
}
