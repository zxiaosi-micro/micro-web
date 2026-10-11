// auth.ts · 登录态管理（密码登录走 admin-bff /auth/login {mobile,password}，服务端固定 ADMIN_WEB 语义；
// token 存 Taro storage；登录后拉 /station-web/me 预热驻站上下文——data_scope 锁定本场站）。
//
// 存储策略：token 存 Taro.setStorageSync（key 前缀 station.*），与场站 Web sessionStorage 语义对齐
// （小程序无 sessionStorage，storage 随小程序生命周期）。
//
// 认证码语义（request.ts 分流）：10401/10403/10405 单飞刷新；10402 同端互斥踢下线 → 重登
// （reLaunch 登录页）；10404 禁用 → 重登。

import Taro from "@tarojs/taro";
import {
  ApiError,
  CodeInvalidCredential,
  CodeLoginLocked,
  configureRequest,
  get,
  post,
  type TokenStore,
} from "./request";
import type { LoginResp, StationWebMeResp } from "@micro/shared/types";

const ACCESS_KEY = "station.access";
const REFRESH_KEY = "station.refresh";
const ME_KEY = "station.me";
const LOGIN_PAGE = "/pages/login/index";

export const tokenStore: TokenStore = {
  getAccessToken: () => Taro.getStorageSync<string>(ACCESS_KEY) || null,
  getRefreshToken: () => Taro.getStorageSync<string>(REFRESH_KEY) || null,
  setTokens: (access, refresh) => {
    Taro.setStorageSync(ACCESS_KEY, access);
    Taro.setStorageSync(REFRESH_KEY, refresh);
  },
  clear: () => {
    Taro.removeStorageSync(ACCESS_KEY);
    Taro.removeStorageSync(REFRESH_KEY);
    Taro.removeStorageSync(ME_KEY);
  },
};

/** 10402/10404 重登去重：多个并发 401 只触发一次跳转（2s 窗口） */
let loggingOut = false;

function navigateToLogin(reason: string): void {
  if (loggingOut) {
    return;
  }
  loggingOut = true;
  // 已在登录页则不跳（登录页自身请求不会带 401 刷新循环）
  const pages = Taro.getCurrentPages();
  const current = pages[pages.length - 1]?.path ?? "";
  if (!current.includes("pages/login/index")) {
    Taro.reLaunch({ url: `${LOGIN_PAGE}?kicked=1&reason=${encodeURIComponent(reason)}` });
  }
  setTimeout(() => {
    loggingOut = false;
  }, 2000);
}

/** app.ts 启动时安装（onLaunch 调用一次） */
export function setupAuth(): void {
  configureRequest({
    auth: tokenStore,
    onForceLogout: () => navigateToLogin("登录状态已失效，请重新登录"),
    // 10406 step-up：小程序后置增强，骨架仅占位
    onStepUpRequired: () => {
      Taro.showToast({ title: "该操作需要二次验证（未开放）", icon: "none" });
    },
  });
}

export function isLoggedIn(): boolean {
  return tokenStore.getAccessToken() !== null;
}

export interface LoginResult {
  ok: boolean;
  /** 10407 锁定剩余秒数（登录页倒计时）；10400 凭证错误 msg 直接展示 */
  lockedSeconds?: number;
  message?: string;
}

/**
 * 密码登录：POST /auth/login（admin-bff 契约 LoginReq={mobile,password}；
 * client 由服务端固定 ADMIN_WEB，互斥踢旧/锁定/审计都在 identity）。
 * 登录成功后拉 /station-web/me 预热驻站上下文（工作台首帧直接用，data_scope 锁定本场站）。
 */
export async function login(mobile: string, password: string): Promise<LoginResult> {
  try {
    const resp = await post<LoginResp>("/auth/login", { mobile, password });
    tokenStore.setTokens(resp.tokens.access_token, resp.tokens.refresh_token);
    await fetchStationMe(); // 登录即拉驻站身份，预热 ME_KEY
    return { ok: true };
  } catch (e) {
    if (e instanceof ApiError) {
      if (e.code === CodeLoginLocked) {
        // 锁定 msg 形如 "...锁定 1800 秒"，解析失败回退 30 分钟
        const m = e.message.match(/(\d+)\s*秒/);
        return { ok: false, lockedSeconds: m ? parseInt(m[1], 10) : 1800, message: e.message };
      }
      if (e.code === CodeInvalidCredential) {
        return { ok: false, message: e.message };
      }
      return { ok: false, message: e.isNetworkError ? "网络异常，请检查服务端地址" : e.message };
    }
    return { ok: false, message: "网络异常，请稍后重试" };
  }
}

/** 场站 Web 我的驻站（GET /station-web/me；data_scope 锁定本场站；结果缓存 ME_KEY 供各页取 station_id） */
export async function fetchStationMe(): Promise<StationWebMeResp | null> {
  if (!isLoggedIn()) {
    return null;
  }
  try {
    const me = await get<StationWebMeResp>("/station-web/me");
    Taro.setStorageSync(ME_KEY, JSON.stringify(me));
    return me;
  } catch {
    return null;
  }
}

/** 驻站上下文缓存（上次 fetchStationMe 成功的快照；未登录/无缓存返回 null） */
export function cachedStationMe(): StationWebMeResp | null {
  const raw = Taro.getStorageSync<string>(ME_KEY);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as StationWebMeResp;
  } catch {
    return null;
  }
}

/**
 * 确保驻站上下文可用：缓存优先，无缓存（或缓存无 station_id）时拉一次网络。
 * 各页取 station_id 的唯一入口——data_scope 锁定语义下全端点强制带 station_id。
 */
export async function ensureStationMe(): Promise<StationWebMeResp | null> {
  const cached = cachedStationMe();
  if (cached && cached.station_id) {
    return cached;
  }
  return fetchStationMe();
}

/** 登出：尽力而为调 /auth/logout（无网也照样清本地） */
export async function logout(): Promise<void> {
  const p = post<unknown>("/auth/logout").catch(() => undefined);
  tokenStore.clear();
  Taro.removeStorageSync(ME_KEY);
  await p;
  navigateToLogin("已退出登录");
}
