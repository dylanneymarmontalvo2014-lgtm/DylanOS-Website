'use strict';

const { execFileSync } = require('node:child_process');
const status = JSON.parse(execFileSync('npx', ['supabase', 'status', '-o', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));

process.env.PORT = '5511';
process.env.SUPABASE_URL = status.API_URL || status.api_url;
process.env.SUPABASE_ANON_KEY = status.ANON_KEY || status.anon_key;
process.env.SOURCEFORGE_PROJECT = 'dylanos-test';

require('../../server');
