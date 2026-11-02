'use strict';

const CHANNELS = Object.freeze(['pre-beta', 'beta', 'stable']);
const VERSION_RE = /^[0-9A-Za-z][0-9A-Za-z._+-]{0,63}$/;
const SHA256_RE = /^[a-f0-9]{64}$/;

function validateReleaseInput(input) {
  const value = input || {};
  const channel = String(value.channel || '').trim().toLowerCase();
  const version = String(value.version || '').trim();
  const name = String(value.name || '').trim();
  if (!CHANNELS.includes(channel)) throw new Error('Canal de publicación inválido.');
  if (!VERSION_RE.test(version)) throw new Error('Número de versión inválido.');
  if (!name || name.length > 120) throw new Error('Nombre de versión inválido.');
  if (value.sha256 && !SHA256_RE.test(String(value.sha256).toLowerCase())) {
    throw new Error('SHA-256 inválido.');
  }
  return { ...value, channel, version, name, sha256: value.sha256 ? String(value.sha256).toLowerCase() : null };
}

function safeIsoName(filename) {
  const original = String(filename || '').split(/[\\/]/).pop();
  if (!/\.iso$/i.test(original)) throw new Error('El archivo debe tener extensión .iso.');
  const stem = original.slice(0, -4)
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^0-9A-Za-z._+-]+/g, '-')
    .replace(/^[.-]+|[.-]+$/g, '')
    .slice(0, 180);
  if (!stem) throw new Error('El nombre de la ISO no es válido.');
  return `${stem}.iso`;
}

function validateUploadId(uploadId) {
  const value = String(uploadId || '');
  if (!/^[0-9A-Za-z_-]{2,80}$/.test(value)) throw new Error('Identificador de carga inválido.');
  return value;
}

function buildObjectKey(channel, version, filename, uploadId) {
  const release = validateReleaseInput({ channel, version, name: 'release' });
  return `${release.channel}/${release.version}/${validateUploadId(uploadId)}/${safeIsoName(filename)}`;
}

function assertObjectKey(key) {
  const value = String(key || '');
  if (!value || value.length > 1024 || value.startsWith('/') || value.includes('\\') || /(^|\/)\.\.?(\/|$)/.test(value) || /[\u0000-\u001f]/.test(value)) {
    throw new Error('Ruta de objeto inválida.');
  }
  return value;
}

module.exports = { CHANNELS, VERSION_RE, SHA256_RE, validateReleaseInput, safeIsoName, buildObjectKey, assertObjectKey };
