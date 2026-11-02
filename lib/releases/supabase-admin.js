'use strict';

function configFromEnv(env = process.env) {
  const url = String(env.SUPABASE_URL || '').replace(/\/+$/, '');
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !serviceRoleKey) throw new Error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.');
  return { url, serviceRoleKey };
}

async function request(config, path, options = {}) {
  const response = await fetch(`${config.url}${path}`, {
    ...options,
    headers: {
      apikey: config.serviceRoleKey,
      authorization: `Bearer ${config.serviceRoleKey}`,
      'content-type': 'application/json',
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  let data = null;
  if (text) { try { data = JSON.parse(text); } catch { data = text; } }
  if (!response.ok) {
    const error = new Error(data && data.message ? data.message : `Supabase respondió ${response.status}.`);
    error.status = response.status; error.details = data; throw error;
  }
  return data;
}

module.exports = { configFromEnv, request };
