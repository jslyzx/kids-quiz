import { request, setAdminSession, type AdminUser } from './client';

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
  return result.user;
}
