'use strict';

function requestFile(pathname) {
  const raw = String(pathname || '/').replace(/^\/+/, '');
  const segments = raw.split('/');
  if (segments.some(segment => segment === '..' || segment.startsWith('.'))) {
    throw new Error('Ruta no permitida.');
  }
  if (!raw) return 'index.html';
  return raw.endsWith('/') ? `${raw}index.html` : raw;
}

module.exports = { requestFile };
