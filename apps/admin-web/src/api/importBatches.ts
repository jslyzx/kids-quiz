import { request } from './client';

export function createImportBatch(body: { title?: string; sourceType?: string; sourceName?: string; notes?: string }): Promise<any> {
  return request<any>('/admin/import-batches', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function finishImportBatch(id: string, body: { status?: 'COMPLETED' | 'FAILED'; stats?: Record<string, unknown>; notes?: string }): Promise<any> {
  return request<any>(`/admin/import-batches/${id}/finish`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
