const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('forms migration defines owner-safe builder tables and public submissions', () => {
  const sql = fs.readFileSync('supabase/migrations/20261108000100_dylanosforms.sql', 'utf8');
  assert.match(sql, /create table if not exists public\.dylanos_forms/);
  assert.match(sql, /create table if not exists public\.dylanos_form_fields/);
  assert.match(sql, /create table if not exists public\.dylanos_form_submissions/);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /dylanos_forms_public_read/);
  assert.match(sql, /dylanos_submissions_public_insert/);
  assert.match(sql, /auth\.uid\(\)/);
  assert.doesNotMatch(sql, /service_role/i);
});
