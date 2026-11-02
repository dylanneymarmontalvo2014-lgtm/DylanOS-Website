const test = require('node:test');
const assert = require('node:assert/strict');

const base = 'https://raw.githubusercontent.com/wiki/dylanneymarmontalvo2014-lgtm/DylanOS';

test('GitHub Wiki publica la portada que consume DylanOSdocs', async () => {
  const response = await fetch(`${base}/Home.md`, { cache: 'no-store' });
  assert.equal(response.status, 200);
  const markdown = await response.text();
  assert.match(markdown, /DylanOS Crimson/);
  assert.match(markdown, /Capitulo-1-Empezar/);
});

test('GitHub Wiki publica la barra lateral que genera la navegación', async () => {
  const response = await fetch(`${base}/_Sidebar.md`, { cache: 'no-store' });
  assert.equal(response.status, 200);
  const markdown = await response.text();
  assert.match(markdown, /01 · Empezar/);
  assert.match(markdown, /08 · Comunidad/);
  assert.match(markdown, /\[\[Inicio\|Home\]\]/);
});
