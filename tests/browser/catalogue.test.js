const test = require('node:test');
const assert = require('node:assert/strict');
const { splitChannel, downloadUrl, EMPTY_TITLE, EMPTY_DESCRIPTION } = require('../../lib/releases/catalogue');

test('an empty channel exposes explanatory Spanish copy', () => {
  const result = splitChannel([]);
  assert.equal(result.active, null);
  assert.deepEqual(result.history, []);
  assert.equal(EMPTY_TITLE, 'No hay ISOs disponibles');
  assert.match(EMPTY_DESCRIPTION, /todavía no existe/i);
});

test('active and history are independent and drafts never enter the public model', () => {
  const rows = [
    { id: 'draft', status: 'draft', published_at: '2026-10-25T10:00:00Z' },
    { id: 'old', status: 'retired', published_at: '2026-01-01T10:00:00Z' },
    { id: 'active', status: 'published', published_at: '2026-10-01T10:00:00Z' },
    { id: 'new-history', status: 'retired', published_at: '2026-09-01T10:00:00Z' }
  ];
  const result = splitChannel(rows);
  assert.equal(result.active.id, 'active');
  assert.deepEqual(result.history.map(row => row.id), ['new-history', 'old']);
  assert.equal(JSON.stringify(result).includes('draft'), false);
});

test('SourceForge public download URLs encode safe object-key segments', () => {
  const url = downloadUrl({ storage_provider: 'sourceforge', file_path: 'beta/1.0/id/Dylan OS.iso' }, { sourceforge_project: 'dylanos' });
  assert.equal(url, 'https://sourceforge.net/projects/dylanos/files/beta/1.0/id/Dylan%20OS.iso/download');
  assert.equal(downloadUrl({ storage_provider: 'sourceforge', file_path: 'beta/../private.iso' }, { sourceforge_project: 'dylanos' }), null);
  assert.equal(downloadUrl({ storage_provider: 'sourceforge', file_path: 'beta/Dylán.iso' }, { sourceforge_project: 'dylanos' }), null);
});

test('legacy R2 public download URLs remain readable', () => {
  const url = downloadUrl({ storage_provider: 'r2', file_path: 'beta/1.0/id/Dylan OS.iso' }, { r2_public_base: 'https://iso.dylanos.example/' });
  assert.equal(url, 'https://iso.dylanos.example/beta/1.0/id/Dylan%20OS.iso');
  assert.equal(downloadUrl({ storage_provider: 'r2', file_path: 'beta/1.iso' }, {}), null);
});
