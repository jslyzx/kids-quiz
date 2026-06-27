import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

/* ========================================
   把筛选条件同步到 URL query
   - 刷新/分享链接时保留筛选
   - 支持浏览器前进后退
   用法：
     const [keyword, setKeyword] = useUrlState('q', '');
   ======================================== */

export function useUrlState(key: string, defaultValue: string): [string, (value: string) => void] {
  const [searchParams, setSearchParams] = useSearchParams();
  const value = searchParams.get(key) ?? defaultValue;

  const setValue = useCallback((next: string) => {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        if (!next || next === defaultValue) params.delete(key);
        else params.set(key, next);
        return params;
      },
      { replace: true },
    );
  }, [key, defaultValue, setSearchParams]);

  return [value, setValue];
}
