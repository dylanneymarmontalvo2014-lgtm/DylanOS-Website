const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtemp, writeFile } = require('node:fs/promises');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const { spawnSync } = require('node:child_process');

const { parseArgs, productionDependencies, validateIsoFileSize, publishRelease, cleanupReleaseFile } = require('../../tools/releases/service');

test('CLI parser keeps command options and rejects missing option values', () => {
  assert.deepEqual(parseArgs(['publish', '--file', './a.iso', '--channel', 'beta', '--publish']), {
    command: 'publish', file: './a.iso', channel: 'beta', publish: true
  });
  assert.throws(() => parseArgs(['publish', '--file']), /valor/i);
  assert.deepEqual(parseArgs(['--help']), { command: 'help' });
  assert.deepEqual(parseArgs(['publish', '--draft']), { command: 'publish', draft: true });
});

test('database-only commands do not require SourceForge credentials', async () => {
  const deps = productionDependencies({
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-test-value'
  });
  assert.equal(typeof deps.request, 'function');
  assert.throws(() => deps.upload({ file: '/tmp/DylanOS.iso', path: 'beta/1.0/id/DylanOS.iso' }), /SourceForge/i);
});

test('CLI rejects an ISO over the SourceForge mirror limit before upload', () => {
  assert.equal(validateIsoFileSize(3_400_000_000), 3_400_000_000);
  assert.throws(() => validateIsoFileSize(10_000_000_001), /10 GB/i);
});

test('publish workflow hashes, uploads, verifies, inserts, then promotes in order', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dylanos-cli-'));
  const file = join(dir, 'DylanOS.iso');
  await writeFile(file, 'abc');
  const calls = [];
  const deps = {
    upload: async input => { calls.push(['upload', input.sha256, input.size]); return { path: input.path }; },
    verify: async input => { calls.push(['verify', input.path, input.expectedSize]); return { size: 3, url: 'https://sourceforge.example/DylanOS.iso/download' }; },
    insertDraft: async row => { calls.push(['insert', row.sha256, row.status, row.storage_provider]); return { ...row, id: 'release-id' }; },
    publish: async id => { calls.push(['publish', id]); return { id, status: 'published' }; },
    randomId: () => 'upload-id'
  };
  const result = await publishRelease({ file, name: 'DylanOS Crimson', version: '0.3.0-beta', channel: 'beta', publish: true }, deps);
  assert.equal(result.release.status, 'published');
  assert.equal(result.path, 'beta/0.3.0-beta/upload-id/DylanOS.iso');
  assert.equal(result.url, 'https://sourceforge.example/DylanOS.iso/download');
  assert.deepEqual(calls, [
    ['upload', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad', 3],
    ['verify', 'beta/0.3.0-beta/upload-id/DylanOS.iso', 3],
    ['insert', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad', 'draft', 'sourceforge'],
    ['publish', 'release-id']
  ]);
});

test('draft upload verifies and inserts without promoting any channel', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dylanos-cli-'));
  const file = join(dir, 'DylanOS.iso');
  await writeFile(file, 'abc');
  const mutations = [];
  const result = await publishRelease({ file, name: 'DylanOS Beta', version: '0.4.0-beta', channel: 'beta', publish: false }, {
    upload: async () => ({}),
    verify: async input => ({ size: input.expectedSize, url: 'https://sourceforge.example/beta.iso/download' }),
    insertDraft: async row => { mutations.push(['insert', row.channel]); return { ...row, id: 'draft-id' }; },
    publish: async id => { mutations.push(['publish', id]); throw new Error('no debe promover'); },
    randomId: () => 'draft-id'
  });
  assert.equal(result.release.status, 'draft');
  assert.deepEqual(mutations, [['insert', 'beta']]);
});

test('failed upload creates no database row', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dylanos-cli-'));
  const file = join(dir, 'DylanOS.iso');
  await writeFile(file, 'abc');
  let inserted = false;
  await assert.rejects(publishRelease({ file, name: 'DylanOS', version: '0.1.0-prebeta', channel: 'pre-beta' }, {
    upload: async () => { throw new Error('upload failed'); },
    insertDraft: async () => { inserted = true; }, randomId: () => 'id'
  }), /upload failed/);
  assert.equal(inserted, false);
});

