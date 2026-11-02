const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');

function localConfig() {
  try {
    const cfg = JSON.parse(execFileSync('npx', ['supabase', 'status', '-o', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
    const url = cfg.API_URL || cfg.api_url;
    const anon = cfg.ANON_KEY || cfg.anon_key;
    const service = cfg.SERVICE_ROLE_KEY || cfg.service_role_key;
    if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(url || '')) return null;
    return { url, anon, service };
  } catch { return null; }
}

async function call(cfg, path, { token = cfg.anon, method = 'GET', body, headers = {} } = {}) {
  const response = await fetch(cfg.url + path, {
    method,
    headers: { apikey: cfg.anon, authorization: `Bearer ${token}`, 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { response, data };
}

test('local Supabase enforces release lifecycle and admin authorization end to end', { timeout: 90000 }, async t => {
  const cfg = localConfig();
  if (!cfg) return t.skip('Supabase local no está iniciado.');
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const password = `Test-${suffix}-Aa1!`;
  const adminEmail = `release-admin-${suffix}@example.test`;
  const userEmail = `release-user-${suffix}@example.test`;
  const versionPrefix = `9.${String(Date.now()).slice(-5)}`;
  const createdUsers = [];

  async function createUser(email) {
    const result = await call(cfg, '/auth/v1/admin/users', { token: cfg.service, method: 'POST', body: { email, password, email_confirm: true } });
    assert.equal(result.response.status, 200, JSON.stringify(result.data));
    createdUsers.push(result.data.id); return result.data;
  }
  async function signIn(email) {
    const result = await call(cfg, '/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password } });
    assert.equal(result.response.status, 200, JSON.stringify(result.data)); return result.data.access_token;
  }
  async function insertRelease(token, channel, version) {
    return call(cfg, '/rest/v1/releases?select=*', { token, method: 'POST', headers: { Prefer: 'return=representation' }, body: {
      channel, version, name: `DylanOS ${version}`, arch: 'x86_64', status: 'draft', storage_provider: 'sourceforge',
      file_path: `${channel}/${version}/${suffix}/DylanOS.iso`, file_size: 4096, sha256: 'a'.repeat(64)
    } });
  }

  try {
    const admin = await createUser(adminEmail);
    await createUser(userEmail);
    let result = await call(cfg, '/rest/v1/release_admins', { token: cfg.service, method: 'POST', body: { user_id: admin.id, email: adminEmail } });
    assert.equal(result.response.status, 201, JSON.stringify(result.data));
    const adminToken = await signIn(adminEmail);
    const userToken = await signIn(userEmail);

    result = await call(cfg, '/rest/v1/releases?select=*', { token: adminToken, method: 'POST', headers: { Prefer: 'return=representation' }, body: {
      channel: 'stable', version: `${versionPrefix}.0-legacy`, name: 'Compatibilidad R2', arch: 'x86_64', status: 'draft',
      storage_provider: 'r2', file_path: `stable/${suffix}/legacy.iso`, file_size: 4096, sha256: 'b'.repeat(64)
    } });
    assert.equal(result.response.status, 201, JSON.stringify(result.data));

    result = await insertRelease(cfg.anon, 'pre-beta', `${versionPrefix}.0-pre`);
    assert.ok([401, 403].includes(result.response.status));
    result = await insertRelease(userToken, 'pre-beta', `${versionPrefix}.0-pre`);
    assert.equal(result.response.status, 403);

    result = await call(cfg, '/rest/v1/releases?select=*', { token: adminToken, method: 'POST', headers: { Prefer: 'return=representation' }, body: {
      channel: 'stable', version: `${versionPrefix}.0-stable`, name: 'Publicación directa no permitida', arch: 'x86_64', status: 'published',
      storage_provider: 'r2', file_path: `stable/${suffix}/forbidden.iso`, file_size: 4096, sha256: 'a'.repeat(64)
    } });
    assert.equal(result.response.status, 403, JSON.stringify(result.data));

    const first = await insertRelease(adminToken, 'pre-beta', `${versionPrefix}.1-pre`);
    assert.equal(first.response.status, 201, JSON.stringify(first.data));
    result = await call(cfg, `/rest/v1/releases?select=id&version=eq.${versionPrefix}.1-pre`);
    assert.deepEqual(result.data, []);

    result = await call(cfg, '/rest/v1/rpc/release_publish', { token: adminToken, method: 'POST', body: { p_release_id: first.data[0].id } });
    assert.equal(result.response.status, 200, JSON.stringify(result.data));

    const second = await insertRelease(adminToken, 'pre-beta', `${versionPrefix}.2-pre`);
    assert.equal(second.response.status, 201);
    result = await call(cfg, `/rest/v1/releases?id=eq.${second.data[0].id}`, { token: adminToken, method: 'PATCH', body: { status: 'published' } });
    assert.equal(result.response.status, 403, JSON.stringify(result.data));
    result = await call(cfg, '/rest/v1/rpc/release_publish', { token: adminToken, method: 'POST', body: { p_release_id: second.data[0].id } });
    assert.equal(result.response.status, 200, JSON.stringify(result.data));

    result = await call(cfg, '/rest/v1/rpc/release_publish', { token: adminToken, method: 'POST', body: { p_release_id: first.data[0].id } });
    assert.equal(result.response.status, 409, JSON.stringify(result.data));

    const beta = await insertRelease(adminToken, 'beta', `${versionPrefix}.1-beta`);
    assert.equal(beta.response.status, 201);
    result = await call(cfg, '/rest/v1/rpc/release_publish', { token: adminToken, method: 'POST', body: { p_release_id: beta.data[0].id } });
    assert.equal(result.response.status, 200);

    result = await call(cfg, `/rest/v1/releases?select=id,channel,version,status,published_at&version=like.${versionPrefix}*&order=published_at.desc`);
    assert.equal(result.response.status, 200);
    assert.equal(result.data.filter(row => row.channel === 'pre-beta' && row.status === 'published').length, 1);
    assert.equal(result.data.filter(row => row.channel === 'pre-beta' && row.status === 'retired').length, 1);
    assert.equal(result.data.find(row => row.channel === 'pre-beta' && row.status === 'published').version, `${versionPrefix}.2-pre`);
    assert.equal(result.data.filter(row => row.channel === 'beta' && row.status === 'published').length, 1);
    assert.equal(result.data.some(row => row.status === 'draft'), false);

    result = await call(cfg, '/rest/v1/rpc/release_delete', { token: adminToken, method: 'POST', body: { p_release_id: second.data[0].id } });
    assert.equal(result.response.status, 409);
  } finally {
    await call(cfg, `/rest/v1/releases?version=like.${versionPrefix}*`, { token: cfg.service, method: 'DELETE' });
    for (const id of createdUsers) await call(cfg, `/auth/v1/admin/users/${id}`, { token: cfg.service, method: 'DELETE' });
  }
});
