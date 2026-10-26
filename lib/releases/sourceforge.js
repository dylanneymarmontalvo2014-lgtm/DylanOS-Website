'use strict';

const { spawn } = require('node:child_process');
const pathModule = require('node:path');
const { buildObjectKey } = require('./validation');

const DEFAULT_HOST = 'frs.sourceforge.net';
const MAX_SOURCEFORGE_FILE_SIZE = 10 * 1024 * 1024 * 1024;
const MAX_REDIRECTS = 5;
const SAFE_SEGMENT_RE = /^[0-9A-Za-z _+.,=@!()[\]~\-]+$/;

function validateProject(value) {
  const project = String(value || '').trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(project)) throw new Error('Proyecto SourceForge inválido.');
  return project;
}

function validateUsername(value) {
  const username = String(value || '').trim();
  if (!/^[0-9A-Za-z][0-9A-Za-z._-]{1,63}$/.test(username)) throw new Error('Usuario SourceForge inválido.');
  return username;
}

function validateHost(value) {
  const host = String(value || DEFAULT_HOST).trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9.-]{1,252}$/.test(host) || host.includes('..')) throw new Error('Host SourceForge inválido.');
  return host;
}

function validateSshKey(value) {
  if (!value) return null;
  const key = String(value);
  if (!pathModule.isAbsolute(key) || !/^\/[0-9A-Za-z_./-]+$/.test(key)) throw new Error('Ruta de clave SSH inválida.');
  return key;
}

function sourceForgeConfigFromEnv(env = process.env, options = {}) {
  const project = validateProject(env.SOURCEFORGE_PROJECT);
  const requireCredentials = options.requireCredentials !== false;
  const username = env.SOURCEFORGE_USERNAME ? validateUsername(env.SOURCEFORGE_USERNAME) : null;
  if (requireCredentials && !username) throw new Error('Falta configuración SourceForge: SOURCEFORGE_USERNAME.');
  const defaultBase = `https://sourceforge.net/projects/${encodeURIComponent(project)}/files`;
  return {
    project,
    username,
    host: validateHost(env.SOURCEFORGE_SSH_HOST || DEFAULT_HOST),
    sshKey: validateSshKey(env.SOURCEFORGE_SSH_KEY),
    downloadBase: String(env.SOURCEFORGE_DOWNLOAD_BASE || defaultBase).replace(/\/+$/, ''),
    fileManagerBase: String(env.SOURCEFORGE_FILE_MANAGER_URL || `${defaultBase}/`).replace(/\/+$/, '') + '/'
  };
}

function validateSourceForgePath(path) {
  const value = String(path || '');
  if (!value || value.length > 300 || value.startsWith('/') || value.includes('\\') || /[^\x20-\x7e]/.test(value)) {
    throw new Error('Ruta SourceForge inválida.');
  }
  const segments = value.split('/');
  if (segments.some(segment => !segment || segment === '.' || segment === '..' || /^[ .]/.test(segment) || / $/.test(segment) || !SAFE_SEGMENT_RE.test(segment))) {
    throw new Error('Ruta SourceForge inválida.');
  }
  if (!/\.iso$/i.test(segments.at(-1))) throw new Error('La ruta SourceForge debe terminar en una ISO.');
  return value;
}

function buildSourceForgePath({ channel, version, filename, uploadId }) {
  return validateSourceForgePath(buildObjectKey(channel, version, filename, uploadId));
}

function encodePath(path) {
  return validateSourceForgePath(path).split('/').map(encodeURIComponent).join('/');
}

function normalizePublicConfig(config) {
  const project = validateProject(config && config.project);
  return {
    project,
    downloadBase: String((config && config.downloadBase) || `https://sourceforge.net/projects/${encodeURIComponent(project)}/files`).replace(/\/+$/, ''),
    fileManagerBase: String((config && config.fileManagerBase) || `https://sourceforge.net/projects/${encodeURIComponent(project)}/files/`).replace(/\/+$/, '') + '/'
  };
}

function sourceForgeDownloadUrl(config, path) {
  const cfg = normalizePublicConfig(config);
  return `${cfg.downloadBase}/${encodePath(path)}/download`;
}

function sourceForgeFileManagerUrl(config, path) {
  const cfg = normalizePublicConfig(config);
  return path ? `${cfg.fileManagerBase}${encodePath(path)}` : cfg.fileManagerBase;
}

function remoteRoot(config) {
  return `/home/frs/project/${validateProject(config.project)}`;
}

function connectionConfig(config) {
  return {
    project: validateProject(config && config.project),
    username: validateUsername(config && config.username),
    host: validateHost(config && config.host),
    sshKey: validateSshKey(config && config.sshKey)
  };
}

function quoteSftp(value) {
  return `"${value}"`;
}

function sftpArgs(config) {
  return ['-b', '-', ...(config.sshKey ? ['-i', config.sshKey] : []), `${config.username}@${config.host}`];
}

