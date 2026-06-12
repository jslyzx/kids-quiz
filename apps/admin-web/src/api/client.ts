function normalizeApiBase(value: string | undefined) {
  const next = value?.trim();
  return (next || 'http://localhost:3000').replace(/\/+$/, '');
}

export const API_BASE = normalizeApiBase(import.meta.env.VITE_API_BASE_URL);

const TOKEN_KEY = 'kidsQuiz.adminToken';
const USER_KEY = 'kidsQuiz.adminUser';
const STUDENT_TOKEN_KEY = 'kidsQuiz.studentToken';
const STUDENT_KEY = 'kidsQuiz.studentSession';

export type AdminUser = {
  id: string;
  username: string;
  displayName?: string | null;
  role: string;
};

export type StudentSession = {
  id: string;
  ownerId: string;
  name: string;
  avatarUrl?: string | null;
  grade?: string | null;
};

export function getAdminToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}

export function getStudentToken() {
  return localStorage.getItem(STUDENT_TOKEN_KEY) || '';
}

export function getStudentSession(): StudentSession | null {
  const raw = localStorage.getItem(STUDENT_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StudentSession;
  } catch {
    return null;
  }
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

export function setStudentSession(token: string, student: unknown) {
  localStorage.setItem(STUDENT_TOKEN_KEY, token);
  localStorage.setItem(STUDENT_KEY, JSON.stringify(student));
}

export function clearAdminSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function clearStudentSession() {
  localStorage.removeItem(STUDENT_TOKEN_KEY);
  localStorage.removeItem(STUDENT_KEY);
}

export function isAdminLoggedIn() {
  return Boolean(getAdminToken());
}

export function isStudentLoggedIn() {
  return Boolean(getStudentToken());
}

async function requestWithToken<T>(path: string, init: RequestInit | undefined, token: string, onUnauthorized?: () => void): Promise<T> {
  const headers = new Headers(init?.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
  });

  if (res.status === 401) {
    onUnauthorized?.();
    throw new Error('登录已失效，请重新登录');
  }
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<T>;
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  return requestWithToken<T>(path, init, getAdminToken(), clearAdminSession);
}

export async function studentRequest<T>(path: string, init?: RequestInit): Promise<T> {
  return requestWithToken<T>(path, init, getStudentToken(), clearStudentSession);
}

export async function studentOrAdminRequest<T>(studentPath: string, adminPath: string, init?: RequestInit): Promise<T> {
  if (getStudentToken()) return studentRequest<T>(studentPath, init);
  if (!getAdminToken()) {
    try {
      const res = await fetch(`${API_BASE}/student/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        const session = await res.json() as { accessToken: string; student: unknown };
        setStudentSession(session.accessToken, session.student);
        return studentRequest<T>(studentPath, init);
      }
    } catch {
      // Fall through to the existing admin-path behavior so callers keep one error path.
    }
  }
  return request<T>(adminPath, init);
}
