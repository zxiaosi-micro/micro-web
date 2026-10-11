// offline.ts · 离线草稿引擎（本任务核心，02 §12.3：离线工单草稿 + client_action_id 幂等恢复同步）。
//
// 状态机（队列级 SYNCING 锁 + 单条 pending/conflict 两态）：
//
//   提交动作（accept/start/submit）
//        │ 无网（request 层 isNetworkError）或用户点"存为草稿"
//        ▼
//   ┌─────────┐ flush() 逐条重放 ┌──────────┐
//   │ pending │ ───────────────▶ │ 成功出队  │  submit 带 client_action_id：服务端幂等，
//   └─────────┘                   └──────────┘  已受理则直接返回 ok（重放成功也返回 ok），
//        │ 重试失败                     ▲        不产生重复流转日志（entry.api appSubmitTicket 契约）
//        ▼                             │
//   retries < MAX_RETRIES：留队，定时退避重试                    │
//        │ ≥ MAX_RETRIES 或业务冲突（ops 段 9xxxx 状态机拒绝）  │ 设置页"重试冲突项"
//        ▼                             │
//   ┌──────────┐ ─────────────────────┘
//   │ conflict │  仅人工处理：设置页查看/重试/删除
//   └──────────┘
//   认证错误（1040x，段 10000+）：整轮中断不计数，等 request 层重登后 app.onShow 再触发。
//
// 存储：Taro storage key `ops.draft.queue`（RN 下经 taro-rn 桥接 AsyncStorage，见 auth.ts 说明）。
// 订阅：subscribe(listener) 供工作台角标与设置页队列管理实时刷新。

import Taro from "@tarojs/taro";
import { acceptTicket, startTicket, submitTicket } from "./api";
import { ApiError, isNetworkError } from "./request";
import { isLoggedIn } from "./auth";
import type { AppSubmitTicketReq } from "@micro/shared/types/mobile-bff";

const QUEUE_KEY = "ops.draft.queue";

/** 单条草稿最大自动重试次数（超过转 conflict 等人工处理） */
export const MAX_RETRIES = 5;
/** 冲突段：ops 业务码 90000~99999（状态机拒绝/工单不存在等终态语义，重试无意义） */
const OPS_SEG_MIN = 90000;
const OPS_SEG_MAX = 100000;
/** 认证段：10000~10999（1040x）——整轮中断，等重登 */
const AUTH_SEG_MIN = 10000;
const AUTH_SEG_MAX = 11000;
/** 重试退避：30s 起步，每次翻倍，封顶 5 分钟 */
const RETRY_BASE_MS = 30_000;
const RETRY_MAX_MS = 300_000;

export type DraftAction = "accept" | "start" | "submit";

export interface DraftEntry {
  /** client_action_id：幂等键，uuid v4；入队即生成，重放全程不变（服务端据它去重） */
  client_action_id: string;
  action: DraftAction;
  ticket_id: string;
  /** submit 携带 { result }；accept/start 无业务字段（占位空对象便于统一信封） */
  payload: Record<string, unknown>;
  created_at: number;
  retries: number;
  state: "pending" | "conflict";
  last_error?: string;
}

export interface QueueSnapshot {
  /** 待同步条数（pending 态，工作台角标数据源） */
  pendingCount: number;
  /** 冲突条数（conflict 态，设置页红点） */
  conflictCount: number;
  /** flush 进行中 */
  syncing: boolean;
}