function runProcess(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false, stdio: ['pipe', 'pipe', 'pipe'], env: options.env || process.env });
    let stdout = '', stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; if (options.onStdout) options.onStdout(chunk); });
    child.stderr.on('data', chunk => { stderr += chunk; if (options.onStderr) options.onStderr(chunk); });
    child.on('error', reject);
    child.on('close', code => {
      if (code === 0) resolve({ code, stdout, stderr });
      else reject(new Error(`${command} terminó con código ${code}: ${stderr.trim() || 'sin detalle'}`));
    });
    if (options.input) child.stdin.write(options.input);
    child.stdin.end();
  });
}

async function uploadFileWithRsync({ config, filePath, path, runProcess: execute = runProcess, onProgress }) {
  const cfg = connectionConfig(config);
  const safePath = validateSourceForgePath(path);
  const segments = safePath.split('/');
  const directories = segments.slice(0, -1);
  let current = remoteRoot(cfg);
  const commands = [];
  for (const segment of directories) {
    current += `/${segment}`;
    commands.push(`-mkdir ${quoteSftp(current)}`);
  }
  await execute('sftp', sftpArgs(cfg), { shell: false, input: `${commands.join('\n')}\n` });
  const sshTransport = cfg.sshKey ? `ssh -i ${cfg.sshKey}` : 'ssh';
  const destination = `${cfg.username}@${cfg.host}:${remoteRoot(cfg)}/${safePath}`;
  await execute('rsync', ['-avP', '--partial', '--progress', '--protect-args', '-e', sshTransport, filePath, destination], {
    shell: false,
    onStdout: onProgress,
    onStderr: onProgress
  });
  return { path: safePath, url: sourceForgeDownloadUrl(cfg, safePath) };
}

async function deleteRemoteFile({ config, path, runProcess: execute = runProcess }) {
  const cfg = connectionConfig(config);
  const safePath = validateSourceForgePath(path);
  const input = `rm ${quoteSftp(`${remoteRoot(cfg)}/${safePath}`)}\n`;
  await execute('sftp', sftpArgs(cfg), { shell: false, input });
  return { ok: true, path: safePath };
}

function trustedRedirect(url) {
  return url.protocol === 'https:' && (url.hostname === 'sourceforge.net' || url.hostname.endsWith('.sourceforge.net'));
}

async function inspectPublicFile(url, expectedSize, fetchImpl) {
  let current = url;
  const visited = new Set();
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
    if (visited.has(current)) throw new Error('SourceForge devolvió un bucle de redirecciones.');
    visited.add(current);
    const response = await fetchImpl(current, { method: 'HEAD', redirect: 'manual' });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location || redirects === MAX_REDIRECTS) throw new Error('SourceForge excedió el límite de redirecciones.');
      const next = new URL(location, current);
      if (!trustedRedirect(next)) throw new Error('SourceForge devolvió una redirección no confiable.');
      current = next.href;
      continue;
    }
    if (!response.ok) throw new Error(`SourceForge respondió ${response.status}.`);
    const rawSize = response.headers.get('content-length');
    const size = rawSize && /^\d+$/.test(rawSize) ? Number(rawSize) : 0;
    if (!size) throw new Error('SourceForge no informó un tamaño verificable.');
    if (size > MAX_SOURCEFORGE_FILE_SIZE) throw new Error('La ISO supera el límite de 10 GB de los espejos SourceForge.');
    const contentType = String(response.headers.get('content-type') || '').toLowerCase();
    if (contentType.includes('text/html')) throw new Error('SourceForge devolvió HTML en lugar de la ISO.');
    if (size !== expectedSize) throw new Error(`El tamaño público (${size}) no coincide con el esperado (${expectedSize}).`);
    return { size, resolvedUrl: current };
  }
  throw new Error('SourceForge excedió el límite de redirecciones.');
}

async function verifyPublicFile({ config, path, expectedSize, fetchImpl = fetch, attempts = 4, delayMs = 3000, wait = ms => new Promise(resolve => setTimeout(resolve, ms)) }) {
  const safePath = validateSourceForgePath(path);
  const size = Number(expectedSize);
  if (!Number.isSafeInteger(size) || size <= 0) throw new Error('Tamaño esperado inválido.');
  if (size > MAX_SOURCEFORGE_FILE_SIZE) throw new Error('La ISO supera el límite de 10 GB de los espejos SourceForge.');
  if (!Number.isInteger(attempts) || attempts < 1 || attempts > 20) throw new Error('Cantidad de reintentos inválida.');
  const url = sourceForgeDownloadUrl(config, safePath);
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const result = await inspectPublicFile(url, size, fetchImpl);
      return { ok: true, path: safePath, url, size: result.size, resolvedUrl: result.resolvedUrl };
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await wait(delayMs * attempt);
    }
  }
  throw new Error(`No se pudo verificar la ISO pública en SourceForge: ${lastError.message}`);
}

module.exports = {
  DEFAULT_HOST,
  MAX_SOURCEFORGE_FILE_SIZE,
  sourceForgeConfigFromEnv,
  validateSourceForgePath,
  buildSourceForgePath,
  sourceForgeDownloadUrl,
  sourceForgeFileManagerUrl,
  verifyPublicFile,
  uploadFileWithRsync,
  deleteRemoteFile,
  runProcess
};
