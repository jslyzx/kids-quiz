/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const iconv = require('iconv-lite');
const { PrismaClient } = require('@prisma/client');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT_DIR = path.join(__dirname, 'output');
const OUT_FILE = path.join(OUT_DIR, 'matching-export.json');
const REPORT_FILE = path.join(OUT_DIR, 'migration-report.json');
const MAP_FILE = path.join(OUT_DIR, 'id-map.json');

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  const text = fs.readFileSync(file, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx < 0) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(path.join(ROOT, '.env'));
loadEnvFile(path.join(ROOT, 'prisma', '.env'));

const args = new Set(process.argv.slice(2));
const command = process.argv[2] || 'preview';
const samplePerType = Number(process.argv.find((item) => item.startsWith('--sample-per-type='))?.split('=')[1] || (args.has('--all') ? 0 : 1));
const includePapers = args.has('--include-papers') || args.has('--all');
const dryRun = command === 'preview' || args.has('--dry-run');

function dbConfig(database) {
  return {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database,
    charset: 'utf8mb4',
  };
}

function toJsonSafe(value) {
  return JSON.parse(JSON.stringify(value, (_key, v) => typeof v === 'bigint' ? v.toString() : v));
}

function looksMojibake(value) {
  return /[涓鍑璁鐨棰濉杩绌姊涔潰瀛缁骞闅寮紝€]/.test(value);
}

function repairText(value) {
  if (typeof value !== 'string' || !looksMojibake(value)) return value;
  try {
    const repaired = iconv.decode(iconv.encode(value, 'gbk'), 'utf8');
    if (repaired && !repaired.includes('�') && repaired !== value) return repaired;
  } catch {
    // keep original
  }
  return value;
}

function repairDeep(value) {
  if (typeof value === 'string') return repairText(value);
  if (Array.isArray(value)) return value.map(repairDeep);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, repairDeep(item)]));
  }
  return value;
}

function gradeMap(value) {
  return ({ grade1: '一年级', grade2: '二年级', grade3: '三年级', grade4: '四年级', grade5: '五年级', grade6: '六年级' })[value] || value || null;
}

function subjectLabel(value) {
  return ({ math: '数学', chinese: '语文', english: '英语', science: '科学' })[value] || value || '数学';
}

function typeLabel(value) {
  return ({ matching: '连线题', choice: '选择题', fill_blank: '填空题', poem_fill: '古诗填空' })[value] || value;
}

function difficultyMap(value) {
  return ({ easy: 1, medium: 2, hard: 4, error_prone: 5 })[value] || 1;
}

function pickStem(q) {
  return normalizeLegacyText(String(q.description || q.title || '').trim() || `旧题目 ${q.id}`);
}

function isNumericText(value) {
  return /^[-+]?\d+(\.\d+)?$/.test(String(value).trim());
}

function normalizeBlankStem(rawStem, blanks, report, q) {
  let stem = String(rawStem || '').trim();
  if (!stem) stem = String(q.title || `填空题 ${q.id}`).trim();
  stem = normalizeLegacyText(stem);
  if (/\{\{blank:\d+\}\}/.test(stem)) return stem;
  let index = 0;
  const blankToken = /（\s*）|\(\s*\)|_{2,}|\[\s*\]|【\s*】/g;
  stem = stem.replace(blankToken, () => {
    index += 1;
    return `{{blank:${index}}}`;
  });
  if (index < blanks.length) {
    for (let i = index + 1; i <= blanks.length; i += 1) stem += `${stem.endsWith('\n') ? '' : '\n'}第 ${i} 空：{{blank:${i}}}`;
    report.warnings.push({ oldQuestionId: q.id, type: q.question_type, message: '题干空位数量少于 blank_items，已在末尾补空位，建议人工复核。' });
  }
  if (!/\{\{blank:\d+\}\}/.test(stem) && blanks.length) {
    stem += `${stem.endsWith('\n') ? '' : '\n'}答案：${blanks.map((_, i) => `{{blank:${i + 1}}}`).join(' ')}`;
    report.warnings.push({ oldQuestionId: q.id, type: q.question_type, message: '题干未发现空位，已自动追加空位，建议人工复核。' });
  }
  return stem;
}

function normalizeLegacyPlaceholders(text) {
  return String(text ?? '').replace(/\{_(\d+)\}/g, (_m, n) => `{{blank:${Number(n) + 1}}}`);
}

