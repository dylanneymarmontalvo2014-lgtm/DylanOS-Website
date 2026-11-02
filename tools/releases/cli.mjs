#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { parseArgs, productionDependencies, publishRelease, cleanupReleaseFile } = require('./service');
const { CHANNELS } = require('../../lib/releases/validation');

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match || match[2].startsWith('#') || process.env[match[1]] !== undefined) continue;
    process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}
loadEnv(path.resolve('.env.local'));

const HELP = `DylanOS releases CLI

Commands:
  status
  list [--channel pre-beta|beta|stable] [--status draft|published|retired]
  history --channel <channel>
  publish --file <iso> --name <name> --version <version> --channel <channel> [--draft]
  retire --id <release-id>
  delete --id <release-id> --yes
  verify [--id <release-id>]
  cleanup --key <sourceforge-path> --yes
  admin:add --user-id <supabase-user-id> --email <email>

Credentials are read from .env.local or the process environment.
SourceForge publication requires an authorized SSH agent or SOURCEFORGE_SSH_KEY.`;

function qs(params) {
  const value = new URLSearchParams({ select: '*' });
  for (const [key, item] of Object.entries(params)) if (item) value.set(key, `eq.${item}`);
  value.set('order', 'created_at.desc');
  return value.toString();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.command === 'help' || args.help) { console.log(HELP); return; }
  if (args.command === 'history' && !args.channel) throw new Error('history requiere --channel.');
  if (args.channel && !CHANNELS.includes(args.channel)) throw new Error('Canal no válido: ' + args.channel + '.');
  if (args.command === 'delete' && (!args.id || !args.yes)) throw new Error('delete requiere --id y --yes.');
  if (args.command === 'cleanup' && (!args.key || !args.yes)) throw new Error('cleanup requiere --key y --yes.');
  const deps = productionDependencies();

  if (args.command === 'publish') {
    const result = await publishRelease({ ...args, publish: !args.draft,
      onHashProgress: bytes => process.stderr.write(`\rHash: ${bytes} bytes`),
      onUploadProgress: chunk => process.stderr.write(String(chunk))
    }, deps);
    process.stderr.write('\n');
    console.log(JSON.stringify({
      ok: true,
      id: result.release.id,
      status: result.release.status,
      provider: 'sourceforge',
      path: result.path,
      url: result.url,
      sha256: result.sha256,
      size: result.size
    }, null, 2));
    return;
  }

  if (args.command === 'list' || args.command === 'history' || args.command === 'status') {
    const filters = args.command === 'history' ? { channel: args.channel, status: 'retired' } : { channel: args.channel, status: args.status };
    const rows = await deps.request(`/rest/v1/releases?${qs(filters)}`);
    if (args.command === 'status') {
      const active = rows.filter(row => row.status === 'published');
      console.log(JSON.stringify({ total: rows.length, drafts: rows.filter(row => row.status === 'draft').length, active }, null, 2));
    } else if (args.json) console.log(JSON.stringify(rows, null, 2));
    else console.table(rows.map(row => ({ id: row.id, channel: row.channel, version: row.version, status: row.status, size: row.file_size, published_at: row.published_at })));
    return;
  }

  if (args.command === 'retire') {
    if (!args.id) throw new Error('Falta --id.');
    console.log(JSON.stringify(await deps.retire(args.id), null, 2)); return;
  }

  if (args.command === 'delete') {
    const rows = await deps.request(`/rest/v1/releases?select=*&id=eq.${encodeURIComponent(args.id)}&limit=1`);
    if (!rows[0]) throw new Error('Versión no encontrada.');
    if (rows[0].storage_provider !== 'sourceforge') throw new Error('La eliminación física automática solo admite archivos SourceForge.');
    await deps.deleteRelease(args.id);
    try { await deps.deleteObject(rows[0].file_path); }
    catch (cause) {
      throw new Error('El registro se eliminó, pero quedó el objeto huérfano ' + rows[0].file_path
        + '. Recupera con: npm run releases:cleanup -- --key "' + rows[0].file_path + '" --yes. Error: ' + cause.message);
    }
    console.log(JSON.stringify({ ok: true, deleted: args.id, key: rows[0].file_path }, null, 2)); return;
  }

  if (args.command === 'cleanup') {
    await cleanupReleaseFile(args.key, deps);
    console.log(JSON.stringify({ ok: true, deleted_path: args.key }, null, 2)); return;
  }

  if (args.command === 'verify') {
    const rows = await deps.request(`/rest/v1/releases?${qs({ id: args.id })}`);
    const results = [];
    for (const row of rows) {
      if (row.storage_provider !== 'sourceforge') {
        results.push({ id: row.id, ok: false, error: `Proveedor no verificable por esta CLI: ${row.storage_provider}` });
        continue;
      }
      try { const info = await deps.verify({ path: row.file_path, expectedSize: Number(row.file_size) }); results.push({ id: row.id, ok: Number(info.size) === Number(row.file_size), expected: row.file_size, actual: info.size, url: info.url }); }
      catch (error) { results.push({ id: row.id, ok: false, error: error.message }); }
    }
    console.table(results); if (results.some(item => !item.ok)) process.exitCode = 2; return;
  }

  if (args.command === 'admin:add') {
    if (!args.userId || !args.email) throw new Error('admin:add requiere --user-id y --email.');
    const data = await deps.request('/rest/v1/release_admins', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ user_id: args.userId, email: args.email }) });
    console.log(JSON.stringify({ ok: true, admin: data[0] }, null, 2)); return;
  }
  throw new Error(`Comando desconocido: ${args.command}`);
}

main().catch(error => {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
});
