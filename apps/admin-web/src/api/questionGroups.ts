import { request, studentOrAdminRequest } from './client';

export function listQuestionGroups(options?: { includeDisabled?: boolean; limit?: number }): Promise<any[]> {
  const params = new URLSearchParams();
  if (options?.includeDisabled) params.set('includeDisabled', '1');
  if (options?.limit) params.set('limit', String(options.limit));
  const qs = params.toString() ? `?${params.toString()}` : '';
  return request<any[]>(`/admin/question-groups${qs}`);
}

export function listStudentQuestionGroups(): Promise<any[]> {
  return studentOrAdminRequest<any[]>('/student/question-groups', '/admin/question-groups');
}

export function exportQuestionBank(): Promise<any> {
  return request<any>('/admin/question-groups/export/all');
}

export function getQuestionGroup(id: string): Promise<any> {
  return request<any>(`/admin/question-groups/${id}`);
}

export function getStudentQuestionGroup(id: string): Promise<any> {
  return studentOrAdminRequest<any>(`/student/question-groups/${id}`, `/admin/question-groups/${id}`);
}

export function saveQuestionGroup(draft: unknown): Promise<any> {
  return request<any>('/admin/question-groups', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(draft),
  });
}

export function updateQuestionGroup(id: string, draft: unknown): Promise<any> {
  return request<any>(`/admin/question-groups/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(draft),
  });
}

export function updateQuestionGroupStatus(id: string, status: 'ENABLED' | 'DISABLED'): Promise<any> {
  return request<any>(`/admin/question-groups/${id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
}

export function bulkUpdateQuestionGroupStatus(ids: string[], status: 'ENABLED' | 'DISABLED'): Promise<{ ok: boolean; count: number; status: string }> {
  return request<{ ok: boolean; count: number; status: string }>('/admin/question-groups/bulk/status', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids, status }),
  });
}

export function bulkAddQuestionGroupTags(ids: string[], tags: string[]): Promise<{ ok: boolean; count: number; tags: string[] }> {
  return request<{ ok: boolean; count: number; tags: string[] }>('/admin/question-groups/bulk/tags', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids, tags }),
  });
}

export function bulkRemoveQuestionGroupTags(ids: string[], tags: string[]): Promise<{ ok: boolean; count: number; tags: string[] }> {
  return request<{ ok: boolean; count: number; tags: string[] }>('/admin/question-groups/bulk/tags/remove', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids, tags }),
  });
}

export function bulkApplyQuestionGroupDefaults(ids: string[], options?: { gradeLevel?: string; addMissingTags?: boolean }): Promise<{ ok: boolean; count: number; gradeFixed: number; tagFixed: number; gradeLevel: string }> {
  return request<{ ok: boolean; count: number; gradeFixed: number; tagFixed: number; gradeLevel: string }>('/admin/question-groups/bulk/defaults', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids, ...(options ?? {}) }),
  });
}

export function bulkNormalizeLegacyQuestionGroups(ids: string[]): Promise<{ ok: boolean; count: number; groupFixed: number; questionFixed: number; slotFixed: number; optionFixed: number }> {
  return request<{ ok: boolean; count: number; groupFixed: number; questionFixed: number; slotFixed: number; optionFixed: number }>('/admin/question-groups/bulk/normalize-legacy', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  });
}

export function deleteQuestionGroup(id: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(`/admin/question-groups/${id}`, { method: 'DELETE' });
}
