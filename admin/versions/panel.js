/* =====================================================================
   DylanOS — Panel privado de versiones (/admin/versions/)
   ---------------------------------------------------------------------
   Supabase Auth (email/contraseña) + RLS + RPC seguras.
   - No hay permisos hardcodeados: is_release_admin() vive en la base de
     datos y las políticas RLS bloquean la escritura Administración.
   - SHA-256 incremental local + carga externa en SourceForge File Manager.
   - Publicar/retirar/borrar usan las funciones SQL SECURITY DEFINER.
   ===================================================================== */
(function () {
  'use strict';

  /* ------------------------------- refs ------------------------------ */

  function $(id) { return document.getElementById(id); }

  var views = {
    unconfigured: $('view-unconfigured'),
    login: $('view-login'),
    forbidden: $('view-forbidden'),
    panel: $('view-panel')
  };

  var state = {
    supabase: null,
    bucket: 'dylanos-iso',
    r2PublicBase: null,
    sourceforgeProject: null,
    sourceforgeDownloadBase: null,
    sourceforgeFileManagerUrl: null,
    session: null,
    isAdmin: false,
    releases: [],
    upload: null,          // { file, uploadId, hashPromise, sha256 }
    verification: null,    // resultado público vigente para archivo+ruta
    editing: null,         // fila en edición
    pendingPublish: null   // payload esperando confirmación
  };

  /* ----------------------------- utilidades -------------------------- */

  function showView(name) {
    Object.keys(views).forEach(function (k) { views[k].hidden = (k !== name); });
  }

  function busy(on, text) {
    var overlay = $('busy-overlay');
    overlay.hidden = !on;
    if (text) $('busy-text').textContent = text;
  }

  function fmtBytes(b) {
    if (b == null || isNaN(Number(b))) return '—';
    var n = Number(b), u = ['B', 'KB', 'MB', 'GB'], i = 0;
    while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
    return (i === 0 ? n : n.toFixed(1)) + ' ' + u[i];
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }); }
    catch (_) { return iso; }
  }

  function esc(t) {
    var d = document.createElement('div');
    d.textContent = t == null ? '' : String(t);
    return d.innerHTML;
  }

  function alertBox(kind, text) {
    var box = $('admin-alert');
    if (!text) { box.innerHTML = ''; return; }
    box.innerHTML = '<div class="admin-alert admin-alert--' + esc(kind) + '">' + esc(text) + '</div>';
  }

  function downloadUrl(row) {
    if (!row || !row.file_path) return null;
    var path = row.file_path.split('/').map(encodeURIComponent).join('/');
    if (row.storage_provider === 'sourceforge') {
      return state.sourceforgeDownloadBase ? state.sourceforgeDownloadBase + '/' + path + '/download' : null;
    }
    if (row.storage_provider === 'r2') {
      return state.r2PublicBase ? state.r2PublicBase + '/' + path : null;
    }
    return state.supabaseUrl.replace(/\/+$/, '') + '/storage/v1/object/public/'
      + encodeURIComponent(state.bucket) + '/' + path;
  }

  function isoFilenameSafe(name) {
    var raw = String(name || '').split(/[\\/]/).pop();
    var stem = raw.replace(/\.iso$/i, '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^0-9A-Za-z._+-]+/g, '-').replace(/^[.-]+|[.-]+$/g, '').slice(0, 180);
    return (stem || 'DylanOS') + '.iso';
  }

  /* ------------------------------- arranque -------------------------- */

  function loadConfig() {
    return fetch('/api/public-config').then(function (r) { return r.json(); });
  }

  function initSupabase(cfg) {
    state.bucket = cfg.bucket || state.bucket;
    state.r2PublicBase = cfg.r2_public_base || null;
    state.sourceforgeProject = cfg.sourceforge_project || null;
    state.sourceforgeDownloadBase = cfg.sourceforge_download_base || null;
    state.sourceforgeFileManagerUrl = cfg.sourceforge_file_manager_url || null;
    $('sourceforge-file-manager').href = state.sourceforgeFileManagerUrl || '#';
    state.supabaseUrl = cfg.supabase.url;
    state.supabase = supabase.createClient(cfg.supabase.url, cfg.supabase.anon_key, {
      auth: { persistSession: true, autoRefreshToken: true }
    });
  }

  function routeSession() {
    return state.supabase.auth.getSession().then(function (res) {
      state.session = res.data.session || null;
      return decide();
    });
  }

  function decide() {
    if (!state.session) { showView('login'); return Promise.resolve(); }
    return state.supabase.rpc('is_release_admin').then(function (res) {
      state.isAdmin = Boolean(res.data);
      if (state.isAdmin) {
        enterPanel();
        showView('panel');
      } else {
        $('forbidden-email').textContent = state.session.user.email || '';
        showView('forbidden');
      }
    }, function (err) {
      console.error(err);
      showView('login');
      $('login-error').textContent = 'No se pudo verificar tu cuenta: ' + (err.message || err);
    });
  }

  /* ------------------------------- auth ------------------------------ */

  $('login-form').addEventListener('submit', function (event) {
    event.preventDefault();
    $('login-error').textContent = '';
    var email = $('login-email').value.trim();
    var password = $('login-password');
    if (!email || !password.value) {
      $('login-error').textContent = 'Introduce el correo y la contraseña.';
      return;
    }
    var btn = $('login-btn');
    btn.classList.add('is-busy');
    btn.innerHTML = '<span class="spinner"></span> Verificando…';
    state.supabase.auth.signInWithPassword({ email: email, password: password.value }).then(function (res) {
      if (res.error) throw res.error;
      state.session = res.data.session;
      password.value = '';
      return decide();
    }).catch(function (err) {
      $('login-error').textContent = err.message || 'No se pudo iniciar sesión.';
    }).finally(function () {
      btn.classList.remove('is-busy');
      btn.textContent = 'Iniciar sesión';
    });
  });

  function logout() {
    state.supabase.auth.signOut().then(function () {
      state.session = null; state.isAdmin = false;
      showView('login');
    });
  }

  $('logout-btn').addEventListener('click', logout);
  $('forbidden-logout').addEventListener('click', logout);

  /* ------------------------------- panel ----------------------------- */

  function enterPanel() {
    $('panel-user-email').textContent = state.session.user.email || '';
    refreshStats();
    refreshList();
  }

  function refreshStats() {
    state.supabase.rpc('release_panel_stats').then(function (res) {
      if (res.error) { console.error(res.error); return; }
      var s = res.data;
      var chips =
        '<div class="admin-stat"><div class="n">' + s.published + '</div><div class="l">Publicadas (principales)</div></div>'
        + '<div class="admin-stat"><div class="n">' + s.drafts + '</div><div class="l">Borradores</div></div>'
        + '<div class="admin-stat"><div class="n">' + s.retired + '</div><div class="l">En historial</div></div>'
        + '<div class="admin-stat"><div class="n" style="font-size:15px">' + esc(s.last_published_at ? fmtDate(s.last_published_at) : '—') + '</div><div class="l">Última publicación</div></div>';
      var active = s.active || {};
      var channels = ['pre-beta', 'beta', 'stable'].map(function (c) {
        var a = active[c];
        return a
          ? '<a class="admin-stat admin-stat--accent" href="#/" style="text-decoration:none"><div class="n" style="font-size:14px">' + esc(a.version) + '</div><div class="l">Principal · ' + esc(c) + '</div></a>'
          : '<div class="admin-stat"><div class="n" style="font-size:14px">—</div><div class="l">Principal · ' + esc(c) + '</div></div>';
      });
      $('admin-stats').innerHTML = chips + channels.join('');
    });
  }

  function storageApi(payload) {
    return fetch('/api/release-upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + state.session.access_token },
      body: JSON.stringify(payload)
    }).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (data) {
        if (!response.ok) throw new Error(data.error || 'Falló la operación de almacenamiento.');
        return data;
      });
    });
  }

  function refreshList() {
    return state.supabase.from('releases').select('*').order('created_at', { ascending: false }).then(function (res) {
      if (res.error) { alertBox('error', 'No se pudieron cargar las versiones: ' + res.error.message); return; }
      state.releases = res.data || [];
      renderTable();
    });
  }

  function renderTable() {
    var q = ($('search-input').value || '').toLowerCase();
    var fc = $('filter-channel').value;
    var fs = $('filter-status').value;
    var rows = state.releases.filter(function (r) {
      if (fc && r.channel !== fc) return false;
      if (fs && r.status !== fs) return false;
      if (q && !(String(r.version).toLowerCase().includes(q) || String(r.name).toLowerCase().includes(q))) return false;
      return true;
    });

    var tbody = $('releases-tbody');
    tbody.innerHTML = rows.map(function (r) {
      var url = downloadUrl(r);
      var actions =
        (r.status === 'draft'
          ? '<button class="icon-btn icon-btn--accent" data-act="publish" data-id="' + r.id + '">Publicar</button>'
          : r.status === 'published'
            ? '<button class="icon-btn" data-act="retire" data-id="' + r.id + '">Retirar</button>'
            : '')
        + '<button class="icon-btn" data-act="check" data-id="' + r.id + '">Archivo</button>'
        + (url ? '<button class="icon-btn" data-act="copy" data-id="' + r.id + '">Copiar URL</button>' : '')
        + '<button class="icon-btn" data-act="edit" data-id="' + r.id + '">Editar</button>'
        + (r.status !== 'published' ? '<button class="icon-btn icon-btn--danger" data-act="delete" data-id="' + r.id + '">Borrar</button>' : '');

      return '<tr>'
        + '<td class="r-version">' + esc(r.version) + '</td>'
        + '<td class="r-name">' + esc(r.name) + '</td>'
        + '<td><span class="channel-pill">' + esc(r.channel) + '</span></td>'
        + '<td><span class="status-badge status-badge--' + esc(r.status) + '"><span class="dot"></span>' + esc(r.status) + '</span></td>'
        + '<td>' + esc(r.arch) + '</td>'
        + '<td>' + esc(fmtBytes(r.file_size)) + '</td>'
        + '<td>' + esc(fmtDate(r.published_at || r.created_at)) + '</td>'
        + '<td><div class="row-actions">' + actions + '</div></td>'
        + '</tr>';
    }).join('');

    var empty = rows.length === 0;
    $('table-empty').hidden = !empty || state.releases.length > 0;
    if (state.releases.length > 0 && empty) {
      $('table-empty').textContent = 'Ninguna versión coincide con los filtros.';
    }
    tbody.querySelectorAll('button[data-act]').forEach(function (btn) {
      btn.addEventListener('click', function () { rowAction(btn.getAttribute('data-act'), btn.getAttribute('data-id')); });
    });
  }

  ['search-input', 'filter-channel', 'filter-status'].forEach(function (id) {
    $(id).addEventListener('input', renderTable);
  });

  function rowAction(act, id) {
    var row = state.releases.find(function (r) { return r.id === id; });
    if (!row) return;

    if (act === 'publish') {
      openPublishConfirm(row);
    } else if (act === 'retire') {
      confirmDanger('Retirar ' + row.version,
        'La versión dejará de ser la principal del canal "' + row.channel + '" y pasará al historial (su archivo se conserva). ¿Continuar?',
        function () {
          busy(true, 'Retirando versión…');
          state.supabase.rpc('release_retire', { p_release_id: id }).then(function (res) {
            if (res.error) throw res.error;
            alertBox('ok', row.version + ' retirada: pasa al historial del canal.');
            afterMutation();
          }).catch(function (err) { alertBox('error', 'No se pudo retirar: ' + errorText(err)); })
            .finally(function () { busy(false); });
        });
    } else if (act === 'edit') {
      openEdit(row);
    } else if (act === 'delete') {
      confirmDanger('Eliminar ' + row.version + ' definitivamente',
        'Se borrará el registro. La ISO permanecerá en SourceForge para evitar una eliminación remota accidental; puedes retirarla después con la CLI tras comprobar referencias. ¿Continuar?',
        function () {
          busy(true, 'Eliminando…');
          state.supabase.rpc('release_delete', { p_release_id: id }).then(function (res) {
            if (res.error) throw res.error;
            alertBox('ok', row.version + ' eliminada. La ISO se conservó en SourceForge; usa releases:cleanup si deseas retirarla.');
            afterMutation();
          }).catch(function (err) {
            alertBox('error', 'No se pudo eliminar: ' + errorText(err));
          })
            .finally(function () { busy(false); });
        });
    } else if (act === 'check') {
      busy(true, 'Comprobando archivo…');
      checkFile(row).then(function (info) {
        busy(false);
        alertBox(info.ok ? 'ok' : 'error',
          info.ok
            ? 'Archivo OK · ' + row.file_path + ' · ' + fmtBytes(info.size) + ' · ' + (row.sha256 ? 'SHA-256 registrado' : 'sin SHA-256 registrado')
            : 'El archivo no responde (' + (info.status || 'sin conexión') + '): ' + row.file_path);
      });
    } else if (act === 'copy') {
      var url = downloadUrl(row);
      if (url && navigator.clipboard) navigator.clipboard.writeText(url).then(function () {
        alertBox('ok', 'Enlace copiado.');
      });
    }
  }

  function errorText(err) {
    return (err && (err.message || err.details || String(err))) || 'error desconocido';
  }

  function afterMutation() {
    refreshList();
    refreshStats();
  }

  function checkFile(row) {
    if (row.storage_provider === 'sourceforge') {
      return storageApi({ action: 'verify', path: row.file_path, expectedSize: Number(row.file_size) }).catch(function (err) {
        return { ok: false, status: err.message };
      });
    }
    if (row.storage_provider !== 'r2') {
      var url = downloadUrl(row);
      if (!url) return Promise.resolve({ ok: false });
      return fetch(url, { method: 'HEAD' }).then(function (r) {
        return { ok: r.ok, status: r.status, size: Number(r.headers.get('content-length')) };
      }).catch(function () { return { ok: false }; });
    }
    return storageApi({ action: 'head', key: row.file_path }).catch(function (err) {
      return { ok: false, status: err.message };
    });
  }

  /* ------------------------- modales genéricos ----------------------- */

  function openModal(id) { $(id).hidden = false; }
  function closeModals() {
    document.querySelectorAll('.modal-overlay').forEach(function (m) { if (m.id !== 'busy-overlay') m.hidden = true; });
  }
  document.querySelectorAll('[data-close]').forEach(function (btn) {
    btn.addEventListener('click', closeModals);
  });
  document.querySelectorAll('.modal-overlay').forEach(function (ov) {
    ov.addEventListener('click', function (e) { if (e.target === ov && ov.id !== 'busy-overlay') closeModals(); });
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeModals();
  });

  function confirmDanger(title, subHtml, onAccept) {
    $('danger-title').textContent = title;
    $('danger-sub').innerHTML = subHtml;
    var accept = $('danger-accept');
    var clone = accept.cloneNode(true);
    accept.replaceWith(clone);
    clone.addEventListener('click', function () { closeModals(); onAccept(); });
    openModal('confirm-danger');
    clone.focus();
  }

  /* -------------------------- confirmar publicación ------------------ */

  function openPublishConfirm(row) {
    $('confirm-title').textContent = 'Publicar ' + row.version;
    $('confirm-sub').textContent = 'Esta versión pasará a ser la principal del canal "' + row.channel + '".';
    $('confirm-summary').innerHTML =
      '<div class="publish-summary-row"><span class="k">Nombre</span><span class="v">' + esc(row.name) + '</span></div>'
      + '<div class="publish-summary-row"><span class="k">Versión</span><span class="v">' + esc(row.version) + '</span></div>'
      + '<div class="publish-summary-row"><span class="k">Canal</span><span class="v">' + esc(row.channel) + '</span></div>'
      + '<div class="publish-summary-row"><span class="k">Archivo</span><span class="v" style="font-family:ui-monospace,monospace;font-size:12px">' + esc(row.file_path) + '</span></div>'
      + '<div class="publish-summary-row"><span class="k">Tamaño</span><span class="v">' + esc(fmtBytes(row.file_size)) + '</span></div>'
      + '<div class="publish-summary-row"><span class="k">SHA-256</span><span class="v" style="font-family:ui-monospace,monospace;font-size:11.5px">' + esc(row.sha256 || 'no registrado') + '</span></div>';
    var accept = $('confirm-accept');
    var clone = accept.cloneNode(true);
    accept.replaceWith(clone);
    clone.addEventListener('click', function () {
      closeModals();
      busy(true, 'Publicando…');
      state.supabase.rpc('release_publish', { p_release_id: row.id }).then(function (res) {
        if (res.error) throw res.error;
        alertBox('ok', row.version + ' publicada como principal de ' + row.channel + '.');
        afterMutation();
      }).catch(function (err) { alertBox('error', 'No se pudo publicar: ' + errorText(err)); })
        .finally(function () { busy(false); });
    });
    openModal('confirm-publish');
    clone.focus();
  }

  /* ------------------------------- editar ---------------------------- */

  function openEdit(row) {
    state.editing = row;
    $('edit-name').value = row.name;
    $('edit-version').value = row.version;
    $('edit-arch').value = row.arch || 'x86_64';
    $('edit-sha256').value = row.sha256 || '';
    $('edit-description').value = row.description || '';
    $('edit-changelog').value = row.changelog || '';
    openModal('edit-modal');
  }

  $('edit-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var row = state.editing;
    var patch = {
      name: $('edit-name').value.trim(),
      version: $('edit-version').value.trim(),
      arch: $('edit-arch').value,
      sha256: ($('edit-sha256').value.trim() || null),
      description: ($('edit-description').value.trim() || null),
      changelog: ($('edit-changelog').value.trim() || null)
    };
    busy(true, 'Guardando…');
    state.supabase.from('releases').update(patch).eq('id', row.id).then(function (res) {
      if (res.error) throw res.error;
      closeModals();
      alertBox('ok', row.version + ' actualizada.');
      afterMutation();
    }).catch(function (err) {
      $('edit-error').textContent = errorText(err);
    }).finally(function () { busy(false); });
  });

  /* ------------------ alta nueva (SourceForge externo) ---------------- */

  $('new-release-btn').addEventListener('click', openNewRelease);

  function openNewRelease() {
    $('release-form').reset();
    state.upload = null;
    state.verification = null;
    $('rel-file-path').dataset.suggested = 'true';
    $('dropzone-file').hidden = true;
    $('dropzone-warning').hidden = true;
    resetProgressUI();
    setVerificationState('Pendiente de verificación.', '');
    showFormError('');
    $('release-modal-title').textContent = 'Nueva versión';
    openModal('release-modal');
    setTimeout(function () { $('rel-name').focus(); }, 60);
  }

  var dropzone = $('dropzone');
  var fileInput = $('file-input');

  dropzone.addEventListener('click', function () { fileInput.click(); });
  dropzone.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
  });
  ['dragenter', 'dragover'].forEach(function (type) {
    dropzone.addEventListener(type, function (e) { e.preventDefault(); dropzone.classList.add('is-dragover'); });
  });
  ['dragleave', 'drop'].forEach(function (type) {
    dropzone.addEventListener(type, function (e) { e.preventDefault(); dropzone.classList.remove('is-dragover'); });
  });
  dropzone.addEventListener('drop', function (e) {
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]);
  });
  fileInput.addEventListener('change', function () {
    if (fileInput.files && fileInput.files[0]) setFile(fileInput.files[0]);
  });

  function invalidateVerification(message) {
    state.verification = null;
    setVerificationState(message || 'Pendiente de verificación.', '');
  }

  function setVerificationState(message, kind) {
    var element = $('file-verification-state');
    element.textContent = message;
    element.classList.toggle('is-ok', kind === 'ok');
    element.classList.toggle('is-error', kind === 'error');
  }

  function suggestedPath() {
    if (!state.upload || !state.upload.file) return '';
    var version = $('rel-version').value.trim();
    if (!/^[0-9A-Za-z][0-9A-Za-z._+-]{0,63}$/.test(version)) return '';
    return $('rel-channel').value + '/' + version + '/' + state.upload.uploadId + '/' + isoFilenameSafe(state.upload.file.name);
  }

  function updateSuggestedPath() {
    var input = $('rel-file-path');
    if (input.dataset.suggested !== 'true' && input.value) return;
    input.value = suggestedPath();
    input.dataset.suggested = 'true';
    invalidateVerification();
  }

  function setFile(file) {
    var warn = $('dropzone-warning');
    warn.hidden = true;
    warn.textContent = '';
    try { DylanBrowserFile.validateIsoFile(file); }
    catch (error) { state.upload = null; invalidateVerification(); showFormError(error.message); return; }

    state.upload = {
      file: file,
      uploadId: crypto.randomUUID ? crypto.randomUUID() : (Date.now().toString(36) + '-' + Math.random().toString(36).slice(2)),
      sha256: null,
      hashPromise: null
    };
    invalidateVerification('La ISO cambió; vuelve a verificarla después de subirla.');
    $('rel-file-path').dataset.suggested = 'true';
    updateSuggestedPath();
    var row = $('dropzone-file');
    row.hidden = false;
    row.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/></svg> ' + esc(file.name) + ' · ' + fmtBytes(file.size);
    showFormError('');

    showProgressUI();
    progress({ pct: 0, label: 'Calculando SHA-256 local…' });
    state.upload.hashPromise = DylanBrowserFile.hashIsoFile(file, function (ratio) {
      progress({ pct: ratio * 100, label: 'Calculando SHA-256 local…' });
    }).then(function (integrity) {
      if (!state.upload || state.upload.file !== file) return integrity;
      state.upload.sha256 = integrity.sha256;
      var expected = $('rel-sha256').value.trim();
      DylanBrowserFile.verifyExpectedHash(integrity.sha256, expected || null);
      if (!expected) $('rel-sha256').value = integrity.sha256;
      progress({ pct: 100, label: 'SHA-256 calculado' });
      $('upload-hint').textContent = 'Hash local listo. Sube la misma ISO a SourceForge y verifica su ruta.';
      return integrity;
    }).catch(function (error) {
      $('upload-progress').classList.add('is-error');
      $('upload-hint').textContent = errorText(error);
      return null;
    });

    file.slice(0x8000, 0x8000 + 2056).arrayBuffer().then(function (buf) {
      var bytes = new Uint8Array(buf), signature = '';
      for (var i = 1; i < 6 && i < bytes.length; i++) signature += String.fromCharCode(bytes[i]);
      if (signature !== 'CD001') {
        warn.hidden = false;
        warn.textContent = 'No se encontró la firma ISO 9660 CD001. Puedes continuar si es una ISO híbrida o usa otro formato válido.';
      }
    }).catch(function () {});
  }

  $('rel-name').addEventListener('input', function () {
    var version = ($('rel-name').value.match(/\d+\.\d+\.\d+(-[A-Za-z0-9._+-]+)?$/) || [null])[0];
    if (version) { $('rel-version').value = version.toLowerCase(); updateSuggestedPath(); }
  });
  $('rel-version').addEventListener('input', updateSuggestedPath);
  $('rel-channel').addEventListener('change', updateSuggestedPath);
  $('rel-file-path').addEventListener('input', function () {
    this.dataset.suggested = 'false';
    invalidateVerification('La ruta cambió; verifica de nuevo.');
  });

  function showFormError(message) { $('form-error').textContent = message; }
  function showProgressUI() { $('upload-progress').classList.add('is-visible'); $('upload-progress').classList.remove('is-error'); }
  function resetProgressUI() {
    $('upload-progress').classList.remove('is-visible', 'is-error');
    $('upload-bar').style.width = '0%';
    $('upload-percent').textContent = '0%';
  }
  function progress(value) {
    $('upload-label').textContent = value.label || 'Calculando SHA-256 local…';
    $('upload-percent').textContent = Math.max(0, Math.min(100, value.pct || 0)).toFixed(0) + '%';
    $('upload-bar').style.width = (value.pct || 0) + '%';
  }

  $('verify-file-btn').addEventListener('click', function () {
    var file = state.upload && state.upload.file;
    var path = $('rel-file-path').value.trim();
    if (!file) return showFormError('Selecciona primero la ISO local.');
    if (!path) return showFormError('Introduce la ruta relativa publicada en SourceForge.');
    var button = this;
    button.disabled = true;
    setVerificationState('Comprobando el espejo público…', '');
    Promise.resolve(state.upload.hashPromise).then(function () {
      DylanBrowserFile.verifyExpectedHash(state.upload.sha256, $('rel-sha256').value.trim() || null);
      return storageApi({ action: 'verify', path: path, expectedSize: file.size });
    }).then(function (result) {
      state.verification = DylanBrowserFile.createVerification({ file: file, path: path, sha256: state.upload.sha256, result: result });
      setVerificationState('Archivo verificado · ' + fmtBytes(result.size), 'ok');
      showFormError('');
    }).catch(function (error) {
      invalidateVerification('No verificado: ' + errorText(error));
      setVerificationState('No verificado: ' + errorText(error), 'error');
    }).finally(function () { button.disabled = false; });
  });

  function formPayload() {
    var file = state.upload && state.upload.file;
    var name = $('rel-name').value.trim();
    var version = $('rel-version').value.trim();
    var channel = $('rel-channel').value;
    var path = $('rel-file-path').value.trim();
    if (!file) throw new Error('Selecciona el archivo .iso.');
    if (!name) throw new Error('Introduce el nombre de la versión.');
    if (!/^[0-9A-Za-z][0-9A-Za-z._+-]{0,63}$/.test(version)) throw new Error('El número de versión no es válido.');
    var expected = $('rel-sha256').value.trim() || null;
    if (expected && !/^[a-fA-F0-9]{64}$/.test(expected)) throw new Error('El SHA-256 debe tener 64 caracteres hexadecimales.');
    DylanBrowserFile.verifyExpectedHash(state.upload.sha256, expected);
    var metadata = {
      channel: channel, version: version, name: name, arch: $('rel-arch').value,
      description: $('rel-description').value.trim(), changelog: $('rel-changelog').value.trim()
    };
    var row = DylanBrowserFile.buildReleaseRow({ file: file, path: path, verification: state.verification, metadata: metadata });
    return { file: file, path: path, row: row, name: name, version: version, channel: channel };
  }

  $('release-form').addEventListener('submit', function (event) {
    event.preventDefault();
    event.stopPropagation();
    var payload;
    try { payload = formPayload(); }
    catch (error) { return showFormError(error.message); }
    if (event.submitter === $('publish-btn') || document.activeElement === $('publish-btn')) return confirmPublishNew(payload);
    submitRelease(payload, false);
  });

  function confirmPublishNew(payload) {
    closeModals();
    $('confirm-title').textContent = 'Publicar ' + payload.version;
    $('confirm-sub').textContent = 'Esta versión verificada pasará a ser la principal del canal "' + payload.channel + '".';
    $('confirm-summary').innerHTML =
      '<div class="publish-summary-row"><span class="k">Nombre</span><span class="v">' + esc(payload.name) + '</span></div>'
      + '<div class="publish-summary-row"><span class="k">Versión</span><span class="v">' + esc(payload.version) + '</span></div>'
      + '<div class="publish-summary-row"><span class="k">Canal</span><span class="v">' + esc(payload.channel) + '</span></div>'
      + '<div class="publish-summary-row"><span class="k">Ruta SourceForge</span><span class="v">' + esc(payload.path) + '</span></div>'
      + '<div class="publish-summary-row"><span class="k">Tamaño</span><span class="v">' + esc(fmtBytes(payload.file.size)) + '</span></div>';
    var accept = $('confirm-accept');
    var clone = accept.cloneNode(true);
    accept.replaceWith(clone);
    clone.addEventListener('click', function () { closeModals(); openModal('release-modal'); submitRelease(payload, true); });
    openModal('confirm-publish');
    clone.focus();
  }

  function submitRelease(payload, publishNow) {
    var draftButton = $('save-draft-btn'), publishButton = $('publish-btn');
    draftButton.disabled = true; publishButton.disabled = true;
    state.supabase.from('releases').select('id').eq('channel', payload.channel).ilike('version', payload.version).then(function (result) {
      if (result.error) throw result.error;
      if (result.data && result.data.length) throw new Error('Ya existe esa versión en el canal.');
      return createRecord(payload, publishNow);
    }).catch(function (error) {
      showFormError(errorText(error));
    }).finally(function () { draftButton.disabled = false; publishButton.disabled = false; });
  }

  function createRecord(payload, publishNow) {
    var recordCreated = null;
    return state.supabase.from('releases').insert(payload.row).select('id,version,name,channel,file_path,file_size,sha256,status').single().then(function (result) {
      if (result.error) throw result.error;
      recordCreated = result.data;
      if (!publishNow) {
        closeModals(); alertBox('ok', 'Borrador de ' + payload.version + ' guardado.'); afterMutation(); return null;
      }
      return state.supabase.rpc('release_publish', { p_release_id: result.data.id }).then(function (published) {
        if (published.error) throw published.error;
        closeModals(); alertBox('ok', payload.version + ' publicada como principal de ' + payload.channel + '.'); afterMutation();
      });
    }).catch(function (error) {
      if (recordCreated) {
        closeModals();
        alertBox('error', 'El borrador se guardó, pero no pudo publicarse: ' + errorText(error) + '. La principal anterior permanece intacta.');
        afterMutation();
        return null;
      }
      throw new Error('SourceForge conserva la ISO, pero no se pudo crear el registro: ' + errorText(error)
        + '. Reintenta o limpia después la ruta ' + payload.path + ' con releases:cleanup.');
    });
  }

  /* ------------------------------- arranque -------------------------- */

  loadConfig().then(function (cfg) {
    if (!cfg || cfg.catalogue_ready !== true || cfg.external_upload_configured !== true || !cfg.supabase) { showView('unconfigured'); return; }
    initSupabase(cfg);
    routeSession();
  });
})();
