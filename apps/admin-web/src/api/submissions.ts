import { request } from './client';

export type SubmitPaperAttemptPayload = {
  paperId: string;
  studentName?: string;
  avatarUrl?: string;
  durationSeconds?: number;
  source?: 'PAPER' | 'WRONG_RETRY';
  answers: Array<{
    questionId?: string;
    groupId?: string;
    paperId?: string;
    answerData: unknown;
    correctData?: unknown;
    isCorrect: boolean;
    score?: number;
    maxScore?: number;
    details?: Array<{
      slotKey: string;
      studentValue: unknown;
      correctValue?: unknown;
      isCorrect: boolean;
      score?: number;
    }>;
  }>;
};

export function submitPaperAttempt(payload: SubmitPaperAttemptPayload): Promise<any> {
  return request<any>('/admin/submissions/paper-attempts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export function listPaperAttempts(paperId: string): Promise<any[]> {
  return request<any[]>(`/admin/submissions/paper-attempts/${paperId}`);
}

export function listPaperPracticeAttempts(paperId: string): Promise<any[]> {
  return request<any[]>(`/admin/submissions/practice-attempts?paperId=${encodeURIComponent(paperId)}`);
}

export function listWrongAnswers(): Promise<any[]> {
  return request<any[]>('/admin/submissions/wrong-answers');
}

export function getWrongStats(): Promise<any> {
  return request<any>('/admin/submissions/wrong-stats');
}

export function listPaperStats(): Promise<any[]> {
  return request<any[]>('/admin/submissions/paper-stats');
}

export function listTagStats(): Promise<any[]> {
  return request<any[]>('/admin/submissions/tag-stats');
}

export function listRecentAttempts(): Promise<any[]> {
  return request<any[]>('/admin/submissions/recent-attempts');
}

export function listPracticeAttempts(): Promise<any[]> {
  return request<any[]>('/admin/submissions/practice-attempts');
}

export function getPracticeAttempt(attemptId: string): Promise<any> {
  return request<any>(`/admin/submissions/practice-attempts/${encodeURIComponent(attemptId)}`);
}