function normalizeLegacyFormula(text) {
  return String(text ?? '')
    .replace(/\\\((.+?)\\\)/gs, (_m, expr) => `{{math:${String(expr).trim()}}}`)
    .replace(/\\\[(.+?)\\\]/gs, (_m, expr) => `{{math:${String(expr).trim()}}}`);
}

function normalizeLegacyText(text) {
  return normalizeLegacyFormula(normalizeLegacyPlaceholders(text));
}

function normalizePoemText(value) {
  return String(value ?? '').replace(/[\s\p{P}]/gu, '');
}

function deterministicShuffle(chars) {
  return chars.map((ch, index) => ({ ch, sort: (ch.codePointAt(0) || 0) * 131 + index * 17 }))
    .sort((a, b) => a.sort - b.sort)
    .map((item) => item.ch);
}

function baseMeta(q) {
  const tags = ['旧系统', typeLabel(q.question_type), subjectLabel(q.subject)];
  if (q.difficulty_level === 'error_prone') tags.push('易错题');
  if (q.hint_enabled && q.hint_text) tags.push('有提示');
  if (q.image_enabled && q.image_url) tags.push('有图片');
  return {
    difficulty: difficultyMap(q.difficulty_level),
    gradeLevel: gradeMap(q.grade),
    tags: [...new Set(tags.filter(Boolean))],
  };
}

function legacyContent(q, extra = {}) {
  return {
    ...extra,
    legacy: {
      source: 'matching_game',
      oldQuestionId: q.id,
      oldQuestionType: q.question_type,
      oldDifficulty: q.difficulty_level || null,
      oldGrade: q.grade || null,
      oldSubject: q.subject || null,
      isActive: Boolean(q.is_active),
    },
  };
}

function convertChoice(q, data, report) {
  const options = (data.choiceOptions[q.id] || []).sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
  const mappedOptions = options.map((option, index) => ({ key: String.fromCharCode(65 + index), text: String(option.content || '').trim(), oldOptionId: option.id }));
  const answer = mappedOptions.filter((option, index) => Boolean(options[index].is_correct)).map((option) => option.key);
  if (mappedOptions.length < 2) report.errors.push({ oldQuestionId: q.id, type: q.question_type, message: '选择题选项少于 2 个，跳过。' });
  if (!answer.length) report.errors.push({ oldQuestionId: q.id, type: q.question_type, message: '选择题没有正确答案，跳过。' });
  if (mappedOptions.length < 2 || !answer.length) return null;
  const questionType = answer.length > 1 ? 'MULTIPLE_CHOICE' : 'SINGLE_CHOICE';
  return {
    group: { title: normalizeLegacyText(q.title || `选择题 ${q.id}`), groupType: 'PRACTICE_SET', content: legacyContent(q), ...baseMeta(q) },
    questions: [{ questionType, stem: pickStem(q), content: { options: mappedOptions.map(({ key, text }) => ({ key, text: normalizeLegacyText(text) })), legacy: { oldQuestionId: q.id } }, slots: [{ slotKey: 'answer', slotType: 'CHOICE', correctAnswer: answer }] }],
  };
}

function convertFillBlank(q, data, report) {
  const blanks = (data.blankItems[q.id] || []).sort((a, b) => (a.idx || 0) - (b.idx || 0));
  if (!blanks.length) {
    report.errors.push({ oldQuestionId: q.id, type: q.question_type, message: '填空题没有 blank_items，跳过。' });
    return null;
  }
  const stem = normalizeBlankStem(pickStem(q), blanks, report, q);
  const slots = blanks.map((blank, index) => ({
    slotKey: `blank_${Number(blank.idx ?? index) + 1}`,
    slotType: isNumericText(blank.answer_text) ? 'NUMBER' : 'TEXT',
    correctAnswer: [String(blank.answer_text || '').trim()],
  }));
  return {
    group: { title: normalizeLegacyText(q.title || `填空题 ${q.id}`), groupType: 'PRACTICE_SET', content: legacyContent(q), ...baseMeta(q) },
    questions: [{ questionType: 'FILL_BLANK', stem, content: legacyContent(q, { hints: blanks.map((b) => b.hint || null) }), slots }],
  };
}

