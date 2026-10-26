'use strict';

const assert = require('node:assert/strict');
const { mkdirSync } = require('node:fs');
const { execFileSync } = require('node:child_process');
const { chromium } = require('playwright');

const BASE = 'http://127.0.0.1:5511';
const OUTPUT = '/tmp/dylanos-release-ui';
mkdirSync(OUTPUT, { recursive: true });

const local = JSON.parse(execFileSync('npx', ['supabase', 'status', '-o', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
const SUPABASE_URL = local.API_URL || local.api_url;
const SERVICE_KEY = local.SERVICE_ROLE_KEY || local.service_role_key;
const suffix = `8.${String(Date.now()).slice(-7)}`;
const adminEmail = `ui-admin-${suffix}@example.test`;
const adminPassword = `Ui-${suffix}-Aa1!`;
let adminUserId = null;

async function db(path, options = {}) {
  const response = await fetch(SUPABASE_URL + path, {
    ...options,
    headers: { apikey: SERVICE_KEY, authorization: `Bearer ${SERVICE_KEY}`, 'content-type': 'application/json', ...(options.headers || {}) }
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  assert.ok(response.ok, `${response.status}: ${text}`);
  return data;
}

async function create(channel, version, status = 'draft') {
  const rows = await db('/rest/v1/releases?select=*', {
    method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({
      channel, version, name: `DylanOS Crimson ${version}`, arch: 'x86_64', status,
      storage_provider: 'sourceforge', file_path: `${channel}/${version}/${suffix}/DylanOS.iso`,
      file_size: 3145728, sha256: 'b'.repeat(64), changelog: `Notas ${version}`
    })
  });
  return rows[0];
}

async function publish(row) {
  return db('/rest/v1/rpc/release_publish', { method: 'POST', body: JSON.stringify({ p_release_id: row.id }) });
}

(async () => {
  const adminUser = await db('/auth/v1/admin/users', {
    method: 'POST', body: JSON.stringify({ email: adminEmail, password: adminPassword, email_confirm: true })
  });
  adminUserId = adminUser.id;
  await db('/rest/v1/release_admins', {
    method: 'POST', body: JSON.stringify({ user_id: adminUserId, email: adminEmail })
  });
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium' });
  const errors = [];
  try {
    const desktop = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    desktop.on('pageerror', error => errors.push(String(error)));
    await desktop.goto(BASE, { waitUntil: 'networkidle' });
    await desktop.locator('#descargas').scrollIntoViewIfNeeded();
    await desktop.waitForSelector('#releases-grid .channel-card');
    assert.equal(await desktop.locator('#releases-grid .channel-card').count(), 3);
    assert.equal(await desktop.getByText('No hay ISOs disponibles', { exact: true }).count(), 3);
    assert.equal(await desktop.locator('#releases-grid button[disabled]').count(), 0);
    await desktop.screenshot({ path: `${OUTPUT}/catalogue-desktop.png`, fullPage: true });

    const previous = await create('pre-beta', `${suffix}.0-prebeta`); await publish(previous);
    const current = await create('pre-beta', `${suffix}.1-prebeta`); await publish(current);
    const beta = await create('beta', `${suffix}.0-beta`); await publish(beta);
    await create('stable', `${suffix}.0-draft`);

    await desktop.reload({ waitUntil: 'networkidle' });
    await desktop.locator('#descargas').scrollIntoViewIfNeeded();
    assert.equal(await desktop.getByText(`${suffix}.1-prebeta`, { exact: true }).count(), 1);
    assert.equal(await desktop.getByText(`${suffix}.0-beta`, { exact: true }).count(), 1);
    assert.equal(await desktop.getByText(`${suffix}.0-draft`, { exact: true }).count(), 0);
    assert.equal(await desktop.getByText('No hay ISOs disponibles', { exact: true }).count(), 1);
    const preCard = desktop.locator('.channel-card--pre-beta');
    await preCard.locator('summary.history-summary').click();
    await preCard.locator('summary.history-item-head').click();
    assert.equal(await preCard.getByText(`${suffix}.0-prebeta`, { exact: true }).isVisible(), true);
    assert.match(await preCard.locator('a.btn-primary').getAttribute('href'), /^https:\/\/sourceforge\.net\/projects\/dylanos-test\/files\//);
    await desktop.screenshot({ path: `${OUTPUT}/catalogue-populated.png`, fullPage: true });

    const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
    mobile.on('pageerror', error => errors.push(String(error)));
    await mobile.goto(BASE, { waitUntil: 'networkidle' });
    await mobile.locator('#descargas').scrollIntoViewIfNeeded();
    await mobile.waitForSelector('#releases-grid .channel-card');
    const cards = mobile.locator('#releases-grid .channel-card');
    for (let index = 0; index < await cards.count(); index++) {
      const box = await cards.nth(index).boundingBox();
      assert.ok(box && box.width <= 390, `card ${index} overflows mobile viewport`);
    }
    await mobile.screenshot({ path: `${OUTPUT}/catalogue-mobile.png`, fullPage: true });

    const admin = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    admin.on('pageerror', error => errors.push(String(error)));
    await admin.goto(`${BASE}/admin/versions/`, { waitUntil: 'networkidle' });
    await admin.waitForSelector('#view-login:not([hidden])');
    assert.equal(await admin.getByRole('button', { name: 'Iniciar sesión' }).isVisible(), true);
    assert.equal(await admin.locator('#view-panel').isHidden(), true);
    assert.equal(await admin.locator('#view-unconfigured').isHidden(), true);
    assert.equal(await admin.locator('#view-forbidden').isHidden(), true);
    assert.equal(await admin.locator('.modal-overlay:visible').count(), 0);
    await admin.locator('#login-email').fill(adminEmail);
    await admin.locator('#login-password').fill(adminPassword);
    await admin.getByRole('button', { name: 'Iniciar sesión' }).click();
    await admin.waitForSelector('#view-panel:not([hidden])');
    await admin.getByRole('button', { name: 'Nueva versión' }).click();
    await admin.waitForSelector('#release-modal:not([hidden])');
    assert.equal(await admin.getByRole('link', { name: 'Abrir File Manager' }).getAttribute('href'), 'https://sourceforge.net/projects/dylanos-test/files/');
    assert.equal(await admin.locator('#rel-file-path').isVisible(), true);
    assert.equal(await admin.getByRole('button', { name: 'Verificar archivo público' }).isVisible(), true);
    assert.equal(await admin.locator('#upload-cancel').count(), 0);
    await admin.screenshot({ path: `${OUTPUT}/admin-login.png`, fullPage: true });

    assert.deepEqual(errors, []);
    console.log(`UI screenshots: ${OUTPUT}`);
  } finally {
    await db(`/rest/v1/releases?version=like.${encodeURIComponent(suffix + '*')}`, { method: 'DELETE' }).catch(() => {});
    if (adminUserId) await db(`/auth/v1/admin/users/${adminUserId}`, { method: 'DELETE' }).catch(() => {});
    await browser.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
