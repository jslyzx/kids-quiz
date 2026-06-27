-- 20260617 选择题选项表新增 is_correct 字段
-- 用于把"正确选项"从运行时比对 content.options 与 answer_slots.correct_answer，
-- 改为存储时直接确立，便于 SQL 查询/统计，并消除"改选项忘改答案"的不一致。
-- 历史选项默认 false（不视为正确），后续可通过回填脚本从 answer_slots 推导补全。

ALTER TABLE `question_options`
  ADD COLUMN `is_correct` TINYINT(1) NOT NULL DEFAULT 0 AFTER `content`;

-- 回填：根据 answer_slots.choice 类型的 correct_answer 标记历史正确选项
UPDATE `question_options` opt
INNER JOIN `answer_slots` slot ON slot.question_id = opt.question_id
SET opt.is_correct = 1
WHERE slot.slot_type = 'CHOICE'
  AND JSON_CONTAINS(slot.correct_answer, JSON_QUOTE(opt.option_key));
