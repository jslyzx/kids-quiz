const API_BASE = process.env.API_BASE || 'http://127.0.0.1:3000';
const marker = `E2E_IMPORT_${Date.now()}`;
const password = 'import-pass-123';

let prisma;
let authToken = '';

async function getPrisma() {
  if (!prisma) {
    const { PrismaClient } = await import('@prisma/client');
    prisma = new PrismaClient();
  }
  return prisma;
}

async function hashPassword(value) {
  const bcrypt = await import('../apps/api/node_modules/bcryptjs/index.js');
  return (bcrypt.hash ?? bcrypt.default.hash)(value, 10);
}

async function cleanup() {
  const db = await getPrisma();
  const users = await db.user.findMany({ where: { username: { startsWith: marker } }, select: { id: true } });
  const ownerIds = users.map((user) => user.id);
  if (!ownerIds.length) return;

  const groupIds = (await db.questionGroup.findMany({ where: { ownerId: { in: ownerIds } }, select: { id: true } })).map((item) => item.id);
  const questionIds = (await db.question.findMany({ where: { ownerId: { in: ownerIds } }, select: { id: true } })).map((item) => item.id);
  const batchIds = (await db.importBatch.findMany({ where: { ownerId: { in: ownerIds } }, select: { id: true } })).map((item) => item.id);
  const knowledgePointIds = (await db.knowledgePoint.findMany({ where: { ownerId: { in: ownerIds } }, select: { id: true } })).map((item) => item.id);
  const subjectIds = (await db.subject.findMany({ where: { ownerId: { in: ownerIds } }, select: { id: true } })).map((item) => item.id);

  if (groupIds.length) {
    await db.paperQuestion.deleteMany({ where: { groupId: { in: groupIds } } });
    await db.questionGroupKnowledgePoint.deleteMany({ where: { groupId: { in: groupIds } } });
  }
  if (questionIds.length) {
    await db.questionKnowledgePoint.deleteMany({ where: { questionId: { in: questionIds } } });
    await db.questionOption.deleteMany({ where: { questionId: { in: questionIds } } });
    await db.answerSlot.deleteMany({ where: { questionId: { in: questionIds } } });
    await db.question.deleteMany({ where: { id: { in: questionIds } } });
  }
  if (groupIds.length) await db.questionGroup.deleteMany({ where: { id: { in: groupIds } } });
  if (batchIds.length) await db.importBatch.deleteMany({ where: { id: { in: batchIds } } });
  if (knowledgePointIds.length) await db.knowledgePoint.deleteMany({ where: { id: { in: knowledgePointIds } } });
  if (subjectIds.length) await db.subject.deleteMany({ where: { id: { in: subjectIds } } });
  await db.user.deleteMany({ where: { id: { in: ownerIds } } });
}

async function request(path, init = {}) {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    ...(init.headers || {}),
  };
  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  const text = await res.text();
  if (!res.ok) throw new Error(`${init.method || 'GET'} ${path} -> ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

try {
  await cleanup();
  const db = await getPrisma();
  const owner = await db.user.create({
    data: {
      username: marker,
      passwordHash: await hashPassword(password),
      displayName: marker,
      role: 'ADMIN',
      status: 'ENABLED',
    },
  });
  const subject = await db.subject.create({
    data: { ownerId: owner.id, name: 'Math', icon: 'math' },
  });
  const knowledgePoint = await db.knowledgePoint.create({
    data: {
      ownerId: owner.id,
      subjectId: subject.id,
      name: `${marker} knowledge point`,
      path: `${marker}/knowledge point`,
    },
  });

  const health = await request('/health', { method: 'GET', headers: {} });
  assert(health?.ok, 'API health failed');

  const login = await request('/admin/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username: marker, password }),
  });
  authToken = login.accessToken;
  assert(authToken, 'login did not return token');

  const batch = await request('/admin/import-batches', {
    method: 'POST',
    body: JSON.stringify({ title: `${marker} batch`, sourceType: 'json', sourceName: 'smoke.json' }),
  });
  assert(batch.id, 'import batch was not created');

  const group = await request('/admin/question-groups', {
    method: 'POST',
    body: JSON.stringify({
      type: 'question',
      title: `${marker} choice question`,
      gradeLevel: 'Grade 2',
      difficulty: 1,
      tags: ['E2E', 'import batch'],
      importBatchId: batch.id,
      knowledgePointIds: [knowledgePoint.id.toString()],
      question: {
        question_type: 'single_choice',
        stem: 'Which number is the largest?',
        content: {
          options: [
            { key: 'A', text: '12' },
            { key: 'B', text: '21' },
            { key: 'C', text: '20' },
          ],
        },
        answer_slots: [{ slot_key: 'choice', slot_type: 'choice', correct_answer: ['B'] }],
      },
    }),
  });

  const stored = await db.questionGroup.findFirst({
    where: { id: BigInt(group.id) },
    include: {
      knowledgePointLinks: true,
      importBatch: true,
      questions: { include: { options: true, knowledgePointLinks: true } },
    },
  });
  assert(stored?.importBatchId?.toString() === String(batch.id), 'question group missing importBatchId');
  assert(stored?.knowledgePointLinks?.length === 1, 'group knowledge point link missing');
  assert(stored?.questions?.[0]?.knowledgePointLinks?.length === 1, 'question knowledge point link missing');
  assert(stored?.questions?.[0]?.options?.length === 3, 'content.options were not synchronized to question_options');

  const finished = await request(`/admin/import-batches/${batch.id}/finish`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'COMPLETED', stats: { saved: 1, failed: 0, groupIds: [group.id] } }),
  });
  assert(finished.status === 'COMPLETED', 'import batch was not completed');

  console.log(JSON.stringify({
    ok: true,
    groupId: group.id,
    batchId: batch.id,
    optionCount: stored.questions[0].options.length,
    groupKnowledgeLinks: stored.knowledgePointLinks.length,
    questionKnowledgeLinks: stored.questions[0].knowledgePointLinks.length,
    message: 'Import pipeline smoke passed.',
  }, null, 2));
} finally {
  await cleanup().catch(() => {});
  if (prisma) await prisma.$disconnect();
}
