// permission.ts · 按钮级权限判定（shared 核心四件之三）。
//
// 权限数据源：/auth/me 的 perms（auth_cache 快照，BFF 每请求 GET，降权即时生效）。
// React 消费：<Perm code="system:user:create">{children}</Perm> 或 usePerm()。

import type { ReactNode } from "react";
import { cachedMe } from "./auth";
import type { MeResp } from "../types/admin-bff";

/** 当前用户权限码集合（登录后由 App 布局调用 refresh） */
let perms: Set<string> = new Set();
let loaded = false;

export function refreshPerms(me?: MeResp | null): void {
  const source = me ?? cachedMe();
  perms = new Set(source?.perms ?? []);
  loaded = true;
}

export function hasPerm(code: string): boolean {
  if (!loaded) {
    refreshPerms();
  }
  return perms.has(code);
}

export function hasAnyPerm(...codes: string[]): boolean {
  return codes.some((c) => hasPerm(c));
}

/** 权限包装组件（antd 兼容；无权限渲染 null） */
export function Perm(props: { code: string; children: ReactNode }): ReactNode {
  return hasPerm(props.code) ? props.children : null;
}
