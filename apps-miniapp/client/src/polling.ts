// polling.ts · 小程序统一轮询 Hook（02 §8.7 轮询规范：10s + 页面隐藏自动暂停 + 回前台立即拉一次 + 操作后手动刷新）。
//
// weapp 实现：Taro 页面级 useDidShow / useDidHide（页面 onShow/onHide）——
//   - useDidShow：页面可见 → 立即拉一次 + 启动 interval；
//   - useDidHide：页面不可见（跳转他页/切后台）→ 停 interval，防后台耗电与请求堆积；
// 与 shared/src/usePolling.ts（Web visibilitychange 版）同语义。禁止页面自造 setInterval（02 §8.7）。

import { useCallback, useEffect, useRef, useState } from "react";
import { useDidHide, useDidShow } from "@tarojs/taro";

/** 轮询配置项 */
export interface UsePollingOptions {
  /** 轮询间隔 ms（默认 10000；configcenter mobile-bff/polling.yml 可调） */
  intervalMs?: number;
  /** 是否启用（false 完全停止；静态开关，动态启停请用 enabled + 页面显隐组合） */
  enabled?: boolean;
}

/** 轮询状态（失败保留上次 data + error 态） */
export interface UsePollingResult<T> {
  data: T | null;
  error: Error | null;
  loading: boolean;
  /** 手动刷新（操作后立即调用，不等下一个周期） */
  refresh: () => void;
}

/** 小程序轮询 Hook（useDidShow/useDidHide 显隐暂停，页面栈返回自动恢复） */
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
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

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
      // 网络错误保留上次数据 + error 态，下一次轮询自然收敛（不叠加重试/退避）
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
      inFlight.current = false;
    }
  }, []);

  const stop = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const start = useCallback(() => {
    if (!enabledRef.current || timerRef.current !== null) {
      return;
    }
    timerRef.current = setInterval(() => {
      void run();
    }, intervalMs);
  }, [intervalMs, run]);

  // 页面显示：立即拉一次 + 启动轮询
  useDidShow(() => {
    if (!enabledRef.current) {
      return;
    }
    void run();
    start();
  });

  // 页面隐藏：停轮询（跳转他页/切后台均触发）
  useDidHide(() => {
    stop();
  });

  // 卸载兜底 + enabled 动态关闭时同步停止
  useEffect(() => {
    if (!enabled) {
      stop();
    }
    return stop;
  }, [enabled, stop]);

  const refresh = useCallback(() => {
    void run();
  }, [run]);

  return { data, error, loading, refresh };
}
