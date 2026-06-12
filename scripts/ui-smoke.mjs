import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { PrismaClient } from '@prisma/client';

const API_BASE = process.env.API_BASE || 'http://127.0.0.1:3000';
const WEB_BASE = process.env.WEB_BASE || 'http://127.0.0.1:4173';
const apiUrl = new URL(API_BASE);
const webUrl = new URL(WEB_BASE);
const apiPort = apiUrl.port || '3000';
const webHost = webUrl.hostname || '127.0.0.1';
const webPort = webUrl.port || '4173';
const marker = `E2E_UI_${Date.now()}`;
const password = 'ui-pass-123';
const prisma = new PrismaClient();

function pnpmCommand() {
  return process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
}

async function createExcelImportFile() {
  const XLSX = await import(pathToFileURL(resolve('apps/admin-web/node_modules/xlsx/xlsx.mjs')).href);
  const title = `${marker} Excel import question`;
  const filename = `${marker}-excel-ui-smoke.xlsx`;
  const filePath = join(tmpdir(), filename);
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet([{
    title,
    gradeLevel: 'Grade 2',
    difficulty: 1,
    tags: `UI smoke|${marker}`,
    question_type: 'fill_blank',
    stem: `${marker} Excel {{blank:1}}`,
    answer: 'ok',
    options: '',
    explanation: 'UI smoke Excel import explanation',
  }]);
  XLSX.utils.book_append_sheet(workbook, sheet, 'questions');
  const data = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
  await writeFile(filePath, data);
  return { filePath, filename, title };
}

