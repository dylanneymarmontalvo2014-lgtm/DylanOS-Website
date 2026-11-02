const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const root = join(__dirname, '../..');

function read(relativePath) {
  return readFileSync(join(root, relativePath), 'utf8');
}

test('DylanOSdocs ofrece una estructura accesible de documentación', () => {
  const html = read('DylanOSdocs/index.html');
  assert.match(html, /<html lang="es">/);
  assert.match(html, /<title>DylanOSdocs/);
  assert.match(html, /<header[^>]*class="docs-header"/);
  assert.match(html, /<nav[^>]*aria-label="Capítulos de DylanOSdocs"/);
  assert.match(html, /<main[^>]*id="docs-main"/);
  assert.match(html, /<aside[^>]*aria-label="En esta página"/);
  assert.match(html, /id="docs-search"[^>]*aria-label="Buscar en DylanOSdocs"/);
  assert.match(html, /wiki-core\.js/);
  assert.match(html, /app\.js/);
});

test('el tema conserva la identidad Crimson y responde a móvil y movimiento reducido', () => {
  const css = read('DylanOSdocs/dylanosdocs.css');
  assert.match(css, /--crimson:\s*#dc143c/i);
  assert.match(css, /--black:\s*#050505/i);
  assert.match(css, /grid-template-columns:/);
  assert.match(css, /@media\s*\(max-width:\s*900px\)/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /\.nav-backdrop\[hidden\]\s*\{\s*display:\s*none\s*!important;/);
  assert.match(css, /\.wiki-article img\[width="100%"\][^{]*\{[^}]*width:\s*100%/);
  assert.doesNotMatch(css, /> p\[align="center"\] img\s*\{[^}]*width:\s*100%/);
});

test('la aplicación lee GitHub Wiki sin caché y sanea el HTML remoto', () => {
  const app = read('DylanOSdocs/app.js');
  assert.match(app, /_Sidebar/);
  assert.match(app, /cache:\s*['"]no-store['"]/);
  assert.match(app, /sanitizeFragment/);
  assert.match(app, /ALLOWED_TAGS/);
  assert.match(app, /removeAttribute/);
  assert.match(app, /hashchange/);
  assert.match(app, /buildSearchIndex/);
  assert.match(app, /wrapWideTables/);
  assert.match(app, /No pudimos cargar esta página/);
  assert.doesNotMatch(app, /breadcrumbs\.innerHTML/);
  assert.match(app, /breadcrumbs\.replaceChildren/);
});
