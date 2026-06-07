const API_BASE = process.env.API_BASE || 'http://127.0.0.1:3000';
const shouldCleanup = process.env.E2E_CLEANUP !== '0';
let authToken = '';

async function cleanupE2EArtifacts() {
  if (!shouldCleanup) return;
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();
  try {
    const groups = await prisma.questionGroup.findMany({
      where: { title: { startsWith: 'E2E' } },
      select: { id: true, questions: { select: { id: true } } },
    });
    const groupIds = groups.map((item) => item.id);
    const questionIds = groups.flatMap((item) => item.questions.map((question) => question.id));
    const papers = await prisma.paper.findMany({
      where: { title: { startsWith: 'E2E' } },
      select: { id: true },
    });
    const paperIds = papers.map((item) => item.id);

    if (questionIds.length || groupIds.length || paperIds.length) {
      await prisma.studentAnswerDetail.deleteMany({
        where: {
          answer: {
            OR: [
              ...(questionIds.length ? [{ questionId: { in: questionIds } }] : []),
              ...(groupIds.length ? [{ groupId: { in: groupIds } }] : []),
              ...(paperIds.length ? [{ paperId: { in: paperIds } }] : []),
            ],
          },
        },
      });
      await prisma.studentAnswer.deleteMany({
        where: {
          OR: [
            ...(questionIds.length ? [{ questionId: { in: questionIds } }] : []),
            ...(groupIds.length ? [{ groupId: { in: groupIds } }] : []),
            ...(paperIds.length ? [{ paperId: { in: paperIds } }] : []),
          ],
        },
      });
      if (paperIds.length) await prisma.practiceAttempt.deleteMany({ where: { paperId: { in: paperIds } } });
      await prisma.paperQuestion.deleteMany({
        where: {
          OR: [
            ...(paperIds.length ? [{ paperId: { in: paperIds } }] : []),
            ...(groupIds.length ? [{ groupId: { in: groupIds } }] : []),
          ],
        },
      });
      if (paperIds.length) await prisma.paper.deleteMany({ where: { id: { in: paperIds } } });
      if (questionIds.length) {
        await prisma.answerSlot.deleteMany({ where: { questionId: { in: questionIds } } });
        await prisma.question.deleteMany({ where: { id: { in: questionIds } } });
      }
      if (groupIds.length) await prisma.questionGroup.deleteMany({ where: { id: { in: groupIds } } });
    }
  } finally {
    await prisma.$disconnect();
  }
}

async function request(path, init = {}) {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    ...(init.headers || {}),
  };
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${init.method || 'GET'} ${path} -> ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const created = { paperId: null, groupId: null };

try {
  await cleanupE2EArtifacts();
  const health = await request('/health', { method: 'GET', headers: {} });
  assert(health?.ok, 'API health check failed');
  const login = await request('/admin/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      username: process.env.ADMIN_USERNAME || 'admin',
      password: process.env.ADMIN_PASSWORD || 'admin123',
    }),
  });
  authToken = login?.accessToken || '';
  assert(authToken, 'Admin login did not return an access token');

  const marker = `E2E解析验收-${Date.now()}`;
  const group = await request('/admin/question-groups', {
    method: 'POST',
    body: JSON.stringify({
      type: 'question',
      title: marker,
      gradeLevel: '二年级',
      difficulty: 1,
      tags: ['E2E', '解析验收'],
      question: {
        question_type: 'fill_blank',
        stem: '计算 {{math:3\\times 5}} = {{blank:1}}。',
        explanation: '先看作 3×5，表示 3 个 5 相加。所以答案是 15。',
        content: {
          explanationHtml:
            '<p>先看作 <strong>{{math:3\\times 5}}</strong>，表示 3 个 5 相加。</p><p>所以答案是 {{math:15}}。</p>',
          explanationFormat: 'html',
        },
        answer_slots: [{ slot_key: 'blank_1', slot_type: 'number', correct_answer: ['15'] }],
      },
    }),
  });
  created.groupId = group.id;

  const paper = await request('/admin/papers', {
    method: 'POST',
    body: JSON.stringify({ title: `${marker}试卷`, description: '自动验收创建，运行结束会删除试卷。' }),
  });
  created.paperId = paper.id;

  const paperWithItem = await request(`/admin/papers/${paper.id}/question-groups`, {
    method: 'POST',
    body: JSON.stringify({ groupId: group.id }),
  });
  const question = paperWithItem.items?.[0]?.group?.questions?.[0];
  assert(question?.id, 'Paper did not include created question');
  assert(question.stem.includes('计算'), 'Question stem encoding failed');
  assert(question.content?.explanationHtml?.includes('先看作'), 'Explanation encoding failed');

  const attempt = await request('/admin/submissions/paper-attempts', {
    method: 'POST',
    body: JSON.stringify({
      paperId: paper.id,
      studentName: '验收小朋友',
      durationSeconds: 12,
      answers: [{
        questionId: question.id,
        groupId: group.id,
        paperId: paper.id,
        answerData: { blank_1: '12' },
        correctData: { blank_1: '15' },
        isCorrect: false,
        score: 0,
        maxScore: 1,
        details: [{ slotKey: 'blank_1', studentValue: '12', correctValue: '15', isCorrect: false, score: 0 }],
      }],
    }),
  });
  assert(attempt?.ok && attempt.wrongCount === 1, 'Wrong submission was not saved');

  const wrongAnswers = await request('/admin/submissions/wrong-answers', { method: 'GET', headers: {} });
  const wrong = wrongAnswers.find((item) => String(item.questionId) === String(question.id));
  assert(wrong, 'Wrong answer did not appear in wrong book');
  assert(wrong.question?.content?.explanationHtml?.includes('先看作'), 'Wrong book did not include explanationHtml');

  console.log(JSON.stringify({
    ok: true,
    paperId: paper.id,
    groupId: group.id,
    questionId: question.id,
    wrongAnswerId: wrong.id,
    message: '端到端验收通过：保存题目 → 组卷 → 提交错题 → 错题本带解析。',
  }, null, 2));
} finally {
  await cleanupE2EArtifacts().catch(() => {});
}