function convertMatching(q, data, report) {
  const items = data.questionItems[q.id] || [];
  const leftRows = items.filter((item) => item.side === 'left').sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
  const rightRows = items.filter((item) => item.side === 'right').sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
  const rightKeyByOldId = new Map(rightRows.map((row, index) => [row.id, `R${index + 1}`]));
  const left = leftRows.map((row, index) => ({ key: `L${index + 1}`, text: normalizeLegacyText(String(row.content || '').trim()), oldItemId: row.id }));
  const right = rightRows.map((row, index) => ({ key: `R${index + 1}`, text: normalizeLegacyText(String(row.content || '').trim()), oldItemId: row.id }));
  const matches = [];
  leftRows.forEach((row, index) => {
    const rightKey = rightKeyByOldId.get(row.match_item_id);
    if (rightKey) matches.push({ left: `L${index + 1}`, right: rightKey });
  });
  if (!left.length || !right.length) report.errors.push({ oldQuestionId: q.id, type: q.question_type, message: '连线题左右项为空，跳过。' });
  if (matches.length !== left.length) report.errors.push({ oldQuestionId: q.id, type: q.question_type, message: '连线题存在缺失或无效 match_item_id，跳过。' });
  if (!left.length || !right.length || matches.length !== left.length) return null;
  return {
    group: { title: normalizeLegacyText(q.title || `连线题 ${q.id}`), groupType: 'PRACTICE_SET', content: legacyContent(q), ...baseMeta(q) },
    questions: [{ questionType: 'MATCHING', stem: pickStem(q), content: { left: left.map(({ key, text }) => ({ key, text })), right: right.map(({ key, text }) => ({ key, text })), legacy: { oldQuestionId: q.id } }, slots: [{ slotKey: 'answer', slotType: 'MATCH', correctAnswer: matches }] }],
  };
}

function convertPoemFill(q, data, report) {
  const poem = data.poemsById[q.poem_id];
  const blanks = (data.blankItems[q.id] || []).sort((a, b) => (a.idx || 0) - (b.idx || 0));

  let converted;
  if (poem) {
    let lines = [];
    if (poem.content_lines) {
      try { lines = JSON.parse(poem.content_lines); } catch { lines = []; }
    }
    if (!lines.length && poem.content) lines = String(poem.content).split(/(?<=[，。！？；,.!?;])/).map((line) => line.trim()).filter(Boolean);
    const answerText = normalizePoemText(lines.join('') || poem.content || '');
    const charPool = deterministicShuffle(Array.from(answerText));
    converted = {
      group: { title: normalizeLegacyText(q.title || poem.title || `古诗填空 ${q.id}`), groupType: 'PRACTICE_SET', content: legacyContent(q), ...baseMeta(q) },
      questions: [{
        questionType: 'FILL_BLANK',
        stem: poem.title || q.title || `古诗填空 ${q.id}`,
        content: legacyContent(q, {
          interaction: 'poem_char_fill',
          poem: { title: poem.title, author: poem.author, dynasty: poem.dynasty, genre: poem.genre, lines },
          charPool,
        }),
        slots: [{ slotKey: 'answer', slotType: 'TEXT', correctAnswer: [answerText] }],
      }],
    };
    report.warnings.push({ oldQuestionId: q.id, type: q.question_type, message: '古诗填空已迁为选字答题结构：只维护诗全文，系统自动生成字池和答案。' });
  } else if (blanks.length) {
    converted = convertFillBlank(q, data, report);
    if (!converted) return null;
  } else {
    report.errors.push({ oldQuestionId: q.id, type: q.question_type, message: '古诗填空没有关联 poems 数据，跳过。' });
    return null;
  }
  converted.group.groupType = 'COMPOSITE';
  converted.group.commonStem = poem ? [`《${poem.title || '古诗'}》`, poem.author ? `作者：${poem.author}` : '', poem.content || poem.full_text || ''].filter(Boolean).join('\n') : q.description || q.title || '';
  converted.group.content = legacyContent(q, {
    materials: [{ type: 'text', title: poem?.title || '古诗材料', text: converted.group.commonStem }],
  });
  if (converted.questions[0].content?.interaction !== 'poem_char_fill') {
    converted.questions[0].stem = /\{\{blank:\d+\}\}/.test(converted.questions[0].stem) ? converted.questions[0].stem : `请补全诗句：${converted.questions[0].stem}`;
  }
  return converted;
}