test('failed public mirror verification creates no database row', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dylanos-cli-'));
  const file = join(dir, 'DylanOS.iso');
  await writeFile(file, 'abc');
  let databaseCalls = 0;
  await assert.rejects(publishRelease({ file, name: 'DylanOS', version: '0.1.0-beta', channel: 'beta' }, {
    upload: async () => ({}),
    verify: async () => { throw new Error('No se pudo verificar la ISO pública en SourceForge: mirror pendiente'); },
    insertDraft: async () => { databaseCalls++; },
    publish: async () => { databaseCalls++; },
    randomId: () => 'mirror-id'
  }), error => {
    assert.match(error.message, /verificar.*SourceForge/i);
    assert.equal(error.orphanKey, 'beta/0.1.0-beta/mirror-id/DylanOS.iso');
    assert.match(error.message, /releases:cleanup -- --key "beta\/0\.1\.0-beta\/mirror-id\/DylanOS\.iso" --yes/);
    return true;
  });
  assert.equal(databaseCalls, 0);
});

test('database failure reports the exact orphan key and cleanup command', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dylanos-cli-'));
  const file = join(dir, 'DylanOS.iso');
  await writeFile(file, 'abc');
  await assert.rejects(publishRelease({ file, name: 'DylanOS', version: '1.0.0', channel: 'stable' }, {
    upload: async () => ({}), verify: async () => ({ size: 3, url: 'https://sourceforge.example/stable.iso/download' }),
    insertDraft: async () => { throw new Error('database down'); }, randomId: () => 'orphan-id'
  }), error => {
    assert.equal(error.orphanKey, 'stable/1.0.0/orphan-id/DylanOS.iso');
    assert.match(error.message, /releases:cleanup -- --key "stable\/1\.0\.0\/orphan-id\/DylanOS\.iso" --yes/);
    assert.doesNotMatch(error.message, /secret|token|password/i);
    return true;
  });
});

test('cleanup refuses referenced SourceForge paths and deletes only unreferenced exact paths', async () => {
  const key = 'stable/1.0.0/upload-id/DylanOS.iso';
  let deleted = null;
  await assert.rejects(cleanupReleaseFile(key, {
    findReferences: async () => [{ id: 'release-id' }],
    deleteObject: async path => { deleted = path; }
  }), /continúa referenciado/i);
  assert.equal(deleted, null);

  const result = await cleanupReleaseFile(key, {
    findReferences: async () => [],
    deleteObject: async path => { deleted = path; return { ok: true, path }; }
  });
  assert.equal(deleted, key);
  assert.deepEqual(result, { ok: true, path: key });
  await assert.rejects(cleanupReleaseFile('../other.iso', {
    findReferences: async () => [], deleteObject: async () => { throw new Error('no debe ejecutarse'); }
  }), /ruta/i);
});

test('history rejects missing or invalid channels before loading credentials', () => {
  const cli = join(__dirname, '../../tools/releases/cli.mjs');
  let run = spawnSync(process.execPath, [cli, 'history'], { encoding: 'utf8', env: {} });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /requiere --channel/i);
  run = spawnSync(process.execPath, [cli, 'history', '--channel', 'nightly'], { encoding: 'utf8', env: {} });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /canal no válido/i);
});

test('destructive CLI commands require --yes before loading credentials', () => {
  const cli = join(__dirname, '../../tools/releases/cli.mjs');
  let run = spawnSync(process.execPath, [cli, 'delete', '--id', 'release-id'], { encoding: 'utf8', env: {} });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /delete requiere --id y --yes/i);
  assert.doesNotMatch(run.stderr, /SOURCEFORGE|SUPABASE/i);

  run = spawnSync(process.execPath, [cli, 'cleanup', '--key', 'beta/1.0/id/DylanOS.iso'], { encoding: 'utf8', env: {} });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /cleanup requiere --key y --yes/i);
  assert.doesNotMatch(run.stderr, /SOURCEFORGE|SUPABASE/i);
});
