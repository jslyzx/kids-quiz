#!/usr/bin/env node
/**
 * 导出全部题目的题干 + 正确答案，输出为可读 Markdown。
 *
 * 用法：
 *   node scripts/export-answers.mjs                # 导出所有启用的题组
 *   node scripts/export-answers.mjs --paper=5      # 只导出某份试卷（按 paper_id）
 *   node scripts/export-answers.mjs --group=12     # 只导出某个题组
 *   node scripts/export-answers.mjs --out=docs/answers.md
 *
 * 答案来源：
 *   - answer_slots.correct_answer  数值/填空/连线/排序/比较号
 *   - question_options.is_correct   选择题选项
 *   - questions.content             题干选项文字、材料图、tokens 等
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

// ---- 文本渲染辅助 -------------------------------------------------------

/** 常见 LaTeX 符号 → 中文可读字符。 */
const LATEX_SYMBOLS = {
  '\\times': '×',
  '\\cdot': '·',
  '\\div': '÷',
  '\\pm': '±',
  '\\mp': '∓',
  '\\neq': '≠',
  '\\leq': '≤',
  '\\geq': '≥',
  '\\approx': '≈',
  '\\frac': '/', // 粗略：\frac{a}{b} → a/b（下面单独处理）
  '\\sqrt': '√',
  '\\degree': '°',
  '\\pi': 'π',
};
function readableMath(expr) {
  let s = expr.trim();
  // \frac{a}{b} → (a)/(b)
  s = s.replace(/\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, '($1)/($2)');
  s = s.replace(/\\sqrt\s*\{([^{}]*)\}/g, '√($1)');
  for (const [k, v] of Object.entries(LATEX_SYMBOLS)) {
    s = s.split(k).join(v);
  }
  // 去掉成对的 $ 和多余空格
  s = s.replace(/\$/g, '').replace(/\s+/g, ' ').trim();
  return s;
}

/** 通用文本渲染：转换 {{math:...}} 占位符、清理空白。用于题组标题/common_stem。 */
function renderText(text) {
  if (!text) return '';
  return String(text)
    .replace(/\{\{math:([^}]+)\}\}/g, (_, e) => readableMath(e))
    .replace(/\s+/g, ' ')
    .trim();
}

/** 把题干里的 {{blank:n}} / {{math:...}} / {{blank:1}} 占位符渲染成可读文本。 */
function renderStem(stem, slotsByKey) {
  if (!stem) return '';
  return String(stem)
    .replace(/\{\{blank:(\d+)\}\}/g, (_, n) => {
      // {{blank:1}} 对应 slot_key blank_1
      const slot = slotsByKey[`blank_${n}`];
      const ans = slot ? slot.readableAnswer : '';
      return ans ? `【${ans}】` : `_____`;
    })
    .replace(/\{\{blank_(\d+)\}\}/g, (_, n) => {
      const slot = slotsByKey[`blank_${n}`];
      const ans = slot ? slot.readableAnswer : '';
      return ans ? `【${ans}】` : `_____`;
    })
    .replace(/\{\{math:([^}]+)\}\}/g, (_, expr) => readableMath(expr))
    .replace(/\{\{blank\}\}/g, '_____');
}

/** 把任意 correct_answer JSON 转成人能读的单行文本。 */
function readableAnswer(correctAnswer, slotType, content) {
  const val = Array.isArray(correctAnswer) && correctAnswer.length === 1 ? correctAnswer[0] : correctAnswer;
  // 古诗选字题：优先用 content.poem.lines 分行展示
  if (content?.poem?.lines && (slotType === 'TEXT' || !slotType)) {
    return content.poem.lines.join(' / ');
  }
  if (slotType === 'MATCH') {
    // 连线：[{left,right}, ...]
    const leftMap = new Map((content?.left || []).map((l) => [l.key, l.text]));
    const rightMap = new Map((content?.right || []).map((r) => [r.key, r.text]));
    return (Array.isArray(correctAnswer) ? correctAnswer : [])
      .map((p) => `${leftMap.get(p.left) ?? p.left} → ${rightMap.get(p.right) ?? p.right}`)
      .join('；');
  }
  if (slotType === 'ORDER') {
    // 排序/连词成句：返回 token 文本按正确顺序
    const tokenMap = new Map((content?.tokens || []).map((t) => [String(t.key), t.text]));
    return (Array.isArray(correctAnswer) ? correctAnswer : [])
      .map((k) => tokenMap.get(String(k)) ?? k)
      .join(' ');
  }
  if (slotType === 'CHOICE') {
    // 单选/多选：返回选项 key
    return Array.isArray(correctAnswer) ? correctAnswer.join('、') : String(correctAnswer ?? '');
  }
  // NUMBER / TEXT / EXPRESSION / COMPARE_SYMBOL
  if (Array.isArray(correctAnswer)) return correctAnswer.join(' 或 ');
  return String(correctAnswer ?? '');
}

