import { request, setAdminSession, setStudentSession, type AdminUser } from './client';

type LoginResult = {
  accessToken: string;
  user: AdminUser;
};

export async function loginAdmin(username: string, password: string) {
  const result = await request<LoginResult>('/admin/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  setAdminSession(result.accessToken, result.user);
  try {
    const studentSession = await request<{ accessToken: string; student: unknown }>('/admin/student/session', { method: 'POST' });
    setStudentSession(studentSession.accessToken, studentSession.student);
  } catch {
    // Student-facing pages can still fall back to admin endpoints during local setup.
  }
  return result.user;
}
