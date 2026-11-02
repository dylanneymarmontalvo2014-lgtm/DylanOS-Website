const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { handleRequest } = require('../../server');

const root = join(__dirname, '../..');

test('el enlace Documentación del pie abre DylanOSdocs en HTML y en el bundle', () => {
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  const bundle = readFileSync(join(root, 'scripts/index-viqq3O5v.js'), 'utf8');
  assert.match(html, /href="\/DylanOSdocs\/"[^>]*>[^<]*(?:<[^>]+>)*Documentación/);
  assert.match(bundle, /label:"Documentación",href:"\/DylanOSdocs\/"/);
});

test('el servidor local resuelve la ruta de directorio de DylanOSdocs', async () => {
  const server = http.createServer(handleRequest);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    const response = await fetch(`http://127.0.0.1:${port}/DylanOSdocs/`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /text\/html/);
    assert.match(await response.text(), /<title>DylanOSdocs/);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('el sitemap publica la entrada de DylanOSdocs', () => {
  const sitemap = readFileSync(join(root, 'sitemap.xml'), 'utf8');
  assert.match(sitemap, /https:\/\/dylanoswebsite\.vercel\.app\/DylanOSdocs\//);
});
