import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';

const API_BASE = process.env.API_BASE || 'http://127.0.0.1:3000';
const apiHealthUrl = `${API_BASE}/health`;
const apiPort = new URL(API_BASE).port || '3000';

function pnpmCommand() {
  return process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
}

function log(message) {
  console.log(`[smoke:all] ${message}`);
}

async function isHealthy(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return false;
    return Boolean((await res.json())?.ok);
  } catch {
    return false;
  }
}

async function waitForApi(proc) {
  for (let index = 0; index < 60; index += 1) {
    if (await isHealthy(apiHealthUrl)) return;
    if (proc?.exitCode !== null) throw new Error(`API exited early with code ${proc.exitCode}`);
    await delay(500);
  }
  throw new Error(`API did not become ready at ${apiHealthUrl}`);
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

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    log(`running: ${[command, ...args].join(' ')}`);
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: {
        ...process.env,
        API_BASE,
        ...(options.env || {}),
      },
      stdio: 'inherit',
      shell: process.platform === 'win32',
      windowsHide: true,
    });

    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${[command, ...args].join(' ')} failed with ${signal || `exit code ${code}`}`));
    });
  });
}

async function ensureApi() {
  if (await isHealthy(apiHealthUrl)) {
    log(`using existing API at ${API_BASE}`);
    return null;
  }

  if (!existsSync('apps/api/dist/main.js')) {
    throw new Error('API build output is missing after build: apps/api/dist/main.js');
  }

  log(`starting built API at ${API_BASE}`);
  const proc = spawn('node', ['apps/api/dist/main.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      API_BASE,
      PORT: apiPort,
    },
    stdio: 'ignore',
    windowsHide: true,
  });
  await waitForApi(proc);
  return proc;
}

const smokeSteps = [
  ['smoke:e2e', ['run', 'smoke:e2e']],
  ['smoke:import', ['run', 'smoke:import']],
  ['smoke:isolation', ['run', 'smoke:isolation']],
  ['smoke:rewards', ['run', 'smoke:rewards']],
  ['smoke:entertainment', ['run', 'smoke:entertainment']],
  ['smoke:ui', ['run', 'smoke:ui']],
];

let apiProc = null;
let failure = null;
let exitCode = 1;

try {
  await run(pnpmCommand(), ['run', 'build']);
  apiProc = await ensureApi();

  for (const [name, args] of smokeSteps) {
    log(`starting ${name}`);
    await run(pnpmCommand(), args);
    log(`passed ${name}`);
  }

  log('all smoke checks passed');
  exitCode = 0;
} catch (error) {
  failure = error;
} finally {
  stopProcessTree(apiProc);
}

if (failure) {
  console.error(failure instanceof Error ? failure.stack || failure.message : String(failure));
  process.exit(1);
}

process.exit(exitCode);