/** 渲染选择题的选项列表。 */
function renderChoiceOptions(content, options) {
  const opts = content?.options || options || [];
  if (!opts.length) return '';
  return opts
    .map((o) => {
      const text = String(o.text ?? o.content ?? '')
        .replace(/\{\{math:([^}]+)\}\}/g, (_, e) => e.trim());
      const mark = o.isCorrect ? ' ✓' : '';
      return `   ${o.key}. ${text}${mark}`;
    })
    .join('\n');
}

/** 收集题干 content 里的材料图（如有）。 */
function renderMaterials(content) {
  const mats = content?.materials;
  if (!Array.isArray(mats) || !mats.length) return '';
  return mats
    .filter((m) => m.type === 'image')
    .map((m) => `   [图] ${m.title || ''} ${m.url || ''}`.trim())
    .join('\n');
}

// ---- 主流程 -------------------------------------------------------------

async function main() {
  const paperFilter = getArg('paper');
  const groupFilter = getArg('group');
  const outPath = getArg('out') || 'docs/all-answers.md';

  const conn = await mysql.createConnection(DATABASE_URL);

  // 选出要导出的题组
  let groupWhere = `g.status != 'DELETED'`;
  const groupParams = [];
  if (paperFilter) {
    // 按试卷：取该试卷包含的 group_id（题目级 PaperQuestion 也归到其 group）
    groupWhere = `g.id IN (
      SELECT COALESCE(pq.group_id, q.group_id)
      FROM paper_questions pq
      LEFT JOIN questions q ON q.id = pq.question_id
      WHERE pq.paper_id = ?
    ) AND g.status != 'DELETED'`;
    groupParams.push(paperFilter);
  } else if (groupFilter) {
    groupWhere = `g.id = ? AND g.status != 'DELETED'`;
    groupParams.push(groupFilter);
  }

  const [groups] = await conn.query(
    `SELECT g.id, g.title, g.common_stem, g.content AS group_content, g.group_type, g.grade_level, g.tags
       FROM question_groups g
       WHERE ${groupWhere}
       ORDER BY g.sort_order, g.id`,
    groupParams,
  );

  if (!groups.length) {
    console.log('未找到匹配的题组。');
    await conn.end();
    return;
  }

  const groupIds = groups.map((g) => g.id);

  // 一次性批量预取所有 questions / slots / options，避免 N+1 往返（远程库很慢）
  const [allQuestions] = await conn.query(
    `SELECT q.id, q.group_id, q.stem, q.content, q.question_type, q.explanation, q.sort_order
       FROM questions q
       WHERE q.group_id IN (?) AND q.status != 'DELETED'
       ORDER BY q.group_id, q.sort_order, q.id`,
    [groupIds],
  );
  const [allSlots] = await conn.query(
    `SELECT question_id, slot_key, slot_type, correct_answer, placeholder, unit, sort_order
       FROM answer_slots WHERE question_id IN (?) ORDER BY question_id, sort_order, id`,
    [allQuestions.map((q) => q.id)],
  );
  const [allOpts] = await conn.query(
    `SELECT question_id, option_key, content AS text, is_correct, sort_order
       FROM question_options WHERE question_id IN (?) ORDER BY question_id, sort_order, id`,
    [allQuestions.map((q) => q.id)],
  );

  const slotsByQid = new Map();
  for (const s of allSlots) {
    const arr = slotsByQid.get(s.question_id) || [];
    arr.push(s);
    slotsByQid.set(s.question_id, arr);
  }
  const optsByQid = new Map();
  for (const o of allOpts) {
    const arr = optsByQid.get(o.question_id) || [];
    arr.push(o);
    optsByQid.set(o.question_id, arr);
  }
  const questionsByGroup = new Map();
  for (const q of allQuestions) {
    const arr = questionsByGroup.get(q.group_id) || [];
    arr.push(q);
    questionsByGroup.set(q.group_id, arr);
  }

  const lines = [];
  let qIndex = 0;

  for (const g of groups) {
    lines.push(`\n## 题组 ${g.id}：${renderText(g.title)}  \`${g.group_type}\``);
    if (g.common_stem) lines.push(`> ${renderText(g.common_stem).replace(/\n/g, ' ')}`);
    if (g.grade_level) lines.push(`> 年级：${g.grade_level}`);

    const questions = questionsByGroup.get(g.id) || [];

    if (!questions.length) {
      lines.push(`_（题组无小题）_`);
      continue;
    }

    for (const q of questions) {
      qIndex += 1;
      const content = typeof q.content === 'string' ? JSON.parse(q.content) : q.content;

      const slots = slotsByQid.get(q.id) || [];
      const optRows = optsByQid.get(q.id) || [];

      // 把 is_correct 合并进 content.options（便于统一渲染）
      const contentWithOptions = content && Array.isArray(content.options) && content.options.length
        ? {
            ...content,
            options: content.options.map((o) => ({
              ...o,
              isCorrect: optRows.find((r) => r.option_key === o.key)?.is_correct ?? o.isCorrect,
              is_correct: optRows.find((r) => r.option_key === o.key)?.is_correct ?? o.is_correct,
            })),
          }
        : content;

      // 计算每个 slot 的可读答案
      const slotsByKey = {};
      for (const s of slots) {
        const ca = typeof s.correct_answer === 'string' ? JSON.parse(s.correct_answer) : s.correct_answer;
        slotsByKey[s.slot_key] = {
          ...s,
          correct_answer: ca,
          readableAnswer: readableAnswer(ca, s.slot_type, contentWithOptions),
        };
      }

      // 渲染题干（填空位直接嵌入答案）
      const stemText = renderStem(q.stem, slotsByKey);

      lines.push(`\n**${qIndex}. [Q${q.id} · ${q.question_type}]** ${stemText}`);

      const mats = renderMaterials(contentWithOptions);
      if (mats) lines.push(mats);

      // 选择题：列出选项（含正确标记）
      if (q.question_type === 'SINGLE_CHOICE' || q.question_type === 'MULTIPLE_CHOICE' || q.question_type === 'TRUE_FALSE') {
        const optsText = renderChoiceOptions(contentWithOptions, optRows.map((r) => ({ key: r.option_key, text: r.text, isCorrect: r.is_correct })));
        if (optsText) lines.push(optsText);
      }

      // 答案汇总
      if (slots.length) {
        const ansParts = [...slots]
          .sort((a, b) => (a.sort_order - b.sort_order) || String(a.slot_key).localeCompare(String(b.slot_key)))
          .map((s) => {
            const ca = typeof s.correct_answer === 'string' ? JSON.parse(s.correct_answer) : s.correct_answer;
            const txt = readableAnswer(ca, s.slot_type, contentWithOptions);
            const unit = s.unit ? ` ${s.unit}` : '';
            return `${s.slot_key} = ${txt}${unit}`;
          });
        lines.push(`✅ 答案：${ansParts.join(' ｜ ')}`);
      } else {
        lines.push(`✅ 答案：_（无答案槽）_`);
      }

      if (q.explanation) {
        const exp = String(q.explanation)
          .replace(/\{\{math:([^}]+)\}\}/g, (_, e) => readableMath(e))
          .replace(/<[^>]+>/g, '')
          .replace(/\s+/g, ' ')
          .trim();
        if (exp) lines.push(`💡 解析：${exp.slice(0, 400)}${exp.length > 400 ? '…' : ''}`);
      }
    }
  }

  // 头部统计
  const header = [];
  header.push(`# 题目答案清单`);
  header.push('');
  header.push(`- 生成时间：${new Date().toISOString()}`);
  header.push(`- 题组数量：${groups.length}`);
  header.push(`- 数据来源：MySQL quiz 库（answer_slots / question_options / questions.content）`);
  if (paperFilter) header.push(`- 筛选：试卷 id = ${paperFilter}`);
  if (groupFilter) header.push(`- 筛选：题组 id = ${groupFilter}`);
  header.push('');
  header.push(`> 说明：题干中的【...】为填空位的正确答案；选择题选项末尾 ✓ 为正确项；✅ 行为答案槽汇总。`);

  const md = header.join('\n') + '\n' + lines.join('\n') + '\n';
  writeFileSync(resolve(process.cwd(), outPath), md, 'utf8');

  console.log(`✅ 已导出 ${groups.length} 个题组、${qIndex} 道小题`);
  console.log(`   文件：${resolve(process.cwd(), outPath)}`);

  await conn.end();
}

main().catch((e) => {
  console.error('ERR:', e);
  process.exit(1);
});