function convertQuestion(q, data, report) {
  if (q.question_type === 'choice') return convertChoice(q, data, report);
  if (q.question_type === 'fill_blank') return convertFillBlank(q, data, report);
  if (q.question_type === 'matching') return convertMatching(q, data, report);
  if (q.question_type === 'poem_fill') return convertPoemFill(q, data, report);
  report.errors.push({ oldQuestionId: q.id, type: q.question_type, message: '暂不支持该旧题型，跳过。' });
  return null;
}

async function tableExists(conn, tableName) {
  const [rows] = await conn.query('SHOW TABLES LIKE ?', [tableName]);
  return rows.length > 0;
}

function groupBy(rows, key) {
  return rows.reduce((acc, row) => {
    const k = row[key];
    if (!acc[k]) acc[k] = [];
    acc[k].push(row);
    return acc;
  }, {});
}

async function exportOldData() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const conn = await mysql.createConnection(dbConfig('matching_game'));
  const [questions] = await conn.query('SELECT * FROM questions ORDER BY id ASC');
  const [questionItems] = await conn.query(await tableExists(conn, 'question_items') ? 'SELECT * FROM question_items ORDER BY question_id, display_order, id' : 'SELECT NULL WHERE FALSE');
  const [blankItems] = await conn.query(await tableExists(conn, 'blank_items') ? 'SELECT * FROM blank_items ORDER BY question_id, idx, id' : 'SELECT NULL WHERE FALSE');
  const [choiceOptions] = await conn.query(await tableExists(conn, 'choice_options') ? 'SELECT * FROM choice_options ORDER BY question_id, display_order, id' : 'SELECT NULL WHERE FALSE');
  const [papers] = await conn.query(await tableExists(conn, 'papers') ? 'SELECT * FROM papers ORDER BY id ASC' : 'SELECT NULL WHERE FALSE');
  const [paperItems] = await conn.query(await tableExists(conn, 'paper_items') ? 'SELECT * FROM paper_items ORDER BY paper_id, display_order, id' : 'SELECT NULL WHERE FALSE');
  const [poems] = await conn.query(await tableExists(conn, 'poems') ? 'SELECT * FROM poems ORDER BY id ASC' : 'SELECT NULL WHERE FALSE');
  await conn.end();
  const payload = repairDeep({ exportedAt: new Date().toISOString(), source: 'matching_game', questions, questionItems, blankItems, choiceOptions, papers, paperItems, poems });
  fs.writeFileSync(OUT_FILE, JSON.stringify(toJsonSafe(payload), null, 2), 'utf8');
  return payload;
}

function loadExportedData() {
  if (!fs.existsSync(OUT_FILE)) return null;
  return JSON.parse(fs.readFileSync(OUT_FILE, 'utf8'));
}

function buildPlan(exported) {
  const data = {
    ...exported,
    questionItems: groupBy(exported.questionItems || [], 'question_id'),
    blankItems: groupBy(exported.blankItems || [], 'question_id'),
    choiceOptions: groupBy(exported.choiceOptions || [], 'question_id'),
    poemsById: Object.fromEntries((exported.poems || []).map((poem) => [poem.id, poem])),
  };
  const report = { generatedAt: new Date().toISOString(), dryRun, samplePerType, includePapers, converted: [], skipped: [], errors: [], warnings: [] };
  const drafts = [];
  const convertedTypeCount = new Map();
  for (const q of exported.questions || []) {
    const type = q.question_type || 'matching';
    if (samplePerType && (convertedTypeCount.get(type) || 0) >= samplePerType) continue;
    const beforeErrorCount = report.errors.length;
    const draft = convertQuestion(q, data, report);
    if (draft) {
      draft.oldQuestionId = q.id;
      draft.oldQuestionType = q.question_type;
      drafts.push(draft);
      convertedTypeCount.set(type, (convertedTypeCount.get(type) || 0) + 1);
      report.converted.push({ oldQuestionId: q.id, type: q.question_type, title: q.title, questionType: draft.questions[0]?.questionType, groupType: draft.group.groupType });
    } else if (report.errors.length === beforeErrorCount) {
      report.skipped.push({ oldQuestionId: q.id, type: q.question_type, title: q.title });
    }
  }
  const selectedIds = new Set(drafts.map((d) => d.oldQuestionId));
  const papers = includePapers ? (exported.papers || []).map((paper) => ({ ...paper, items: (exported.paperItems || []).filter((item) => item.paper_id === paper.id && selectedIds.has(item.question_id)) })).filter((paper) => paper.items.length) : [];
  return { drafts, papers, report };
}