// ---- uuid v4（无第三方依赖：Math.random 伪随机，幂等键用途碰撞概率可忽略）----
// 生产加固路径：react-native-get-random-values polyfill + crypto.getRandomValues（spike 后接入）。

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function uuidv4(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ---- 队列存取 ----

function loadQueue(): DraftEntry[] {
  try {
    const raw = Taro.getStorageSync<string>(QUEUE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(isDraftEntry);
  } catch {
    return [];
  }
}

function saveQueue(queue: DraftEntry[]): void {
  Taro.setStorageSync(QUEUE_KEY, JSON.stringify(queue));
}

/** 防脏数据（旧版本/手改 storage）拖垮 flush */
function isDraftEntry(v: unknown): v is DraftEntry {
  if (typeof v !== "object" || v === null) {
    return false;
  }
  const e = v as Partial<DraftEntry>;
  return (
    typeof e.client_action_id === "string" &&
    UUID_RE.test(e.client_action_id) &&
    (e.action === "accept" || e.action === "start" || e.action === "submit") &&
    typeof e.ticket_id === "string" &&
    typeof e.created_at === "number" &&
    typeof e.retries === "number" &&
    (e.state === "pending" || e.state === "conflict")
  );
}

// ---- 订阅（工作台角标 / 设置页队列管理） ----

type Listener = (snapshot: QueueSnapshot) => void;
const listeners = new Set<Listener>();

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  listener(snapshotOf(loadQueue(), syncing));
  return () => {
    listeners.delete(listener);
  };
}

function snapshotOf(queue: DraftEntry[], syncingNow: boolean): QueueSnapshot {
  let pendingCount = 0;
  let conflictCount = 0;
  for (const e of queue) {
    if (e.state === "conflict") {
      conflictCount += 1;
    } else {
      pendingCount += 1;
    }
  }
  return { pendingCount, conflictCount, syncing: syncingNow };
}

function notify(): void {
  const snap = snapshotOf(loadQueue(), syncing);
  for (const l of listeners) {
    try {
      l(snap);
    } catch {
      // 订阅方异常不阻断引擎
    }
  }
}

// ---- 引擎状态 ----

let syncing = false;
let retryTimer: ReturnType<typeof setTimeout> | null = null;

/** 当前队列快照（同步读取，页面首次渲染用） */
export function getSnapshot(): QueueSnapshot {
  return snapshotOf(loadQueue(), syncing);
}

/**
 * 入队（生成 client_action_id 并持久化；返回幂等键供本地提示）。
 * 触发点：①工单提交捕获 isNetworkError；②工单页"存为草稿"按钮。
 * 入队后安排一次延迟重试（无网时用户可能很快恢复网络）。
 */
export function enqueueDraft(action: DraftAction, ticketId: string, payload: Record<string, unknown> = {}): string {
  const entry: DraftEntry = {
    client_action_id: uuidv4(),
    action,
    ticket_id: ticketId,
    payload,
    created_at: Date.now(),
    retries: 0,
    state: "pending",
  };
  const queue = loadQueue();
  queue.push(entry);
  saveQueue(queue);
  notify();
  scheduleRetry(RETRY_BASE_MS);
  return entry.client_action_id;
}

/** 定时重试（刷新/无网入队后兜底触发；已登录才真正 flush） */
function scheduleRetry(delayMs: number): void {
  if (retryTimer !== null) {
    return; // 已有待触发的重试
  }
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void flush();
  }, delayMs);
}

/**
 * 恢复同步 flush：逐条按入队顺序重放（串行保证同一工单动作有序）。
 * 幂等语义：submit 带 client_action_id，服务端已受理 → 直接返回 ok（重放成功也返回 ok）；
 * accept/start 为状态机动作，重放由工单状态守卫幂等（已接单再 accept 返回业务冲突 → conflict 化）。
 *
 * 返回 { done, failed }：done=本轮成功条数，failed=本轮剩余条数（网络中断中断轮）。
 */
export async function flush(): Promise<{ done: number; failed: number }> {
  if (syncing) {
    return { done: 0, failed: 0 };
  }
  if (!isLoggedIn()) {
    return { done: 0, failed: 0 }; // 未登录不动队列（重登后 app.onShow 再触发）
  }
  const queue = loadQueue();
  if (queue.every((e) => e.state === "conflict")) {
    return { done: 0, failed: 0 };
  }
  syncing = true;
  notify();
  let done = 0;
  let failed = 0;
  let sawNetworkError = false;

  try {
    for (const entry of queue) {
      if (entry.state === "conflict") {
        continue; // 冲突项仅人工处理
      }
      try {
        await dispatch(entry);
        removeEntry(entry.client_action_id);
        done += 1;
      } catch (e) {
        if (classify(e) === "auth") {
          // 认证失效：request 层正在走重登；本轮到此为止，retries 不累计
          sawNetworkError = sawNetworkError || isNetworkError(e);
          failed = countRemaining();
          return { done, failed }; // finally 会复位 syncing
        }
        if (classify(e) === "conflict") {
          markConflict(entry, e);
          continue;
        }
        // 网络失败：retries+1，整轮中断（下一轮从头再放；成功项已出队，submit 幂等不受影响）
        bumpRetries(entry, e);
        sawNetworkError = sawNetworkError || isNetworkError(e);
        failed = countRemaining();
        return { done, failed };
      }
    }
    failed = 0;
    return { done, failed };
  } finally {
    syncing = false;
    notify();
    if (sawNetworkError) {
      const backoff = Math.min(RETRY_BASE_MS * 2 ** Math.min(failed, 4), RETRY_MAX_MS);
      scheduleRetry(backoff);
    }
  }
}