function browserExecutablePath() {
  const candidates = [
    process.env.CHROME_PATH,
    process.env.PLAYWRIGHT_CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    `${process.env.LOCALAPPDATA || ''}\\Google\\Chrome\\Application\\chrome.exe`,
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter(Boolean);
  return candidates.find((candidate) => existsSync(candidate));
}

async function hashPassword(value) {
  const bcrypt = await import('../apps/api/node_modules/bcryptjs/index.js');
  return (bcrypt.hash ?? bcrypt.default.hash)(value, 10);
}

async function cleanup() {
  const users = await prisma.user.findMany({
    where: { username: { startsWith: marker } },
    select: { id: true },
  });
  const ownerIds = users.map((user) => user.id);
  if (!ownerIds.length) return;
  const students = await prisma.student.findMany({ where: { ownerId: { in: ownerIds } }, select: { id: true } });
  const studentIds = students.map((student) => student.id);
  const groupIds = (await prisma.questionGroup.findMany({ where: { ownerId: { in: ownerIds } }, select: { id: true } })).map((item) => item.id);
  const questionIds = (await prisma.question.findMany({ where: { ownerId: { in: ownerIds } }, select: { id: true } })).map((item) => item.id);
  const paperIds = (await prisma.paper.findMany({ where: { ownerId: { in: ownerIds } }, select: { id: true } })).map((item) => item.id);
  const batchIds = (await prisma.importBatch.findMany({ where: { ownerId: { in: ownerIds } }, select: { id: true } })).map((item) => item.id);
  const knowledgePointIds = (await prisma.knowledgePoint.findMany({ where: { ownerId: { in: ownerIds } }, select: { id: true } })).map((item) => item.id);
  const subjectIds = (await prisma.subject.findMany({ where: { ownerId: { in: ownerIds } }, select: { id: true } })).map((item) => item.id);

  if (studentIds.length || questionIds.length || groupIds.length || paperIds.length) {
    await prisma.studentAnswerDetail.deleteMany({
      where: {
        answer: {
          OR: [
            ...(studentIds.length ? [{ studentId: { in: studentIds } }] : []),
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
          ...(studentIds.length ? [{ studentId: { in: studentIds } }] : []),
          ...(questionIds.length ? [{ questionId: { in: questionIds } }] : []),
          ...(groupIds.length ? [{ groupId: { in: groupIds } }] : []),
          ...(paperIds.length ? [{ paperId: { in: paperIds } }] : []),
        ],
      },
    });
  }
  if (studentIds.length) await prisma.practiceAttempt.deleteMany({ where: { studentId: { in: studentIds } } });
  if (paperIds.length) await prisma.practiceAttempt.deleteMany({ where: { paperId: { in: paperIds } } });
  if (paperIds.length || groupIds.length || questionIds.length) {
    await prisma.paperQuestion.deleteMany({
      where: {
        OR: [
          ...(paperIds.length ? [{ paperId: { in: paperIds } }] : []),
          ...(groupIds.length ? [{ groupId: { in: groupIds } }] : []),
          ...(questionIds.length ? [{ questionId: { in: questionIds } }] : []),
        ],
      },
    });
  }
  if (paperIds.length) await prisma.paper.deleteMany({ where: { id: { in: paperIds } } });
  if (groupIds.length) await prisma.questionGroupKnowledgePoint.deleteMany({ where: { groupId: { in: groupIds } } });
  if (questionIds.length) {
    await prisma.questionKnowledgePoint.deleteMany({ where: { questionId: { in: questionIds } } });
    await prisma.questionOption.deleteMany({ where: { questionId: { in: questionIds } } });
    await prisma.answerSlot.deleteMany({ where: { questionId: { in: questionIds } } });
    await prisma.question.deleteMany({ where: { id: { in: questionIds } } });
  }
  if (groupIds.length) await prisma.questionGroup.deleteMany({ where: { id: { in: groupIds } } });
  if (batchIds.length) await prisma.importBatch.deleteMany({ where: { id: { in: batchIds } } });
  if (knowledgePointIds.length) await prisma.knowledgePoint.deleteMany({ where: { id: { in: knowledgePointIds } } });
  if (subjectIds.length) await prisma.subject.deleteMany({ where: { id: { in: subjectIds } } });
  if (studentIds.length) {
    await prisma.rewardRedemption.deleteMany({ where: { studentId: { in: studentIds } } });
    await prisma.rewardCatalogItem.deleteMany({ where: { studentId: { in: studentIds } } });
    await prisma.student.deleteMany({ where: { id: { in: studentIds } } });
  }
  await prisma.user.deleteMany({ where: { id: { in: ownerIds } } });
}

async function createOwner() {
  return prisma.user.create({
    data: {
      username: marker,
      passwordHash: await hashPassword(password),
      displayName: marker,
      role: 'ADMIN',
      status: 'ENABLED',
      students: {
        create: [{
          name: 'UI Smoke Student',
          grade: 'Grade 2',
          totalStars: 40,
          rewardCatalogItems: {
            create: [{
              rewardKey: 'ui_reward',
              title: 'UI Smoke Reward',
              cost: 10,
              description: 'Created by UI smoke',
              enabled: true,
            }],
          },
        }],
      },
    },
    include: { students: true },
  });
}

async function isHealthy(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return false;
    if (url.endsWith('/health')) return Boolean((await res.json())?.ok);
    return true;
  } catch {
    return false;
  }
}

async function waitForHttp(url, proc, label) {
  for (let index = 0; index < 60; index += 1) {
    if (await isHealthy(url)) return;
    if (proc?.exitCode !== null) throw new Error(`${label} exited early with code ${proc.exitCode}`);
    await delay(500);
  }
  throw new Error(`${label} did not become ready at ${url}`);
}

async function ensureApi() {
  const url = `${API_BASE}/health`;
  if (await isHealthy(url)) return null;
  if (!existsSync('apps/api/dist/main.js')) throw new Error('API build output is missing. Run `pnpm run build` before `pnpm smoke:ui`.');
  const proc = spawn('node', ['apps/api/dist/main.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: apiPort,
    },
    stdio: 'ignore',
    windowsHide: true,
  });
  await waitForHttp(url, proc, 'API');
  return proc;
}

