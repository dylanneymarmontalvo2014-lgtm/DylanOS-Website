const test = require('node:test');
const assert = require('node:assert/strict');

const core = require('../../DylanOSdocs/wiki-core');

test('normaliza slugs de la Wiki y rechaza rutas peligrosas', () => {
  assert.equal(core.normalizePageSlug('DylanOS Explorer'), 'DylanOS-Explorer');
  assert.equal(core.normalizePageSlug('Capitulo-6-Solucion-de-problemas'), 'Capitulo-6-Solucion-de-problemas');
  assert.equal(core.normalizePageSlug('../.env'), 'Home');
  assert.equal(core.normalizePageSlug('javascript:alert(1)'), 'Home');
  assert.equal(core.normalizePageSlug(''), 'Home');
});

test('construye rutas internas y URLs crudas de GitHub Wiki', () => {
  assert.equal(core.pageHash('DylanOS Explorer'), '#/DylanOS-Explorer');
  assert.equal(
    core.githubWikiPageUrl('DylanOS-Explorer', 'session-1'),
    'https://raw.githubusercontent.com/wiki/dylanneymarmontalvo2014-lgtm/DylanOS/DylanOS-Explorer.md?v=session-1'
  );
});

test('convierte la barra lateral de GitHub Wiki en capítulos navegables', () => {
  const sidebar = [
    '**[[Inicio|Home]]**',
    '',
    '### 01 · Empezar',
    '',
    '- [[Qué es DylanOS|Que-es-DylanOS-Crimson]]',
    '- [[Instalar|Instalar-DylanOS]]',
    '',
    '### 02 · Escritorio',
    '',
    '- [[Recorrido|Recorrido-por-el-escritorio]]'
  ].join('\n');

  assert.deepEqual(core.parseSidebar(sidebar), [
    {
      title: 'Inicio',
      pages: [{ title: 'Inicio', slug: 'Home' }]
    },
    {
      title: '01 · Empezar',
      pages: [
        { title: 'Qué es DylanOS', slug: 'Que-es-DylanOS-Crimson' },
        { title: 'Instalar', slug: 'Instalar-DylanOS' }
      ]
    },
    {
      title: '02 · Escritorio',
      pages: [{ title: 'Recorrido', slug: 'Recorrido-por-el-escritorio' }]
    }
  ]);
});

test('renderiza títulos, enlaces Wiki, tablas, avisos y bloques de código', () => {
  const markdown = [
    '# Guía',
    '',
    'Consulta [[Explorer|DylanOS-Explorer]] y **continúa**.',
    '',
    '| Acción | Resultado |',
    '| --- | --- |',
    '| Abrir | Ventana |',
    '',
    '> [!IMPORTANT]',
    '> Conserva una copia.',
    '',
    '```bash',
    'dylanos-explorer ~/Documentos',
    '```'
  ].join('\n');

  const html = core.renderMarkdown(markdown);
  assert.match(html, /<h1[^>]*>Guía<\/h1>/);
  assert.match(html, /href="#\/DylanOS-Explorer"/);
  assert.match(html, /<strong>continúa<\/strong>/);
  assert.match(html, /<table>/);
  assert.match(html, /docs-callout docs-callout--important/);
  assert.match(html, /<pre><code class="language-bash">/);
});

test('extrae texto útil para el índice de búsqueda', () => {
  const text = core.extractSearchText('# DylanOS Explorer\n\n**Archivos** y `KIO`. [[Abrir|DylanOS-Explorer]]');
  assert.equal(text, 'DylanOS Explorer Archivos y KIO. Abrir');
});

test('conserva bloques HTML editoriales completos sin mostrar sus etiquetas como texto', () => {
  const markdown = [
    '<p align="center">',
    '  Empieza con <a href="Diagnostico-rapido"><strong>diagnóstico rápido</strong></a>',
    '  &nbsp;·&nbsp;',
    '</p>'
  ].join('\n');

  const html = core.renderMarkdown(markdown);
  assert.match(html, /<p align="center">\s*Empieza con <a href="Diagnostico-rapido">/);
  assert.match(html, /&nbsp;·&nbsp;/);
  assert.doesNotMatch(html, /&lt;a href/);
  assert.doesNotMatch(html, /<p><\/p>/);
});
