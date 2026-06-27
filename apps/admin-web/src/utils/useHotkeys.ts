import { useEffect } from 'react';

/* ========================================
   键盘快捷键 hook
   - 全局监听 keydown
   - 自动忽略输入框内的单键（除非带修饰键）
   用法：
     useHotkeys({
       '/': () => focusSearch(),
       'ctrl+s': (e) => { e.preventDefault(); save(); },
       'escape': () => close(),
     });
   ======================================== */

export type HotkeyHandler = (event: KeyboardEvent) => void;
export type HotkeyMap = Record<string, HotkeyHandler>;

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable;
}

export function useHotkeys(hotkeys: HotkeyMap, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const handler = (event: KeyboardEvent) => {
      const parts: string[] = [];
      if (event.ctrlKey || event.metaKey) parts.push('ctrl');
      if (event.shiftKey) parts.push('shift');
      if (event.altKey) parts.push('alt');
      const key = event.key.toLowerCase();
      parts.push(key);
      const combo = parts.join('+');

      // 带修饰键的（如 ctrl+s）即使焦点在输入框也触发
      const hasModifier = event.ctrlKey || event.metaKey || event.altKey;
      if (!hasModifier && isTypingTarget(event.target)) {
        // 输入框内只响应 escape
        if (key !== 'escape') return;
      }

      const fn = hotkeys[combo] ?? hotkeys[key];
      if (fn) fn(event);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [hotkeys, enabled]);
}
