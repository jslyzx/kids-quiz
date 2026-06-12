import { request } from './client';

export type ImportBatchSummary = {
  id: string;
  title: string;
  sourceType?: string | null;
  sourceName?: string | null;
  status: 'DRAFT' | 'IMPORTING' | 'COMPLETED' | 'FAILED';
  stats?: Record<string, unknown> | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt?: string | null;
  groupCount: number;
};

export type ImportBatchQuestion = {
  id: string;
  questionType: string;
  stem: string;
  explanation?: string | null;
  difficulty?: number | null;
  gradeLevel?: string | null;
  tags?: unknown;
  status?: string;
  createdAt: string;
  knowledgePoint?: ImportBatchKnowledgePoint | null;
  knowledgePointLinks?: ImportBatchKnowledgePointLink[];
};

export type ImportBatchKnowledgePoint = {
  id: string;
  name: string;
  path?: string | null;
};

export type ImportBatchKnowledgePointLink = {
  knowledgePoint: ImportBatchKnowledgePoint;
};

export type ImportBatchGroup = {
  id: string;
  title: string;
  groupType: string;
  difficulty?: number | null;
  gradeLevel?: string | null;
  tags?: unknown;
  status?: string;
  createdAt: string;
  knowledgePoint?: ImportBatchKnowledgePoint | null;
  knowledgePointLinks?: ImportBatchKnowledgePointLink[];
  questions: ImportBatchQuestion[];
};

export type ImportBatchDetail = ImportBatchSummary & {
  questionGroups: ImportBatchGroup[];
};

export function listImportBatches(): Promise<ImportBatchSummary[]> {
  return request<ImportBatchSummary[]>('/admin/import-batches');
}

export function getImportBatch(id: string): Promise<ImportBatchDetail> {
  return request<ImportBatchDetail>(`/admin/import-batches/${id}`);
}

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
