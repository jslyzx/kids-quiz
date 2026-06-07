import { request, studentOrAdminRequest } from './client';

export function listPapers(): Promise<any[]> {
  return request<any[]>('/admin/papers');
}

export function getPaper(id: string): Promise<any> {
  return request<any>(`/admin/papers/${id}`);
}

export function listStudentPapers(): Promise<any[]> {
  return studentOrAdminRequest<any[]>('/student/papers', '/admin/papers');
}

export function getStudentPaper(id: string): Promise<any> {
  return studentOrAdminRequest<any>(`/student/papers/${id}`, `/admin/papers/${id}`);
}

export function createPaper(data: { title: string; description?: string }): Promise<any> {
  return request<any>('/admin/papers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export function updatePaper(id: string, data: { title?: string; description?: string }): Promise<any> {
  return request<any>(`/admin/papers/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export function deletePaper(id: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(`/admin/papers/${id}`, { method: 'DELETE' });
}

export function smartGeneratePaper(data: { title: string; description?: string; count?: number; keyword?: string; gradeLevel?: string; tag?: string; maxDifficulty?: number }): Promise<any> {
  return request<any>('/admin/papers/smart-generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export function addPaperQuestionGroup(paperId: string, groupId: string): Promise<any> {
  return request<any>(`/admin/papers/${paperId}/question-groups`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ groupId }),
  });
}

export function removePaperItem(paperId: string, itemId: string): Promise<any> {
  return request<any>(`/admin/papers/${paperId}/items/${itemId}`, { method: 'DELETE' });
}

export function reorderPaperItems(paperId: string, itemIds: string[]): Promise<any> {
  return request<any>(`/admin/papers/${paperId}/items/reorder`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ itemIds }),
  });
}
