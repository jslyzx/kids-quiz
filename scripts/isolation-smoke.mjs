const API_BASE = process.env.API_BASE || 'http://127.0.0.1:3000';
const marker = `E2E_ISO_${Date.now()}`;
const password = 'iso-pass-123';

let prisma;

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
  const users = await db.user.findMany({
    where: { username: { startsWith: marker } },
    select: { id: true },
  });
  const ownerIds = users.map((user) => user.id);
  if (!ownerIds.length) return;

  const students = await db.student.findMany({
    where: { ownerId: { in: ownerIds } },
    select: { id: true },
  });
  const studentIds = students.map((student) => student.id);
  const groups = await db.questionGroup.findMany({
    where: { ownerId: { in: ownerIds } },
    select: { id: true },
  });
  const groupIds = groups.map((group) => group.id);
  const questions = await db.question.findMany({
    where: { ownerId: { in: ownerIds } },
    select: { id: true },
  });
  const questionIds = questions.map((question) => question.id);
  const papers = await db.paper.findMany({
    where: { ownerId: { in: ownerIds } },
    select: { id: true },
  });
  const paperIds = papers.map((paper) => paper.id);

  if (studentIds.length) {
    await db.studentAnswerDetail.deleteMany({ where: { answer: { studentId: { in: studentIds } } } });
    await db.studentAnswer.deleteMany({ where: { studentId: { in: studentIds } } });
    await db.practiceAttempt.deleteMany({ where: { studentId: { in: studentIds } } });
  }
  if (paperIds.length || groupIds.length) {
    await db.paperQuestion.deleteMany({
      where: {
        OR: [
          ...(paperIds.length ? [{ paperId: { in: paperIds } }] : []),
          ...(groupIds.length ? [{ groupId: { in: groupIds } }] : []),
        ],
      },
    });
  }
  if (paperIds.length) await db.paper.deleteMany({ where: { id: { in: paperIds } } });
  if (questionIds.length) {
    await db.answerSlot.deleteMany({ where: { questionId: { in: questionIds } } });
    await db.questionOption.deleteMany({ where: { questionId: { in: questionIds } } });
    await db.question.deleteMany({ where: { id: { in: questionIds } } });
  }
  if (groupIds.length) await db.questionGroup.deleteMany({ where: { id: { in: groupIds } } });
  await db.student.deleteMany({ where: { ownerId: { in: ownerIds } } });
  await db.knowledgePoint.deleteMany({ where: { ownerId: { in: ownerIds } } });
  await db.subject.deleteMany({ where: { ownerId: { in: ownerIds } } });
  await db.user.deleteMany({ where: { id: { in: ownerIds } } });
}

async function createOwner(username, studentNames) {
  const db = await getPrisma();
  const passwordHash = await hashPassword(password);
  const user = await db.user.create({
    data: {
      username,
      passwordHash,
      displayName: username,
      role: 'ADMIN',
      status: 'ENABLED',
      students: {
        create: studentNames.map((name) => ({ name, grade: '二年级' })),
      },
    },
    include: { students: { orderBy: { id: 'asc' } } },
  });
  return user;
}

async function request(path, init = {}, token) {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(init.headers || {}),
  };
  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  const text = await res.text();
  return {
    ok: res.ok,
    status: res.status,
    body: text ? JSON.parse(text) : null,
    text,
  };
}

