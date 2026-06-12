import { API_BASE } from './client';

export type ApiHealth = {
  ok: boolean;
  service?: string;
  database?: string;
  checkedAt?: string;
  latencyMs?: number;
  message?: string;
};

export async function checkApiHealth(): Promise<ApiHealth> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 2500);
  try {
    const res = await fetch(`${API_BASE}/health`, {
      signal: controller.signal,
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        ok: false,
        database: data?.database,
        message: data?.message || data?.error || `HTTP ${res.status}`,
      };
    }
    return { ok: true, ...data };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error && error.name === 'AbortError'
        ? 'API 连接超时，请确认后端服务是否已启动'
        : '无法连接 API，请确认已运行 pnpm dev:api',
    };
  } finally {
    window.clearTimeout(timeout);
  }
}
