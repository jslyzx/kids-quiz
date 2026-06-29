#!/usr/bin/env node
/**
 * 扫描题库，找出"答案可能录错或需人工复核"的题目，输出分级清单。
 *
 * 用法：
 *   node scripts/find-answer-issues.mjs                         # 全库
 *   node scripts/find-answer-issues.mjs --paper=5               # 只扫某份试卷
 *   node scripts/find-answer-issues.mjs --out=docs/answers-to-review.md
 *
 * 检测规则（按严重度）：
 *   🔴 高（确定要修）
 *     - NUMBER 答案是 "待校对" / 空字符串 / null
 *     - 答案槽 correct_answer 为空数组 []
 *   🟡 中（需人工确认）
 *     - NUMBER 答案不是纯数字（如中文数字、含字母）—— 可能题目本就如此
 *     - SENTENCE_BUILD（连词成句）答案语序可疑（句末不是标点）
 *     - 题干有 blank slot 但题干里看不到对应 {{blank:N}} 占位符（多为表格/子题，确认对应）
 *     - 古诗选字题：correct_answer 拼接长度 ≠ content.poem.lines 去标点后字数
 *   ℹ️ 统计：按题型/题组汇总命中数
 */
import mysql from 'mysql2/promise';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const getArg = (key) => {
  const found = args.find((a) => a.startsWith(`--${key}=`));
  return found ? found.slice(key.length + 3) : undefined;
};

const DATABASE_URL = process.env.DATABASE_URL
  || 'mysql://root:Jslyzx19910107%21@115.175.36.47:3306/quiz';

// 去标点后的纯字数（中文古诗校验用）
function countChineseChars(str) {
  return [...String(str)].filter((ch) => /[\u4e00-\u9fff]/.test(ch)).length;
}

function readableCorrect(ca) {
  const a = typeof ca === 'string' ? JSON.parse(ca) : ca;
  return Array.isArray(a) ? a.join('、') : String(a ?? '');
}

