import { useEffect, useMemo, useState } from 'react';

/* ========================================
   轻量分页 hook
   用于家长端可能上千条的列表，避免一次渲染全部导致卡顿。
   配合 URL query 持久化页码（可选）。
   ======================================== */

export function usePagination<T>(items: readonly T[], initialPageSize = 50) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);

  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  // 当数据变化导致当前页超出范围时，回退到最后一页
  const safePage = Math.min(page, totalPages);

  const pagedItems = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, safePage, pageSize]);

  // 数据源变化（如筛选）时回到第 1 页
  useEffect(() => {
    setPage(1);
  }, [items.length, pageSize]);

  return {
    page: safePage,
    pageSize,
    totalPages,
    total: items.length,
    pagedItems,
    setPage,
    setPageSize,
    hasNext: safePage < totalPages,
    hasPrev: safePage > 1,
  };
}
