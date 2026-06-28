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
  operation?: 'addition' | 'subtraction' | 'multiplication' | 'division';
  columns?: number;
  allowedDigits?: string[];
  uniqueDigits?: boolean;
  rows: ColumnArithmeticRow[];
  carryRows?: ColumnArithmeticRow[];
  validation?: ColumnArithmeticValidation;
}

/**
 * 长除法竖式（数字谜风格：每个 token 可为固定文字 text 或可填方框 slot）
 * 每位商对应一个 step：部分积 product（除数×当前位商）、减法后的剩余 remainder（含落下的数字）
 * 布局示意（936 ÷ 4 = 234）：
 *          q3 q2 q1        ← quotient（商，从高到低）
 *        ┌────────
 *     d1 │ n3 n2 n1        ← dividend + divisor
 *         p1(=d×q3)        ← steps[0].product
 *         ─
 *         r1(落下n2)        ← steps[0].remainder
 *          p2(=d×q2)       ← steps[1].product
 *          ─
 *          r2(落下n1)       ← steps[1].remainder
 *           p3(=d×q1)      ← steps[2].product
 *           ─
 *           finalRemainder ← remainder（最终余数，整除时为 0）
 */
export interface ColumnDivisionStep {
  /** 部分积（除数 × 当前位商），向右缩进对齐到当前位 */
  product: ColumnArithmeticCell[];
  /** 本次减法后的剩余（含落下的下一位），缩进同 product */
  remainder: ColumnArithmeticCell[];
}

export interface ColumnDivisionContent {
  /** 商（从高位到低位） */
  quotient: ColumnArithmeticCell[];
  /** 除数 */
  divisor: ColumnArithmeticCell[];
  /** 被除数（从高位到低位） */
  dividend: ColumnArithmeticCell[];
  /** 最终余数；整除时填 [0] */
  remainder: ColumnArithmeticCell[];
  /** 中间步骤（每位商一个，可省略以简化展示） */
  steps?: ColumnDivisionStep[];
  /** 可填数字集合（数字谜：限定可选数字） */
  allowedDigits?: string[];
  /** 数字谜：每个数字只能用一次 */
  uniqueDigits?: boolean;
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
