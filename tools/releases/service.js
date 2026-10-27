'use strict';

const { stat } = require('node:fs/promises');
const crypto = require('node:crypto');
const { basename } = require('node:path');
const { validateReleaseInput, safeIsoName } = require('../../lib/releases/validation');
const { sha256File } = require('../../lib/releases/sha256');
const {
  sourceForgeConfigFromEnv,
  buildSourceForgePath,
  uploadFileWithRsync,
  verifyPublicFile,
  deleteRemoteFile,
  validateSourceForgePath
} = require('../../lib/releases/sourceforge');
const { configFromEnv, request } = require('../../lib/releases/supabase-admin');

function parseArgs(argv) {
  if (!argv.length || argv[0] === '--help' || argv[0] === '-h') return { command: 'help' };
  const result = { command: argv[0] };
  for (let i = 1; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--')) throw new Error(`Argumento desconocido: ${token}`);
    const key = token.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    if (['publish', 'draft', 'json', 'yes', 'help'].includes(key)) { result[key] = true; continue; }
    if (i + 1 >= argv.length || argv[i + 1].startsWith('--')) throw new Error(`Falta el valor de ${token}.`);
    result[key] = argv[++i];
  }
  return result;
}

function productionDependencies(env = process.env) {
  const sourceforge = sourceForgeConfigFromEnv(env);
  const db = configFromEnv(env);
  return {
    randomId: () => crypto.randomUUID(),
    upload: input => uploadFileWithRsync({
      config: sourceforge,
      filePath: input.file,
      path: input.path,
      onProgress: input.onProgress
    }),
    verify: input => verifyPublicFile({
      config: sourceforge,
      path: input.path,
      expectedSize: input.expectedSize
    }),
    deleteObject: path => deleteRemoteFile({ config: sourceforge, path }),
    findReferences: path => request(db, `/rest/v1/releases?select=id&storage_provider=eq.sourceforge&file_path=eq.${encodeURIComponent(path)}&limit=1`),
    insertDraft: async row => {
      const data = await request(db, '/rest/v1/releases', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(row) });
      return data[0];
    },
    publish: id => request(db, '/rest/v1/rpc/release_publish', { method: 'POST', body: JSON.stringify({ p_release_id: id }) }),
    retire: id => request(db, '/rest/v1/rpc/release_retire', { method: 'POST', body: JSON.stringify({ p_release_id: id }) }),
    deleteRelease: id => request(db, '/rest/v1/rpc/release_delete', { method: 'POST', body: JSON.stringify({ p_release_id: id }) }),
    request: (path, options) => request(db, path, options)
  };
}

async function publishRelease(options, dependencies) {
  const input = validateReleaseInput(options);
  if (!options.file) throw new Error('Falta --file.');
  const fileInfo = await stat(options.file);
  if (!fileInfo.isFile() || fileInfo.size <= 0) throw new Error('La ISO no existe o está vacía.');
  const fileName = safeIsoName(basename(options.file));
  const integrity = await sha256File(options.file, options.onHashProgress);
  if (input.sha256 && input.sha256 !== integrity.sha256) throw new Error('El SHA-256 calculado no coincide con --sha256.');
  const deps = dependencies || productionDependencies();
  const path = buildSourceForgePath({ channel: input.channel, version: input.version, filename: fileName, uploadId: deps.randomId() });
  await deps.upload({ file: options.file, path, size: integrity.size, sha256: integrity.sha256, onProgress: options.onUploadProgress });
  const remote = await deps.verify({ path, expectedSize: integrity.size });
  const row = {
    channel: input.channel, version: input.version, name: input.name,
    description: options.description || null, changelog: options.changelog || null,
    arch: options.arch || 'x86_64', status: 'draft', storage_provider: 'sourceforge',
    file_path: path, file_size: integrity.size, sha256: integrity.sha256
  };
  let release;
  try { release = await deps.insertDraft(row); }
  catch (cause) {
    const error = new Error(`${cause.message}. Archivo huérfano: ${path}. Recupera con: npm run releases:cleanup -- --key "${path}" --yes`);
    error.cause = cause; error.orphanKey = path; error.orphanPath = path; throw error;
  }
  if (options.publish) release = await deps.publish(release.id);
  return { release, path, key: path, url: remote.url, sha256: integrity.sha256, size: integrity.size };
}

async function cleanupReleaseFile(path, dependencies) {
  const safePath = validateSourceForgePath(path);
  const references = await dependencies.findReferences(safePath);
  if (references.length) throw new Error('El archivo continúa referenciado; no se elimina.');
  return dependencies.deleteObject(safePath);
}

module.exports = { parseArgs, productionDependencies, publishRelease, cleanupReleaseFile };
