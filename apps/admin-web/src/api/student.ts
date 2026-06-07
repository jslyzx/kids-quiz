import { request } from './client';

export function getStudentProfile(): Promise<any> {
  return request<any>('/admin/student/profile');
}

export function saveStudentProfile(data: { name?: string; avatarUrl?: string; grade?: string }): Promise<any> {
  return request<any>('/admin/student/profile', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export function getTaskSettings(): Promise<any> {
  return request<any>('/admin/student/task-settings');
}

export function saveTaskSettings(data: unknown): Promise<any> {
  return request<any>('/admin/student/task-settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export function getRewards(): Promise<any> {
  return request<any>('/admin/student/rewards');
}

export function saveRewards(data: unknown): Promise<any> {
  return request<any>('/admin/student/rewards', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}
