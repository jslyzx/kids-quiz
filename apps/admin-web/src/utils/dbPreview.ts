import type { QuestionDraft } from '@kids-quiz/shared-types';

function dbSlotTypeToFront(value: string) {
  const map: Record<string, string> = {
    TEXT: 'text',
    NUMBER: 'number',
    EXPRESSION: 'expression',
    CHOICE: 'choice',
    MATCH: 'match',
    ORDER: 'order',
    COMPARE_SYMBOL: 'compare_symbol',
  };
  return map[value] ?? 'text';
}

function dbQuestionTypeToFront(value: string) {
  const map: Record<string, string> = {
    CALCULATION: 'calculation',
    FILL_BLANK: 'fill_blank',
    SINGLE_CHOICE: 'single_choice',
    MULTIPLE_CHOICE: 'multiple_choice',
    TRUE_FALSE: 'true_false',
    MATCHING: 'matching',
    ORDERING: 'ordering',
    WORD_PROBLEM: 'word_problem',
  };
  return map[value] ?? 'fill_blank';
}

export function dbQuestionToPreview(question: any): QuestionDraft {
  return {
    id: String(question.id),
    question_type: dbQuestionTypeToFront(question.questionType) as QuestionDraft['question_type'],
    stem: question.stem ?? '',
    content: question.content ?? undefined,
    explanation: question.explanation ?? undefined,
    answer_slots: (question.answerSlots ?? []).map((slot: any) => ({
      slot_key: slot.slotKey,
      slot_type: dbSlotTypeToFront(slot.slotType),
      correct_answer: Array.isArray(slot.correctAnswer) ? slot.correctAnswer : [slot.correctAnswer],
      answer_rule: slot.answerRule ?? undefined,
    })),
  };
}

export function dbGroupToPreviewDraft(group: any) {
  const questions = group.questions ?? [];
  if (group.groupType === 'MENTAL_MATH') {
    return {
      type: 'calculation_group',
      title: group.title,
      columns: group.content?.columns ?? 4,
      items: questions.map((q: any) => ({
        stem: q.stem,
        answer: Array.isArray(q.answerSlots?.[0]?.correctAnswer) ? q.answerSlots[0].correctAnswer[0] ?? '' : '',
      })),
    };
  }

  if (group.groupType === 'COMPOSITE') {
    return {
      type: 'composite_group',
      title: group.title,
      commonStem: group.commonStem,
      table: group.content?.table,
      materials: group.content?.materials,
      children: questions.map(dbQuestionToPreview),
    };
  }

  return {
    type: 'question',
    title: group.title,
    question: dbQuestionToPreview(questions[0] ?? {}),
  };
}
