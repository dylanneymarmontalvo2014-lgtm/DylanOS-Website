(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var state = { client: null, session: null, forms: [], active: null, publicForm: null, authMode: 'sign-in' };

  function esc(value) {
    var node = document.createElement('div');
    node.textContent = value == null ? '' : String(value);
    return node.innerHTML;
  }

  function setMessage(id, text, kind) {
    var element = $(id);
    element.textContent = text || '';
    element.className = 'form-message' + (kind ? ' ' + kind : '');
  }

  function slugify(value) {
    return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70) || 'mi-formulario';
  }

  function showOnly(id) {
    ['config-error', 'auth-view', 'builder-view', 'public-view'].forEach(function (name) { $(name).hidden = name !== id; });
  }

  function apiRequest(path, options) {
    options = options || {};
    return (state.client ? state.client.auth.getSession() : Promise.resolve({ data: {} })).then(function (result) {
      var session = result.data && result.data.session;
      var headers = Object.assign({ 'Content-Type': 'application/json' }, options.headers || {});
      if (session && session.access_token) headers.Authorization = 'Bearer ' + session.access_token;
      return fetch(path, Object.assign({}, options, { headers: headers })).then(function (response) {
        return response.json().catch(function () { return {}; }).then(function (data) {
          if (!response.ok) throw new Error(data.error || 'La operación no pudo completarse.');
          return data;
        });
      });
    });
  }

  function setAuthMode(mode) {
    state.authMode = mode;
    $('auth-kicker').textContent = mode === 'sign-up' ? 'Primer paso' : 'Tu espacio';
    $('auth-title').textContent = mode === 'sign-up' ? 'Crea tu espacio' : 'Entra a DylanOSforms';
    $('auth-copy').textContent = mode === 'sign-up' ? 'Regístrate con tu correo para empezar a crear.' : 'Usa tu correo para crear y administrar formularios.';
    $('auth-submit').textContent = mode === 'sign-up' ? 'Crear cuenta' : 'Iniciar sesión';
    $('auth-toggle').textContent = mode === 'sign-up' ? '¿Ya tienes cuenta? Inicia sesión' : '¿Todavía no tienes cuenta? Regístrate';
  }

  function formatDate(value) {
    if (!value) return '';
    return new Date(value).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
  }

  function blankForm() {
    return { id: null, title: 'Nuevo formulario', description: 'Cuéntales para qué sirve este formulario.', slug: 'nuevo-formulario', status: 'draft', fields: [] };
  }

  function renderFormsList() {
    var list = $('forms-list');
    if (!state.forms.length) {
      list.innerHTML = '<div class="form-list-empty">Todavía no tienes formularios.</div>';
      return;
    }
    list.innerHTML = state.forms.map(function (form) {
      return '<button class="form-list-item' + (state.active && state.active.id === form.id ? ' active' : '') + '" type="button" data-form-id="' + esc(form.id) + '"><strong>' + esc(form.title) + '</strong><small>' + (form.status === 'published' ? 'Publicado' : 'Borrador') + ' · ' + esc(formatDate(form.updated_at)) + '</small></button>';
    }).join('');
    list.querySelectorAll('[data-form-id]').forEach(function (button) {
      button.addEventListener('click', function () { selectForm(button.getAttribute('data-form-id')); });
    });
  }

  function updateEditorVisibility() {
    var empty = !state.active;
    $('builder-empty').hidden = !empty;
    $('builder-editor').hidden = empty;
    if (empty) return;
    $('form-title').value = state.active.title || '';
    $('form-description').value = state.active.description || '';
    $('form-slug').value = state.active.slug || '';
    $('editor-status').textContent = state.active.status === 'published' ? 'Publicado' : 'Borrador';
    $('editor-status').className = 'status-pill' + (state.active.status === 'published' ? ' published' : '');
    $('share-box').hidden = state.active.status !== 'published';
    if (state.active.status === 'published') $('share-url').value = publicUrl(state.active.slug);
    renderFields();
    renderPreview();
  }

  function publicUrl(slug) { return location.origin + '/DylanOSforms/?slug=' + encodeURIComponent(slug); }

  function renderFields() {
    var list = $('fields-list');
    var fields = state.active ? state.active.fields : [];
    if (!fields.length) {
      list.innerHTML = '<div class="no-fields">Aún no hay preguntas. Añade un campo para empezar.</div>';
      return;
    }
    list.innerHTML = fields.map(function (field, index) {
      var options = field.type === 'select' ? '<label class="wide field-options">Opciones separadas por coma<input data-field="options" data-index="' + index + '" value="' + esc((field.options || []).join(', ')) + '" placeholder="Beta, Estable"></label>' : '';
      return '<article class="field-card"><div class="field-card-head"><span class="field-index">Pregunta ' + String(index + 1).padStart(2, '0') + '</span><div class="field-actions"><label><input type="checkbox" data-field="required" data-index="' + index + '"' + (field.required ? ' checked' : '') + '> Obligatorio</label><button type="button" class="remove-field" data-remove-index="' + index + '">Quitar</button></div></div><div class="field-card-grid"><label>Tipo<select data-field="type" data-index="' + index + '"><option value="text"' + (field.type === 'text' ? ' selected' : '') + '>Texto corto</option><option value="textarea"' + (field.type === 'textarea' ? ' selected' : '') + '>Texto largo</option><option value="email"' + (field.type === 'email' ? ' selected' : '') + '>Correo</option><option value="number"' + (field.type === 'number' ? ' selected' : '') + '>Número</option><option value="select"' + (field.type === 'select' ? ' selected' : '') + '>Selector</option><option value="checkbox"' + (field.type === 'checkbox' ? ' selected' : '') + '>Casilla</option></select></label><label>Etiqueta<input data-field="label" data-index="' + index + '" value="' + esc(field.label) + '" placeholder="¿Qué quieres preguntar?"></label><label class="wide">Ayuda (opcional)<input data-field="description" data-index="' + index + '" value="' + esc(field.description || '') + '" placeholder="Una pista para responder mejor"></label>' + options + '</div></article>';
    }).join('');
    list.querySelectorAll('[data-field]').forEach(function (input) {
      input.addEventListener('input', updateField);
      input.addEventListener('change', updateField);
    });
    list.querySelectorAll('[data-remove-index]').forEach(function (button) {
      button.addEventListener('click', function () { state.active.fields.splice(Number(button.getAttribute('data-remove-index')), 1); renderFields(); renderPreview(); });
    });
  }

  function updateField(event) {
    var input = event.currentTarget;
    var field = state.active.fields[Number(input.getAttribute('data-index'))];
    if (!field) return;
    var property = input.getAttribute('data-field');
    if (property === 'required') field.required = input.checked;
    else if (property === 'options') field.options = input.value.split(',').map(function (item) { return item.trim(); }).filter(Boolean);
    else field[property] = input.value;
    renderPreview();
  }

  function fieldPreview(field) {
    var control = field.type === 'textarea' ? '<textarea rows="3" placeholder="Tu respuesta" disabled></textarea>' : field.type === 'select' ? '<select disabled><option>Elige una opción</option>' + (field.options || []).map(function (option) { return '<option>' + esc(option) + '</option>'; }).join('') + '</select>' : field.type === 'checkbox' ? '<label class="preview-check"><input type="checkbox" disabled>' + esc(field.label) + '</label>' : '<input type="' + (field.type === 'email' ? 'email' : field.type === 'number' ? 'number' : 'text') + '" placeholder="Tu respuesta" disabled>';
    return '<div class="preview-field' + (field.type === 'checkbox' ? ' preview-check' : '') + '"><span>' + (field.type === 'checkbox' ? '' : esc(field.label) + (field.required ? ' *' : '')) + '</span>' + control + '</div>';
  }

  function renderPreview() {
    if (!state.active) return;
    $('form-preview').innerHTML = '<span class="eyebrow">DylanOSforms</span><h2 class="preview-title">' + esc(state.active.title || 'Tu formulario') + '</h2><p class="preview-description">' + esc(state.active.description || 'Añade una descripción para orientar a tus visitantes.') + '</p>' + (state.active.fields.length ? state.active.fields.map(fieldPreview).join('') : '<div class="no-fields">Tu vista previa aparecerá aquí.</div>');
  }

  function selectForm(id) {
    return apiRequest('/api/forms?id=' + encodeURIComponent(id)).then(function (data) { state.active = data.form; updateEditorVisibility(); renderFormsList(); }).catch(function (error) { setMessage('auth-message', error.message, 'error'); });
  }

  function loadBuilder() {
    return apiRequest('/api/forms?mine=1').then(function (data) {
      state.forms = data.forms || [];
      renderFormsList();
      if (state.forms[0]) return selectForm(state.forms[0].id);
      updateEditorVisibility();
    });
  }

  function enterBuilder(session) {
    state.session = session;
    $('sign-out').hidden = false;
    $('session-email').textContent = session.user.email || '';
    showOnly('builder-view');
    loadBuilder().catch(function (error) { setMessage('auth-message', error.message, 'error'); });
  }

  function newForm() {
    state.active = blankForm();
    updateEditorVisibility();
    renderFormsList();
    $('form-title').focus();
  }

  function saveForm() {
    if (!state.active) return Promise.resolve();
    var payload = { title: $('form-title').value.trim(), description: $('form-description').value.trim(), slug: $('form-slug').value.trim() || slugify($('form-title').value), fields: state.active.fields };
    var request = state.active.id ? apiRequest('/api/forms/' + state.active.id, { method: 'PATCH', body: JSON.stringify(payload) }) : apiRequest('/api/forms', { method: 'POST', body: JSON.stringify(payload) });
    $('save-form').disabled = true;
    return request.then(function (data) { state.active = data.form; return apiRequest('/api/forms?mine=1'); }).then(function (data) { state.forms = data.forms || []; updateEditorVisibility(); renderFormsList(); setMessage('auth-message', 'Borrador guardado.', 'success'); }).catch(function (error) { window.alert(error.message); }).finally(function () { $('save-form').disabled = false; });
  }

  function publishForm() {
    return saveForm().then(function () {
      if (!state.active || !state.active.id) return;
      return apiRequest('/api/forms/' + state.active.id + '/publish', { method: 'POST' }).then(function (data) { state.active = data.form; updateEditorVisibility(); renderFormsList(); $('copy-message').textContent = 'Formulario publicado.'; });
    });
  }

  function deleteForm() {
    if (!state.active || !state.active.id || !window.confirm('¿Eliminar este formulario y sus respuestas?')) return;
    return apiRequest('/api/forms/' + state.active.id, { method: 'DELETE' }).then(function () { state.forms = state.forms.filter(function (form) { return form.id !== state.active.id; }); state.active = state.forms[0] || null; renderFormsList(); return state.active ? selectForm(state.active.id) : updateEditorVisibility(); }).catch(function (error) { window.alert(error.message); });
  }

  function renderPublic(form) {
    state.publicForm = form;
    showOnly('public-view');
    $('public-form-wrap').innerHTML = '<article class="public-card"><span class="eyebrow">DylanOSforms</span><h1>' + esc(form.title) + '</h1><p>' + esc(form.description || 'Responde estas preguntas para compartir tu opinión.') + '</p><form id="public-form"><div class="public-fields">' + form.fields.map(function (field) {
      var control = field.type === 'textarea' ? '<textarea name="' + esc(field.id) + '" rows="4"' + (field.required ? ' required' : '') + '></textarea>' : field.type === 'select' ? '<select name="' + esc(field.id) + '"' + (field.required ? ' required' : '') + '><option value="">Elige una opción</option>' + field.options.map(function (option) { return '<option value="' + esc(option) + '">' + esc(option) + '</option>'; }).join('') + '</select>' : field.type === 'checkbox' ? '<span class="check-label"><input type="checkbox" name="' + esc(field.id) + '"' + (field.required ? ' required' : '') + '><span>Confirmo esta respuesta</span></span>' : '<input name="' + esc(field.id) + '" type="' + (field.type === 'email' ? 'email' : field.type === 'number' ? 'number' : 'text') + '"' + (field.required ? ' required' : '') + '>'; return '<label>' + esc(field.label) + (field.required ? ' *' : '') + (field.description ? '<small>' + esc(field.description) + '</small>' : '') + control + '</label>'; }).join('') + '<label>Tu correo (opcional)<small>Solo si quieres que el creador pueda contactarte.</small><input name="_email" type="email"></label></div><p id="public-message" class="form-message" role="status"></p><button class="button button-primary public-submit" type="submit">Enviar respuestas</button></form></article>';
    $('public-form').addEventListener('submit', submitPublicForm);
  }

  function submitPublicForm(event) {
    event.preventDefault();
    var form = event.currentTarget;
    var answers = {};
    state.publicForm.fields.forEach(function (field) {
      var input = form.elements[field.id];
      answers[field.id] = field.type === 'checkbox' ? input.checked : input.value;
    });
    var submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    apiRequest('/api/forms/' + state.publicForm.id + '/submissions', { method: 'POST', body: JSON.stringify({ answers: answers, email: form.elements._email.value }) }).then(function () {
      form.innerHTML = '<div class="public-success"><strong>Respuesta enviada.</strong><br>Gracias por compartirla con DylanOS.</div>';
    }).catch(function (error) { setMessage('public-message', error.message, 'error'); submit.disabled = false; });
  }

  function bindEvents() {
    $('auth-toggle').addEventListener('click', function () { setAuthMode(state.authMode === 'sign-in' ? 'sign-up' : 'sign-in'); });
    $('auth-form').addEventListener('submit', function (event) {
      event.preventDefault();
      var email = $('auth-email').value.trim();
      var password = $('auth-password').value;
      var operation = state.authMode === 'sign-up' ? state.client.auth.signUp({ email: email, password: password }) : state.client.auth.signInWithPassword({ email: email, password: password });
      $('auth-submit').disabled = true;
      operation.then(function (result) { if (result.error) throw result.error; if (state.authMode === 'sign-up' && !result.data.session) setMessage('auth-message', 'Revisa tu correo para confirmar la cuenta.', 'success'); else enterBuilder(result.data.session); }).catch(function (error) { setMessage('auth-message', error.message, 'error'); }).finally(function () { $('auth-submit').disabled = false; });
    });
    $('sign-out').addEventListener('click', function () { state.client.auth.signOut().then(function () { location.reload(); }); });
    $('new-form').addEventListener('click', newForm);
    $('empty-new-form').addEventListener('click', newForm);
    $('add-field').addEventListener('click', function () { if (!state.active) return; state.active.fields.push({ type: $('new-field-type').value, label: 'Nueva pregunta', description: '', required: false, options: $('new-field-type').value === 'select' ? ['Opción 1', 'Opción 2'] : [] }); renderFields(); renderPreview(); });
    $('form-title').addEventListener('input', function () { if (state.active && (!state.active.id || $('form-slug').dataset.edited !== 'true')) $('form-slug').value = slugify(this.value); state.active.title = this.value; renderPreview(); });
    $('form-description').addEventListener('input', function () { state.active.description = this.value; renderPreview(); });
    $('form-slug').addEventListener('input', function () { this.dataset.edited = 'true'; state.active.slug = this.value; });
    $('save-form').addEventListener('click', saveForm);
    $('publish-form').addEventListener('click', publishForm);
    $('delete-form').addEventListener('click', deleteForm);
    $('copy-link').addEventListener('click', function () { navigator.clipboard.writeText($('share-url').value).then(function () { $('copy-message').textContent = 'Enlace copiado.'; }); });
  }

  function boot() {
    bindEvents();
    var slug = new URLSearchParams(location.search).get('slug');
    fetch('/api/public-config').then(function (response) { return response.json(); }).then(function (config) {
      if (!config.supabase || !config.supabase.url || !config.supabase.anon_key) { showOnly('config-error'); return; }
      state.client = window.supabase.createClient(config.supabase.url, config.supabase.anon_key, { auth: { persistSession: true, autoRefreshToken: true } });
      if (slug) return apiRequest('/api/forms?slug=' + encodeURIComponent(slug)).then(function (data) { renderPublic(data.form); }).catch(function (error) { showOnly('public-view'); $('public-form-wrap').innerHTML = '<section class="state-panel"><span class="state-kicker">DylanOSforms</span><h1>Este formulario no está disponible.</h1><p>' + esc(error.message) + '</p></section>'; });
      return state.client.auth.getSession().then(function (result) { if (result.data.session) enterBuilder(result.data.session); else { showOnly('auth-view'); setAuthMode('sign-in'); } });
    }).catch(function (error) { showOnly('config-error'); $('config-error').querySelector('p').textContent = error.message; });
  }

  boot();
}());
