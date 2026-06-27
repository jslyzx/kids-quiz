import { useEffect, useState } from 'react';

/* ========================================
   防抖值 hook：输入频繁变化的场景（如 JSON 解析、搜索）避免每次按键都重算
   ======================================== */

export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}