/** 单条动作分发（submit 必须带 client_action_id——服务端幂等键） */
async function dispatch(entry: DraftEntry): Promise<void> {
  switch (entry.action) {
    case "accept":
      await acceptTicket(entry.ticket_id);
      return;
    case "start":
      await startTicket(entry.ticket_id);
      return;
    case "submit": {
      const req: AppSubmitTicketReq = {
        id: entry.ticket_id,
        result: typeof entry.payload["result"] === "string" ? (entry.payload["result"] as string) : "",
        client_action_id: entry.client_action_id,
      };
      await submitTicket(req);
      return;
    }
  }
}

type FailureKind = "auth" | "conflict" | "retryable";

/** 失败分类：认证段中断轮 / ops 业务段转冲突 / 其余（网络/限流/系统）可重试 */
function classify(e: unknown): FailureKind {
  if (e instanceof ApiError) {
    if (e.code >= AUTH_SEG_MIN && e.code < AUTH_SEG_MAX) {
      return "auth";
    }
    if (e.code >= OPS_SEG_MIN && e.code < OPS_SEG_MAX) {
      return "conflict";
    }
  }
  return "retryable";
}

function markConflict(entry: DraftEntry, e: unknown): void {
  const queue = loadQueue();
  const idx = queue.findIndex((q) => q.client_action_id === entry.client_action_id);
  if (idx >= 0) {
    queue[idx] = {
      ...queue[idx],
      state: "conflict",
      retries: queue[idx].retries + 1,
      last_error: e instanceof Error ? e.message : String(e),
    };
    saveQueue(queue);
    notify();
  }
}

function bumpRetries(entry: DraftEntry, e: unknown): void {
  const queue = loadQueue();
  const idx = queue.findIndex((q) => q.client_action_id === entry.client_action_id);
  if (idx >= 0) {
    const retries = queue[idx].retries + 1;
    queue[idx] = {
      ...queue[idx],
      retries,
      state: retries >= MAX_RETRIES ? "conflict" : "pending",
      last_error: e instanceof Error ? e.message : String(e),
    };
    saveQueue(queue);
    notify();
  }
}

function countRemaining(): number {
  return loadQueue().filter((e) => e.state === "pending").length;
}

function removeEntry(clientActionId: string): void {
  const queue = loadQueue().filter((e) => e.client_action_id !== clientActionId);
  saveQueue(queue);
  notify();
}

// ---- 队列管理（设置页） ----

/** 全量条目（设置页列表渲染；返回拷贝防外部误改） */
export function listEntries(): DraftEntry[] {
  return loadQueue().map((e) => ({ ...e }));
}

/** 清空队列（设置页"清空"——conflict 与 pending 一并清除，需用户确认） */
export function clearQueue(): void {
  saveQueue([]);
  notify();
}

/** 删除单条（设置页对 conflict 条目的处理） */
export function removeDraft(clientActionId: string): void {
  removeEntry(clientActionId);
}

/** 冲突项重试：state 置回 pending（retries 清零），立即 flush */
export async function retryConflicts(): Promise<void> {
  const queue = loadQueue().map((e) =>
    e.state === "conflict" ? { ...e, state: "pending" as const, retries: 0, last_error: undefined } : e,
  );
  saveQueue(queue);
  notify();
  await flush();
}

/** app.onShow / 页面 useDidShow 恢复同步入口（未登录时静默跳过） */
export function flushOnAppShow(): void {
  if (isLoggedIn()) {
    void flush();
  }
}