async function main() {
  const paperFilter = getArg('paper');
  const outPath = getArg('out') || 'docs/answers-to-review.md';

  const conn = await mysql.createConnection(DATABASE_URL);

  // 选题组
  let groupWhere = `g.status != 'DELETED'`;
  const groupParams = [];
  if (paperFilter) {
    groupWhere = `g.id IN (
      SELECT COALESCE(pq.group_id, q.group_id) FROM paper_questions pq
      LEFT JOIN questions q ON q.id = pq.question_id WHERE pq.paper_id = ?
    ) AND g.status != 'DELETED'`;
    groupParams.push(paperFilter);
  }

  const [groups] = await conn.query(
    `SELECT g.id, g.title, g.group_type FROM question_groups g WHERE ${groupWhere} ORDER BY g.sort_order, g.id`,
    groupParams,
  );
  const groupTitle = new Map(groups.map((g) => [g.id, g.title]));

  const groupIds = groups.map((g) => g.id);
  const [questions] = await conn.query(
    `SELECT q.id, q.group_id, q.stem, q.content, q.question_type
       FROM questions q WHERE q.group_id IN (?) AND q.status != 'DELETED' ORDER BY q.id`,
    [groupIds],
  );
  const [slots] = await conn.query(
    `SELECT question_id, slot_key, slot_type, correct_answer
       FROM answer_slots WHERE question_id IN (?) ORDER BY question_id, sort_order, id`,
    [questions.map((q) => q.id)],
  );
  const [opts] = await conn.query(
    `SELECT question_id, option_key, is_correct FROM question_options WHERE question_id IN (?)`,
    [questions.map((q) => q.id)],
  );

  const slotsByQid = new Map();
  for (const s of slots) {
    if (!slotsByQid.has(s.question_id)) slotsByQid.set(s.question_id, []);
    slotsByQid.get(s.question_id).push(s);
  }
  const optsByQid = new Map();
  for (const o of opts) {
    if (!optsByQid.has(o.question_id)) optsByQid.set(o.question_id, []);
    optsByQid.get(o.question_id).push(o);
  }

  const high = []; // 🔴
  const mid = [];  // 🟡
  const seenQid = new Set();

  function pushIssue(list, q, severity, rule, detail) {
    seenQid.add(q.id);
    list.push({
      qid: q.id,
      groupId: q.group_id,
      groupTitle: groupTitle.get(q.group_id) || '',
      type: q.question_type,
      severity,
      rule,
      detail,
      stem: String(q.stem || '').replace(/\s+/g, ' ').slice(0, 60),
    });
  }
  for (const q of questions) {
    const content = typeof q.content === 'string' ? JSON.parse(q.content) : q.content;
    const qSlots = slotsByQid.get(q.id) || [];

    // —— 🔴 规则：答案为空 / "待校对" ——
    for (const s of qSlots) {
      const ca = typeof s.correct_answer === 'string' ? JSON.parse(s.correct_answer) : s.correct_answer;
      const arr = Array.isArray(ca) ? ca : [ca];
      const isEmpty = arr.length === 0 || arr.every((x) => x === null || x === undefined || x === '');
      if (isEmpty) {
        pushIssue(high, q, '🔴', '答案为空', `slot ${s.slot_key} (${s.slot_type}) 的 correct_answer 为空`);
        continue;
      }
      if (s.slot_type === 'NUMBER') {
        // "待校对" 等占位文字
        if (arr.some((x) => /待校对|待定|TODO|待填|xxx/i.test(String(x)))) {
          pushIssue(high, q, '🔴', '答案未录入', `slot ${s.slot_key} = "${arr.join('、')}"（占位未填）`);
        } else if (arr.some((x) => !/^[0-9.]+$/.test(String(x)))) {
          // 非纯数字：中文数字等，标中
          pushIssue(mid, q, '🟡', 'NUMBER答案非数字', `slot ${s.slot_key} = "${arr.join('、')}"，确认是否应为数字`);
        }
      }
    }

    // —— 🟡 连词成句：答案末位应为标点 ——
    if (q.question_type === 'SENTENCE_BUILD') {
      const s = qSlots[0];
      if (s) {
        const ca = typeof s.correct_answer === 'string' ? JSON.parse(s.correct_answer) : s.correct_answer;
        const tokenMap = new Map((content?.tokens || []).map((t) => [String(t.key), t.text]));
        const words = (Array.isArray(ca) ? ca : []).map((k) => tokenMap.get(String(k)) ?? k);
        const last = words[words.length - 1];
        if (last && !/[。.！!？?，,]/.test(String(last))) {
          pushIssue(mid, q, '🟡', '连词成句语序可疑', `答案末位 "${last}" 非标点：${words.join(' ')}`);
        }
      }
    }

    // —— 🟡 古诗选字：字数校验 ——
    if (content?.poem?.lines) {
      const expected = content.poem.lines.reduce((sum, line) => sum + countChineseChars(line), 0);
      const s = qSlots[0];
      if (s) {
        const ca = typeof s.correct_answer === 'string' ? JSON.parse(s.correct_answer) : s.correct_answer;
        const got = countChineseChars(Array.isArray(ca) ? ca.join('') : String(ca ?? ''));
        if (got !== 0 && got !== expected) {
          pushIssue(mid, q, '🟡', '古诗字数不符', `答案 ${got} 字 ≠ 诗句 ${expected} 字`);
        }
      }
    }

    // —— 🟡 有 blank_N slot 但题干无 {{blank:N}} ——
    const stemBlankNums = new Set([...String(q.stem || '').matchAll(/\{\{blank:(\d+)\}\}/g)].map((m) => m[1]));
    const orphanBlanks = qSlots
      .map((s) => s.slot_key)
      .filter((sk) => {
        const m = String(sk).match(/^blank_(\d+)$/);
        return m && !stemBlankNums.has(m[1]);
      });
    if (orphanBlanks.length) {
      pushIssue(mid, q, '🟡', '空位占位符缺失', `有 slot ${orphanBlanks.join(',')} 但题干无对应 {{blank:N}}（多在表格/子题中）`);
    }

    // —— 🔴 选择题：is_correct 全 false（无正确选项）——
    if (q.question_type === 'SINGLE_CHOICE' || q.question_type === 'MULTIPLE_CHOICE') {
      const oRows = optsByQid.get(q.id) || [];
      if (oRows.length && !oRows.some((o) => o.is_correct)) {
        pushIssue(high, q, '🔴', '选择题无正确项', `${oRows.length} 个选项全部 is_correct=false`);
      }
    }
  }

  // —— 输出 Markdown ——
  const L = [];
  L.push(`# 题目答案待复核清单`);
  L.push(``);
  L.push(`- 生成时间：${new Date().toISOString()}`);
  L.push(`- 扫描范围：${groups.length} 个题组、${questions.length} 道小题`);
  if (paperFilter) L.push(`- 筛选：试卷 id = ${paperFilter}`);
  L.push(`- 命中：🔴 高 ${high.length} 条，🟡 中 ${mid.length} 条，涉及 ${seenQid.size} 道题`);
  L.push(``);
  L.push(`> 🔴 高 = 基本确定要修（答案为空/"待校对"/选择题无正确项）。`);
  L.push(`> 🟡 中 = 需人工确认（NUMBER 非数字、连词成句语序、古诗字数、表格空位对应）。`);
  L.push(`> 完整题目见 [all-answers.md](./all-answers.md)。修复入口：家长后台 → 题库管理（按 Q 号搜索）。`);

  const renderIssue = (it) => {
    const lines = [];
    lines.push(`\n### Q${it.qid}  [${it.severity} ${it.rule}]`);
    lines.push(`- 题组：${it.groupId}「${it.groupTitle}」｜ 题型：${it.type}`);
    lines.push(`- 问题：${it.detail}`);
    lines.push(`- 题干：${it.stem}${String(it.stem).length >= 60 ? '…' : ''}`);
    return lines.join('\n');
  };

  L.push(`\n---\n\n## 🔴 高优先级（确定要修） — ${high.length} 条\n`);
  if (high.length) {
    const byQ = new Map();
    for (const it of high) {
      if (!byQ.has(it.qid)) byQ.set(it.qid, { ...it, details: [] });
      byQ.get(it.qid).details.push(`${it.rule}：${it.detail}`);
    }
    for (const it of [...byQ.values()]) {
      L.push(`\n### Q${it.qid}  [${it.type}｜题组 ${it.groupId}「${it.groupTitle}」]`);
      L.push(`- 题干：${it.stem}${String(it.stem).length >= 60 ? '…' : ''}`);
      L.push(`- 问题：`);
      for (const d of it.details) L.push(`   - ${d}`);
    }
  } else {
    L.push(`\n_无_ ✅`);
  }

  L.push(`\n---\n\n## 🟡 中优先级（需人工确认） — ${mid.length} 条\n`);
  if (mid.length) {
    const byQ = new Map();
    for (const it of mid) {
      if (!byQ.has(it.qid)) byQ.set(it.qid, { ...it, details: [] });
      byQ.get(it.qid).details.push(`${it.rule}：${it.detail}`);
    }
    for (const it of [...byQ.values()]) {
      L.push(`\n### Q${it.qid}  [${it.type}｜题组 ${it.groupId}「${it.groupTitle}」]`);
      L.push(`- 题干：${it.stem}${String(it.stem).length >= 60 ? '…' : ''}`);
      L.push(`- 待确认：`);
      for (const d of it.details) L.push(`   - ${d}`);
    }
  } else {
    L.push(`\n_无_ ✅`);
  }

  const md = L.join('\n') + '\n';
  writeFileSync(resolve(process.cwd(), outPath), md, 'utf8');

  console.log(`✅ 扫描完成：${groups.length} 题组 / ${questions.length} 题`);
  console.log(`   🔴 高优先级：${high.length} 条（${new Set(high.map((h) => h.qid)).size} 题）`);
  console.log(`   🟡 中优先级：${mid.length} 条（${new Set(mid.map((m) => m.qid)).size} 题）`);
  console.log(`   文件：${resolve(process.cwd(), outPath)}`);

  await conn.end();
}

main().catch((e) => {
  console.error('ERR:', e);
  process.exit(1);
});
