const test = require('node:test');
const assert = require('node:assert/strict');

test('public config exposes only public Supabase and SourceForge values plus readiness flags', () => {
  const { publicConfig } = require('../../api/public-config');
  const env = {
    SUPABASE_URL: 'https://project.supabase.co', SUPABASE_ANON_KEY: 'anon-public', SUPABASE_SERVICE_ROLE_KEY: 'never-public',
    SOURCEFORGE_PROJECT: 'dylanos', SOURCEFORGE_USERNAME: 'private-user', SOURCEFORGE_SSH_KEY: '/private/ssh-key'
  };
  const config = publicConfig(env);
  assert.equal(config.configured, true);
  assert.equal(config.catalogue_ready, true);
  assert.equal(config.external_upload_configured, true);
  assert.equal(config.storage_provider, 'sourceforge');
  assert.equal(config.sourceforge_project, 'dylanos');
  assert.equal(config.sourceforge_download_base, 'https://sourceforge.net/projects/dylanos/files');
  assert.equal(config.sourceforge_file_manager_url, 'https://sourceforge.net/projects/dylanos/files/');
  assert.equal(JSON.stringify(config).includes('never-public'), false);
  assert.equal(JSON.stringify(config).includes('private-user'), false);
  assert.equal(JSON.stringify(config).includes('ssh-key'), false);
});

test('public config distinguishes catalogue readiness from upload readiness', () => {
  const { publicConfig } = require('../../api/public-config');
  const config = publicConfig({ SUPABASE_URL: 'https://project.supabase.co', SUPABASE_ANON_KEY: 'anon' });
  assert.equal(config.catalogue_ready, true);
  assert.equal(config.external_upload_configured, false);
  assert.equal(config.sourceforge_download_base, null);
});
