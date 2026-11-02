const test = require('node:test');
const assert = require('node:assert/strict');

function provider() {
  return require('../../lib/releases/sourceforge');
}

test('SourceForge paths are immutable ASCII ISO paths and URLs encode allowed spaces', () => {
  const { buildSourceForgePath, sourceForgeConfigFromEnv, sourceForgeDownloadUrl, sourceForgeFileManagerUrl } = provider();
  const path = buildSourceForgePath({
    channel: 'pre-beta', version: '0.3.0-prebeta', filename: 'Dylan OS.iso', uploadId: 'upload-123'
  });
  assert.equal(path, 'pre-beta/0.3.0-prebeta/upload-123/Dylan-OS.iso');
  const config = sourceForgeConfigFromEnv({ SOURCEFORGE_PROJECT: 'dylanos' }, { requireCredentials: false });
  assert.equal(sourceForgeDownloadUrl(config, 'beta/1.0.0/Dylan OS.iso'), 'https://sourceforge.net/projects/dylanos/files/beta/1.0.0/Dylan%20OS.iso/download');
  assert.equal(sourceForgeFileManagerUrl(config), 'https://sourceforge.net/projects/dylanos/files/');
});

test('SourceForge path validation rejects traversal, encoded separators, Unicode and provider-disallowed names', () => {
  const { validateSourceForgePath } = provider();
  const invalid = [
    '', '/beta/release.iso', 'beta//release.iso', 'beta/../release.iso', 'beta/%2f/release.iso',
    'beta/Dylán.iso', 'beta/name&bad.iso', 'beta/name?.iso', 'beta/.hidden.iso',
    ' beta/release.iso', 'beta /release.iso', 'beta/release.iso ', 'beta/release.zip'
  ];
  for (const path of invalid) assert.throws(() => validateSourceForgePath(path), /SourceForge|ISO|ruta/i, path);
  assert.equal(validateSourceForgePath('beta/Release 1.0/DylanOS.iso'), 'beta/Release 1.0/DylanOS.iso');
});

test('SourceForge upload uses SFTP batch plus rsync argument arrays without a shell', async () => {
  const { uploadFileWithRsync } = provider();
  const calls = [];
  const runProcess = async (command, args, options) => {
    calls.push({ command, args, options });
    return { code: 0, stdout: '', stderr: '' };
  };
  await uploadFileWithRsync({
    config: { project: 'dylanos', username: 'dylan-user', host: 'frs.sourceforge.net' },
    filePath: '/tmp/Dylan OS.iso', path: 'beta/1.0/upload-1/Dylan OS.iso', runProcess
  });
  assert.equal(calls[0].command, 'sftp');
  assert.match(calls[0].options.input, /mkdir "\/home\/frs\/project\/dylanos\/beta"/);
  assert.equal(calls[1].command, 'rsync');
  assert.deepEqual(calls[1].args.slice(0, 3), ['-avP', '--partial', '--progress']);
  assert.equal(calls[1].args.at(-2), '/tmp/Dylan OS.iso');
  assert.equal(calls[1].args.at(-1), 'dylan-user@frs.sourceforge.net:/home/frs/project/dylanos/beta/1.0/upload-1/Dylan OS.iso');
  assert.equal(calls[1].options.shell, false);
});

test('SourceForge configuration rejects an SSH key path with command metacharacters', () => {
  const { sourceForgeConfigFromEnv } = provider();
  assert.throws(() => sourceForgeConfigFromEnv({
    SOURCEFORGE_PROJECT: 'dylanos', SOURCEFORGE_USERNAME: 'dylan-user', SOURCEFORGE_SSH_KEY: '/tmp/key;touch-pwned'
  }), /clave SSH/i);
});

test('SourceForge public verification follows trusted redirects and checks exact size', async () => {
  const { verifyPublicFile } = provider();
  const responses = [
    new Response(null, { status: 302, headers: { location: 'https://pilotfiber.dl.sourceforge.net/project/dylanos/beta/Dylan.iso' } }),
    new Response(null, { status: 200, headers: { 'content-length': '4096', 'content-type': 'application/octet-stream' } })
  ];
  const seen = [];
  const result = await verifyPublicFile({
    config: { project: 'dylanos' }, path: 'beta/Dylan.iso', expectedSize: 4096, attempts: 1,
    fetchImpl: async (url, options) => { seen.push({ url, options }); return responses.shift(); }, wait: async () => {}
  });
  assert.equal(result.size, 4096);
  assert.equal(result.url, 'https://sourceforge.net/projects/dylanos/files/beta/Dylan.iso/download');
  assert.equal(seen.length, 2);
  assert.equal(seen[0].options.method, 'HEAD');
});

test('SourceForge public verification rejects unsafe redirects and unverifiable files', async () => {
  const { verifyPublicFile } = provider();
  async function rejects(response, expectedSize = 4096) {
    await assert.rejects(() => verifyPublicFile({
      config: { project: 'dylanos' }, path: 'beta/Dylan.iso', expectedSize, attempts: 1,
      fetchImpl: async () => response, wait: async () => {}
    }));
  }
  await rejects(new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/private' } }));
  await rejects(new Response(null, { status: 200, headers: { 'content-type': 'application/octet-stream' } }));
  await rejects(new Response(null, { status: 200, headers: { 'content-length': '12', 'content-type': 'text/html' } }));
  await rejects(new Response(null, { status: 200, headers: { 'content-length': '12', 'content-type': 'application/octet-stream' } }));
  await rejects(new Response(null, { status: 200, headers: { 'content-length': '10000000001', 'content-type': 'application/octet-stream' } }), 10_000_000_001);
});

test('SourceForge verification stops redirect loops', async () => {
  const { verifyPublicFile } = provider();
  let calls = 0;
  await assert.rejects(() => verifyPublicFile({
    config: { project: 'dylanos' }, path: 'beta/Dylan.iso', expectedSize: 4096, attempts: 1,
    fetchImpl: async () => {
      calls++;
      return new Response(null, { status: 302, headers: { location: 'https://sourceforge.net/projects/dylanos/files/beta/Dylan.iso/download' } });
    }, wait: async () => {}
  }), /redirecciones/i);
  assert.ok(calls >= 1 && calls <= 6);
});

test('SourceForge deletion sends only a validated exact path to SFTP batch input', async () => {
  const { deleteRemoteFile } = provider();
  let call;
  await deleteRemoteFile({
    config: { project: 'dylanos', username: 'dylan-user', host: 'frs.sourceforge.net' },
    path: 'beta/1.0/upload-1/Dylan OS.iso',
    runProcess: async (command, args, options) => { call = { command, args, options }; return { code: 0 }; }
  });
  assert.equal(call.command, 'sftp');
  assert.equal(call.options.shell, false);
  assert.equal(call.options.input, 'rm "/home/frs/project/dylanos/beta/1.0/upload-1/Dylan OS.iso"\n');
  await assert.rejects(() => deleteRemoteFile({
    config: { project: 'dylanos', username: 'dylan-user', host: 'frs.sourceforge.net' },
    path: '../other.iso', runProcess: async () => { throw new Error('no debe ejecutarse'); }
  }), /ruta/i);
});
