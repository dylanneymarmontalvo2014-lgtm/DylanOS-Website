const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('DylanOSforms ships an auth-aware builder and public response flow', () => {
  const html = fs.readFileSync('DylanOSforms/index.html', 'utf8');
  const script = fs.readFileSync('DylanOSforms/forms.js', 'utf8');
  const css = fs.readFileSync('DylanOSforms/forms.css', 'utf8');
  assert.match(html, /id="forms-app"/);
  assert.match(html, /vendor\/supabase\.js/);
  assert.match(html, /forms\.js/);
  assert.match(script, /signInWithPassword/);
  assert.match(script, /signUp/);
  assert.match(script, /\/api\/forms/);
  assert.match(script, /submissions/);
  assert.match(css, /prefers-reduced-motion/);
});

test('the production community call-to-action redirects to DylanOSforms', () => {
  const script = fs.readFileSync('scripts/dylanosforms-link.js', 'utf8');
  const html = fs.readFileSync('index.html', 'utf8');
  assert.match(html, /dylanosforms-link\.js/);
  assert.match(script, /DylanOSforms/);
  assert.match(script, /Formularios/);
});