async function ensureDefaults(prisma) {
  await prisma.user.upsert({ where: { id: 1n }, update: {}, create: { id: 1n, username: 'admin', passwordHash: 'dev-placeholder', displayName: '默认管理员' } });
  await prisma.subject.upsert({ where: { id: 1n }, update: {}, create: { id: 1n, ownerId: 1n, name: '数学', icon: '🔢' } });
}

async function existingLegacyIds(prisma) {
  const rows = await prisma.questionGroup.findMany({ where: { status: { not: 'DELETED' } }, select: { id: true, content: true } });
  const map = new Map();
  for (const row of rows) {
    const oldId = row.content?.legacy?.oldQuestionId;
    if (oldId) map.set(Number(oldId), row.id);
  }
  return map;
}

async function importPlan(plan) {
  const prisma = new PrismaClient();
  const idMap = fs.existsSync(MAP_FILE) ? JSON.parse(fs.readFileSync(MAP_FILE, 'utf8')) : { questions: {}, papers: {} };
  try {
    await ensureDefaults(prisma);
    const existing = await existingLegacyIds(prisma);
    for (const draft of plan.drafts) {
      if (existing.has(Number(draft.oldQuestionId))) {
        idMap.questions[draft.oldQuestionId] = String(existing.get(Number(draft.oldQuestionId)));
        plan.report.warnings.push({ oldQuestionId: draft.oldQuestionId, message: '新库已存在该旧题目来源，已跳过重复导入。' });
        continue;
      }
      const group = await prisma.questionGroup.create({ data: { ownerId: 1n, subjectId: 1n, title: draft.group.title, commonStem: draft.group.commonStem || null, content: draft.group.content, groupType: draft.group.groupType, difficulty: draft.group.difficulty, gradeLevel: draft.group.gradeLevel, tags: draft.group.tags, score: 1 } });
      for (const [index, item] of draft.questions.entries()) {
        const question = await prisma.question.create({ data: { ownerId: 1n, subjectId: 1n, groupId: group.id, questionType: item.questionType, stem: item.stem, content: item.content || undefined, difficulty: draft.group.difficulty, gradeLevel: draft.group.gradeLevel, tags: draft.group.tags, sortOrder: index } });
        for (const [slotIndex, slot] of item.slots.entries()) {
          await prisma.answerSlot.create({ data: { questionId: question.id, slotKey: slot.slotKey, slotType: slot.slotType, correctAnswer: slot.correctAnswer, answerRule: slot.answerRule || undefined, sortOrder: slotIndex } });
        }
      }
      idMap.questions[draft.oldQuestionId] = String(group.id);
      plan.report.imported = plan.report.imported || [];
      plan.report.imported.push({ oldQuestionId: draft.oldQuestionId, newGroupId: String(group.id), title: draft.group.title });
    }
    for (const paper of plan.papers) {
      const importedItems = paper.items.filter((item) => idMap.questions[item.question_id]);
      if (!importedItems.length) continue;
      const newPaper = await prisma.paper.create({ data: { ownerId: 1n, subjectId: 1n, title: `[旧系统] ${paper.title}`, description: paper.description || null, items: { create: importedItems.map((item) => ({ groupId: BigInt(idMap.questions[item.question_id]), sortOrder: item.display_order || 0, score: item.points || 1 })) } } });
      idMap.papers[paper.id] = String(newPaper.id);
    }
    fs.writeFileSync(MAP_FILE, JSON.stringify(idMap, null, 2), 'utf8');
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  let exported = loadExportedData();
  if (command === 'export' || !exported || args.has('--fresh')) exported = await exportOldData();
  if (command === 'export') {
    console.log(`已导出旧库数据：${OUT_FILE}`);
    console.log(`题目 ${exported.questions.length} 道，试卷 ${(exported.papers || []).length} 份。`);
    return;
  }
  const plan = buildPlan(exported);
  if (!dryRun) await importPlan(plan);
  fs.writeFileSync(REPORT_FILE, JSON.stringify(toJsonSafe(plan.report), null, 2), 'utf8');
  console.log(`${dryRun ? '预检完成' : '导入完成'}：转换 ${plan.report.converted.length} 道；错误 ${plan.report.errors.length} 条；警告 ${plan.report.warnings.length} 条。`);
  console.log(`报告：${REPORT_FILE}`);
  if (!dryRun) console.log(`ID 映射：${MAP_FILE}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
