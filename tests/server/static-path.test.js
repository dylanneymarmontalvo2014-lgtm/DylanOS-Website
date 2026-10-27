const test = require('node:test');
const assert = require('node:assert/strict');
const { requestFile } = require('../../lib/static-path');

test('directory URLs resolve to their index document', () => {
  assert.equal(requestFile('/'), 'index.html');
  assert.equal(requestFile('/admin/versions/'), 'admin/versions/index.html');
});

test('static request paths remain relative and reject hidden segments', () => {
  assert.equal(requestFile('/styles/releases.css'), 'styles/releases.css');
  assert.throws(() => requestFile('/../.env'), /no permitida/i);
  assert.throws(() => requestFile('/.git/config'), /no permitida/i);
});