async function ensureWeb() {
  if (await isHealthy(WEB_BASE)) return null;
  const viteCli = resolve('apps/admin-web/node_modules/vite/bin/vite.js');
  if (!existsSync(viteCli)) throw new Error('Vite CLI is missing. Run `pnpm install --frozen-lockfile` before `pnpm smoke:ui`.');
  const proc = spawn(process.execPath, [viteCli, '--host', webHost, '--port', webPort], {
    cwd: resolve('apps/admin-web'),
    stdio: 'ignore',
    windowsHide: true,
  });
  await waitForHttp(WEB_BASE, proc, 'admin web');
  return proc;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function stopProcessTree(proc) {
  if (!proc || proc.exitCode !== null || !proc.pid) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(proc.pid), '/t', '/f'], {
      stdio: 'ignore',
      windowsHide: true,
    });
    return;
  }
  proc.kill();
}

async function loginAdmin(page, username) {
  await page.goto(`${WEB_BASE}/login`);
  await page.getByLabel('用户名').fill(username);
  await page.getByLabel('密码').fill(password);
  await page.getByRole('button', { name: '登录' }).click();
  await page.waitForURL(/\/parent/, { timeout: 10000 });
}

async function exerciseImportUi(page) {
  await page.goto(`${WEB_BASE}/parent/questions/import-json`);
  await page.getByRole('heading', { name: '导入题目 JSON' }).waitFor({ timeout: 10000 });
  const badSample = [{
    type: 'question',
    title: '濂栧姳涓€乱码测试',
    gradeLevel: '二年级',
    difficulty: 1,
    tags: ['UI smoke'],
    question: {
      question_type: 'fill_blank',
      stem: '濂栧姳涓€ {{blank:1}}',
      answer_slots: [{ slot_key: 'blank_1', slot_type: 'text', correct_answer: ['ok'] }],
    },
  }];
  await page.locator('textarea').first().fill(JSON.stringify(badSample, null, 2));
  await page.getByText('疑似中文乱码').first().waitFor({ timeout: 10000 });
  await page.getByRole('button', { name: '定位第一道需处理题' }).click();
  await page.getByText('已定位第 1 道需处理题。').waitFor({ timeout: 10000 });
  await page.getByRole('button', { name: /显示全部题目|只看需处理/ }).waitFor({ timeout: 10000 });

  await page.locator('textarea').first().fill('[{]');
  await page.getByText(/JSON 解析失败：.*第 \d+ 行第 \d+ 列/).waitFor({ timeout: 10000 });

  const excelImport = await createExcelImportFile();
  try {
    await page.locator('input[type="file"]').setInputFiles(excelImport.filePath);
    await page.waitForFunction(
      (title) => document.querySelector('textarea')?.value.includes(String(title)),
      excelImport.title,
      { timeout: 10000 },
    );
    await page.getByText(excelImport.filename).waitFor({ timeout: 10000 });
  } finally {
    await rm(excelImport.filePath, { force: true }).catch(() => {});
  }
  await page.getByRole('button', { name: /导入 1 道有效题/ }).click();
  await page.getByText('已导入题组 ID：').waitFor({ timeout: 20000 });
  await page.getByText(/批次 ID：\d+，状态：已完成/).waitFor({ timeout: 10000 });
  await page.getByRole('button', { name: '生成验收试卷' }).click();
  await page.getByText(/已生成验收试卷：\d+/).waitFor({ timeout: 20000 });
  await page.getByRole('button', { name: '查看批次列表' }).click();
  await page.waitForURL(/\/parent\/questions\/import-batches/, { timeout: 10000 });
  await page.getByRole('heading', { name: '导入批次' }).waitFor({ timeout: 10000 });
  await page.getByText('当前显示 1 个批次').waitFor({ timeout: 10000 });
  await page.getByText(excelImport.filename).waitFor({ timeout: 10000 });
  await page.locator('.filter-bar select').nth(2).selectOption('CLEAN');
  await page.getByText('当前显示 1 个批次').waitFor({ timeout: 10000 });
  await page.getByRole('button', { name: '查看验收卷' }).first().waitFor({ timeout: 10000 });
  await page.getByRole('button', { name: '孩子端验收' }).first().waitFor({ timeout: 10000 });
  await page.getByRole('button', { name: '查看详情' }).first().click();
  await page.waitForURL(/\/parent\/questions\/import-batches\/\d+/, { timeout: 10000 });
  await page.getByRole('heading', { name: '导入批次详情' }).waitFor({ timeout: 10000 });
  await page.getByText(excelImport.filename).waitFor({ timeout: 10000 });
  await page.getByText('题型统计').waitFor({ timeout: 10000 });
  await page.getByText('验收试卷').waitFor({ timeout: 10000 });
}

