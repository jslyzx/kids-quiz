#!/usr/bin/env node
/**
 * 规范化试卷导入脚本
 *
 * 把一份 imports/*.json（题目导入格式，见 docs/question-json-import-format.md）
 * 用 Prisma 事务完整写入数据库：import_batches → question_groups → questions
 * → answer_slots → question_options → papers → paper_questions。
 *
 * 用法：
 *   node .agents/skills/import-paper/scripts/import-question-paper.mjs <file.json> [选项]
 *
 * 选项：
 *   --paper <试卷标题>     指定试卷标题（默认从文件 title 推导）
 *   --dry-run              只校验和打印计划，不写库
 *   --owner <id>           owner_id（默认 1）
 *   --subject <id>         subject_id（默认 1）
 *   --no-paper             只导入题组，不建试卷
 *
 * 设计原则：
 *   1. 全程一个 $transaction，失败即回滚，不留残数据。
 *   2. 写前用 Prisma 查重（同名试卷/题组），重复则中止。
 *   3. 写后读回校验（标题、题量、答案槽）。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';

const args = process.argv.slice(2);
const fileArg = args.find((a) => !a.startsWith('--'));
const paperTitleArg = args.find((a) => a.startsWith('--paper='))?.split('=')[1];
const dryRun = args.includes('--dry-run');
const noPaper = args.includes('--no-paper');
const ownerId = Number(args.find((a) => a.startsWith('--owner='))?.split('=')[1] ?? 1);
const subjectId = Number(args.find((a) => a.startsWith('--subject='))?.split('=')[1] ?? 1);

if (!fileArg) {
  console.error('用法: import-question-paper.mjs <file.json> [--paper 标题] [--dry-run] [--no-paper]');
  process.exit(1);
}

const filePath = resolve(process.cwd(), fileArg);
const prisma = new PrismaClient();

// 题型映射：导入格式的小写 type → Prisma enum
const QUESTION_TYPE_MAP = {
  fill_blank: 'FILL_BLANK',
  single_choice: 'SINGLE_CHOICE',
  multiple_choice: 'MULTIPLE_CHOICE',
  true_false: 'TRUE_FALSE',
  matching: 'MATCHING',
  ordering: 'ORDERING',
  sentence_build: 'SENTENCE_BUILD',
  word_problem: 'WORD_PROBLEM',
};
const SLOT_TYPE_MAP = {
  text: 'TEXT', number: 'NUMBER', expression: 'EXPRESSION',
  choice: 'CHOICE', match: 'MATCH', order: 'ORDER', compare_symbol: 'COMPARE_SYMBOL',
};
const GROUP_TYPE_MAP = {
  practice_set: 'PRACTICE_SET', worksheet_section: 'WORKSHEET_SECTION',
  mental_math: 'MENTAL_MATH', fill_blank_group: 'FILL_BLANK_GROUP',
  matching_group: 'MATCHING_GROUP', composite: 'COMPOSITE',
};

function json(v) { return v === undefined ? undefined : (typeof v === 'string' ? JSON.parse(v) : v); }
function tagsOf(item) { return item.tags ?? null; }
function derivePaperTitle(items, sourceName) {
  // 从第一个题组 title 截取试卷名（去掉「 - 一、xxx」这类后缀）
  const first = items.find((i) => i.title)?.title;
  if (first) return first.replace(/\s*[-—]\s*[一二三四五六七八九十]+[、,，].*$/, '').trim();
  return sourceName?.replace(/\.[^.]+$/, '') ?? '未命名试卷';
}

async function buildGroupPlan(item, sortIndex) {
  // 把一个 import item 转成待写入的题组+题目计划
  const type = item.type;
  const gradeLevel = item.gradeLevel ?? '二年级';
  const difficulty = item.difficulty ?? 1;
  const tags = tagsOf(item);

  if (type === 'calculation_group') {
    // 口算/计算题组：每道 item 是一道 CALCULATION 题
    const groupType = GROUP_TYPE_MAP.mental_math;
    const content = { columns: item.columns ?? 4, sourceType: 'calculation_group' };
    const questions = (item.items ?? []).map((q, qi) => {
      const stem = q.stem;
      const answer = String(q.answer ?? '');
      return {
        questionType: 'CALCULATION',
        stem, content: null, explanation: null,
        difficulty, sortOrder: qi,
        slots: [{ slotKey: 'answer', slotType: 'NUMBER', correctAnswer: [answer], sortOrder: 0 }],
        options: [],
      };
    });
    return { title: item.title, commonStem: null, content, groupType, gradeLevel, difficulty, tags, questions };
  }

  if (type === 'composite_group') {
    const groupType = GROUP_TYPE_MAP.composite;
    const content = null;
    const questions = (item.children ?? []).map((q, qi) => buildQuestionPlan(q, qi, difficulty, gradeLevel));
    return { title: item.title, commonStem: item.commonStem ?? null, content, groupType, gradeLevel, difficulty, tags, questions };
  }

  if (type === 'question') {
    const q = item.question;
    const qp = buildQuestionPlan(q, 0, difficulty, gradeLevel);
    return {
      title: item.title, commonStem: null, content: null,
      groupType: GROUP_TYPE_MAP.practice_set, gradeLevel, difficulty, tags,
      questions: [qp],
    };
  }

  throw new Error(`未知的导入 item type: ${type}（题组 ${item.title}）`);
}

function buildQuestionPlan(q, sortIndex, baseDifficulty, gradeLevel) {
  const questionType = QUESTION_TYPE_MAP[q.question_type];
  if (!questionType) throw new Error(`未知 question_type: ${q.question_type}`);
  const slots = (q.answer_slots ?? []).map((s, si) => ({
    slotKey: s.slot_key,
    slotType: SLOT_TYPE_MAP[s.slot_type] ?? 'TEXT',
    correctAnswer: s.correct_answer ?? [],
    sortOrder: si,
  }));
  const options = (q.content?.options ?? q.options ?? []).map((o, oi) => ({
    optionKey: o.key, content: o.text, isCorrect: false, sortOrder: oi,
  }));
  return {
    questionType, stem: q.stem ?? '', content: q.content ?? null,
    explanation: q.explanation ?? null, difficulty: q.difficulty ?? baseDifficulty,
    gradeLevel, sortOrder: sortIndex, slots, options,
  };
}

async function main() {
  const raw = readFileSync(filePath, 'utf8');
  const items = JSON.parse(raw);
  const list = Array.isArray(items) ? items : [items];
  const sourceName = fileArg.replace(/^.*[\\/]/, '');

  // 1. 查重：同名试卷或题组标题
  const paperTitle = paperTitleArg ?? derivePaperTitle(list, sourceName);
  console.log(`试卷标题: ${paperTitle}`);
  if (!noPaper) {
    const dupPaper = await prisma.paper.findFirst({ where: { title: paperTitle } });
    if (dupPaper) { console.error(`✗ 已存在同名试卷: p${dupPaper.id}「${paperTitle}」，请先删除或改名`); process.exit(2); }
  }
  for (const item of list) {
    if (!item.title) continue;
    const dupGroup = await prisma.questionGroup.findFirst({ where: { title: item.title } });
    if (dupGroup) { console.error(`✗ 已存在同名题组: g${dupGroup.id}「${item.title}」`); process.exit(2); }
  }

  // 2. 构造写入计划
  const plans = [];
  for (let i = 0; i < list.length; i++) plans.push(await buildGroupPlan(list[i], i));
  const totalQ = plans.reduce((n, p) => n + p.questions.length, 0);
  console.log(`计划: ${plans.length} 个题组, ${totalQ} 道题${noPaper ? '' : `, 1 份试卷「${paperTitle}」`}`);

  if (dryRun) {
    console.log('\n--dry-run 模式，不写库。题组清单:');
    plans.forEach((p, i) => console.log(`  [${i + 1}] ${p.groupType} | ${p.questions.length}题 | ${p.title}`));
    return;
  }

  // 3. 事务写入
  console.log('\n开始事务写入...');
  const result = await prisma.$transaction(async (tx) => {
    // 批次
    const batch = await tx.importBatch.create({
      data: { ownerId, title: paperTitle, sourceType: 'json', sourceName, status: 'COMPLETED', stats: { groups: plans.length, questions: totalQ } },
    });
    console.log(`  批次 b${batch.id}`);

    const groupIds = [];
    for (let gi = 0; gi < plans.length; gi++) {
      const p = plans[gi];
      const group = await tx.questionGroup.create({
        data: {
          ownerId, subjectId, importBatchId: batch.id,
          title: p.title, commonStem: p.commonStem, content: p.content ?? undefined,
          groupType: p.groupType, difficulty: p.difficulty, gradeLevel: p.gradeLevel,
          tags: p.tags, sortOrder: gi, status: 'ENABLED',
        },
      });
      groupIds.push(group.id);

      for (const qp of p.questions) {
        const question = await tx.question.create({
          data: {
            ownerId, subjectId, groupId: group.id,
            questionType: qp.questionType, stem: qp.stem, content: qp.content ?? undefined,
            explanation: qp.explanation, difficulty: qp.difficulty, gradeLevel: qp.gradeLevel,
            score: 1, sortOrder: qp.sortOrder, status: 'ENABLED',
          },
        });
        for (const s of qp.slots) {
          await tx.answerSlot.create({
            data: { questionId: question.id, slotKey: s.slotKey, slotType: s.slotType, correctAnswer: s.correctAnswer, score: 1, sortOrder: s.sortOrder },
          });
        }
        for (const o of qp.options) {
          await tx.questionOption.create({
            data: { questionId: question.id, optionKey: o.optionKey, content: o.content, isCorrect: o.isCorrect, sortOrder: o.sortOrder },
          });
        }
      }
      console.log(`  题组 g${group.id}（${p.questions.length}题）: ${p.title}`);
    }

    // 试卷
    let paper = null;
    if (!noPaper) {
      paper = await tx.paper.create({ data: { ownerId, subjectId, title: paperTitle, status: 'ENABLED' } });
      for (let i = 0; i < groupIds.length; i++) {
        await tx.paperQuestion.create({ data: { paperId: paper.id, groupId: groupIds[i], sortOrder: i, score: 1 } });
      }
      console.log(`  试卷 p${paper.id}: ${paperTitle}`);
    }

    return { batchId: batch.id, groupIds, paperId: paper?.id };
  });

  // 4. 读回校验
  console.log('\n读回校验:');
  for (const gid of result.groupIds) {
    const g = await prisma.questionGroup.findUnique({ where: { id: gid }, include: { _count: { select: { questions: true } } } });
    const slotCount = await prisma.answerSlot.count({ where: { question: { groupId: gid } } });
    console.log(`  ✓ g${gid} ${g._count.questions}题 / ${slotCount}答案槽 | ${g.title}`);
  }
  if (result.paperId) {
    const p = await prisma.paper.findUnique({ where: { id: result.paperId }, include: { items: { select: { id: true } } } });
    console.log(`  ✓ p${p.id} ${p.items.length}题组 | ${p.title}`);
  }
  console.log(`\n✓ 导入完成。批次 b${result.batchId}，题组 ${result.groupIds.map((g) => 'g' + g).join('，')}${result.paperId ? `，试卷 p${result.paperId}` : ''}`);
}

main()
  .catch((e) => { console.error('\n✗ 导入失败:', e.message); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
