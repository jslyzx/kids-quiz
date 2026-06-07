export type QuestionType =
  | 'calculation_group'
  | 'composite_group'
  | 'fill_blank'
  | 'single_choice'
  | 'multiple_choice'
  | 'true_false'
  | 'ordering'
  | 'matching'
  | 'word_problem';

export type SlotType =
  | 'text'
  | 'number'
  | 'expression'
  | 'choice'
  | 'match'
  | 'order'
  | 'compare_symbol';

export interface AnswerSlot {
  slot_key: string;
  slot_type: SlotType;
  correct_answer: unknown[] | Record<string, unknown>[];
  answer_rule?: Record<string, unknown>;
  placeholder?: string;
  unit?: string;
  score?: number;
}

export interface ChoiceOption {
  key: string;
  text: string;
}

export interface OrderingItem {
  key: string;
  label: string;
  value: string;
}

export interface MatchingItem {
  key: string;
  text: string;
}

export interface TableMaterial {
  headers: string[];
  rows: string[][];
}

export interface QuestionDraft {
  id?: string;
  question_type: QuestionType;
  stem: string;
  content?: Record<string, unknown>;
  answer_slots: AnswerSlot[];
  score?: number;
  explanation?: string;
}

export interface QuestionGroupDraft {
  title: string;
  group_type: 'practice_set' | 'worksheet_section' | 'mental_math' | 'fill_blank_group' | 'matching_group' | 'composite';
  common_stem?: string;
  content?: {
    table?: TableMaterial;
    children?: QuestionDraft[];
    [key: string]: unknown;
  };
  questions: QuestionDraft[];
}
