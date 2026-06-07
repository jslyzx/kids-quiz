export const API_BASE = 'http://localhost:3000';

const TOKEN_KEY = 'kidsQuiz.adminToken';
const USER_KEY = 'kidsQuiz.adminUser';

export type AdminUser = {
  id: string;
  username: string;
  displayName?: string | null;
  role: string;
};

export function getAdminToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}

export function getAdminUser(): AdminUser | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AdminUser;
  } catch {
    return null;
  }
}

export function setAdminSession(token: string, user: AdminUser) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearAdminSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function isAdminLoggedIn() {
  return Boolean(getAdminToken());
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getAdminToken();
  const headers = new Headers(init?.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
  });

  if (res.status === 401) {
    clearAdminSession();
    throw new Error('登录已失效，请重新登录');
  }
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<T>;
}
