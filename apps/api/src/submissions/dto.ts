export type SubmitPaperAttemptDto = {
  paperId: string | number;
  studentName?: string;
  avatarUrl?: string;
  durationSeconds?: number;
  source?: 'PAPER' | 'WRONG_RETRY';
  answers: Array<{
    questionId?: string | number;
    groupId?: string | number;
    paperId?: string | number;
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
