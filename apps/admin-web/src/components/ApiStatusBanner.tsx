import { useEffect, useState } from 'react';
import { checkApiHealth, type ApiHealth } from '../api/health';

export function ApiStatusBanner() {
  const [health, setHealth] = useState<ApiHealth | null>(null);
  const [visible, setVisible] = useState(false);

  const refresh = async () => {
    const next = await checkApiHealth();
    setHealth(next);
    setVisible(!next.ok);
  };

  useEffect(() => {
    void refresh();
    let timer: number | null = null;
    const start = () => {
      if (timer !== null) return;
      timer = window.setInterval(() => void refresh(), 15000);
    };
    const stop = () => {
      if (timer === null) return;
      window.clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => {
      // 页面隐藏时停止轮询，避免后台无谓请求；可见时立即刷新并恢复轮询
      if (document.hidden) {
        stop();
      } else {
        void refresh();
        start();
      }
    };
    const onFocus = () => { void refresh(); start(); };
    const onBlur = () => stop();

    if (!document.hidden) start();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onFocus);
    window.addEventListener('blur', onBlur);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  if (!visible || health?.ok) return null;

  return <div className="api-status-banner">
    <div>
      <b>后端 API 未连接</b>
      <span>{health?.message || '请先启动后端服务'}</span>
    </div>
    <code>pnpm dev:api</code>
    <button onClick={() => void refresh()}>重新检测</button>
  </div>;
}
