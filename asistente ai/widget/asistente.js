/* =====================================================================
   ASISTENTE AI DYLANOS — Widget de chat (vanilla JS, sin dependencias)
   Se comunica con el endpoint local POST /api/asistente del servidor.
   ===================================================================== */
(function () {
  'use strict';

  var API_URL = '/api/asistente';
  var MAX_HISTORY = 12; // pares de mensajes enviados como contexto
  var SUGGESTIONS = [
    '¿Qué es DylanOS?',
    '¿En qué está basado DylanOS?',
    '¿Cuál es su repositorio de GitHub?'
  ];
  var WELCOME = '¡Hola! Soy **Asistente Ai DylanOS**. Puedo responder tus preguntas sobre DylanOS: qué es, en qué está basado, sus características y su comunidad. ¿En qué te ayudo?';
  var ERROR_MSG = 'No pude conectar con el asistente en este momento. Inténtalo de nuevo en unos segundos.';

  var ICONS = {
    chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="da-icon-chat" aria-hidden="true"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="da-icon-close" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>',
    logo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2a7 7 0 0 1 7 7c0 2.4-1.2 4.5-3 5.7V17a1 1 0 0 1-1 1h-6a1 1 0 0 1-1-1v-2.3C6.2 13.5 5 11.4 5 9a7 7 0 0 1 7-7z"/><line x1="9" y1="21" x2="15" y2="21"/></svg>'
  };

  var history = []; // {role: 'user'|'assistant', content: string}
  var sending = false;

  /* ------------------------- Construcción del DOM ------------------------- */

  var fab = document.createElement('button');
  fab.className = 'da-fab';
  fab.setAttribute('aria-label', 'Abrir Asistente Ai DylanOS');
  fab.setAttribute('aria-expanded', 'false');
  fab.innerHTML = ICONS.chat + ICONS.close;

  var panel = document.createElement('section');
  panel.className = 'da-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Asistente Ai DylanOS');
  panel.setAttribute('aria-hidden', 'true');

  panel.innerHTML =
    '<div class="da-header">' +
      '<div class="da-avatar">' + ICONS.logo + '</div>' +
      '<div class="da-header-text">' +
        '<h2 class="da-title">Asistente Ai DylanOS</h2>' +
        '<p class="da-subtitle"><span class="da-status-dot"></span>En línea · Pregúntame sobre DylanOS</p>' +
      '</div>' +
      '<button class="da-close" aria-label="Cerrar asistente">' + ICONS.close + '</button>' +
    '</div>' +
    '<div class="da-messages" aria-live="polite"></div>' +
    '<form class="da-form">' +
      '<input class="da-input" type="text" maxlength="1000" placeholder="Escribe tu pregunta sobre DylanOS..." aria-label="Escribe tu pregunta" autocomplete="off">' +
      '<button class="da-send" type="submit" aria-label="Enviar mensaje">' + ICONS.send + '</button>' +
    '</form>';

  document.body.appendChild(fab);
  document.body.appendChild(panel);

  var messagesEl = panel.querySelector('.da-messages');
  var formEl = panel.querySelector('.da-form');
  var inputEl = panel.querySelector('.da-input');
  var sendEl = panel.querySelector('.da-send');
  var closeEl = panel.querySelector('.da-close');

  /* --------------------------- Renderizado seguro ------------------------- */

  function escapeHtml(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Markdown ligero sobre texto ya escapado: **negrita**, listas "- " y URLs.
  function renderMarkdown(text) {
    var html = escapeHtml(text);
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/(https?:\/\/[^\s<]+)/g, function (url) {
      return '<a href="' + url + '" target="_blank" rel="noopener noreferrer">' + url + '</a>';
    });
    var lines = html.split('\n');
    var inList = false;
    for (var i = 0; i < lines.length; i++) {
      var isItem = /^\s*-\s+/.test(lines[i]);
      if (isItem) {
        lines[i] = lines[i].replace(/^\s*-\s+/, '<li>') + '</li>';
        if (!inList) { lines[i] = '<ul>' + lines[i]; inList = true; }
      } else if (inList) {
        lines[i - 1] += '</ul>';
        inList = false;
      }
    }
    if (inList) { lines[lines.length - 1] += '</ul>'; }
    return lines.join('\n');
  }

  function addMessage(role, content) {
    var el = document.createElement('div');
    el.className = 'da-msg da-msg-' + role;
    if (role === 'assistant') {
      el.innerHTML = renderMarkdown(content);
    } else {
      el.textContent = content;
    }
    messagesEl.appendChild(el);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return el;
  }

  function showTyping() {
    var el = document.createElement('div');
    el.className = 'da-msg da-msg-assistant da-typing';
    el.innerHTML = '<span></span><span></span><span></span>';
    messagesEl.appendChild(el);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return el;
  }

  function showSuggestions() {
    var wrap = document.createElement('div');
    wrap.className = 'da-suggestions';
    var label = document.createElement('p');
    label.className = 'da-suggestions-label';
    label.textContent = 'Preguntas recomendadas';
    wrap.appendChild(label);
    SUGGESTIONS.forEach(function (question) {
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'da-chip';
      chip.textContent = question;
      chip.addEventListener('click', function () {
        wrap.remove();
        sendMessage(question);
      });
      wrap.appendChild(chip);
    });
    messagesEl.appendChild(wrap);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  /* ------------------------------- Lógica -------------------------------- */

  function setSending(state) {
    sending = state;
    inputEl.disabled = state;
    sendEl.disabled = state;
  }

  function sendMessage(text) {
    var message = text.trim();
    if (!message || sending) return;

    addMessage('user', message);
    history.push({ role: 'user', content: message });
    inputEl.value = '';
    setSending(true);
    var typingEl = showTyping();

    fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: history.slice(-MAX_HISTORY) })
    })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) {
          return { ok: res.ok, data: data };
        });
      })
      .then(function (result) {
        typingEl.remove();
        var reply = result.ok && result.data.reply
          ? result.data.reply
          : (result.data && result.data.error) || ERROR_MSG;
        addMessage('assistant', reply);
        if (result.ok) {
          history.push({ role: 'assistant', content: reply });
        }
      })
      .catch(function () {
        typingEl.remove();
        addMessage('assistant', ERROR_MSG);
      })
      .then(function () {
        setSending(false);
        inputEl.focus();
      });
  }

  function openPanel() {
    panel.classList.add('da-visible');
    panel.setAttribute('aria-hidden', 'false');
    fab.classList.add('da-open');
    fab.setAttribute('aria-expanded', 'true');
    if (!history.length) {
      addMessage('assistant', WELCOME);
      showSuggestions();
    }
    inputEl.focus();
  }

  function closePanel() {
    panel.classList.remove('da-visible');
    panel.setAttribute('aria-hidden', 'true');
    fab.classList.remove('da-open');
    fab.setAttribute('aria-expanded', 'false');
    fab.focus();
  }

  fab.addEventListener('click', function () {
    if (panel.classList.contains('da-visible')) { closePanel(); } else { openPanel(); }
  });
  closeEl.addEventListener('click', closePanel);
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && panel.classList.contains('da-visible')) { closePanel(); }
  });
  formEl.addEventListener('submit', function (event) {
    event.preventDefault();
    sendMessage(inputEl.value);
  });
})();
