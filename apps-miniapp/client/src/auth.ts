// auth.ts · 登录态管理（微信静默登录 client 固定 CLIENT_MINI；token 存 Taro storage，key 前缀 micro.*）。
//
// 登录链路（S9-02 / entry.api auth 组）：
//   Taro.login() → POST /auth/wx-login {code}：
//     - 签发 tokens → 写 storage 进入已登录态（拉 /customer/me 预热档案缓存）；
//     - need_bind_phone=true（微信首登未绑手机）→ 影子账号待绑定：手机号表单 →
//       Taro.login() 取**新 code**（wx.login code 一次性，wx-login 已消耗旧码）→
//       POST /auth/wx-bind-phone {code, phone} → 签发 tokens。
//
// 认证分流（request.ts 语义）：
//   10401 → 单飞刷新；10402 互斥踢下线 → 清态跳登录（**禁止静默重登**——与对端互踢成环）；
//   10403/10405 → 静默重登兜底（silentRelogin 单飞）；静默重登也失败 → 跳登录页。

import Taro from "@tarojs/taro";
import type { CustomerMeResp, WxLoginResp } from "@micro/shared/types/mobile-bff";
import {
  ApiError,
  configureRequest,
  get,
  post,
  type TokenStore,
} from "./request";

const ACCESS_KEY = "micro.access";
const REFRESH_KEY = "micro.refresh";
const ME_KEY = "micro.me";
const LOGIN_PAGE = "/pages/login/index";

/** token 存取器实现（Taro storage 持久化，跨启动保留登录态） */
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

/** 跳登录去重：多个并发 401 只触发一次跳转（2s 窗口） */
let navigating = false;

function navigateToLogin(reason: string, kicked = false): void {
  if (navigating) {
    return;
  }
  navigating = true;
  // 已在登录页则不跳（登录页自身请求不会带 401 刷新循环）
  const pages = Taro.getCurrentPages();
  const current = pages[pages.length - 1]?.path ?? "";
  if (!current.includes("pages/login/index")) {
    const q = `kicked=${kicked ? 1 : 0}&reason=${encodeURIComponent(reason)}`;
    void Taro.reLaunch({ url: `${LOGIN_PAGE}?${q}` });
  }
  setTimeout(() => {
    navigating = false;
  }, 2000);
}

/** app.ts 启动时安装（onLaunch 调用一次） */
export function setupAuth(): void {
  configureRequest({
    auth: tokenStore,
    onSessionKicked: () => navigateToLogin("账号在其他小程序端登录，您已被迫下线", true),
    onRelogin: silentRelogin,
    onForceLogout: () => navigateToLogin("登录状态已失效，请重新登录"),
    // 10406 step-up：后置增强（02 §12），占位提示
    onStepUpRequired: () => {
      Taro.showToast({ title: "该操作需要二次验证（未开放）", icon: "none" });
    },
  });
}

/** 本地是否有登录态（仅判 access token 存在，不校验有效性） */
export function isLoggedIn(): boolean {
  return tokenStore.getAccessToken() !== null;
}

/** wxLogin 结果（登录页据此分流到绑定手机或直接进入） */
export interface WxLoginResult {
  ok: boolean;
  /** 微信首登未绑手机 → 登录页切换到手机号绑定表单 */
  needBindPhone: boolean;
  message?: string;
}

function errMessage(e: unknown): string {
  if (e instanceof ApiError) {
    return e.isNetworkError ? "网络异常，请检查服务端地址" : e.message;
  }
  return "操作失败，请稍后重试";
}

/**
 * 微信静默登录：Taro.login → POST /auth/wx-login {code}。
 * dev MOCKWX=1 走服务端微信模拟（任意 code 建影子账号）；正式需已发布 appid（04 §3 F1）。
 */
export async function wxLogin(): Promise<WxLoginResult> {
  try {
    const { code } = await Taro.login();
    const resp = await post<WxLoginResp>("/auth/wx-login", { code });
    if (resp.tokens) {
      tokenStore.setTokens(resp.tokens.access_token, resp.tokens.refresh_token);
      await fetchMe(); // 登录即拉档案，预热 ME_KEY
      return { ok: true, needBindPhone: false };
    }
    return { ok: false, needBindPhone: resp.need_bind_phone };
  } catch (e) {
    return { ok: false, needBindPhone: false, message: errMessage(e) };
  }
}

/**
 * 手机号绑定收尾（need_bind_phone 流程）：Taro.login 取新 code → POST /auth/wx-bind-phone。
 * dev MOCKWX 任意 11 位手机号；正式走 getPhoneNumber 服务端换号（04 §3 F1）。
 */
export async function bindPhone(phone: string): Promise<WxLoginResult> {
  try {
    const { code } = await Taro.login();
    const resp = await post<WxLoginResp>("/auth/wx-bind-phone", { code, phone });
    if (resp.tokens) {
      tokenStore.setTokens(resp.tokens.access_token, resp.tokens.refresh_token);
      await fetchMe();
      return { ok: true, needBindPhone: false };
    }
    return { ok: false, needBindPhone: true, message: "绑定未完成，请重试" };
  } catch (e) {
    return { ok: false, needBindPhone: true, message: errMessage(e) };
  }
}

// ---- 静默重登兜底（10403/10405；单飞：并发 401 共享一次 wxLogin） ----

let reloginInFlight: Promise<boolean> | null = null;

async function doSilentRelogin(): Promise<boolean> {
  const r = await wxLogin();
  if (r.ok) {
    return true;
  }
  if (r.needBindPhone) {
    navigateToLogin("请先绑定手机号");
  }
  return false;
}

function silentRelogin(): Promise<boolean> {
  if (!reloginInFlight) {
    reloginInFlight = doSilentRelogin().finally(() => {
      reloginInFlight = null;
    });
  }
  return reloginInFlight;
}

// ---- 档案缓存 ----

/** 我的档案（GET /customer/me；结果缓存 ME_KEY 供首页离线兜底；未登录返回 null） */
export async function fetchMe(): Promise<CustomerMeResp | null> {
  if (!isLoggedIn()) {
    return null;
  }
  try {
    const me = await get<CustomerMeResp>("/customer/me");
    Taro.setStorageSync(ME_KEY, JSON.stringify(me));
    return me;
  } catch {
    return null;
  }
}

/** 档案缓存（上次 fetchMe 成功的快照；未登录/无缓存返回 null） */
export function cachedMe(): CustomerMeResp | null {
  const raw = Taro.getStorageSync<string>(ME_KEY);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as CustomerMeResp;
  } catch {
    return null;
  }
}

/** 退出登录：尽力而为调 /auth/logout（无网也照样清本地），回登录页 */
export async function logout(): Promise<void> {
  const p = post<unknown>("/auth/logout").catch(() => undefined);
  tokenStore.clear();
  await p;
  navigateToLogin("已退出登录");
}