async function mustRequest(path, init = {}, token) {
  const res = await request(path, init, token);
  if (!res.ok) throw new Error(`${init.method || 'GET'} ${path} -> ${res.status}: ${res.text}`);
  return res.body;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

try {
  await cleanup();

  const ownerA = await createOwner(`${marker}_A`, ['A 学生一', 'A 学生二']);
  const ownerB = await createOwner(`${marker}_B`, ['B 学生一']);

  const health = await mustRequest('/health', { method: 'GET', headers: {} });
  assert(health?.ok, 'API health check failed');

  const loginA = await mustRequest('/admin/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username: ownerA.username, password }),
  });
  const loginB = await mustRequest('/admin/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username: ownerB.username, password }),
  });

  const group = await mustRequest('/admin/question-groups', {
    method: 'POST',
    body: JSON.stringify({
      type: 'question',
      title: `${marker} A 隔离题`,
      gradeLevel: '二年级',
      difficulty: 1,
      tags: ['E2E', '隔离'],
      question: {
        question_type: 'fill_blank',
        stem: '8 + 7 = {{blank:1}}',
        answer_slots: [{ slot_key: 'blank_1', slot_type: 'number', correct_answer: ['15'] }],
      },
    }),
  }, loginA.accessToken);

  const paper = await mustRequest('/admin/papers', {
    method: 'POST',
    body: JSON.stringify({ title: `${marker} A 隔离试卷` }),
  }, loginA.accessToken);
  const paperWithItem = await mustRequest(`/admin/papers/${paper.id}/question-groups`, {
    method: 'POST',
    body: JSON.stringify({ groupId: group.id }),
  }, loginA.accessToken);
  const question = paperWithItem.items?.[0]?.group?.questions?.[0];
  assert(question?.id, 'Created paper did not include question');

  const bReadGroup = await request(`/admin/question-groups/${group.id}`, { method: 'GET' }, loginB.accessToken);
  assert(!bReadGroup.ok, 'Owner B could read owner A question group');
  const bReadPaper = await request(`/admin/papers/${paper.id}`, { method: 'GET' }, loginB.accessToken);
  assert(!bReadPaper.ok, 'Owner B could read owner A paper');

  const studentOne = ownerA.students[0];
  const studentTwo = ownerA.students[1];
  const studentOneLogin = await mustRequest('/student/login', {
    method: 'POST',
    body: JSON.stringify({ ownerUsername: ownerA.username, studentId: studentOne.id.toString() }),
  });
  const studentTwoLogin = await mustRequest('/student/login', {
    method: 'POST',
    body: JSON.stringify({ ownerUsername: ownerA.username, studentId: studentTwo.id.toString() }),
  });

  await mustRequest('/student/submissions/paper-attempts', {
    method: 'POST',
    body: JSON.stringify({
      paperId: paper.id,
      durationSeconds: 10,
      answers: [{
        questionId: question.id,
        groupId: group.id,
        paperId: paper.id,
        answerData: { blank_1: '14' },
        correctData: { blank_1: '15' },
        isCorrect: false,
        score: 0,
        maxScore: 1,
        details: [{ slotKey: 'blank_1', studentValue: '14', correctValue: '15', isCorrect: false, score: 0 }],
      }],
    }),
  }, studentOneLogin.accessToken);

  const oneWrong = await mustRequest('/student/submissions/wrong-answers', { method: 'GET' }, studentOneLogin.accessToken);
  const twoWrong = await mustRequest('/student/submissions/wrong-answers', { method: 'GET' }, studentTwoLogin.accessToken);
  assert(oneWrong.some((item) => String(item.questionId) === String(question.id)), 'Student one cannot see own wrong answer');
  assert(!twoWrong.some((item) => String(item.questionId) === String(question.id)), 'Student two can see student one wrong answer');

  const adminOneWrong = await mustRequest(`/admin/submissions/wrong-answers?studentId=${studentOne.id}`, { method: 'GET' }, loginA.accessToken);
  const adminTwoWrong = await mustRequest(`/admin/submissions/wrong-answers?studentId=${studentTwo.id}`, { method: 'GET' }, loginA.accessToken);
  assert(adminOneWrong.some((item) => String(item.questionId) === String(question.id)), 'Admin cannot see selected student one wrong answer');
  assert(!adminTwoWrong.some((item) => String(item.questionId) === String(question.id)), 'Admin selected student two can see student one wrong answer');

  const adminOneRewards = await mustRequest(`/admin/student/rewards?studentId=${studentOne.id}`, { method: 'GET' }, loginA.accessToken);
  const adminTwoRewards = await mustRequest(`/admin/student/rewards?studentId=${studentTwo.id}`, { method: 'GET' }, loginA.accessToken);
  assert(Number(adminOneRewards.stars || 0) > 0, 'Admin selected student one rewards did not include earned stars');
  assert(Number(adminTwoRewards.stars || 0) === 0, 'Admin selected student two rewards included student one stars');

  await mustRequest(`/admin/student/rewards/catalog?studentId=${studentOne.id}`, {
    method: 'PUT',
    body: JSON.stringify({ catalog: [{ id: 'smoke_reward', title: `${marker} 兑换奖励`, cost: 1, enabled: true }] }),
  }, loginA.accessToken);
  const oneRequestedRewards = await mustRequest('/student/rewards/redemptions', {
    method: 'POST',
    body: JSON.stringify({ rewardId: 'smoke_reward' }),
  }, studentOneLogin.accessToken);
  const pendingRedemption = (oneRequestedRewards.redemptions || []).find((item) => item.rewardId === 'smoke_reward' && item.status === 'PENDING');
  assert(pendingRedemption, 'Student one reward redemption was not created');
  const twoRewardsAfterRequest = await mustRequest('/student/rewards', { method: 'GET' }, studentTwoLogin.accessToken);
  assert(!(twoRewardsAfterRequest.redemptions || []).some((item) => item.rewardId === 'smoke_reward'), 'Student two can see student one reward redemption');
  const oneApprovedRewards = await mustRequest(`/admin/student/rewards/redemptions/${pendingRedemption.id}/confirm?studentId=${studentOne.id}`, {
    method: 'POST',
    body: JSON.stringify({ status: 'APPROVED' }),
  }, loginA.accessToken);
  const approvedRedemption = (oneApprovedRewards.redemptions || []).find((item) => item.id === pendingRedemption.id);
  assert(approvedRedemption?.status === 'APPROVED', 'Reward redemption approval was not saved');
  assert(Number(oneApprovedRewards.stars) === Number(adminOneRewards.stars) - 1, 'Approved redemption did not deduct one star from student one');
  const adminTwoRewardsAfterApproval = await mustRequest(`/admin/student/rewards?studentId=${studentTwo.id}`, { method: 'GET' }, loginA.accessToken);
  assert(!(adminTwoRewardsAfterApproval.redemptions || []).some((item) => item.id === pendingRedemption.id), 'Admin selected student two can see student one redemption');

  await mustRequest(`/admin/student/task-settings?studentId=${studentOne.id}`, {
    method: 'PUT',
    body: JSON.stringify({ requireWrongFirst: false, targetAccuracy: 88, dailyLimit: 3, paperIds: [String(paper.id)] }),
  }, loginA.accessToken);
  const adminOneTasks = await mustRequest(`/admin/student/task-settings?studentId=${studentOne.id}`, { method: 'GET' }, loginA.accessToken);
  const adminTwoTasks = await mustRequest(`/admin/student/task-settings?studentId=${studentTwo.id}`, { method: 'GET' }, loginA.accessToken);
  assert(Number(adminOneTasks.dailyLimit) === 3 && Number(adminOneTasks.targetAccuracy) === 88, 'Admin selected student one task settings were not saved');
  assert(Number(adminTwoTasks.dailyLimit) !== 3 && Number(adminTwoTasks.targetAccuracy) !== 88, 'Admin selected student two task settings leaked from student one');

  console.log(JSON.stringify({
    ok: true,
    ownerIsolation: {
      ownerBReadOwnerAGroupStatus: bReadGroup.status,
      ownerBReadOwnerAPaperStatus: bReadPaper.status,
    },
    studentIsolation: {
      studentOneWrongCount: oneWrong.length,
      studentTwoWrongCount: twoWrong.length,
      adminStudentOneWrongCount: adminOneWrong.length,
      adminStudentTwoWrongCount: adminTwoWrong.length,
      adminStudentOneStars: adminOneRewards.stars,
      adminStudentTwoStars: adminTwoRewards.stars,
      rewardRedemptionStatus: approvedRedemption?.status,
      studentOneStarsAfterRedemption: oneApprovedRewards.stars,
    },
    message: '隔离验收通过：跨 owner 资源不可读，同 owner 多学生错题互不串。',
  }, null, 2));
} finally {
  await cleanup().catch(() => {});
  if (prisma) await prisma.$disconnect();
}
