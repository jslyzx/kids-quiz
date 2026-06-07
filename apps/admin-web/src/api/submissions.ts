import { request, studentOrAdminRequest } from './client';
import { withSelectedStudent } from '../utils/selectedStudent';

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

export function submitStudentPaperAttempt(payload: SubmitPaperAttemptPayload): Promise<any> {
  return studentOrAdminRequest<any>('/student/submissions/paper-attempts', '/admin/submissions/paper-attempts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export function listPaperAttempts(paperId: string): Promise<any[]> {
  return request<any[]>(withSelectedStudent(`/admin/submissions/paper-attempts/${paperId}`));
}

export function listStudentPaperAttempts(paperId: string): Promise<any[]> {
  return studentOrAdminRequest<any[]>(`/student/submissions/paper-attempts/${paperId}`, `/admin/submissions/paper-attempts/${paperId}`);
}

export function listPaperPracticeAttempts(paperId: string): Promise<any[]> {
  return request<any[]>(withSelectedStudent(`/admin/submissions/practice-attempts?paperId=${encodeURIComponent(paperId)}`));
}

export function listStudentPaperPracticeAttempts(paperId: string): Promise<any[]> {
  const query = `practice-attempts?paperId=${encodeURIComponent(paperId)}`;
  return studentOrAdminRequest<any[]>(`/student/submissions/${query}`, `/admin/submissions/${query}`);
}

export function listWrongAnswers(): Promise<any[]> {
  return request<any[]>(withSelectedStudent('/admin/submissions/wrong-answers'));
}

export function listStudentWrongAnswers(): Promise<any[]> {
  return studentOrAdminRequest<any[]>('/student/submissions/wrong-answers', '/admin/submissions/wrong-answers');
}

export function getWrongStats(): Promise<any> {
  return request<any>(withSelectedStudent('/admin/submissions/wrong-stats'));
}

export function getStudentWrongStats(): Promise<any> {
  return studentOrAdminRequest<any>('/student/submissions/wrong-stats', '/admin/submissions/wrong-stats');
}

export function listPaperStats(): Promise<any[]> {
  return request<any[]>(withSelectedStudent('/admin/submissions/paper-stats'));
}

export function listStudentPaperStats(): Promise<any[]> {
  return studentOrAdminRequest<any[]>('/student/submissions/paper-stats', '/admin/submissions/paper-stats');
}

export function listTagStats(): Promise<any[]> {
  return request<any[]>(withSelectedStudent('/admin/submissions/tag-stats'));
}

export function listStudentTagStats(): Promise<any[]> {
  return studentOrAdminRequest<any[]>('/student/submissions/tag-stats', '/admin/submissions/tag-stats');
}

export function listRecentAttempts(): Promise<any[]> {
  return request<any[]>(withSelectedStudent('/admin/submissions/recent-attempts'));
}

export function listStudentRecentAttempts(): Promise<any[]> {
  return studentOrAdminRequest<any[]>('/student/submissions/recent-attempts', '/admin/submissions/recent-attempts');
}

export function listPracticeAttempts(): Promise<any[]> {
  return request<any[]>(withSelectedStudent('/admin/submissions/practice-attempts'));
}

export function listStudentPracticeAttempts(): Promise<any[]> {
  return studentOrAdminRequest<any[]>('/student/submissions/practice-attempts', '/admin/submissions/practice-attempts');
}

export function getPracticeAttempt(attemptId: string): Promise<any> {
  return request<any>(withSelectedStudent(`/admin/submissions/practice-attempts/${encodeURIComponent(attemptId)}`));
}

export function getStudentPracticeAttempt(attemptId: string): Promise<any> {
  return studentOrAdminRequest<any>(`/student/submissions/practice-attempts/${encodeURIComponent(attemptId)}`, `/admin/submissions/practice-attempts/${encodeURIComponent(attemptId)}`);
}
