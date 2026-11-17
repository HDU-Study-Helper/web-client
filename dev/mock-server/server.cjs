'use strict';
// Local development only. No platform clients, network calls, files, or real credentials.
const http = require('node:http');
const { randomBytes, randomUUID } = require('node:crypto');

const SOURCES = [
  ['chaoxing', '学习通'], ['mooc', '中国大学 MOOC'], ['ucampus', 'U 校园'], ['jwxt', '模拟杭电教务'],
].map(([source, name]) => ({ source, name, qr_login: source !== 'jwxt', password_login: source === 'jwxt', resources: source === 'jwxt' ? ['schedule'] : ['courses', 'assignments'] }));
const GROUPS = [
  { id: 'mock-class', name: '【模拟】班级通知群' },
  { id: 'mock-math', name: '【模拟】高等数学课程群' },
  { id: 'mock-lab', name: '【模拟】实验课程群' },
  { id: 'mock-english', name: '【模拟】大学英语课程群' },
];
const token = () => randomBytes(24).toString('hex');
const fail = (status, code, message) => { throw Object.assign(new Error(message), { status, code }); };
const validText = (v, max) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
function numberOption(value, fallback, max = 3600000) {
  const n = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(n) || n < 0 || n > max) throw new Error(`Invalid mock numeric option: ${value}`);
  return n;
}
function createMockServer(options = {}) {
  const config = {
    scannedMs: numberOption(options.scannedMs ?? process.env.MOCK_SCANNED_MS, 2000),
    authorizedMs: numberOption(options.authorizedMs ?? process.env.MOCK_AUTHORIZED_MS, 4500),
    expiresMs: numberOption(options.expiresMs ?? process.env.MOCK_EXPIRES_MS, 120000),
    outcome: options.outcome ?? process.env.MOCK_AUTH_OUTCOME ?? 'authorized',
  };
  if (!['authorized', 'expired', 'failed'].includes(config.outcome)) throw new Error('MOCK_AUTH_OUTCOME must be authorized, expired, or failed');
  if (config.authorizedMs < config.scannedMs) throw new Error('Authorized delay must not precede scanned delay');
  const sessions = new Map();
  function fresh() {
    return { csrf: token(), user: null, platforms: [], dws: [], challenges: new Map(), groups: new Map(), imports: [], createdAt: Date.now(), config: { ...config } };
  }
  function connection(session, kind, id) {
    const c = session[kind].find(item => item.id === id);
    if (!c) fail(404, 'not_found', '模拟连接不存在或不属于当前会话');
    return c;
  }
  function newConnection(session, kind, source) {
    const c = { id: `mock-${source}-${randomUUID()}`, user_id: session.user.id, ...(kind === 'platforms' ? { source } : {}), state: 'pending', enabled: true };
    session[kind].push(c);
    return c;
  }
  function advance(session, challenge) {
    if (!['authorized', 'expired', 'failed', 'cancelled'].includes(challenge.status)) {
      const elapsed = Date.now() - challenge.started;
      if (elapsed >= challenge.duration) challenge.status = 'expired';
      else if (elapsed >= challenge.authorizedMs && challenge.outcome !== 'expired') challenge.status = challenge.outcome;
      else if (elapsed >= challenge.scannedMs) challenge.status = 'scanned';
    }
    const c = connection(session, challenge.kind, challenge.connection_id);
    c.state = challenge.status === 'authorized' ? 'active' : challenge.status === 'failed' ? 'error' : challenge.status;
    if (challenge.status === 'cancelled') c.enabled = false;
    return challenge;
  }
  function authView(session, challenge) {
    advance(session, challenge);
    const base = { status: challenge.status, expires_at: new Date(challenge.started + challenge.duration).toISOString(), poll_after_ms: 2000 };
    const uri = `https://mock-auth.invalid/simulation-only/${challenge.id}`;
    return challenge.kind === 'dws'
      ? { ...base, id: challenge.id, connection_id: challenge.connection_id, verification_uri: uri, user_code: challenge.user_code, ...(challenge.status === 'failed' ? { error_code: 'mock_denied' } : {}) }
      : { ...base, qr_url: uri };
  }
  function startChallenge(session, kind, c) {
    // Supersede old challenges so late polling cannot undo newer authorization.
    for (const old of session.challenges.values()) {
      if (old.connection_id === c.id) session.challenges.delete(old.id);
    }
    const challenge = { id: randomUUID(), connection_id: c.id, kind, status: 'pending', started: Date.now(), duration: session.config.expiresMs, scannedMs: session.config.scannedMs, authorizedMs: session.config.authorizedMs, outcome: session.config.outcome, user_code: `MOCK-${randomBytes(2).toString('hex').toUpperCase()}` };
    c.enabled = true;
    c.state = 'pending';
    session.challenges.set(challenge.id, challenge);
    return authView(session, challenge);
  }
  function findChallenge(session, kind, id, challengeId) {
    connection(session, kind, id);
    const challenge = [...session.challenges.values()].find(c => c.kind === kind && c.connection_id === id && (!challengeId || c.id === challengeId));
    if (!challenge) fail(404, 'not_found', '模拟授权不存在');
    return challenge;
  }
  function active(c) {
    if (!c.enabled || c.state !== 'active') fail(409, 'auth_required', '请先完成模拟平台授权');
  }
  function validateImport(body) {
    if (body.resource !== 'schedule') fail(400, 'unsupported', '仅支持模拟 schedule 导入');
    if (!Number.isInteger(body.academic_year) || body.academic_year < 2000 || body.academic_year > 2100 || ![1, 2].includes(body.term)) fail(400, 'validation_error', '学年应为2000–2100，学期为1或2');
    const calendar = body.calendar;
    const monday = calendar?.week_one_monday;
    const date = typeof monday === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(monday) ? new Date(`${monday}T00:00:00Z`) : new Date(NaN);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== monday || date.getUTCDay() !== 1 || date.getUTCFullYear() < body.academic_year || date.getUTCFullYear() > body.academic_year + 1) fail(400, 'validation_error', '第一教学周必须为学年范围内的有效周一');
    if (!Array.isArray(calendar.periods) || !calendar.periods.length || calendar.periods.length > 24) fail(400, 'validation_error', '作息须包含1–24节课');
    let end = -1;
    for (const [index, p] of calendar.periods.entries()) {
      const time = value => typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value) ? Number(value.slice(0, 2)) * 60 + Number(value.slice(3)) : -1;
      const start = time(p?.start), stop = time(p?.end);
      if (p?.period !== index + 1 || start < end || start < 0 || stop <= start) fail(400, 'validation_error', '节次须连续编号、时间有效且不得重叠');
      end = stop;
    }
  }
  async function readBody(req) {
    let bytes = 0;
    const chunks = [];
    for await (const chunk of req) {
      bytes += chunk.length;
      if (bytes > 65536) fail(413, 'payload_too_large', '模拟请求体不得超过64KiB');
      chunks.push(chunk);
    }
    if (!bytes) return {};
    if (!req.headers['content-type']?.toLowerCase().startsWith('application/json')) fail(415, 'unsupported_media_type', '请发送application/json');
    let body;
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { fail(400, 'invalid_json', 'JSON格式错误'); }
    if (!body || Array.isArray(body) || typeof body !== 'object') fail(400, 'validation_error', '请求体须为JSON对象');
    return body;
  }
  const server = http.createServer(async (req, res) => {
    const requestId = randomUUID();
    const json = (data, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(status === 204 ? undefined : JSON.stringify(data)); };
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Mock-Backend', 'simulation-only');
    res.setHeader('X-Request-ID', requestId);
    try {
      const port = server.address().port;
      const allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
      if (!allowedHosts.has(req.headers.host)) fail(403, 'forbidden', 'Mock只接受本机Host');
      const url = new URL(req.url, `http://127.0.0.1:${port}`);
      const path = url.pathname.replace(/\/$/, '');
      const method = req.method;
      const cookies = Object.fromEntries((req.headers.cookie || '').split(';').map(v => v.trim().split('=')));
      let sid = cookies.academic_mock_session;
      let session = sessions.get(sid);
      // Fixed lifetime and lazy garbage collection; no permanent timers.
      for (const [id, s] of sessions) if (Date.now() - s.createdAt > 8 * 3600000) sessions.delete(id);
      session = sessions.get(sid);
      if (!session) { sid = token(); session = fresh(); sessions.set(sid, session); }
      const setCookies = () => res.setHeader('Set-Cookie', [`academic_mock_session=${sid}; Path=/; HttpOnly; SameSite=Lax`, `academic_csrf=${session.csrf}; Path=/; SameSite=Lax`]);
      setCookies();
      if (!['GET', 'HEAD'].includes(method)) {
        // Vite validates browser origin then rewrites it to HAA_BACKEND_ORIGIN.
        if (req.headers.origin !== `http://${req.headers.host}`) fail(403, 'forbidden', '来源校验失败：写请求需要匹配后端Origin');
        if (req.headers['x-csrf-token'] !== session.csrf || cookies.academic_csrf !== session.csrf) fail(403, 'csrf_failed', 'CSRF校验失败，请先GET /api/v1/auth/me获取cookie');
      }
      if (path === '/api/v1/auth/me' && method === 'GET') {
        if (!session.user) fail(401, 'unauthenticated', '尚未登录本地模拟账号');
        return json(session.user);
      }
      if (path === '/api/v1/auth/login' && method === 'POST') {
        const b = await readBody(req);
        if (!validText(b.username, 32) || !validText(b.password, 72)) fail(400, 'validation_error', '账号和密码不能为空或过长');
        if (!['student', 'admin'].includes(b.username) || b.password !== 'correct-password') fail(401, 'unauthenticated', '模拟账号或密码错误');
        sessions.delete(sid);
        sid = token(); session = fresh(); sessions.set(sid, session);
        session.user = { id: `mock-${b.username}`, username: b.username, display_name: b.username === 'admin' ? '模拟管理员' : '模拟同学', role: b.username === 'admin' ? 'admin' : 'user' };
        setCookies();
        return json(session.user);
      }
      if (!session.user) fail(401, 'unauthenticated', '请先登录本地模拟账号');
      if (path === '/api/v1/auth/logout' && method === 'POST') {
        sessions.delete(sid);
        res.setHeader('Set-Cookie', ['academic_mock_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0', 'academic_csrf=; Path=/; SameSite=Lax; Max-Age=0']);
        return json(null, 204);
      }
      for (const ch of session.challenges.values()) advance(session, ch);
      if (path === '/api/v1/mock/status' && method === 'GET') return json({ simulation_only: true, user: session.user, config: session.config, platforms: session.platforms, dws: session.dws, imports: session.imports, groups: Object.fromEntries(session.groups) });
      if (path === '/api/v1/mock/reset' && method === 'POST') {
        const user = session.user;
        Object.assign(session, fresh(), { user }); setCookies();
        return json({ simulation_only: true, reset: true });
      }
      if (path === '/api/v1/mock/config' && method === 'POST') {
        const b = await readBody(req);
        const next = { ...session.config };
        for (const key of ['scannedMs', 'authorizedMs', 'expiresMs']) {
          if (b[key] === undefined) continue;
          if (typeof b[key] !== 'number' || !Number.isInteger(b[key]) || b[key] < 0 || b[key] > 3600000) fail(400, 'validation_error', '模拟延迟须为0–3600000的整数毫秒');
          next[key] = b[key];
        }
        if (b.outcome !== undefined) next.outcome = b.outcome;
        if (!['authorized', 'expired', 'failed'].includes(next.outcome) || next.authorizedMs < next.scannedMs) fail(400, 'validation_error', '模拟授权配置无效');
        session.config = next;
        return json({ simulation_only: true, config: next });
      }
      if (path === '/api/v1/platforms/sources' && method === 'GET') return json({ items: SOURCES });
      if (path === '/api/v1/platforms/connections' && method === 'GET') return json({ items: session.platforms });
      if (path === '/api/v1/dws/connections' && method === 'GET') return json({ items: session.dws });
      if (path === '/api/v1/platforms/jwxt/login' && method === 'POST') {
        const b = await readBody(req);
        if (!validText(b.username, 128) || !validText(b.password, 1024)) fail(400, 'validation_error', '模拟教务账号密码不能为空或过长');
        if (b.username !== 'synthetic-student' || b.password !== 'synthetic-school-password') fail(400, 'auth_required', '仅接受README中的虚构教务演示账号，请勿输入真实密码');
        const c = session.platforms.find(c => c.source === 'jwxt') || newConnection(session, 'platforms', 'jwxt');
        c.state = 'active'; c.enabled = true;
        return json(c, 201);
      }
      let match = path.match(/^\/api\/v1\/platforms\/(chaoxing|mooc|ucampus)\/auth$/);
      if (match && method === 'POST') {
        const c = session.platforms.find(c => c.source === match[1]) || newConnection(session, 'platforms', match[1]);
        return json({ connection: c, auth: startChallenge(session, 'platforms', c) }, 201);
      }
      match = path.match(/^\/api\/v1\/platforms\/connections\/([^/]+)(?:\/(auth|sync))?$/);
      if (match) {
        const c = connection(session, 'platforms', match[1]);
        if (match[2] === 'auth' && method === 'GET') return json(authView(session, findChallenge(session, 'platforms', c.id)));
        if (!match[2] && method === 'DELETE') {
          session.platforms = session.platforms.filter(item => item.id !== c.id);
          for (const [id, ch] of session.challenges) if (ch.connection_id === c.id) session.challenges.delete(id);
          return json(null, 204);
        }
        if (match[2] === 'sync' && method === 'POST') {
          active(c);
          if (c.source !== 'jwxt') fail(400, 'unsupported', '仅模拟教务课表导入');
          const b = await readBody(req); validateImport(b);
          const result = { academic_year: b.academic_year, term: b.term, records: 3, generated: 48, skipped_practice: 1, retired_modifications: [] };
          session.imports = session.imports.filter(i => i.request.academic_year !== b.academic_year || i.request.term !== b.term);
          session.imports.push({ connection_id: c.id, request: b, result });
          return json(result);
        }
      }
      match = path.match(/^\/api\/v1\/dws\/connections\/([^/]+)\/link(?:\/([^/]+))?$/);
      if ((path === '/api/v1/dws/link' || (match && !match[2])) && method === 'POST') {
        const c = match ? connection(session, 'dws', match[1]) : newConnection(session, 'dws', 'dws');
        return json(startChallenge(session, 'dws', c), 202);
      }
      if (match?.[2] && ['GET', 'DELETE'].includes(method)) {
        const ch = findChallenge(session, 'dws', match[1], match[2]);
        advance(session, ch);
        if (method === 'DELETE' && !['authorized', 'expired', 'failed'].includes(ch.status)) ch.status = 'cancelled';
        return json(authView(session, ch));
      }
      match = path.match(/^\/api\/v1\/dws\/connections\/([^/]+)\/(groups|available-groups)$/);
      if (match) {
        const c = connection(session, 'dws', match[1]); active(c);
        if (match[2] === 'groups' && method === 'GET') return json({ items: session.groups.get(c.id) || [] });
        if (match[2] === 'groups' && method === 'PUT') {
          const b = await readBody(req);
          if (!Array.isArray(b.groups) || b.groups.length > 100 || b.groups.some(g => !validText(g?.id, 128) || !validText(g?.name, 256)) || new Set(b.groups.map(g => g.id)).size !== b.groups.length) fail(400, 'validation_error', '群列表最多100个，id唯一且名称不能为空');
          session.groups.set(c.id, b.groups.map(g => ({ id: g.id, name: g.name })));
          return json(null, 204);
        }
        if (match[2] === 'available-groups' && method === 'GET') {
          const cursor = url.searchParams.get('cursor');
          if (cursor !== null && cursor !== 'page2') fail(400, 'validation_error', '无效分页cursor');
          return json(cursor ? { items: GROUPS.slice(2), has_more: false } : { items: GROUPS.slice(0, 2), has_more: true, next_cursor: 'page2' });
        }
      }
      fail(404, 'not_found', '本地mock未提供此路由（非真实后端）');
    } catch (error) {
      json({ error: { code: error.code || 'internal_error', message: error.status ? error.message : '模拟服务器配置或请求异常', retryable: false }, request_id: requestId }, error.status || 500);
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  return server;
}
if (require.main === module) {
  const port = numberOption(process.env.MOCK_PORT, 2610, 65535);
  const server = createMockServer();
  server.on('error', error => { console.error(`Mock could not bind 127.0.0.1:${port}: ${error.code}. Do not stop another server; use MOCK_PORT and HAA_API_TARGET.`); process.exitCode = 1; });
  server.listen(port, '127.0.0.1', () => console.log(`SIMULATION ONLY — mock backend http://127.0.0.1:${server.address().port}; demo student / correct-password; no real platform login`));
}
module.exports = { createMockServer };
