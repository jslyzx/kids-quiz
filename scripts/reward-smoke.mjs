const API_BASE = process.env.API_BASE || 'http://127.0.0.1:3000';
const marker = `E2E_REWARD_${Date.now()}`;
const password = 'reward-pass-123';

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

  if (studentIds.length) {
    await db.rewardRedemption.deleteMany({ where: { studentId: { in: studentIds } } });
    await db.rewardCatalogItem.deleteMany({ where: { studentId: { in: studentIds } } });
    await db.student.deleteMany({ where: { id: { in: studentIds } } });
  }
  await db.user.deleteMany({ where: { id: { in: ownerIds } } });
}

async function createOwner() {
  const db = await getPrisma();
  return db.user.create({
    data: {
      username: marker,
      passwordHash: await hashPassword(password),
      displayName: marker,
      role: 'ADMIN',
      status: 'ENABLED',
      students: {
        create: [
          {
            name: 'Reward Smoke Student',
            grade: 'Grade 2',
            totalStars: 50,
          },
          {
            name: 'Legacy Reward Student',
            grade: 'Grade 2',
            totalStars: 25,
            taskSettings: {
              rewardCatalog: [
                {
                  id: 'legacy_reward',
                  title: 'Legacy Reward',
                  cost: 7,
                  description: 'Migrated from taskSettings JSON',
                  enabled: true,
                },
              ],
              rewardRedemptions: [
                {
                  id: 'legacy_request_json',
                  rewardId: 'legacy_reward',
                  title: 'Legacy Reward',
                  cost: 7,
                  status: 'REJECTED',
                  requestedAt: '2026-01-02T03:04:05.000Z',
                  confirmedAt: '2026-01-03T04:05:06.000Z',
                },
              ],
            },
          },
        ],
      },
    },
    include: { students: { orderBy: { id: 'asc' } } },
  });
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
  const db = await getPrisma();
  const owner = await createOwner();
  const [student, legacyStudent] = owner.students;

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

  const initialRewards = await mustRequest(`/admin/student/rewards?studentId=${student.id}`, { method: 'GET' }, adminToken);
  assert((initialRewards.catalog || []).length >= 3, 'Default reward catalog was not returned');
  const defaultCatalogCount = await db.rewardCatalogItem.count({ where: { studentId: student.id } });
  assert(defaultCatalogCount === initialRewards.catalog.length, 'Default reward catalog was not stored in reward_catalog_items');

  const savedCatalog = await mustRequest(`/admin/student/rewards/catalog?studentId=${student.id}`, {
    method: 'PUT',
    body: JSON.stringify({
      catalog: [
        {
          id: 'screen_15',
          title: 'Screen Time Pass',
          cost: 30,
          description: 'Parent-approved screen time',
          enabled: false,
        },
        {
          id: 'smoke_reward',
          title: 'Smoke Test Reward',
          cost: 15,
          description: 'Redeemed by the reward smoke test',
          enabled: true,
        },
      ],
    }),
  }, adminToken);
  assert(savedCatalog.catalog.length === 2, 'Reward catalog update did not replace the catalog');

  const dbCatalogItem = await db.rewardCatalogItem.findUnique({
    where: { studentId_rewardKey: { studentId: student.id, rewardKey: 'smoke_reward' } },
  });
  assert(dbCatalogItem?.title === 'Smoke Test Reward', 'Updated catalog item was not persisted');
  assert(dbCatalogItem?.enabled === true, 'Updated catalog enabled flag was not persisted');

  const pendingRewards = await mustRequest('/student/rewards/redemptions', {
    method: 'POST',
    body: JSON.stringify({ rewardId: 'smoke_reward' }),
  }, studentToken);
  const pending = (pendingRewards.redemptions || []).find((item) => item.rewardId === 'smoke_reward' && item.status === 'PENDING');
  assert(pending, 'Student reward redemption request was not returned as pending');

  const dbPending = await db.rewardRedemption.findFirst({
    where: { studentId: student.id, rewardKey: 'smoke_reward', status: 'PENDING' },
  });
  assert(dbPending?.catalogItemId?.toString() === dbCatalogItem.id.toString(), 'Reward redemption was not linked to the catalog item');
  assert(Number(pendingRewards.stars) === 50, 'Pending redemption should not deduct stars');

  const approvedRewards = await mustRequest(`/admin/student/rewards/redemptions/${pending.id}/confirm?studentId=${student.id}`, {
    method: 'POST',
    body: JSON.stringify({ status: 'APPROVED' }),
  }, adminToken);
  const approved = (approvedRewards.redemptions || []).find((item) => item.id === pending.id);
  assert(approved?.status === 'APPROVED', 'Approved redemption was not returned as approved');
  assert(Number(approvedRewards.stars) === 35, 'Approved redemption did not deduct the reward cost');

  const dbApproved = await db.rewardRedemption.findFirst({
    where: { id: BigInt(pending.id), studentId: student.id },
  });
  assert(dbApproved?.status === 'APPROVED', 'Approved redemption was not persisted');
  assert(dbApproved?.confirmedAt, 'Approved redemption did not store confirmedAt');

  const legacyRewards = await mustRequest(`/admin/student/rewards?studentId=${legacyStudent.id}`, { method: 'GET' }, adminToken);
  assert((legacyRewards.catalog || []).some((item) => item.id === 'legacy_reward'), 'Legacy reward catalog was not migrated');
  assert((legacyRewards.redemptions || []).some((item) => item.rewardId === 'legacy_reward' && item.status === 'REJECTED'), 'Legacy reward redemption was not migrated');

  const legacyCatalogCount = await db.rewardCatalogItem.count({ where: { studentId: legacyStudent.id, rewardKey: 'legacy_reward' } });
  const legacyRedemptionCount = await db.rewardRedemption.count({ where: { studentId: legacyStudent.id, rewardKey: 'legacy_reward' } });
  assert(legacyCatalogCount === 1, 'Legacy catalog migration did not create exactly one row');
  assert(legacyRedemptionCount === 1, 'Legacy redemption migration did not create exactly one row');

  await mustRequest(`/admin/student/rewards?studentId=${legacyStudent.id}`, { method: 'GET' }, adminToken);
  const legacyRedemptionCountAfterSecondRead = await db.rewardRedemption.count({ where: { studentId: legacyStudent.id, rewardKey: 'legacy_reward' } });
  assert(legacyRedemptionCountAfterSecondRead === 1, 'Legacy redemption migration created duplicates on a second read');

  const legacyTaskSettings = await mustRequest(`/admin/student/task-settings?studentId=${legacyStudent.id}`, { method: 'GET' }, adminToken);
  assert(!Object.hasOwn(legacyTaskSettings, 'rewardCatalog'), 'Task settings leaked legacy rewardCatalog');
  assert(!Object.hasOwn(legacyTaskSettings, 'rewardRedemptions'), 'Task settings leaked legacy rewardRedemptions');

  console.log(JSON.stringify({
    ok: true,
    studentId: student.id.toString(),
    legacyStudentId: legacyStudent.id.toString(),
    reward: {
      pendingRedemptionId: pending.id,
      approvedStars: approvedRewards.stars,
      catalogCount: savedCatalog.catalog.length,
    },
    legacyMigration: {
      catalogRows: legacyCatalogCount,
      redemptionRows: legacyRedemptionCountAfterSecondRead,
    },
    message: 'Reward catalog and redemption smoke passed.',
  }, null, 2));
} finally {
  await cleanup().catch(() => {});
  if (prisma) await prisma.$disconnect();
}
