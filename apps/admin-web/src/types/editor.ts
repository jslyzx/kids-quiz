export type EditorMode = 'calculation' | 'fill_blank' | 'compare' | 'single_choice' | 'multiple_choice' | 'ordering' | 'matching' | 'sentence_build' | 'composite';
export type ChildType = 'fill_blank' | 'compare';
export type ChildDraftInput = { type: ChildType; stem: string; answer: string; slotType: 'number' | 'text' | 'compare_symbol'; answers?: Record<string, string>; explanationHtml?: string };
export type MaterialInput = { type: 'text' | 'table' | 'image'; title?: string; text: string };
export type SavedDraft = { id: string; name: string; updatedAt: string; state: AppState };

export type AppState = {
  mode: EditorMode;
  title: string;
  gradeLevel: string;
  difficulty: number;
  tagsText: string;
  stem: string;
  answers: Record<string, string>;
  explanationHtml: string;
  choiceStem: string;
  choiceOptionsText: string;
  choiceAnswer: string;
  calcText: string;
  calcColumns: number;
  orderingText: string;
  orderingAnswer: string;
  orderingSeparator: '>' | '<';
  matchingLeft: string;
  matchingRight: string;
  matchingAnswer: string;
  // 连词成句：每行一个词；标点行用 `#` 前缀标记，如 `#。`
  sentenceTokens: string;
  // 连词成句正确语序（逗号分隔的 key 序列，如 "1,2,3,4"）
  sentenceAnswer: string;
  commonStem: string;
  tableText: string;
  materials: MaterialInput[];
  children: ChildDraftInput[];
};
