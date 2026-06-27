-- 20260617 新增题型：连词成句（SENTENCE_BUILD）
-- 词块（含标点）按正确语序排列，slot_type 复用 ORDER，判分逻辑无需改动。
-- 仅需扩展 question_type ENUM。

ALTER TABLE `questions`
  MODIFY COLUMN `question_type` ENUM(
    'CALCULATION', 'FILL_BLANK', 'SINGLE_CHOICE', 'MULTIPLE_CHOICE',
    'TRUE_FALSE', 'MATCHING', 'ORDERING', 'SENTENCE_BUILD',
    'WORD_PROBLEM', 'COMPOSITE_CHILD'
  ) NOT NULL;
