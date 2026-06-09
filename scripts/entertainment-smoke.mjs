const API_BASE = process.env.API_BASE || 'http://127.0.0.1:3000';
const marker = `E2E_GAME_${Date.now()}`;
const password = 'game-pass-123';
const gameKeys = ['2048', '24', 'sudoku', 'gomoku', 'memory'];

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
  await db.student.deleteMany({ where: { ownerId: { in: ownerIds } } });
  await db.user.deleteMany({ where: { id: { in: ownerIds } } });
}

async function createOwner() {
  const db = await getPrisma();
  const user = await db.user.create({
    data: {
      username: marker,
      passwordHash: await hashPassword(password),
      displayName: marker,
      role: 'ADMIN',
      status: 'ENABLED',
      students: { create: [{ name: '娱乐验收学生', grade: '二年级' }] },
    },
    include: { students: true },
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
  return { ok: res.ok, status: res.status, body: text ? JSON.parse(text) : null, text };
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
  const owner = await createOwner();
  const student = owner.students[0];

  const health = await mustRequest('/health', { method: 'GET', headers: {} });
  assert(health?.ok, 'API health check failed');

  const adminLogin = await mustRequest('/admin/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username: owner.username, password }),
  });
  const adminToken = adminLogin.accessToken;
  assert(adminToken, 'Admin login did not return an access token');

  const studentLogin = await mustRequest('/student/login', {
    method: 'POST',
    body: JSON.stringify({ ownerUsername: owner.username, studentId: student.id.toString() }),
  });
  const studentToken = studentLogin.accessToken;
  assert(studentToken, 'Student login did not return an access token');

  const defaultSettings = await mustRequest(`/admin/student/task-settings?studentId=${student.id}`, { method: 'GET' }, adminToken);
  assert(defaultSettings.entertainmentEnabled === true, 'Default entertainmentEnabled should be true');
  assert(Number(defaultSettings.entertainmentDailyLimitSeconds) === 1800, 'Default entertainment limit should be 1800 seconds');
  assert(gameKeys.every((key) => defaultSettings.entertainmentAllowedGames.includes(key)), 'Default allowed games missing keys');

  const cappedSettings = await mustRequest(`/admin/student/task-settings?studentId=${student.id}`, {
    method: 'PUT',
    body: JSON.stringify({
      entertainmentEnabled: true,
      entertainmentDailyLimitSeconds: 3600,
      entertainmentAllowedGames: ['24'],
    }),
  }, adminToken);
  assert(Number(cappedSettings.entertainmentDailyLimitSeconds) === 1800, 'Entertainment limit should cap at 1800 seconds');

  const cappedState = await mustRequest('/student/entertainment-session', { method: 'GET' }, studentToken);
  assert(Number(cappedState.dailyLimitSeconds) === 1800, 'Student entertainment state should cap at 1800 seconds');

  await mustRequest(`/admin/student/task-settings?studentId=${student.id}`, {
    method: 'PUT',
    body: JSON.stringify({
      requireWrongFirst: false,
      targetAccuracy: 86,
      dailyLimit: 4,
      paperIds: [],
      entertainmentEnabled: false,
      entertainmentDailyLimitSeconds: 60,
      entertainmentAllowedGames: ['2048', 'sudoku'],
    }),
  }, adminToken);

  const disabledState = await mustRequest('/student/entertainment-session', { method: 'GET' }, studentToken);
  assert(disabledState.enabled === false, 'Disabled entertainment state did not reflect settings');
  assert(disabledState.locked === true, 'Disabled entertainment should be locked');
  assert(Number(disabledState.dailyLimitSeconds) === 60, 'Disabled state did not use configured limit');
  assert(disabledState.allowedGames.join(',') === '2048,sudoku', 'Allowed games did not match configured list');

  const disabledUsage = await mustRequest('/student/entertainment-session/usage', {
    method: 'POST',
    body: JSON.stringify({ addSeconds: 10 }),
  }, studentToken);
  assert(Number(disabledUsage.usedSeconds) === 0, 'Usage should not increase while entertainment is disabled');

  await mustRequest(`/admin/student/task-settings?studentId=${student.id}`, {
    method: 'PUT',
    body: JSON.stringify({ requireWrongFirst: true, targetAccuracy: 90, dailyLimit: 5 }),
  }, adminToken);
  const preservedSettings = await mustRequest(`/admin/student/task-settings?studentId=${student.id}`, { method: 'GET' }, adminToken);
  assert(preservedSettings.entertainmentEnabled === false, 'Learning-only task update should preserve entertainmentEnabled');
  assert(Number(preservedSettings.entertainmentDailyLimitSeconds) === 60, 'Learning-only task update should preserve entertainment limit');
  assert(preservedSettings.entertainmentAllowedGames.join(',') === '2048,sudoku', 'Learning-only task update should preserve allowed games');

  await mustRequest(`/admin/student/task-settings?studentId=${student.id}`, {
    method: 'PUT',
    body: JSON.stringify({
      entertainmentEnabled: true,
      entertainmentDailyLimitSeconds: 60,
      entertainmentAllowedGames: ['gomoku'],
    }),
  }, adminToken);

  const enabledState = await mustRequest('/student/entertainment-session', { method: 'GET' }, studentToken);
  assert(enabledState.enabled === true, 'Enabled entertainment state did not reflect settings');
  assert(enabledState.locked === false, 'Enabled entertainment should not start locked');
  assert(enabledState.allowedGames.join(',') === 'gomoku', 'Enabled state did not use configured game list');
  assert(Number(enabledState.remainingSeconds) === 60, 'Enabled state did not start with configured remaining time');

  const usedState = await mustRequest('/student/entertainment-session/usage', {
    method: 'POST',
    body: JSON.stringify({ addSeconds: 7 }),
  }, studentToken);
  assert(Number(usedState.usedSeconds) === 7, 'Entertainment usage was not accumulated');
  assert(Number(usedState.remainingSeconds) === 53, 'Entertainment remaining seconds were not reduced');

  const lockedState = await mustRequest('/student/entertainment-session/usage', {
    method: 'POST',
    body: JSON.stringify({ addSeconds: 60 }),
  }, studentToken);
  assert(Number(lockedState.usedSeconds) === 60, 'Entertainment usage should cap at daily limit');
  assert(lockedState.locked === true && Number(lockedState.remainingSeconds) === 0, 'Entertainment should lock at daily limit');

  const resetState = await mustRequest(`/admin/student/entertainment-session/reset?studentId=${student.id}`, {
    method: 'POST',
  }, adminToken);
  assert(Number(resetState.usedSeconds) === 0, 'Entertainment reset should clear used seconds');
  assert(Number(resetState.remainingSeconds) === 60, 'Entertainment reset should restore remaining seconds');
  assert(resetState.locked === false, 'Entertainment reset should unlock enabled entertainment center');

  console.log(JSON.stringify({
    ok: true,
    studentId: student.id.toString(),
    disabled: {
      locked: disabledState.locked,
      allowedGames: disabledState.allowedGames,
    },
    enabled: {
      allowedGames: enabledState.allowedGames,
      usedSeconds: lockedState.usedSeconds,
      remainingSeconds: lockedState.remainingSeconds,
      resetRemainingSeconds: resetState.remainingSeconds,
    },
    message: '娱乐中心验收通过：家长设置、学生会话、时长累计和锁定均生效。',
  }, null, 2));
} finally {
  await cleanup().catch(() => {});
  if (prisma) await prisma.$disconnect();
}