async function exerciseRewardUi(page, owner) {
  const student = owner.students[0];

  await page.evaluate(() => {
    localStorage.removeItem('kidsQuiz.studentToken');
    localStorage.removeItem('kidsQuiz.studentSession');
  });
  await page.goto(`${WEB_BASE}/student-login`);
  await page.locator('.studentLoginOwner input').fill(owner.username);
  await page.getByRole('button', { name: '刷新' }).click();
  const studentCard = page.locator('.studentLoginCard').filter({ hasText: student.name });
  await studentCard.waitFor({ timeout: 10000 });
  await studentCard.click();
  await page.getByRole('button', { name: '进入孩子端' }).click();
  await page.waitForURL(/\/$/, { timeout: 10000 });

  await page.goto(`${WEB_BASE}/kid/rewards`);
  const rewardCard = page.locator('.reward-catalog-item').filter({ hasText: 'UI Smoke Reward' });
  await rewardCard.getByRole('button', { name: '申请兑换' }).click();
  await page.getByText('已提交兑换申请：UI Smoke Reward').waitFor({ timeout: 10000 });

  await page.goto(`${WEB_BASE}/parent/rewards`);
  await page.getByText('全部申请').waitFor({ timeout: 10000 });
  await page.getByText('待审批').first().waitFor({ timeout: 10000 });
  await page.getByRole('button', { name: '导出 CSV' }).waitFor({ timeout: 10000 });
  await page.locator('.filter-bar select').selectOption('PENDING');
  const redemption = page.locator('.reward-redemption-item').filter({ hasText: 'UI Smoke Reward' });
  await redemption.waitFor({ timeout: 10000 });
  await redemption.getByRole('button', { name: '批准' }).click();
  await page.getByText('兑换已批准，星星已扣除').waitFor({ timeout: 10000 });
  await page.locator('.filter-bar select').selectOption('APPROVED');
  await page.locator('.reward-redemption-item').filter({ hasText: 'UI Smoke Reward' }).waitFor({ timeout: 10000 });

  const updated = await prisma.student.findUnique({ where: { id: student.id }, select: { totalStars: true } });
  const approved = await prisma.rewardRedemption.findFirst({
    where: { studentId: student.id, rewardKey: 'ui_reward' },
    orderBy: { requestedAt: 'desc' },
  });
  assert(updated?.totalStars === 30, 'UI reward approval did not deduct stars in the database');
  assert(approved?.status === 'APPROVED', 'UI reward approval did not persist APPROVED status');
}

let apiProc = null;
let webProc = null;
let browser = null;
let failure = null;
let exitCode = 1;

try {
  await cleanup();
  const owner = await createOwner();
  apiProc = await ensureApi();
  webProc = await ensureWeb();
  const executablePath = browserExecutablePath();
  if (!executablePath) throw new Error('No Chrome/Edge executable found. Set CHROME_PATH to run `pnpm smoke:ui`.');
  browser = await chromium.launch({ executablePath, headless: true });
  const page = await browser.newPage();

  await loginAdmin(page, owner.username);
  await exerciseImportUi(page);
  await exerciseRewardUi(page, owner);

  console.log(JSON.stringify({
    ok: true,
    owner: owner.username,
    studentId: owner.students[0].id.toString(),
    message: 'UI smoke passed: import, batch tracking, review paper, and reward approval flows are working.',
  }, null, 2));
  exitCode = 0;
} catch (error) {
  failure = error;
} finally {
  if (browser) await browser.close().catch(() => {});
  stopProcessTree(apiProc);
  stopProcessTree(webProc);
  await cleanup().catch(() => {});
  await prisma.$disconnect();
}

if (failure) {
  console.error(failure instanceof Error ? failure.stack || failure.message : String(failure));
  process.exit(1);
}

process.exit(exitCode);
