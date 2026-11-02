/* Configuración pública del catálogo. Las credenciales de Supabase admin,
   SourceForge/SSH y cualquier secreto permanecen fuera de esta respuesta. */
const { sourceForgeConfigFromEnv } = require('../lib/releases/sourceforge');

function publicConfig(env = process.env) {
  const supabaseUrl = env.SUPABASE_URL || '';
  const anonKey = env.SUPABASE_ANON_KEY || '';
  const catalogueReady = Boolean(supabaseUrl && anonKey);
  let sourceforge = null;
  try {
    sourceforge = sourceForgeConfigFromEnv(env, { requireCredentials: false });
  } catch (_) { /* Un proyecto ausente o inválido se representa como no configurado. */ }
  return {
    configured: catalogueReady,
    catalogue_ready: catalogueReady,
    upload_configured: Boolean(sourceforge),
    external_upload_configured: Boolean(sourceforge),
    storage_provider: 'sourceforge',
    bucket: env.SUPABASE_STORAGE_BUCKET || null,
    supabase: supabaseUrl && anonKey ? { url: supabaseUrl, anon_key: anonKey } : null,
    sourceforge_project: sourceforge ? sourceforge.project : null,
    sourceforge_download_base: sourceforge ? sourceforge.downloadBase : null,
    sourceforge_file_manager_url: sourceforge ? sourceforge.fileManagerBase : null,
    r2_public_base: env.R2_PUBLIC_BASE ? String(env.R2_PUBLIC_BASE).replace(/\/+$/, '') : null
  };
}

async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
  res.status(200).json(publicConfig());
}

module.exports = handler;
module.exports.publicConfig = publicConfig;
