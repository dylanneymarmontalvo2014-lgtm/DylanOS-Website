const test = require('node:test');
const assert = require('node:assert/strict');

test('validation accepts exactly the three release channels', () => {
  const { validateReleaseInput } = require('../../lib/releases/validation');
  for (const channel of ['pre-beta', 'beta', 'stable']) {
    assert.equal(validateReleaseInput({ channel, version: '0.3.0-beta', name: 'Crimson' }).channel, channel);
  }
  assert.throws(() => validateReleaseInput({ channel: 'nightly', version: '1.0.0', name: 'Bad' }), /canal/i);
});

test('validation rejects unsafe versions and non-ISO files', () => {
  const { validateReleaseInput, safeIsoName } = require('../../lib/releases/validation');
  assert.throws(() => validateReleaseInput({ channel: 'beta', version: '../1.0', name: 'Bad' }), /versión/i);
  assert.throws(() => safeIsoName('release.zip'), /\.iso/i);
  assert.equal(safeIsoName('../../Dylan OS 0.3.ISO'), 'Dylan-OS-0.3.iso');
});

test('object keys are immutable, scoped, and traversal safe', () => {
  const { buildObjectKey } = require('../../lib/releases/validation');
  assert.equal(
    buildObjectKey('pre-beta', '0.3.0-prebeta', 'Dylan OS.iso', '018f-test'),
    'pre-beta/0.3.0-prebeta/018f-test/Dylan-OS.iso'
  );
  assert.throws(() => buildObjectKey('beta', '../escape', 'x.iso', 'id'), /versión/i);
});

test('safe ISO names normalize Unicode into SourceForge-compatible ASCII', () => {
  const { safeIsoName } = require('../../lib/releases/validation');
  assert.equal(safeIsoName('Dylán Crimson edición.iso'), 'Dylan-Crimson-edicion.iso');
});
