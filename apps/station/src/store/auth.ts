// store/auth.ts · station 登录态 + 驻站上下文全局 store（zustand）。
// 会话探测（/auth/me + stationWebMe）留在 App 的 Gate effect（依赖 authed+route）；
// token 存取仍归 shared。

import { create } from "zustand";
import { logout, tokenStore } from "@micro/shared";
import type { StationWebMeResp } from "@micro/shared/types";

/** 驻站上下文（登录后拉取；大屏免登录跳过） */
export interface StationCtx {
  me: StationWebMeResp | null;
}

interface AuthState {
  authed: boolean;
  checking: boolean;
  ctx: StationCtx;
  setAuthed: (v: boolean) => void;
  setChecking: (v: boolean) => void;
  setCtx: (ctx: StationCtx) => void;
  /** 登录成功：置 authed 并重开探测（Gate effect 拉取会话与驻站上下文） */
  refresh: () => void;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  authed: !!tokenStore.getAccessToken(),
  checking: !!tokenStore.getAccessToken(),
  ctx: { me: null },
  setAuthed: (v) => set({ authed: v }),
  setChecking: (v) => set({ checking: v }),
  setCtx: (ctx) => set({ ctx }),
  refresh: () => set({ authed: true, checking: true }),
  signOut: async () => {
    await logout();
    set({ authed: false, ctx: { me: null } });
  },
}));
