const test = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');

function request(body, token = 'valid-token', method = 'POST') {
  const req = Readable.from([JSON.stringify(body)]);
  req.method = method;
  req.headers = { authorization: token ? `Bearer ${token}` : '', 'content-type': 'application/json' };
  return req;
}

function response() {
  return {
    statusCode: 200, headers: {}, body: '',
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = JSON.stringify(value); this.ended = true; },
    end(value = '') { this.body += value; this.ended = true; }
  };
}

const env = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_ANON_KEY: 'anon',
  SOURCEFORGE_PROJECT: 'dylanos'
};

function adminFetch(allowed = true) {
  return async url => url.includes('/auth/v1/user')
    ? new Response(JSON.stringify({ id: 'admin-id' }), { status: 200 })
    : new Response(JSON.stringify(allowed), { status: 200, headers: { 'content-type': 'application/json' } });
}

test('file verification API rejects non-POST and missing sessions before provider access', async () => {
  const { createReleaseUploadHandler } = require('../../api/release-upload');
  let providerCalls = 0;
  const handler = createReleaseUploadHandler({ env, fetchImpl: async () => { throw new Error('unexpected fetch'); }, verifyFile: async () => { providerCalls++; } });
  const wrongMethod = response();
  await handler(request({}, '', 'GET'), wrongMethod);
  assert.equal(wrongMethod.statusCode, 405);
  const missing = response();
  await handler(request({ action: 'verify', path: 'beta/1/a.iso', expectedSize: 4096 }, ''), missing);
  assert.equal(missing.statusCode, 401);
  assert.equal(providerCalls, 0);
  assert.match(missing.body, /sesión/i);
});

test('file verification API rejects authenticated non-admin users', async () => {
  const { createReleaseUploadHandler } = require('../../api/release-upload');
  let providerCalls = 0;
  const handler = createReleaseUploadHandler({ env, fetchImpl: adminFetch(false), verifyFile: async () => { providerCalls++; } });
  const res = response();
  await handler(request({ action: 'verify', path: 'beta/1/a.iso', expectedSize: 4096 }), res);
  assert.equal(res.statusCode, 403);
  assert.equal(providerCalls, 0);
  assert.match(res.body, /administradora/i);
});

test('administrator can verify one safe SourceForge path without exposing provider credentials', async () => {
  const { createReleaseUploadHandler } = require('../../api/release-upload');
  let received;
  const handler = createReleaseUploadHandler({
    env,
    fetchImpl: adminFetch(true),
    verifyFile: async args => {
      received = args;
      return { ok: true, path: args.path, url: 'https://sourceforge.net/projects/dylanos/files/beta/1/a.iso/download', size: 4096, resolvedUrl: 'https://mirror.dl.sourceforge.net/a.iso' };
    }
  });
  const res = response();
  await handler(request({ action: 'verify', path: 'beta/1/a.iso', expectedSize: 4096 }), res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(JSON.parse(res.body), {
    ok: true, path: 'beta/1/a.iso', url: 'https://sourceforge.net/projects/dylanos/files/beta/1/a.iso/download', size: 4096
  });
  assert.equal(received.expectedSize, 4096);
  assert.equal(JSON.stringify(res.body).includes('SOURCEFORGE_USERNAME'), false);
});

test('file verification rejects unsafe paths and unknown actions before provider access', async () => {
  const { createReleaseUploadHandler } = require('../../api/release-upload');
  let providerCalls = 0;
  const handler = createReleaseUploadHandler({ env, fetchImpl: adminFetch(true), verifyFile: async () => { providerCalls++; } });
  for (const body of [
    { action: 'verify', path: '../secret.iso', expectedSize: 4096 },
    { action: 'multipart', path: 'beta/1/a.iso', expectedSize: 4096 }
  ]) {
    const res = response();
    await handler(request(body), res);
    assert.equal(res.statusCode, 400);
  }
  assert.equal(providerCalls, 0);
});

test('file verification sanitizes mirror errors and cannot mark failures verified', async () => {
  const { createReleaseUploadHandler } = require('../../api/release-upload');
  const handler = createReleaseUploadHandler({
    env,
    fetchImpl: adminFetch(true),
    verifyFile: async () => { throw new Error('mirror HTML secret-token wrong Content-Length'); }
  });
  const res = response();
  await handler(request({ action: 'verify', path: 'beta/1/a.iso', expectedSize: 4096 }), res);
  assert.equal(res.statusCode, 502);
  assert.deepEqual(JSON.parse(res.body), { error: 'No se pudo verificar el archivo público en SourceForge.' });
  assert.doesNotMatch(res.body, /secret-token|verified/i);
});
