const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const root = join(__dirname, '../..');
const index = readFileSync(join(root, 'index.html'), 'utf8');
const admin = readFileSync(join(root, 'admin/versions/index.html'), 'utf8');
const catalogueScript = readFileSync(join(root, 'scripts/dylanos-downloads.js'), 'utf8');

test('public releases stay inside the production DylanOS shell', () => {
  assert.match(index, /styles\/index-Dy2IKqv_\.css/);
  assert.match(index, /scripts\/index-viqq3O5v\.js/);
  assert.match(index, /relative min-h-screen bg-\[#050505\] text-white overflow-x-hidden/);
  assert.match(index, /id="descargas"/);
  assert.match(index, /styles\/releases\.css/);
  assert.match(index, /scripts\/dylanos-downloads\.js/);
});

test('catalogue mounts after the official React bundle hydrates the page', () => {
  assert.match(catalogueScript, /getElementById\(['"]descargas['"]\)/);
  assert.match(catalogueScript, /addEventListener\(['"]load['"]/);
  assert.match(catalogueScript, /MutationObserver/);
  assert.match(catalogueScript, /id="releases-grid"/);
});

test('Copilot replacement shell is not loaded by the public site', () => {
  assert.doesNotMatch(index, /styles\/dylanos\.css/);
  assert.doesNotMatch(index, /scripts\/app\.js/);
  assert.doesNotMatch(index, /class="site-nav"/);
  assert.doesNotMatch(index, /class="hero"/);
});

test('release and admin styles are isolated from the production shell', () => {
  const releases = readFileSync(join(root, 'styles/releases.css'), 'utf8');
  assert.doesNotMatch(releases, /(^|[},\s])\.(hero|site-nav|section|shell)(\W|$)/m);
  assert.match(admin, /admin\/versions\/admin\.css|href="admin\.css"/);
  assert.doesNotMatch(admin, /styles\/dylanos\.css/);
});
