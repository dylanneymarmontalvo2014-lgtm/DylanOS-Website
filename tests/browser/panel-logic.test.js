const test = require('node:test');
const assert = require('node:assert/strict');

function isoFile(contents = 'iso bytes', name = 'DylanOS.iso', type = 'application/octet-stream') {
  return new File([contents], name, { type });
}

test('browser file validation rejects wrong extension, empty files, unsupported MIME and files over 10 GB', () => {
  const { validateIsoFile } = require('../../lib/releases/browser-file');
  assert.throws(() => validateIsoFile(isoFile('x', 'bad.zip')), /\.iso/i);
  assert.throws(() => validateIsoFile(isoFile('', 'empty.iso')), /vacío/i);
  assert.throws(() => validateIsoFile(isoFile('x', 'bad.iso', 'text/plain')), /tipo/i);
  assert.throws(() => validateIsoFile({ name: 'huge.iso', type: 'application/octet-stream', size: 10_000_000_001 }), /10 GB/i);
  assert.equal(validateIsoFile(isoFile()).name, 'DylanOS.iso');
});

test('browser hashing reports genuine local byte progress and blocks an expected-hash mismatch', async () => {
  const { hashIsoFile, verifyExpectedHash } = require('../../lib/releases/browser-file');
  const seen = [];
  const result = await hashIsoFile(isoFile('abc'), value => seen.push(value), { chunkSize: 1 });
  assert.equal(result.sha256, 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.deepEqual(seen, [1 / 3, 2 / 3, 1]);
  assert.throws(() => verifyExpectedHash(result.sha256, '0'.repeat(64)), /no coincide/i);
});

test('a release row requires a current verified SourceForge path and uses verified integrity', () => {
  const { createVerification, buildReleaseRow } = require('../../lib/releases/browser-file');
  const file = isoFile('abc');
  const verification = createVerification({
    file,
    path: 'beta/1.0/upload-1/DylanOS.iso',
    sha256: 'a'.repeat(64),
    result: { ok: true, path: 'beta/1.0/upload-1/DylanOS.iso', size: file.size, url: 'https://sourceforge.net/download' }
  });
  const row = buildReleaseRow({
    file,
    path: 'beta/1.0/upload-1/DylanOS.iso',
    verification,
    metadata: { channel: 'beta', version: '1.0-beta', name: 'Crimson Beta', arch: 'x86_64', description: '', changelog: '' }
  });
  assert.deepEqual(row, {
    channel: 'beta', version: '1.0-beta', name: 'Crimson Beta', arch: 'x86_64',
    description: null, changelog: null, sha256: 'a'.repeat(64), storage_provider: 'sourceforge',
    file_path: 'beta/1.0/upload-1/DylanOS.iso', file_size: 3, status: 'draft'
  });
  assert.throws(() => buildReleaseRow({
    file, path: 'beta/1.0/upload-2/DylanOS.iso', verification,
    metadata: { channel: 'beta', version: '1.0-beta', name: 'Crimson Beta', arch: 'x86_64' }
  }), /verific/i);
});

test('changing the selected file invalidates a prior verification', () => {
  const { createVerification, isVerificationCurrent } = require('../../lib/releases/browser-file');
  const file = isoFile('abc');
  const verification = createVerification({
    file, path: 'beta/1/DylanOS.iso', sha256: 'a'.repeat(64),
    result: { ok: true, path: 'beta/1/DylanOS.iso', size: file.size, url: 'https://sourceforge.net/download' }
  });
  assert.equal(isVerificationCurrent(verification, file, 'beta/1/DylanOS.iso'), true);
  assert.equal(isVerificationCurrent(verification, isoFile('abc'), 'beta/1/DylanOS.iso'), false);
  assert.equal(isVerificationCurrent(verification, file, 'beta/2/DylanOS.iso'), false);
});

test('legacy public files are checked with HEAD and exact size', async () => {
  const { probePublicFile } = require('../../lib/releases/browser-file');
  const seen = [];
  const ok = await probePublicFile('https://downloads.example/DylanOS.iso', 4096, async (url, options) => {
    seen.push({ url, options });
    return new Response(null, { status: 200, headers: { 'content-length': '4096' } });
  });
  assert.deepEqual(ok, { ok: true, status: 200, size: 4096 });
  assert.equal(seen[0].options.method, 'HEAD');
  const mismatch = await probePublicFile('https://downloads.example/DylanOS.iso', 4096, async () => (
    new Response(null, { status: 200, headers: { 'content-length': '12' } })
  ));
  assert.equal(mismatch.ok, false);
});
