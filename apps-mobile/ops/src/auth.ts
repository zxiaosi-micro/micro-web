// auth.ts · 登录态管理（密码登录 client 固定 OPS_APP；token 存 Taro storage）。
//
// 存储策略：token 存 Taro.setStorageSync（key 前缀 ops.*）。
// RN 适配说明（taro-rn）：Taro 同步 storage API 在 RN 下由 @tarojs/taro-rn 桥接
// @react-native-async-storage/async-storage——首次调用为异步排队但接口保持同步语义，
// 首帧前（app.ts onLaunch）预热一次可避免启动期读空；若 spike 后改用异步 API，
// 仅需替换本模块的 get/set/clear 三处实现（调用方语义不变）。
//
// 认证码语义（request.ts 分流）：10401/10403/10405 单飞刷新；10402 同端互斥踢下线 →
// 重登弹窗（骨架直接 reLaunch 登录页）；10404 禁用 → 重登。

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
import type { AppMeResp, LoginResp } from "@micro/shared/types/mobile-bff";

const ACCESS_KEY = "ops.access";
const REFRESH_KEY = "ops.refresh";
const ME_KEY = "ops.me";
const LOGIN_PAGE = "/pages/login/index";

/** token 存取器实现（Taro storage；RN 目标经 taro-rn 桥接 AsyncStorage） */
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
    // 10406 step-up：运维 App 后置增强（02 §12.3），骨架仅占位
    onStepUpRequired: () => {
      Taro.showToast({ title: "该操作需要二次验证（未开放）", icon: "none" });
    },
  });
}

/** 本地是否有登录态（仅判 access token 存在；离线 flush 前置检查用） */
export function isLoggedIn(): boolean {
  return tokenStore.getAccessToken() !== null;
}

/** 登录结果（登录页分流：成功 / 锁定倒计时 / 报错文案） */
export interface LoginResult {
  ok: boolean;
  /** 10407 锁定剩余秒数（登录页倒计时）；10400 凭证错误 msg 直接展示 */
  lockedSeconds?: number;
  message?: string;
}

/**
 * 密码登录：POST /auth/login（契约 LoginReq={mobile,password}；client 由端点固定为 OPS_APP，
 * refresh 请求显式带 client=OPS_APP 供服务端做端漂移校验）。
 * 登录成功后拉 /app/me 预热身份缓存（工作台首帧直接用）。
 */
export async function login(mobile: string, password: string): Promise<LoginResult> {
  try {
    const resp = await post<LoginResp>("/auth/login", { mobile, password });
    tokenStore.setTokens(resp.tokens.access_token, resp.tokens.refresh_token);
    await fetchMe(); // 登录即拉身份，预热 ME_KEY
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

/** 当前用户（GET /app/me；结果缓存 ME_KEY 供工作台离线兜底；未登录返回 null） */
export async function fetchMe(): Promise<AppMeResp | null> {
  if (!isLoggedIn()) {
    return null;
  }
  try {
    const me = await get<AppMeResp>("/app/me");
    Taro.setStorageSync(ME_KEY, JSON.stringify(me));
    return me;
  } catch {
    return null;
  }
}

/** 身份缓存（上次 fetchMe 成功的快照；未登录/无缓存返回 null） */
export function cachedMe(): AppMeResp | null {
  const raw = Taro.getStorageSync<string>(ME_KEY);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as AppMeResp;
  } catch {
    return null;
  }
}

/** 登出：尽力而为调 /auth/logout（无网也照样清本地） */
export async function logout(): Promise<void> {
  const p = post<unknown>("/auth/logout").catch(() => undefined);
  tokenStore.clear();
  Taro.removeStorageSync(ME_KEY);
  await p;
  navigateToLogin("已退出登录");
}
