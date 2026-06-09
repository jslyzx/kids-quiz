import { request, setStudentSession, studentOrAdminRequest } from './client';
import { withSelectedStudent } from '../utils/selectedStudent';

export type LoginStudent = {
  id: string;
  name: string;
  avatarUrl?: string | null;
  grade?: string | null;
  pinEnabled: boolean;
};

export type ManagedStudent = LoginStudent & {
  status: 'ENABLED' | 'DISABLED' | 'DELETED';
  totalStars: number;
  streakDays: number;
  lastPracticeDate?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type RewardCatalogItem = {
  id: string;
  title: string;
  cost: number;
  description?: string;
  enabled: boolean;
};

export type RewardRedemption = {
  id: string;
  rewardId: string;
  title: string;
  cost: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  requestedAt: string;
  confirmedAt?: string;
};

export type EntertainmentSessionState = {
  date: string;
  enabled: boolean;
  allowedGames: string[];
  dailyLimitSeconds: number;
  usedSeconds: number;
  remainingSeconds: number;
  locked: boolean;
  serverNow: string;
};

export function getStudentProfile(): Promise<any> {
  return request<any>(withSelectedStudent('/admin/student/profile'));
}

export function listManagedStudents(): Promise<ManagedStudent[]> {
  return request<ManagedStudent[]>('/admin/student/students');
}

export function createManagedStudent(data: { name: string; avatarUrl?: string; grade?: string; pin?: string }): Promise<ManagedStudent> {
  return request<ManagedStudent>('/admin/student/students', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export function updateManagedStudent(id: string, data: { name?: string; avatarUrl?: string; grade?: string; status?: 'ENABLED' | 'DISABLED' }): Promise<ManagedStudent> {
  return request<ManagedStudent>(`/admin/student/students/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export function updateManagedStudentPin(id: string, pin: string): Promise<ManagedStudent> {
  return request<ManagedStudent>(`/admin/student/students/${id}/pin`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin }),
  });
}

export function deleteManagedStudent(id: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(`/admin/student/students/${id}`, { method: 'DELETE' });
}

export async function createStudentSessionFromAdmin(studentId?: string): Promise<any> {
  const result = await request<{ accessToken: string; student: unknown }>('/admin/student/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(studentId ? { studentId } : {}),
  });
  setStudentSession(result.accessToken, result.student);
  return result.student;
}

export function listLoginStudents(ownerUsername = 'admin'): Promise<LoginStudent[]> {
  return request<LoginStudent[]>(`/student/students?ownerUsername=${encodeURIComponent(ownerUsername)}`);
}

export async function loginStudent(data: { ownerUsername?: string; studentId?: string; studentName?: string; pin?: string }): Promise<any> {
  const result = await request<{ accessToken: string; student: unknown }>('/student/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  setStudentSession(result.accessToken, result.student);
  return result.student;
}

export function getChildStudentProfile(): Promise<any> {
  return studentOrAdminRequest<any>('/student/profile', '/admin/student/profile');
}

export function saveStudentProfile(data: { name?: string; avatarUrl?: string; grade?: string }): Promise<any> {
  return request<any>(withSelectedStudent('/admin/student/profile'), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export function saveChildStudentProfile(data: { name?: string; avatarUrl?: string; grade?: string }): Promise<any> {
  return studentOrAdminRequest<any>('/student/profile', '/admin/student/profile', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export function getTaskSettings(): Promise<any> {
  return request<any>(withSelectedStudent('/admin/student/task-settings'));
}

export function getChildTaskSettings(): Promise<any> {
  return studentOrAdminRequest<any>('/student/task-settings', '/admin/student/task-settings');
}

export function saveTaskSettings(data: unknown): Promise<any> {
  return request<any>(withSelectedStudent('/admin/student/task-settings'), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export function getChildEntertainmentSession(): Promise<EntertainmentSessionState> {
  return studentOrAdminRequest<EntertainmentSessionState>('/student/entertainment-session', withSelectedStudent('/admin/student/entertainment-session'));
}

export function getEntertainmentSession(): Promise<EntertainmentSessionState> {
  return request<EntertainmentSessionState>(withSelectedStudent('/admin/student/entertainment-session'));
}

export function addChildEntertainmentUsage(addSeconds: number): Promise<EntertainmentSessionState> {
  return studentOrAdminRequest<EntertainmentSessionState>('/student/entertainment-session/usage', withSelectedStudent('/admin/student/entertainment-session/usage'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ addSeconds }),
  });
}

export function resetEntertainmentUsage(): Promise<EntertainmentSessionState> {
  return request<EntertainmentSessionState>(withSelectedStudent('/admin/student/entertainment-session/reset'), { method: 'POST' });
}

export function getRewards(): Promise<any> {
  return request<any>(withSelectedStudent('/admin/student/rewards'));
}

export function getChildRewards(): Promise<any> {
  return studentOrAdminRequest<any>('/student/rewards', '/admin/student/rewards');
}

export function saveRewards(data: unknown): Promise<any> {
  return request<any>(withSelectedStudent('/admin/student/rewards'), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export function saveRewardCatalog(catalog: RewardCatalogItem[]): Promise<any> {
  return request<any>(withSelectedStudent('/admin/student/rewards/catalog'), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ catalog }),
  });
}

export function requestRewardRedemption(rewardId: string): Promise<any> {
  return studentOrAdminRequest<any>('/student/rewards/redemptions', '/admin/student/rewards', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rewardId }),
  });
}

export function confirmRewardRedemption(id: string, status: 'APPROVED' | 'REJECTED'): Promise<any> {
  return request<any>(withSelectedStudent(`/admin/student/rewards/redemptions/${encodeURIComponent(id)}/confirm`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
}
