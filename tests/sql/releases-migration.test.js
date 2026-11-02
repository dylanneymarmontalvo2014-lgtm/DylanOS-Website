const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');
const assert = require('node:assert/strict');

const migration = readFileSync(
  join(__dirname, '../../supabase/migrations/20261025000100_releases_system.sql'),
  'utf8'
);

function readSourceForgeMigration() {
  return readFileSync(
    join(__dirname, '../../supabase/migrations/20261026000100_sourceforge_provider.sql'),
    'utf8'
  );
}

test('sourceforge provider migration preserves legacy providers', () => {
  const sourceforge = readSourceForgeMigration();
  assert.match(sourceforge, /storage_provider\s+in\s*\(\s*'supabase'\s*,\s*'r2'\s*,\s*'sourceforge'\s*\)/i);
  assert.doesNotMatch(sourceforge, /update\s+public\.releases/i);
  assert.doesNotMatch(sourceforge, /delete\s+from\s+public\.releases/i);
});

test('sourceforge rows retain immutable provider path uniqueness', () => {
  const sourceforge = readSourceForgeMigration();
  assert.doesNotMatch(sourceforge, /drop\s+constraint\s+(if\s+exists\s+)?releases_file_path_key/i);
  assert.doesNotMatch(sourceforge, /drop\s+index\s+(if\s+exists\s+)?releases_one_published_per_channel/i);
  assert.match(migration, /constraint\s+releases_file_path_key[\s\S]*unique\s*\(\s*storage_provider\s*,\s*file_path\s*\)/i);
  assert.match(migration, /create\s+unique\s+index\s+(?:if\s+not\s+exists\s+)?releases_one_published_per_channel/i);
});

test('public release reads include published and retired rows but never drafts', () => {
  assert.match(migration, /status\s+in\s*\(\s*'published'\s*,\s*'retired'\s*\)/i);
  assert.doesNotMatch(migration, /using\s*\(\s*status\s*=\s*'published'\s+or\s+public\.is_release_admin\(\)\s*\)/i);
});

test('publishing serializes operations for the same channel', () => {
  assert.match(migration, /pg_advisory_xact_lock\s*\(/i);
  assert.match(migration, /v_target\.channel/i);
});

test('publishing refuses releases without verified size and SHA-256', () => {
  assert.match(migration, /v_target\.file_size\s+is\s+null\s+or\s+v_target\.file_size\s*<=\s*0/i);
  assert.match(migration, /v_target\.sha256\s+is\s+null/i);
  assert.match(migration, /integridad_no_verificada/i);
});

test('only drafts can be promoted and promotion clears retirement metadata', () => {
  assert.match(migration, /if\s+v_target\.status\s*<>\s*'draft'\s+then[\s\S]*raise\s+sqlstate\s+'PT409'\s+using\s+message\s*=\s*'estado_no_publicable'/i);
  assert.match(migration, /retire_reason\s*=\s*null/i);
});

test('anonymous clients receive select only and mutations remain admin gated', () => {
  assert.match(migration, /grant\s+select\s+on\s+public\.releases\s+to\s+anon/i);
  assert.doesNotMatch(migration, /grant\s+select\s*,\s*update\s+on\s+public\.releases\s+to\s+anon/i);
  assert.match(migration, /if\s+not\s+public\.is_release_admin\(\)/i);
});

test('case-insensitive channel versions use a functional unique index', () => {
  assert.doesNotMatch(migration, /constraint\s+releases_channel_version_key\s+unique\s*\(\s*channel\s*,\s*lower\(version\)\s*\)/i);
  assert.match(migration, /create\s+unique\s+index[^;]+on\s+public\.releases\s*\(\s*channel\s*,\s*lower\(version\)\s*\)/is);
});

test('deleting an active release reports an HTTP conflict instead of a server error', () => {
  assert.match(migration, /raise\s+sqlstate\s+'PT409'\s+using\s+message\s*=\s*'version_no_eliminable'/i);
});

test('published rows require verified integrity at the database boundary', () => {
  assert.match(migration, /status\s*<>\s*'published'\s+or\s*\(\s*file_size\s*>\s*0\s+and\s+sha256\s+is\s+not\s+null\s*\)/i);
});

test('authenticated clients cannot bypass lifecycle RPCs', () => {
  assert.match(migration, /with\s+check\s*\(\s*public\.is_release_admin\(\)\s+and\s+status\s*=\s*'draft'\s*\)/i);
  assert.match(migration, /revoke\s+all\s+privileges\s+on\s+public\.releases\s+from\s+anon\s*,\s*authenticated/i);
  assert.doesNotMatch(migration, /grant\s+insert\s*,\s*update\s*,\s*delete\s+on\s+public\.releases\s+to\s+authenticated/i);
  assert.match(migration, /grant\s+update\s*\([^)]*name[^)]*\)\s+on\s+public\.releases\s+to\s+authenticated/is);
});
