const test = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');

test('incremental SHA-256 matches standard vectors across chunk boundaries', () => {
  const { Sha256 } = require('../../lib/releases/sha256');
  const hash = new Sha256();
  hash.update(Buffer.from('a'));
  hash.update(Buffer.from('bc'));
  assert.equal(hash.hex(), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

test('streaming SHA-256 reports bounded progress and final byte count', async () => {
  const { sha256Stream } = require('../../lib/releases/sha256');
  const progress = [];
  const result = await sha256Stream(Readable.from([Buffer.from('hello '), Buffer.from('world')]), n => progress.push(n));
  assert.deepEqual(result, {
    sha256: 'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9',
    size: 11
  });
  assert.deepEqual(progress, [6, 11]);
});
