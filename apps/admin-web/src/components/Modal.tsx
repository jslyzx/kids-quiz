import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/* ========================================
   Modal 组件
   - role="dialog" aria-modal="true"
   - Esc 关闭
   - 简单 focus trap（Tab 在面板内循环）
   - 点击遮罩关闭（可禁用）
   ======================================== */

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  /** 底部操作区，通常放按钮 */
  footer?: ReactNode;
  /** 宽度，默认 520px */
  width?: number | string;
  /** 是否禁用遮罩点击关闭（危险确认场景建议 true） */
  disableOverlayClose?: boolean;
  /** 是否禁用 Esc 关闭 */
  disableEscapeClose?: boolean;
  /** 是否禁用 body 滚动锁 */
  disableScrollLock?: boolean;
}

const FOCUSABLE = [
  'a[href]', 'button:not([disabled])', 'textarea', 'input', 'select',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function Modal({
  open, onClose, title, description, children, footer,
  width = 520, disableOverlayClose, disableEscapeClose, disableScrollLock,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const lastFocused = useRef<HTMLElement | null>(null);

  // 锁滚动
  useEffect(() => {
    if (!open || disableScrollLock) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open, disableScrollLock]);

  // Esc 关闭
  useEffect(() => {
    if (!open || disableEscapeClose) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, disableEscapeClose, onClose]);

  // focus trap + 进入时聚焦面板
  useLayoutEffect(() => {
    if (!open) return;
    lastFocused.current = document.activeElement as HTMLElement;
    const panel = panelRef.current;
    if (!panel) return;
    const focusables = () => Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
    // 聚焦第一个可聚焦元素，没有则聚焦面板
    const first = focusables()[0];
    if (first) first.focus();
    else panel.focus();

    const onTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const items = focusables();
      if (items.length === 0) {
        e.preventDefault();
        panel.focus();
        return;
      }
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };
    panel.addEventListener('keydown', onTab);
    return () => {
      panel.removeEventListener('keydown', onTab);
      // 还原焦点
      lastFocused.current?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      className="modal-overlay rs-modal-overlay"
      onMouseDown={(e) => {
        // 只在直接点击遮罩时关闭（防止子元素冒泡误触）
        if (disableOverlayClose) return;
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        className="modal-panel rs-modal-panel"
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        tabIndex={-1}
        style={{ width: `min(${typeof width === 'number' ? `${width}px` : width}, 96vw)` }}
      >
        {(title || description) && (
          <div className="modal-header">
            <div>
              {title ? <h2>{title}</h2> : null}
              {description ? <p>{description}</p> : null}
            </div>
            <button
              type="button"
              className="modal-close-btn"
              aria-label="关闭"
              onClick={onClose}
            >×</button>
          </div>
        )}
        <div className="modal-body rs-modal-body">{children}</div>
        {footer ? <div className="rs-modal-footer">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}

/* ---- 确认对话框便捷包装（替代 window.confirm） ---- */
interface ConfirmProps {
  open: boolean;
  title?: ReactNode;
  description?: ReactNode;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  /** 关键操作要求用户输入指定文本才可确认 */
  confirmByText?: string;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  children?: ReactNode;
}

export function ConfirmDialog({
  open, title = '请确认', description, confirmText = '确定',
  cancelText = '取消', danger, confirmByText, onConfirm, onCancel, children,
}: ConfirmProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const matched = useRef(false);

  useLayoutEffect(() => {
    if (open && confirmByText) {
      matched.current = false;
      // 延迟到下一帧聚焦
      const t = window.setTimeout(() => inputRef.current?.focus(), 50);
      return () => window.clearTimeout(t);
    }
  }, [open, confirmByText]);

  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      description={description}
      width={460}
      disableOverlayClose
      footer={
        <div className="rs-modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onCancel}>{cancelText}</button>
          <button
            type="button"
            className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`}
            onClick={async () => {
              if (confirmByText) {
                const v = inputRef.current?.value?.trim();
                if (v !== confirmByText) {
                  inputRef.current?.focus();
                  inputRef.current?.setAttribute('aria-invalid', 'true');
                  return;
                }
              }
              await onConfirm();
            }}
          >{confirmText}</button>
        </div>
      }
    >
      {children}
      {confirmByText ? (
        <div className="rs-confirm-by-text">
          <label className="rs-confirm-label">
            请输入 <code>{confirmByText}</code> 以确认：
          </label>
          <input
            ref={inputRef}
            type="text"
            autoComplete="off"
            spellCheck={false}
            placeholder={confirmByText}
            onChange={(e) => {
              matched.current = e.target.value.trim() === confirmByText;
              e.currentTarget.removeAttribute('aria-invalid');
            }}
            style={{ width: '100%' }}
          />
        </div>
      ) : null}
    </Modal>
  );
}
