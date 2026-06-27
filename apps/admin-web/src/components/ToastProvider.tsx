import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

/* ========================================
   Toast 系统
   全局轻量通知：自动消失、队列、可手动关闭
   ======================================== */

export type ToastType = 'info' | 'success' | 'warning' | 'danger' | 'loading';

interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
  duration: number; // 0 = 不自动关闭（loading）
  closing?: boolean;
}

interface ToastContextValue {
  toast: {
    info: (msg: string, duration?: number) => number;
    success: (msg: string, duration?: number) => number;
    warning: (msg: string, duration?: number) => number;
    danger: (msg: string, duration?: number) => number;
    loading: (msg: string) => number;
    dismiss: (id?: number) => void;
    update: (id: number, patch: Partial<Omit<ToastItem, 'id'>>) => void;
  };
}
const ToastContext = createContext<ToastContextValue | null>(null);

const ICONS: Record<ToastType, string> = {
  info: 'ℹ️',
  success: '✅',
  warning: '⚠️',
  danger: '⛔',
  loading: '',
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seqRef = useRef(0);

  const dismiss = useCallback((id?: number) => {
    setItems((prev) => {
      if (id === undefined) return [];
      const target = prev.find((it) => it.id === id);
      if (!target) return prev;
      // 先标记 closing 让动画播完再移除
      return prev.map((it) => (it.id === id ? { ...it, closing: true } : it));
    });
    if (id !== undefined) {
      window.setTimeout(() => {
        setItems((prev) => prev.filter((it) => it.id !== id));
      }, 220);
    }
  }, []);

  const push = useCallback((type: ToastType, message: string, duration: number): number => {
    seqRef.current += 1;
    const id = seqRef.current;
    setItems((prev) => [...prev, { id, type, message, duration }]);
    if (duration > 0) {
      window.setTimeout(() => dismiss(id), duration);
    }
    return id;
  }, [dismiss]);

  const update = useCallback((id: number, patch: Partial<Omit<ToastItem, 'id'>>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
    if (patch.duration && patch.duration > 0) {
      window.setTimeout(() => dismiss(id), patch.duration);
    }
  }, [dismiss]);

  const value = useMemo<ToastContextValue>(() => {
    const api = {
      info: (m: string, d = 3200): number => push('info', m, d),
      success: (m: string, d = 2600): number => push('success', m, d),
      warning: (m: string, d = 4000): number => push('warning', m, d),
      danger: (m: string, d = 5000): number => push('danger', m, d),
      loading: (m: string): number => push('loading', m, 0),
      dismiss,
      update,
    };
    return { toast: api };
  }, [push, dismiss, update]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport items={items} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

function ToastViewport({ items, onDismiss }: { items: ToastItem[]; onDismiss: (id: number) => void }) {
  return (
    <div className="toast-viewport" role="region" aria-label="通知" aria-live="polite">
      {items.map((it) => (
        <div
          key={it.id}
          className={`toast-item toast-item--${it.type}${it.closing ? ' is-closing' : ''}`}
          role="status"
        >
          {it.type === 'loading'
            ? <span className="toast-spinner" aria-hidden="true" />
            : <span className="toast-icon" aria-hidden="true">{ICONS[it.type]}</span>}
          <span className="toast-text">{it.message}</span>
          <button
            type="button"
            className="toast-close"
            aria-label="关闭通知"
            onClick={() => onDismiss(it.id)}
          >×</button>
        </div>
      ))}
    </div>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // 容错：在 Provider 外调用时降级为 console，避免页面崩
    const noop = (): void => undefined;
    const noopNum = (): number => -1;
    return {
      toast: {
        info: (m: string) => { console.info(m); return -1; },
        success: (m: string) => { console.info(m); return -1; },
        warning: (m: string) => { console.warn(m); return -1; },
        danger: (m: string) => { console.error(m); return -1; },
        loading: (m: string) => { console.info(m); return -1; },
        dismiss: noop,
        update: noop,
      },
    };
    void noopNum;
  }
  return ctx;
}

/* ---- 便捷 hook：异步操作的 loading→success/danger 切换 ---- */
export function useToastAsync() {
  const { toast } = useToast();
  return useCallback(async <T,>(fn: () => Promise<T>, opts: {
    loading?: string;
    success?: string | ((res: T) => string);
    danger?: string | ((err: unknown) => string);
  } = {}): Promise<T> => {
    const id: number | null = opts.loading ? toast.loading(opts.loading) : null;
    try {
      const res = await fn();
      if (id !== null) {
        const msg = typeof opts.success === 'function' ? opts.success(res) : opts.success;
        if (msg) toast.update(id, { type: 'success', message: msg, duration: 2600 });
        else toast.dismiss(id);
      } else if (opts.success) {
        const msg = typeof opts.success === 'function' ? opts.success(res) : opts.success;
        toast.success(msg);
      }
      return res;
    } catch (err) {
      const msg = typeof opts.danger === 'function' ? opts.danger(err) : (opts.danger || (err instanceof Error ? err.message : '操作失败'));
      if (id !== null) toast.update(id, { type: 'danger', message: msg, duration: 5000 });
      else toast.danger(msg);
      throw err;
    }
  }, [toast]);
}

/* ---- 简单 hook 包装，方便在组件外（如 router）触发 ---- */
export function useEscapeStackDismiss() {
  const { toast } = useToast();
  useEffect(() => () => toast.dismiss(), [toast]);
}
