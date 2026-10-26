(function (root, factory) {
  var sha = typeof module === 'object' && module.exports ? require('./sha256') : root.DylanSha256;
  var api = factory(sha);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DylanBrowserFile = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function (sha) {
  'use strict';

  var MAX_SOURCEFORGE_FILE_SIZE = 10 * 1024 * 1024 * 1024;
  var MIME_TYPES = ['', 'application/octet-stream', 'application/x-iso9660-image', 'application/x-cd-image'];

  function validateIsoFile(file) {
    if (!file || !/\.iso$/i.test(String(file.name || ''))) throw new Error('Selecciona un archivo con extensión .iso.');
    if (!Number.isFinite(file.size) || file.size <= 0) throw new Error('El archivo ISO está vacío.');
    if (file.size > MAX_SOURCEFORGE_FILE_SIZE) throw new Error('El archivo supera el límite de 10 GB de SourceForge.');
    if (!MIME_TYPES.includes(String(file.type || '').toLowerCase())) throw new Error('El tipo de archivo no corresponde a una imagen ISO.');
    return file;
  }

  async function hashIsoFile(file, onProgress, options) {
    validateIsoFile(file);
    var chunkSize = options && options.chunkSize || 4 * 1024 * 1024;
    var hasher = new sha.Sha256();
    for (var offset = 0; offset < file.size; offset += chunkSize) {
      var end = Math.min(file.size, offset + chunkSize);
      hasher.update(await file.slice(offset, end).arrayBuffer());
      if (onProgress) onProgress(end / file.size);
      await new Promise(function (resolve) { setTimeout(resolve, 0); });
    }
    return { sha256: hasher.hex(), size: file.size };
  }

  function verifyExpectedHash(actual, expected) {
    if (expected && String(actual).toLowerCase() !== String(expected).trim().toLowerCase()) {
      throw new Error('El SHA-256 calculado no coincide con el esperado.');
    }
    return String(actual).toLowerCase();
  }

  function validPath(path) {
    var value = String(path || '');
    var segments = value.split('/');
    return value && value.length <= 300 && !value.startsWith('/') && !value.includes('\\') && !/[^\x20-\x7e]/.test(value)
      && /\.iso$/i.test(value) && segments.every(function (segment) {
        return Boolean(segment) && segment !== '.' && segment !== '..' && !/^[ .]/.test(segment)
          && !/ $/.test(segment) && /^[0-9A-Za-z _+.,=@!()[\]~\-]+$/.test(segment);
      });
  }

  function createVerification(args) {
    var file = validateIsoFile(args && args.file);
    var path = String(args && args.path || '');
    var result = args && args.result;
    var hash = String(args && args.sha256 || '').toLowerCase();
    if (!validPath(path) || !/^[a-f0-9]{64}$/.test(hash) || !result || result.ok !== true
      || result.path !== path || Number(result.size) !== file.size) {
      throw new Error('El archivo de SourceForge no está verificado.');
    }
    return Object.freeze({ file: file, path: path, size: file.size, sha256: hash, url: result.url || null });
  }

  function isVerificationCurrent(verification, file, path) {
    return Boolean(verification && verification.file === file && verification.path === String(path || '')
      && verification.size === Number(file && file.size));
  }

  function buildReleaseRow(args) {
    var file = validateIsoFile(args && args.file);
    var path = String(args && args.path || '');
    if (!isVerificationCurrent(args && args.verification, file, path)) {
      throw new Error('Verifica el archivo de SourceForge antes de guardar la versión.');
    }
    var metadata = args.metadata || {};
    return {
      channel: metadata.channel,
      version: metadata.version,
      name: metadata.name,
      arch: metadata.arch || 'x86_64',
      description: metadata.description || null,
      changelog: metadata.changelog || null,
      sha256: args.verification.sha256,
      storage_provider: 'sourceforge',
      file_path: path,
      file_size: args.verification.size,
      status: 'draft'
    };
  }

  return {
    MAX_SOURCEFORGE_FILE_SIZE: MAX_SOURCEFORGE_FILE_SIZE,
    validateIsoFile: validateIsoFile,
    hashIsoFile: hashIsoFile,
    verifyExpectedHash: verifyExpectedHash,
    createVerification: createVerification,
    isVerificationCurrent: isVerificationCurrent,
    buildReleaseRow: buildReleaseRow
  };
}));
