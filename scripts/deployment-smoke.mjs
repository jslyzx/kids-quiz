const DEFAULT_WEB_BASE = 'http://127.0.0.1';
const REQUEST_TIMEOUT_MS = Number(process.env.DEPLOYMENT_SMOKE_TIMEOUT_MS || 10000);

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) continue;
    const [rawKey, inlineValue] = arg.slice(2).split(/=(.*)/s, 2);
    const key = rawKey.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
    if (inlineValue !== undefined) {
      options[key] = inlineValue;
      continue;
    }
    const next = argv[index + 1];
    if (next && !next.startsWith('--')) {
      options[key] = next;
      index += 1;
    } else {
      options[key] = '1';
    }
  }
  return options;
}

function trimTrailingSlash(value) {
  return value.replace(/\/+$/, '');
}

function normalizeAbsoluteBase(value, label) {
  try {
    const url = new URL(value);
    return trimTrailingSlash(url.toString());
  } catch {
    throw new Error(`${label} must be an absolute URL, received: ${value}`);
  }
}

function resolveBase(value, fallback, webBase) {
  const raw = (value || fallback).trim();
  if (raw.startsWith('/')) return trimTrailingSlash(new URL(raw, webBase).toString());
  return normalizeAbsoluteBase(raw, 'base URL');
}

function withPath(base, path) {
  return `${trimTrailingSlash(base)}${path.startsWith('/') ? path : `/${path}`}`;
}

function log(message) {
  console.log(`[smoke:deployment] ${message}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function request(url, init = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      ...init,
      signal: controller.signal,
      headers: {
        'User-Agent': 'kids-quiz-deployment-smoke',
        ...(init.headers || {}),
      },
    });
    const text = await res.text();
    return {
      res,
      text,
      contentType: res.headers.get('content-type') || '',
    };
  } finally {
    clearTimeout(timeout);
  }
}

function looksLikeHtml(text, contentType = '') {
  return contentType.toLowerCase().includes('text/html') || /<(doctype|html|body|div)\b/i.test(text.slice(0, 500));
}

function toAbsoluteAssetUrl(assetPath, webBase) {
  return new URL(assetPath, `${trimTrailingSlash(webBase)}/`).toString();
}

async function checkWebIndex(webBase) {
  log(`checking web index: ${webBase}`);
  const { res, text, contentType } = await request(webBase, {
    headers: { Accept: 'text/html' },
  });
  assert(res.ok, `web index returned HTTP ${res.status}`);
  assert(looksLikeHtml(text, contentType), 'web index did not return HTML');
  assert(text.includes('id="root"'), 'web index is missing the React root element');

  const assetMatches = Array.from(text.matchAll(/<(?:script|link)\b[^>]+(?:src|href)="([^"]+)"/gi));
  const assetPath = assetMatches.map((match) => match[1]).find((value) => value && !value.startsWith('http') && !value.startsWith('//'));
  assert(assetPath, 'web index did not reference any local JS/CSS asset');

  const assetUrl = toAbsoluteAssetUrl(assetPath, webBase);
  log(`checking first web asset: ${assetUrl}`);
  const asset = await request(assetUrl);
  assert(asset.res.ok, `web asset returned HTTP ${asset.res.status}: ${assetUrl}`);
  assert(!looksLikeHtml(asset.text, asset.contentType), `web asset resolved to HTML instead of an asset: ${assetUrl}`);
}

async function checkSpaFallback(webBase) {
  const url = withPath(webBase, '/parent/questions/import-batches/0');
  log(`checking SPA fallback: ${url}`);
  const { res, text, contentType } = await request(url, {
    headers: { Accept: 'text/html' },
  });
  assert(res.ok, `SPA fallback returned HTTP ${res.status}`);
  assert(looksLikeHtml(text, contentType), 'SPA fallback did not return HTML');
  assert(text.includes('id="root"'), 'SPA fallback did not return the frontend app shell');
}

async function checkApiHealth(apiBase) {
  const url = withPath(apiBase, '/health');
  log(`checking API health: ${url}`);
  const { res, text } = await request(url, {
    headers: { Accept: 'application/json' },
  });
  assert(res.ok, `API health returned HTTP ${res.status}: ${text}`);
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`API health did not return JSON: ${text.slice(0, 200)}`);
  }
  assert(data?.ok, `API health did not report ok: ${text}`);
  return data;
}

async function checkUploadProxy(webBase) {
  const url = withPath(webBase, '/uploads/__kids_quiz_deployment_smoke_missing__.png');
  log(`checking uploads proxy path: ${url}`);
  const { res, text, contentType } = await request(url, {
    headers: { Accept: 'image/*,*/*;q=0.8' },
  });
  assert(![502, 503, 504].includes(res.status), `uploads proxy returned HTTP ${res.status}`);
  assert(!(res.ok && looksLikeHtml(text, contentType)), 'uploads path returned the frontend HTML; Nginx may be missing the /uploads proxy');
}

async function checkCorsIfNeeded(webBase, apiBase) {
  const webOrigin = new URL(webBase).origin;
  const apiOrigin = new URL(apiBase).origin;
  if (webOrigin === apiOrigin) {
    log('skipping CORS preflight: web and API share the same origin');
    return;
  }

  const url = withPath(apiBase, '/health');
  log(`checking CORS preflight: ${url}`);
  const { res } = await request(url, {
    method: 'OPTIONS',
    headers: {
      Origin: webOrigin,
      'Access-Control-Request-Method': 'GET',
    },
  });
  assert(res.ok || res.status === 204, `CORS preflight returned HTTP ${res.status}`);
  const allowOrigin = res.headers.get('access-control-allow-origin') || '';
  assert(allowOrigin === '*' || allowOrigin === webOrigin, `CORS allow-origin mismatch: ${allowOrigin || '<missing>'}`);
}

async function checkAdminLogin(apiBase, username, password) {
  if (!username || !password) {
    log('skipping admin login: set DEPLOY_SMOKE_ADMIN_USERNAME and DEPLOY_SMOKE_ADMIN_PASSWORD to enable it');
    return null;
  }

  const url = withPath(apiBase, '/admin/auth/login');
  log(`checking admin login: ${url}`);
  const { res, text } = await request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ username, password }),
  });
  assert(res.ok, `admin login returned HTTP ${res.status}: ${text}`);
  const data = JSON.parse(text);
  assert(data?.accessToken, 'admin login did not return an access token');
  return data.user?.username || username;
}

const args = parseArgs(process.argv.slice(2));
const webBase = normalizeAbsoluteBase(String(args.webBase || process.env.WEB_BASE || DEFAULT_WEB_BASE), 'WEB_BASE');
const apiBase = resolveBase(String(args.apiBase || process.env.API_BASE || ''), '/api', webBase);
const adminUsername = String(args.adminUsername || process.env.DEPLOY_SMOKE_ADMIN_USERNAME || process.env.ADMIN_USERNAME || '');
const adminPassword = String(args.adminPassword || process.env.DEPLOY_SMOKE_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || '');

try {
  const health = await checkApiHealth(apiBase);
  await checkWebIndex(webBase);
  await checkSpaFallback(webBase);
  await checkUploadProxy(webBase);
  await checkCorsIfNeeded(webBase, apiBase);
  const loginUser = await checkAdminLogin(apiBase, adminUsername, adminPassword);

  console.log(JSON.stringify({
    ok: true,
    webBase,
    apiBase,
    api: {
      service: health.service,
      database: health.database,
      checkedAt: health.checkedAt,
    },
    adminLogin: loginUser ? { ok: true, username: loginUser } : { skipped: true },
    message: 'Deployment smoke passed.',
  }, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
}
