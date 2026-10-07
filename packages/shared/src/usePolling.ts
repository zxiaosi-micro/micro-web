// usePolling.ts · 统一轮询 Hook（shared 核心四件之四；02 §7.5 实时性定稿）。
//
// 行为约定（S3-04）：
//   - 默认 10s 间隔轮询 fetcher；
//   - 页面隐藏（visibilitychange hidden）暂停，回前台立即拉一次并恢复；
//   - 手动 refresh()：操作后立即刷新（增删改后调用，不等下一个周期）。
//
// 设计取舍：不叠加重试/退避——列表数据下一次轮询自然收敛；网络错误保留上次数据 + error 态。

import { useCallback, useEffect, useRef, useState } from "react";

export interface UsePollingOptions {
  /** 轮询间隔 ms（默认 10000；configcenter admin-bff/polling.yml 可调，S4 接入） */
  intervalMs?: number;
  /** 是否启用（false 完全停止） */
  enabled?: boolean;
}

export interface UsePollingResult<T> {
  data: T | null;
  error: Error | null;
  loading: boolean;
  /** 手动刷新（操作后立即调用） */
  refresh: () => void;
}

export function usePolling<T>(fetcher: () => Promise<T>, options: UsePollingOptions = {}): UsePollingResult<T> {
  const intervalMs = options.intervalMs ?? 10_000;
  const enabled = options.enabled ?? true;

  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(false);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inFlight = useRef(false);

  const run = useCallback(async () => {
    if (inFlight.current) {
      return; // 上一次未完成则跳过本轮（慢请求不堆积）
    }
    inFlight.current = true;
    setLoading(true);
    try {
      const result = await fetcherRef.current();
      setData(result);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    void run();
    timerRef.current = setInterval(() => {
      if (document.visibilityState === "visible") {
        void run();
      }
    }, intervalMs);

    // 回前台立即拉一次
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void run();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, intervalMs, run]);

  const refresh = useCallback(() => {
    void run();
  }, [run]);

  return { data, error, loading, refresh };
}
