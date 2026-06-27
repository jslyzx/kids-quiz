export type QuestionType =
  | 'calculation_group'
  | 'composite_group'
  | 'fill_blank'
  | 'single_choice'
  | 'multiple_choice'
  | 'ordering'
  | 'matching'
  | 'sentence_build'
  // 以下两类仅用于导入兼容，录入侧不再产生新数据：
  // - true_false 复用 single_choice 渲染（两选项：对/错）
  // - word_problem 复用 fill_blank 渲染
  | 'true_false'
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

/** 连词成句的词块（标点作为独立词块参与排列） */
export interface SentenceToken {
  key: string;
  text: string;
  /** 是否为标点（仅影响渲染样式，不参与判分） */
  isPunct?: boolean;
}

export interface MatchingItem {
  key: string;
  text: string;
}

export type ColumnArithmeticCell = null | {
  text?: string;
  slot?: string;
};

export interface ColumnArithmeticRow {
  role?: 'carry' | 'borrow' | 'operand' | 'result' | 'note';
  operator?: '+' | '-' | 'x' | '×' | '*';
  cells: ColumnArithmeticCell[];
}

export interface ColumnArithmeticValidation {
  mode?: 'expression';
  operands?: string[][];
  result?: string[];
}

export interface ColumnArithmeticContent {
  operation?: 'addition' | 'subtraction' | 'multiplication';
  columns?: number;
  allowedDigits?: string[];
  uniqueDigits?: boolean;
  rows: ColumnArithmeticRow[];
  carryRows?: ColumnArithmeticRow[];
  validation?: ColumnArithmeticValidation;
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
