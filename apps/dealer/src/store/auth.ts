// store/auth.ts · dealer 登录态全局 store（zustand）：me/checking 集中管理，
// 消除 App → Login → Layout 的 onLoggedIn/onLoggedOut prop 钻透；token 存取仍归 shared。

import { create } from "zustand";
import { cachedMe, fetchMe, logout } from "@micro/shared";
import type { MeResp } from "@micro/shared/types";

interface AuthState {
  me: MeResp | null;
  checking: boolean;
  /** 启动期会话探测：有 token 则拉 /auth/me 预热（App 挂载时调一次） */
  bootstrap: () => Promise<void>;
  /** 登录成功后回填（shared login() 已落 token 并预热 me 缓存） */
  refresh: () => void;
  /** 退出登录：注销会话 + 清 store */
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  me: cachedMe(),
  checking: true,
  bootstrap: async () => {
    const me = await fetchMe();
    set({ me, checking: false });
  },
  refresh: () => set({ me: cachedMe() }),
  signOut: async () => {
    await logout();
    set({ me: null });
  },
}));
