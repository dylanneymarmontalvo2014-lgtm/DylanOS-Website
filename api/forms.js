'use strict';

const { normalizeAnswers, normalizeFormPayload } = require('../lib/forms/validation');

function configFromEnv(env) {
  const url = String(env.SUPABASE_URL || '').replace(/\/+$/, '');
  const anonKey = String(env.SUPABASE_ANON_KEY || '');
  if (!url || !anonKey) throw Object.assign(new Error('Supabase no está configurado.'), { status: 503 });
  return { url, anonKey };
}

function header(req, name) {
  const headers = req.headers || {};
  return headers[name] || headers[name.toLowerCase()] || '';
}

function bearer(req) {
  const value = String(header(req, 'authorization') || '');
  return value.replace(/^Bearer\s+/i, '').trim();
}

function send(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(body));
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => {
      raw += chunk;
      if (raw.length > 128 * 1024) reject(Object.assign(new Error('Cuerpo demasiado grande.'), { status: 413 }));
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch { reject(Object.assign(new Error('JSON inválido.'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

async function restRequest(config, fetchImpl, path, { token, method = 'GET', body } = {}) {
  const response = await fetchImpl(`${config.url}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: config.anonKey,
      authorization: `Bearer ${token || config.anonKey}`,
      'content-type': 'application/json',
      Prefer: method === 'GET' ? 'return=minimal' : 'return=representation'
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  const text = await response.text();
  let data = null;
  if (text) { try { data = JSON.parse(text); } catch { data = { message: text }; } }
  if (!response.ok) {
    throw Object.assign(new Error(data && (data.message || data.error) || `Supabase respondió ${response.status}.`), {
      status: response.status,
      details: data
    });
  }
  return data;
}

function idPath(id) {
  if (!/^[0-9a-f-]{20,}$/i.test(id)) throw Object.assign(new Error('Identificador de formulario inválido.'), { status: 400 });
  return encodeURIComponent(id);
}

async function loadForm(config, fetchImpl, { id, slug, token, publicOnly = false }) {
  const filter = id ? `id=eq.${idPath(id)}` : `slug=eq.${encodeURIComponent(slug)}`;
  const statusFilter = publicOnly ? '&status=eq.published' : '';
  const forms = await restRequest(config, fetchImpl,
    `dylanos_forms?select=id,owner_id,title,description,slug,status,created_at,updated_at&${filter}${statusFilter}&limit=1`,
    { token });
  const form = Array.isArray(forms) ? forms[0] : null;
  if (!form) throw Object.assign(new Error('Formulario no encontrado.'), { status: 404 });
  const fields = await restRequest(config, fetchImpl,
    `dylanos_form_fields?select=id,form_id,type,label,description,required,position,options&form_id=eq.${encodeURIComponent(form.id)}&order=position.asc`,
    { token });
  return { ...form, fields: Array.isArray(fields) ? fields : [] };
}

async function createForm(config, fetchImpl, token, payload) {
  const form = normalizeFormPayload(payload);
  const created = await restRequest(config, fetchImpl, 'dylanos_forms', {
    token,
    method: 'POST',
    body: { title: form.title, description: form.description, slug: form.slug, status: 'draft' }
  });
  const row = Array.isArray(created) ? created[0] : created;
  if (!row || !row.id) throw new Error('Supabase no devolvió el formulario creado.');
  if (form.fields.length) {
    await restRequest(config, fetchImpl, 'dylanos_form_fields', {
      token,
      method: 'POST',
      body: form.fields.map(field => ({ form_id: row.id, type: field.type, label: field.label, description: field.description, required: field.required, position: field.position, options: field.options }))
    });
  }
  return loadForm(config, fetchImpl, { id: row.id, token });
}

async function updateForm(config, fetchImpl, token, id, payload) {
  const form = normalizeFormPayload(payload);
  await restRequest(config, fetchImpl, `dylanos_forms?id=eq.${idPath(id)}`, {
    token,
    method: 'PATCH',
    body: { title: form.title, description: form.description, slug: form.slug }
  });
  await restRequest(config, fetchImpl, `dylanos_form_fields?form_id=eq.${idPath(id)}`, {
    token,
    method: 'DELETE'
  });
  if (form.fields.length) {
    await restRequest(config, fetchImpl, 'dylanos_form_fields', {
      token,
      method: 'POST',
      body: form.fields.map(field => ({ form_id: id, type: field.type, label: field.label, description: field.description, required: field.required, position: field.position, options: field.options }))
    });
  }
  return loadForm(config, fetchImpl, { id, token });
}

async function handle(req, res, { env = process.env, fetchImpl = globalThis.fetch } = {}) {
  try {
    const config = configFromEnv(env);
    const url = new URL(req.url || '/api/forms', 'http://localhost');
    const segments = url.pathname.split('/').filter(Boolean);
    const formId = segments[2];
    const action = segments[3];
    const token = bearer(req);

    if (req.method === 'GET') {
      if (url.searchParams.has('slug')) {
        const form = await loadForm(config, fetchImpl, { slug: url.searchParams.get('slug'), token: undefined, publicOnly: true });
        return send(res, 200, { form });
      }
      if (!token) return send(res, 401, { error: 'Necesitas iniciar sesión para ver tus formularios.' });
      if (url.searchParams.has('id')) {
        const form = await loadForm(config, fetchImpl, { id: url.searchParams.get('id'), token });
        return send(res, 200, { form });
      }
      const forms = await restRequest(config, fetchImpl, 'dylanos_forms?select=id,title,description,slug,status,created_at,updated_at&order=updated_at.desc', { token });
      return send(res, 200, { forms: Array.isArray(forms) ? forms : [] });
    }

    if (req.method === 'POST' && !formId) {
      if (!token) return send(res, 401, { error: 'Necesitas iniciar sesión para crear formularios.' });
      return send(res, 201, { form: await createForm(config, fetchImpl, token, await readJsonBody(req)) });
    }

    if (!formId) return send(res, 404, { error: 'Ruta de formularios no encontrada.' });

    if (action === 'submissions' && req.method === 'POST') {
      const form = await loadForm(config, fetchImpl, { id: formId, token: undefined, publicOnly: true });
      const body = await readJsonBody(req);
      const answers = normalizeAnswers(form.fields, body.answers);
      const email = body.email == null ? null : String(body.email).trim().slice(0, 160);
      await restRequest(config, fetchImpl, 'dylanos_form_submissions', {
        method: 'POST',
        body: { form_id: form.id, answers, respondent_email: email || null }
      });
      return send(res, 201, { ok: true });
    }

    if (!token) return send(res, 401, { error: 'Necesitas iniciar sesión para modificar formularios.' });
    if (req.method === 'PATCH' && !action) {
      return send(res, 200, { form: await updateForm(config, fetchImpl, token, formId, await readJsonBody(req)) });
    }
    if (req.method === 'POST' && action === 'publish') {
      await restRequest(config, fetchImpl, `dylanos_forms?id=eq.${idPath(formId)}`, { token, method: 'PATCH', body: { status: 'published' } });
      return send(res, 200, { form: await loadForm(config, fetchImpl, { id: formId, token }) });
    }
    if (req.method === 'DELETE' && !action) {
      await restRequest(config, fetchImpl, `dylanos_forms?id=eq.${idPath(formId)}`, { token, method: 'DELETE' });
      return send(res, 204, { ok: true });
    }
    return send(res, 405, { error: 'Método no permitido.' });
  } catch (error) {
    const status = error.status || 500;
    const message = status >= 500 ? 'No se pudo completar la operación con DylanOSforms.' : error.message;
    return send(res, status, { error: message });
  }
}

function createFormsHandler(options = {}) {
  return (req, res) => handle(req, res, options);
}

module.exports = createFormsHandler();
module.exports.createFormsHandler = createFormsHandler;
