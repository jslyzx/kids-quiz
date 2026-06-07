export type FrontQuestionDraft = {
  type: 'question';
  title: string;
  gradeLevel?: string;
  difficulty?: number;
  tags?: string[];
  question: {
    question_type: string;
    stem: string;
    content?: Record<string, unknown>;
    explanation?: string;
    answer_slots: Array<{
      slot_key: string;
      slot_type: string;
      correct_answer: unknown;
      answer_rule?: Record<string, unknown>;
    }>;
  };
};

export type FrontCalculationGroupDraft = {
  type: 'calculation_group';
  title: string;
  gradeLevel?: string;
  difficulty?: number;
  tags?: string[];
  columns?: number;
  items: Array<{ stem: string; answer: string | number }>;
};

export type FrontCompositeGroupDraft = {
  type: 'composite_group';
  title: string;
  gradeLevel?: string;
  difficulty?: number;
  tags?: string[];
  commonStem?: string;
  table?: unknown;
  materials?: unknown;
  children: FrontQuestionDraft['question'][];
};

export type SaveQuestionGroupDto = FrontQuestionDraft | FrontCalculationGroupDraft | FrontCompositeGroupDraft;

