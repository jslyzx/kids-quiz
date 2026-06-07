import { useEffect, useRef, useState } from 'react';
import type { PointerEvent } from 'react';

type Props = {
  storageKey: string;
  open: boolean;
  onClose: () => void;
  inline?: boolean;
};

export function StudentDraftPad({ storageKey, open, onClose, inline = false }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const undoStackRef = useRef<string[]>([]);
  const [color, setColor] = useState('#111827');
  const [lineWidth, setLineWidth] = useState(4);
  const [message, setMessage] = useState('');

  const pushUndo = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      undoStackRef.current = [...undoStackRef.current.slice(-7), canvas.toDataURL('image/png')];
    } catch {
      // ignore snapshot failure
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
      localStorage.setItem(storageKey, canvas.toDataURL('image/png'));
    };
    img.src = dataUrl;
  };

  const undo = () => {
    const last = undoStackRef.current.pop();
    if (!last) {
      setMessage('\u6ca1\u6709\u53ef\u64a4\u9500\u7684\u7b14\u8ff9');
      return;
    }
    restoreFromDataUrl(last);
    setMessage('\u5df2\u64a4\u9500');
  };

  const save = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      localStorage.setItem(storageKey, canvas.toDataURL('image/png'));
      setMessage('\u8349\u7a3f\u5df2\u4fdd\u5b58');
    } catch {
      setMessage('\u8349\u7a3f\u4fdd\u5b58\u5931\u8d25');
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
    if (!inline) {
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, width, height);
    } else {
      ctx.clearRect(0, 0, width, height);
    }
    if (!inline) {
      ctx.strokeStyle = '#e5e7eb';
      ctx.lineWidth = 1;
      for (let y = 32; y < height; y += 32) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
    }
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, width, height);
      img.src = saved;
    }
  };

  useEffect(() => {
    if (!open) return;
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

  const clear = () => {
    pushUndo();
    localStorage.removeItem(storageKey);
    resizeAndRestore();
    setMessage('\u8349\u7a3f\u5df2\u6e05\u7a7a');
  };

  return <div className="draft-overlay" onWheel={(event) => inline && event.preventDefault()}>
    <div className="draft-panel">
      <div className="draft-head-float">
        <h2>{'\u8349\u7a3f'}</h2>
        <button className="draft-close-btn" title={'\u5173\u95ed\u8349\u7a3f'} onClick={() => { save(); onClose(); }}>{'\u2715'}</button>
      </div>
      <div className="draft-toolbar-float">
        <button title={'\u9ed1\u7b14'} className={`draft-tool-btn penBlack ${color === '#111827' ? 'active' : ''}`} onClick={() => setColor('#111827')}>{'\u270E'}</button>
        <button title={'\u84dd\u7b14'} className={`draft-tool-btn penBlue ${color === '#2563eb' ? 'active' : ''}`} onClick={() => setColor('#2563eb')}>{'\u270E'}</button>
        <button title={'\u7ea2\u7b14'} className={`draft-tool-btn penRed ${color === '#dc2626' ? 'active' : ''}`} onClick={() => setColor('#dc2626')}>{'\u270E'}</button>
        <button title={'\u6a61\u76ae'} className={`draft-tool-btn eraserIcon ${color === '#ffffff' ? 'active' : ''}`} onClick={() => { setColor('#ffffff'); setLineWidth(18); }}>{'\u{1F9FD}'}</button>
        <button title={'\u64a4\u9500'} className="draft-tool-btn undoIcon" onClick={undo}>{'\u21B6'}</button>
        <label title={'\u7c97\u7ec6'}>{'\u25CF'}<input type="range" min={2} max={18} value={lineWidth} onChange={(event) => setLineWidth(Number(event.target.value))} /></label>
        <button title={'\u4fdd\u5b58'} className="draft-tool-btn" onClick={save}>{'\u{1F4BE}'}</button>
        <button title={'\u6e05\u7a7a\u8349\u7a3f'} className="draft-tool-btn danger clearIcon" onClick={clear}>{'\u{1F9F9}'}</button>
        {message && <span>{message}</span>}
      </div>
      <div className="draft-canvas-wrap">
        <canvas ref={canvasRef} onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={end} />
      </div>
    </div>
  </div>;
}
