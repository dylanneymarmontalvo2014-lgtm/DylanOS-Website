/* =====================================================================
   DylanOS — Catálogo público de descargas (DylanOS Crimson)
   ---------------------------------------------------------------------
   Lee las publicaciones reales de Supabase (PostgREST) usando la
   configuración pública que expone /api/public-config (URL, clave
   anónima y base pública SourceForge). Nunca contiene
   credenciales ni versiones hardcodeadas: todo sale de la base de datos.
   ===================================================================== */
(function () {
  'use strict';

  var CHANNELS = [
    { id: 'pre-beta', label: 'Pre-beta', tag: 'Pre-beta', desc: 'Versiones experimentales: el borde del nuevo desarrollo.' },
    { id: 'beta',     label: 'Beta', tag: 'Beta', desc: 'Funcionales y completas, todavía con detalles por pulir.' },
    { id: 'stable',   label: 'Estable', tag: 'Estable', desc: 'La ISO lista para el uso diario.' }
  ];

  var grid = null;
  var statusEl = null;

  var config = null;
  var loadFailed = false;

  /* El HTML publicado lo hidrata el bundle React oficial. Montamos el
     catálogo en `load`, cuando ese árbol ya es el definitivo, y sustituimos
     únicamente el CTA "Próximamente disponible" dentro de #descargas. */
  function mountCatalogue() {
    var host = document.getElementById('descargas');
    if (!host) return false;
    host.classList.add('release-catalogue-shell');
    host.innerHTML = ''
      + '<div class="release-catalogue-frame">'
      +   '<div class="release-catalogue-heading">'
      +     '<span class="release-catalogue-kicker">Descargas</span>'
      +     '<h2>Elige cómo probar DylanOS Crimson.</h2>'
      +     '<p>Pre-beta, Beta y Estable avanzan por separado. Cada canal conserva sus versiones anteriores.</p>'
      +   '</div>'
      +   '<p id="releases-status" class="releases-status" hidden role="status"></p>'
      +   '<div id="releases-grid" class="release-channel-grid" aria-live="polite"></div>'
      + '</div>';
    grid = document.getElementById('releases-grid');
    statusEl = document.getElementById('releases-status');
    return Boolean(grid);
  }

  /* ----------------------------- utilidades ------------------------- */

  function fmtBytes(bytes) {
    if (bytes == null || isNaN(bytes)) return '—';
    var units = ['B', 'KB', 'MB', 'GB'];
    var n = Number(bytes);
    var i = 0;
    while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
    return (i === 0 ? n : n.toFixed(1)) + ' ' + units[i];
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch (_) { return iso; }
  }

  function fileUrl(release) {
    return DylanReleaseCatalogue.downloadUrl(release, config);
  }

  function esc(text) {
    var div = document.createElement('div');
    div.textContent = String(text == null ? '' : text);
    return div.innerHTML;
  }

  var chevronSvg = '<svg class="chev" xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
  var copySvg = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>';
  var verifiedSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/></svg>';

  function setStatus(text, kind, showRetry) {
    if (!statusEl) return;
    if (!text) { statusEl.hidden = true; statusEl.innerHTML = ''; return; }
    statusEl.hidden = false;
    statusEl.innerHTML = esc(text) + (showRetry ? ' <button type="button" class="status-retry">Reintentar</button>' : '');
    statusEl.classList.toggle('releases-status--error', kind === 'error');
    var retry = statusEl.querySelector('.status-retry');
    if (retry) retry.addEventListener('click', loadCatalogue);
  }

  function showCopied() {
    var tip = document.querySelector('.copy-tip');
    if (!tip) {
      tip = document.createElement('div');
      tip.className = 'copy-tip';
      tip.setAttribute('role', 'status');
      document.body.appendChild(tip);
    }
    tip.textContent = 'SHA-256 copiado al portapapeles';
    tip.classList.add('show');
    clearTimeout(tip._t);
    tip._t = setTimeout(function () { tip.classList.remove('show'); }, 1800);
  }

  function bindShaCopy(container) {
    container.querySelectorAll('.sha-copy').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var sha = btn.getAttribute('data-sha') || '';
        var done = function () {
          btn.classList.add('is-copied');
          showCopied();
          setTimeout(function () { btn.classList.remove('is-copied'); }, 1600);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(sha).then(done, done); // fallback silencioso
        } else { done(); }
      });
    });
  }

  /* ------------------------------ tarjeta --------------------------- */

  function metaRow(label, valueHtml) {
    return '<div class="release-meta-row"><span class="release-meta-label">' + esc(label) +
      '</span><span class="release-meta-value">' + valueHtml + '</span></div>';
  }

  function releaseCard(channel, release) {
    var url = fileUrl(release);
    var notes = (release.notes || release.changelog || '').trim();
    var isNew = release.retire_reason === 'reemplazada';
    return ''
      + '<div class="release-main">'
      +   '<span class="release-version-badge">' + verifiedSvg + 'Versión principal</span>'
      +   '<h3 class="release-title">' + esc(release.name) + '</h3>'
      +   '<p class="release-version">' + esc(release.version) + '</p>'
      +   '<div class="release-meta">'
      +     metaRow('Publicada', esc(fmtDate(release.published_at)))
      +     metaRow('Arquitectura', esc(release.arch || '—'))
      +     metaRow('Tamaño', esc(fmtBytes(release.file_size)))
      +     metaRow('SHA-256', '<span class="sha-value" title="' + esc(release.sha256 || '') + '">' + esc(release.sha256 || 'no registrado') + '</span>'
                          + (release.sha256 ? '<button type="button" class="sha-copy" data-sha="' + esc(release.sha256) + '" aria-label="Copiar SHA-256 de ' + esc(release.version) + '">' + copySvg + '</button>' : ''))
      +   '</div>'
      +   (notes ? '<p class="release-notes" title="Notas de la versión">' + esc(notes) + '</p>' : '')
      +   '<div class="release-cta-row">'
      +     (url
          ? '<a class="btn btn-primary" href="' + esc(url) + '" download>Descargar ISO</a>'
          : '<p class="release-file-error" role="status">El archivo no está disponible en este entorno.</p>')
      +   '</div>'
      + '</div>';
  }

  function channelIdCard(channel, releases) {
    var model = DylanReleaseCatalogue.splitChannel(releases);
    var history = model.history;
    var main = model.active;

    var tag = '<span class="channel-tag channel-tag--' + esc(channel.id) + '"><span class="dot"></span>' + esc(channel.tag) + '</span>';
    var head = '<div class="channel-head"><span class="channel-name">' + esc(channel.label) + '</span>' + tag + '</div>'
      + '<p class="channel-desc">' + esc(channel.desc) + '</p>';
    var body = '';

    if (main) {
      body += releaseCard(channel, main);
    } else {
      body += '<div class="channel-empty">'
        +  '<span class="channel-empty-icon">'
        +  '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>'
        +  '</span>'
        +  '<span class="channel-empty-title">' + esc(DylanReleaseCatalogue.EMPTY_TITLE) + '</span>'
        +  '<span class="channel-empty-sub">' + esc(DylanReleaseCatalogue.EMPTY_DESCRIPTION) + '</span>'
        +  '</div>';
    }

    var historyHtml = '';
    if (history.length > 0) {
      var items = history.map(function (r) {
        var hUrl = fileUrl(r);
        return '<details class="history-item">'
          + '<summary class="history-item-head">'
          +   '<span class="history-version-name">' + esc(r.version) + '</span>'
          +   '<span>' + esc(fmtDate(r.published_at)) + '</span>'
          +   chevronSvg
          + '</summary>'
          + '<div class="history-item-body">'
          +   '<div class="history-meta-row"><span class="k">Nombre</span><span class="v">' + esc(r.name) + '</span></div>'
          +   '<div class="history-meta-row"><span class="k">Tamaño</span><span class="v">' + esc(fmtBytes(r.file_size)) + '</span></div>'
          +   '<div class="history-meta-row"><span class="k">Arquitectura</span><span class="v">' + esc(r.arch || '—') + '</span></div>'
          +   '<div class="history-meta-row"><span class="k">SHA-256</span><span class="v sha-value" title="' + esc(r.sha256 || '') + '">' + esc(r.sha256 || 'no registrado') + '</span></div>'
          +   (r.changelog ? '<p class="history-notes">' + esc(r.changelog) + '</p>' : '')
          +   (hUrl
             ? '<a class="history-download" href="' + esc(hUrl) + '">Descargar esta ISO</a>'
             : '<span class="history-meta-row" style="color:var(--d-text-4)">Archivo no disponible</span>')
          + '</div>'
          + '</details>';
      }).join('');

      historyHtml = '<details class="history">'
        + '<summary class="history-summary">Historial (' + history.length + ' ' + (history.length === 1 ? 'versión' : 'versiones') + ') ' + chevronSvg + '</summary>'
        + '<div class="history-list">' + items + '</div>'
        + '</details>';
    } else {
      historyHtml = '<div class="history-summary history-summary--empty" aria-label="Historial vacío">Historial (0 versiones)</div>';
    }

    return '<article class="channel-card channel-card--' + esc(channel.id) + (main ? ' is-principal' : '')
      + '">' + head + body
      + '<div class="history-block">' + historyHtml + '</div>'
      + '</article>';
  }

  function renderSkeleton() {
    grid.innerHTML = CHANNELS.map(function () {
      return '<article class="channel-card">'
        + '<div class="channel-head"><div class="release-skeleton" style="width:88px;height:13px;border-radius:6px;background:rgba(255,255,255,0.10)"></div>'
        + '<div class="release-skeleton" style="width:72px;height:24px;border-radius:999px;background:rgba(255,255,255,0.08)"></div></div>'
        + '<div class="release-skeleton" style="margin-top:24px;width:180px;height:25px;border-radius:8px;background:rgba(255,255,255,0.09)"></div>'
        + '<div class="release-skeleton" style="margin-top:10px;width:120px;height:12px;border-radius:6px;background:rgba(255,255,255,0.07)"></div>'
        + '<div class="release-skeleton" style="margin-top:22px;width:100%;height:44px;border-radius:10px;background:rgba(255,255,255,0.06)"></div>'
        + '</article>';
    }).join('');
  }

  function renderCatalogue(releases) {
    grid.innerHTML = CHANNELS.map(function (channel) {
      var rows = releases.filter(function (r) { return r.channel === channel.id; });
      return channelIdCard(channel, rows);
    }).join('');
    bindShaCopy(grid);
  }

  /* --------------------------- carga de datos ----------------------- */

  function fetchConfig() {
    return fetch('/api/public-config', { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; });
  }

  function fetchReleases() {
    var base = config.supabase.url.replace(/\/+$/, '');
    var columns = 'id,channel,version,name,arch,status,file_path,storage_provider,file_size,sha256,description,changelog,published_at,retired_at,retire_reason';
    var qs = '?select=' + columns
      + '&status=in.(' + encodeURIComponent('published,retired') + ')'
      + '&order=published_at.desc.nullslast';
    return fetch(base + '/rest/v1/releases' + qs, {
      headers: {
        apikey: config.supabase.anon_key,
        Authorization: 'Bearer ' + config.supabase.anon_key,
        Accept: 'application/json'
      }
    }).then(function (r) {
      if (!r.ok) throw new Error('Supabase respondió ' + r.status);
      return r.json();
    });
  }

  function loadCatalogue() {
    setStatus('Comprobando el catálogo…', null, false);
    renderSkeleton();

    fetchConfig().then(function (cfg) {
      if (!cfg || cfg.configured !== true || !cfg.supabase) {
        loadFailed = true;
        renderCatalogue([]);
        setStatus('El sistema de versiones aún no está configurado en este entorno.', 'error', false);
        return;
      }

      config = cfg;
      fetchReleases().then(function (releases) {
        loadFailed = false;
        renderCatalogue(Array.isArray(releases) ? releases : []);
        setStatus('', null, false);
        bindShaCopy(grid);
      }).catch(function (err) {
        console.error('[DylanOS] No se pudo cargar el catálogo de descargas:', err);
        renderSkeleton();
        setStatus('No se pudo conectar con el catálogo. Comprueba tu conexión e inténtalo de nuevo.', 'error', true);
      });
    });
  }

  function bootCatalogue() {
    var root = document.getElementById('root');
    var scheduled = false;

    function ensureCatalogue() {
      if (document.getElementById('releases-grid') || scheduled) return;
      scheduled = true;
      requestAnimationFrame(function () {
        scheduled = false;
        if (!document.getElementById('releases-grid') && mountCatalogue()) loadCatalogue();
      });
    }

    ensureCatalogue();
    if (root && typeof MutationObserver !== 'undefined') {
      new MutationObserver(ensureCatalogue).observe(root, { childList: true, subtree: true });
    }
  }

  if (document.readyState === 'complete') bootCatalogue();
  else window.addEventListener('load', bootCatalogue, { once: true });
})();
