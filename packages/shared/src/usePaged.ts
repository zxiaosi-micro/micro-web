// usePaged.ts · 列表分页统一 Hook（S3-04：分页上限 100 与后端同源约束）。

import { useCallback, useState } from "react";
import { usePolling } from "./usePolling";

export const PAGE_SIZE_MAX = 100;

export interface PageParams {
  page: number;
  size: number;
}

export interface PagedResp<T> {
  list: T[];
  total: number;
}

export interface UsePagedResult<T> {
  list: T[];
  total: number;
  page: number;
  size: number;
  loading: boolean;
  error: Error | null;
  setPage: (page: number) => void;
  setSize: (size: number) => void;
  refresh: () => void;
}

/** 列表分页轮询（fetcher 接收归一后的分页参数） */
export function usePaged<T>(fetcher: (p: PageParams) => Promise<PagedResp<T>>, size = 20): UsePagedResult<T> {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(Math.min(size, PAGE_SIZE_MAX));

  const fetch = useCallback(() => fetcher({ page, size: pageSize }), [fetcher, page, pageSize]);
  const { data, error, loading, refresh } = usePolling<PagedResp<T>>(fetch);

  const setSize = useCallback((s: number) => {
    setPageSize(Math.min(Math.max(1, s), PAGE_SIZE_MAX));
    setPage(1);
  }, []);

  return {
    list: data?.list ?? [],
    total: data?.total ?? 0,
    page,
    size: pageSize,
    loading,
    error,
    setPage,
    setSize,
    refresh,
  };
}
