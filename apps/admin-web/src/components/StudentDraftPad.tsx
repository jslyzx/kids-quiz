import { useEffect, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import { ConfirmDialog } from './Modal';
import { useToast } from './ToastProvider';

type Props = {
  storageKey: string;
  open: boolean;
  onClose: () => void;
  inline?: boolean;
};

const UNDO_LIMIT = 20;

export function StudentDraftPad({ storageKey, open, onClose, inline = false }: Props) {
  const { toast } = useToast();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const undoStackRef = useRef<string[]>([]);
  const [color, setColor] = useState('#111827');
  const [lineWidth, setLineWidth] = useState(4);
  const [gridBg, setGridBg] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);

  const pushUndo = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      // 扩到 20 步，超出按先进先出丢弃
      undoStackRef.current = [...undoStackRef.current.slice(-(UNDO_LIMIT - 1)), canvas.toDataURL('image/png')];
    } catch {
      // ignore snapshot failure
    }
  };

  const drawBackground = (width: number, height: number) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    if (!inline) {
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, width, height);
    } else {
      ctx.clearRect(0, 0, width, height);
    }
    if (!inline) {
      // 横线背景
      ctx.strokeStyle = '#e5e7eb';
      ctx.lineWidth = 1;
      for (let y = 32; y < height; y += 32) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
    } else if (gridBg) {
      // 方格背景（便于列竖式），inline 模式可开关
      ctx.strokeStyle = 'rgba(99, 102, 241, 0.18)';
      ctx.lineWidth = 1;
      const step = 36;
      for (let x = step; x < width; x += step) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = step; y < height; y += step) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
    }
  };

  const restoreFromDataUrl = (dataUrl: string) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const rect = canvas.getBoundingClientRect();
    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, rect.width, rect.height);
      ctx.drawImage(img, 0, 0, rect.width, rect.height);
      try { localStorage.setItem(storageKey, canvas.toDataURL('image/png')); } catch { /* ignore */ }
    };
    img.src = dataUrl;
  };

  const undo = () => {
    const last = undoStackRef.current.pop();
    if (!last) {
      toast.info('没有可撤销的笔画了');
      return;
    }
    restoreFromDataUrl(last);
  };

  const save = (silent = true) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      localStorage.setItem(storageKey, canvas.toDataURL('image/png'));
      if (!silent) toast.success('草稿已保存');
    } catch {
      toast.danger('草稿保存失败');
    }
  };

  const resizeAndRestore = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    const width = inline ? window.innerWidth : Math.max(320, Math.floor(parent?.clientWidth || 900));
    const height = inline ? window.innerHeight : Math.min(620, Math.max(420, Math.floor(window.innerHeight * 0.62)));
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    drawBackground(width, height);
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, width, height);
      img.src = saved;
    }
  };

  useEffect(() => {
    if (!open) return;
    undoStackRef.current = [];
    const timer = window.setTimeout(resizeAndRestore, 30);
    return () => window.clearTimeout(timer);
  }, [open, storageKey, inline]);

  useEffect(() => {
    if (!open || !inline) return;
    const oldOverflow = document.body.style.overflow;
    const oldTouchAction = document.body.style.touchAction;
    document.body.style.overflow = 'hidden';
    document.body.style.touchAction = 'none';
    return () => {
      document.body.style.overflow = oldOverflow;
      document.body.style.touchAction = oldTouchAction;
    };
  }, [open, inline]);

  useEffect(() => {
    if (!open) return;
    const onResize = () => {
      save();
      resizeAndRestore();
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [open, storageKey, inline]);

  if (!open) return null;

  const point = (event: PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const start = (event: PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    pushUndo();
    drawingRef.current = true;
    canvas.setPointerCapture(event.pointerId);
    const p = point(event);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  };

  const move = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const p = point(event);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalCompositeOperation = inline && color === '#ffffff' ? 'destination-out' : 'source-over';
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
  };

  const end = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    save();
  };

  const confirmClear = () => {
    pushUndo();
    try { localStorage.removeItem(storageKey); } catch { /* ignore */ }
    resizeAndRestore();
    setClearOpen(false);
    toast.info('草稿已清空，可点撤销恢复');
  };

  return <div className="draft-overlay" onWheel={(event) => inline && event.preventDefault()}>
    <div className="draft-panel">
      <div className="draft-head-float">
        <h2>{'\u8349\u7a3f\u672c'}</h2>
        <button className="draft-close-btn" title={'\u5173\u95ed\u8349\u7a3f'} aria-label="关闭草稿" onClick={() => { save(); onClose(); }}>{'\u2715'}</button>
      </div>
      <div className="draft-toolbar-float">
        <button title={'\u9ed1\u7b14'} aria-label="黑笔" className={`draft-tool-btn penBlack ${color === '#111827' ? 'active' : ''}`} onClick={() => setColor('#111827')}>{'\u270E'}</button>
        <button title={'\u84dd\u7b14'} aria-label="蓝笔" className={`draft-tool-btn penBlue ${color === '#2563eb' ? 'active' : ''}`} onClick={() => setColor('#2563eb')}>{'\u270E'}</button>
        <button title={'\u7ea2\u7b14'} aria-label="红笔" className={`draft-tool-btn penRed ${color === '#dc2626' ? 'active' : ''}`} onClick={() => setColor('#dc2626')}>{'\u270E'}</button>
        <button title={'\u6a61\u76ae'} aria-label="橡皮" className={`draft-tool-btn eraserIcon ${color === '#ffffff' ? 'active' : ''}`} onClick={() => { setColor('#ffffff'); setLineWidth(18); }}>{'\u{1F9FD}'}</button>
        <button title={'\u64a4\u9500'} aria-label="撤销" className="draft-tool-btn undoIcon" onClick={undo}>{'\u21B6'}</button>
        <label title={'\u7c97\u7ec6'} className="draft-size-label">
          <span aria-hidden="true">{'\u25CF'}</span>
          <input type="range" min={2} max={18} value={lineWidth} aria-label="笔触粗细" onChange={(event) => setLineWidth(Number(event.target.value))} />
        </label>
        {inline && (
          <button title={'\u65b9\u683c\u80cc\u666f'} aria-label="方格背景" className={`draft-tool-btn gridIcon ${gridBg ? 'active' : ''}`} onClick={() => { const next = !gridBg; setGridBg(next); pushUndo(); setTimeout(() => { drawBackground(window.innerWidth, window.innerHeight); }, 0); }}>{'\u{1F4D0}'}</button>
        )}
        <button title={'\u4fdd\u5b58'} aria-label="保存草稿" className="draft-tool-btn" onClick={() => save(false)}>{'\u{1F4BE}'}</button>
        <button title={'\u6e05\u7a7a\u8349\u7a3f'} aria-label="清空草稿" className="draft-tool-btn danger clearIcon" onClick={() => setClearOpen(true)}>{'\u{1F9F9}'}</button>
      </div>
      <div className="draft-canvas-wrap">
        <canvas ref={canvasRef} onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={end} />
      </div>
    </div>

    <ConfirmDialog
      open={clearOpen}
      title="清空草稿"
      danger
      confirmText="清空"
      description="确定要清空当前草稿吗？清空后仍可点击「撤销」按钮恢复（最多保留最近 20 步）。"
      onConfirm={confirmClear}
      onCancel={() => setClearOpen(false)}
    />
  </div>;
}
