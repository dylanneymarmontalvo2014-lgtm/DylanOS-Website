'use strict';

const {
  sourceForgeConfigFromEnv,
  validateSourceForgePath,
  verifyPublicFile,
  MAX_SOURCEFORGE_FILE_SIZE
} = require('../lib/releases/sourceforge');

const MAX_BODY = 16 * 1024;

function json(res, status, value) {
  if (typeof res.status === 'function' && typeof res.json === 'function') {
    res.status(status).json(value); return;
  }
  res.statusCode = status;
  if (typeof res.setHeader === 'function') res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(value));
}

async function readJson(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (Buffer.byteLength(raw) > MAX_BODY) throw Object.assign(new Error('Solicitud demasiado grande.'), { status: 413 });
  }
  try { return JSON.parse(raw || '{}'); }
  catch { throw Object.assign(new Error('JSON inválido.'), { status: 400 }); }
}

function bearer(req) {
  const match = String(req.headers && req.headers.authorization || '').match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

async function verifyAdmin(req, env, fetchImpl) {
  const token = bearer(req);
  if (!token) throw Object.assign(new Error('Necesitas una sesión válida.'), { status: 401 });
  const base = String(env.SUPABASE_URL || '').replace(/\/+$/, '');
  const anon = env.SUPABASE_ANON_KEY || '';
  if (!base || !anon) throw Object.assign(new Error('Supabase no está configurado.'), { status: 503 });
  const headers = { apikey: anon, authorization: `Bearer ${token}` };
  const userResponse = await fetchImpl(`${base}/auth/v1/user`, { headers });
  if (!userResponse.ok) throw Object.assign(new Error('Necesitas una sesión válida.'), { status: 401 });
  const adminResponse = await fetchImpl(`${base}/rest/v1/rpc/is_release_admin`, {
    method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: '{}'
  });
  if (!adminResponse.ok) throw Object.assign(new Error('No se pudo verificar el permiso de administrador.'), { status: 502 });
  const allowed = await adminResponse.json();
  if (allowed !== true) throw Object.assign(new Error('Esta cuenta no es administradora de versiones.'), { status: 403 });
  return { token, base, anon, headers };
}

function badRequest(message) {
  return Object.assign(new Error(message), { status: 400 });
}

function createReleaseUploadHandler(dependencies = {}) {
  const env = dependencies.env || process.env;
  const fetchImpl = dependencies.fetchImpl || fetch;
  const verifyFile = dependencies.verifyFile || (args => verifyPublicFile({ ...args, fetchImpl }));

  return async function releaseUploadHandler(req, res) {
    if (req.method !== 'POST') return json(res, 405, { error: 'Método no permitido.' });
    try {
      await verifyAdmin(req, env, fetchImpl);
      const body = await readJson(req);
      if (body.action !== 'verify') throw badRequest('Acción de almacenamiento inválida.');
      let path;
      try { path = validateSourceForgePath(body.path); }
      catch (_) { throw badRequest('Ruta SourceForge inválida.'); }
      const expectedSize = Number(body.expectedSize);
      if (!Number.isSafeInteger(expectedSize) || expectedSize <= 0 || expectedSize > MAX_SOURCEFORGE_FILE_SIZE) {
        throw badRequest('Tamaño esperado inválido.');
      }
      let checked;
      try {
        const config = sourceForgeConfigFromEnv(env, { requireCredentials: false });
        checked = await verifyFile({ config, path, expectedSize, attempts: 1 });
      } catch (error) {
        if (/configuración SourceForge|Proyecto SourceForge/i.test(error && error.message || '')) {
          throw Object.assign(new Error('SourceForge no está configurado.'), { status: 503 });
        }
        throw Object.assign(new Error('No se pudo verificar el archivo público en SourceForge.'), { status: 502 });
      }
      return json(res, 200, { ok: true, path, url: checked.url, size: checked.size });
    } catch (error) {
      const status = Number(error && error.status) || 500;
      const safe = status >= 500 && status !== 502 && status !== 503
        ? 'No se pudo completar la verificación del archivo.'
        : error.message;
      return json(res, status, { error: safe });
    }
  };
}

const handler = createReleaseUploadHandler();
module.exports = handler;
module.exports.createReleaseUploadHandler = createReleaseUploadHandler;
module.exports.verifyAdmin = verifyAdmin;
