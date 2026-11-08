const test = require('node:test');
const assert = require('node:assert/strict');
const { createFormsHandler } = require('../../api/forms');

function response() {
  return {
    statusCode: null,
    headers: {},
    body: '',
    writeHead(statusCode, headers = {}) { this.statusCode = statusCode; this.headers = headers; },
    end(body = '') { this.body = String(body); }
  };
}

function request({ url = '/api/forms', method = 'GET', headers = {}, body = '' } = {}) {
  return { url, method, headers, body, on(event, callback) { if (event === 'data' && body) callback(body); if (event === 'end') callback(); } };
}

test('rejects private form creation without a Supabase session', async () => {
  const handler = createFormsHandler({ env: { SUPABASE_URL: 'https://project.supabase.co', SUPABASE_ANON_KEY: 'anon' } });
  const res = response();
  await handler(request({ method: 'POST', body: JSON.stringify({ title: 'Privado', slug: 'privado', fields: [] }) }), res);
  assert.equal(res.statusCode, 401);
  assert.match(res.body, /sesión/i);
});

test('public form reads use the anon key and never the service role key', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (url.includes('dylanos_forms')) return new Response(JSON.stringify([{ id: 'form-1', title: 'Encuesta', description: '', slug: 'encuesta', status: 'published' }]), { status: 200 });
    return new Response(JSON.stringify([{ id: 'field-1', form_id: 'form-1', type: 'text', label: 'Nombre', required: true, position: 0 }]), { status: 200 });
  };
  const handler = createFormsHandler({
    fetchImpl,
    env: { SUPABASE_URL: 'https://project.supabase.co', SUPABASE_ANON_KEY: 'anon-public', SUPABASE_SERVICE_ROLE_KEY: 'must-not-appear' }
  });
  const res = response();
  await handler(request({ url: '/api/forms?slug=encuesta' }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(JSON.parse(res.body).form.fields[0].label, 'Nombre');
  assert.equal(calls[0].options.headers.apikey, 'anon-public');
  assert.equal(JSON.stringify(calls), JSON.stringify(calls).replace('must-not-appear', '')); // service key is not forwarded
  assert.equal(calls[0].options.headers.authorization, 'Bearer anon-public');
});
