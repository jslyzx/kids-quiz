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
    const timer = window.setInterval(() => void refresh(), 15000);
    const onFocus = () => void refresh();
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  if (!visible || health?.ok) return null;

  return <div className="apiStatusBanner">
    <div>
      <b>后端 API 未连接</b>
      <span>{health?.message || '请先启动后端服务'}</span>
    </div>
    <code>pnpm dev:api</code>
    <button onClick={() => void refresh()}>重新检测</button>
  </div>;
}
