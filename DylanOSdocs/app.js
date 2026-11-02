(function runDylanOSdocs() {
  'use strict';

  const core = window.DylanOSWikiCore;
  const version = Date.now().toString(36);
  const WIKI_WEB_BASE = 'https://github.com/dylanneymarmontalvo2014-lgtm/DylanOS/wiki';
  const ALLOWED_TAGS = new Set([
    'A', 'ASIDE', 'BLOCKQUOTE', 'BR', 'CODE', 'DIV', 'EM', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
    'HR', 'IMG', 'LI', 'OL', 'P', 'PRE', 'SMALL', 'SPAN', 'STRONG', 'SUB', 'SUP', 'TABLE', 'TBODY',
    'TD', 'TH', 'THEAD', 'TR', 'UL'
  ]);
  const DROP_TAGS = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'FORM', 'INPUT', 'BUTTON', 'META', 'LINK']);
  const ALLOWED_ATTRIBUTES = new Set(['alt', 'align', 'class', 'colspan', 'height', 'href', 'id', 'loading', 'rel', 'rowspan', 'src', 'target', 'title', 'width']);

  const article = document.getElementById('wiki-article');
  const chapterNav = document.getElementById('chapter-nav');
  const toc = document.getElementById('table-of-contents');
  const searchInput = document.getElementById('docs-search');
  const searchResults = document.getElementById('search-results');
  const sourceLink = document.getElementById('source-link');
  const syncStatus = document.getElementById('sync-status');
  const breadcrumbs = document.getElementById('breadcrumbs');
  const announcer = document.getElementById('docs-announcer');
  const sidebar = document.getElementById('docs-sidebar');
  const navToggle = document.getElementById('nav-toggle');
  const navBackdrop = document.getElementById('nav-backdrop');

  const state = {
    sections: [],
    pages: [],
    cache: new Map(),
    activeSlug: 'Home',
    searchStarted: false
  };

  function slugFromHash() {
    const raw = location.hash.startsWith('#/') ? location.hash.slice(2) : 'Home';
    return core.normalizePageSlug(raw);
  }

  async function fetchWikiPage(slug) {
    const normalized = core.normalizePageSlug(slug);
    const response = await fetch(core.githubWikiPageUrl(normalized, version), { cache: 'no-store' });
    if (!response.ok) throw new Error(`GitHub Wiki respondió ${response.status}`);
    const markdown = await response.text();
    state.cache.set(normalized, markdown);
    return markdown;
  }

  function safeExternalUrl(value) {
    try {
      const parsed = new URL(value, location.href);
      return parsed.protocol === 'https:' || parsed.origin === location.origin ? parsed : null;
    } catch {
      return null;
    }
  }

  function sanitizeFragment(html) {
    const parsed = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
    const elements = Array.from(parsed.body.querySelectorAll('*'));

    elements.forEach(element => {
      if (DROP_TAGS.has(element.tagName)) {
        element.remove();
        return;
      }
      if (!ALLOWED_TAGS.has(element.tagName)) {
        element.replaceWith(...element.childNodes);
        return;
      }

      Array.from(element.attributes).forEach(attribute => {
        const name = attribute.name.toLowerCase();
        if (name.startsWith('on') || name === 'style' || !ALLOWED_ATTRIBUTES.has(name)) {
          element.removeAttribute(attribute.name);
        }
      });

      if (element.hasAttribute('class')) {
        const safeClasses = element.className.split(/\s+/).filter(name => /^docs-[a-z0-9_-]+$/i.test(name));
        if (safeClasses.length) element.className = safeClasses.join(' ');
        else element.removeAttribute('class');
      }

      if (element.tagName === 'A') {
        const href = element.getAttribute('href') || '';
        if (/^https?:\/\//i.test(href)) {
          const safeUrl = safeExternalUrl(href);
          if (!safeUrl) element.removeAttribute('href');
          else {
            element.setAttribute('href', safeUrl.href);
            element.setAttribute('target', '_blank');
            element.setAttribute('rel', 'noopener noreferrer');
          }
        } else if (href.startsWith('#/')) {
          element.setAttribute('href', core.pageHash(href.slice(2)));
        } else if (href.startsWith('#')) {
          element.setAttribute('href', href);
        } else if (href) {
          element.setAttribute('href', core.pageHash(href));
        } else {
          element.removeAttribute('href');
        }
      }

      if (element.tagName === 'IMG') {
        const src = element.getAttribute('src') || '';
        if (!/^https:\/\//i.test(src)) element.remove();
        else {
          element.setAttribute('loading', 'lazy');
          element.removeAttribute('srcset');
        }
      }

      if (/^H[1-6]$/.test(element.tagName) && !element.id) {
        element.id = element.textContent
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '') || 'seccion';
      }
    });

    const fragment = document.createDocumentFragment();
    while (parsed.body.firstChild) fragment.append(parsed.body.firstChild);
    return fragment;
  }

  function currentPageTitle(slug) {
    const page = state.pages.find(item => item.slug === slug);
    return page ? page.title : slug.replaceAll('-', ' ');
  }

  function updateBreadcrumbs(title) {
    const home = document.createElement('a');
    home.href = '#/Home';
    home.textContent = 'DylanOSdocs';
    const separator = document.createElement('span');
    separator.textContent = '/';
    const current = document.createElement('span');
    current.textContent = title;
    breadcrumbs.replaceChildren(home, separator, current);
  }

  function renderNavigation() {
    chapterNav.replaceChildren();
    state.sections.forEach(section => {
      const group = document.createElement('section');
      group.className = 'chapter';
      const title = document.createElement('span');
      title.textContent = section.title;
      group.append(title);
      section.pages.forEach(page => {
        const link = document.createElement('a');
        link.href = core.pageHash(page.slug);
        link.dataset.slug = page.slug;
        link.textContent = page.title;
        group.append(link);
      });
      chapterNav.append(group);
    });
  }

  function updateActiveNavigation(slug) {
    chapterNav.querySelectorAll('a').forEach(link => {
      const active = link.dataset.slug === slug;
      link.classList.toggle('is-active', active);
      if (active) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
  }

  function buildTableOfContents() {
    toc.replaceChildren();
    const headings = Array.from(article.querySelectorAll('h2[id], h3[id]'));
    if (!headings.length) {
      const empty = document.createElement('p');
      empty.textContent = 'Esta página no tiene secciones.';
      toc.append(empty);
      return;
    }
    headings.forEach(heading => {
      const link = document.createElement('a');
      link.href = `#${heading.id}`;
      link.dataset.level = heading.tagName.slice(1);
      link.textContent = heading.textContent;
      toc.append(link);
    });
  }

  function wrapWideTables() {
    article.querySelectorAll('table').forEach(table => {
      if (table.parentElement && table.parentElement.classList.contains('docs-table-wrap')) return;
      const wrapper = document.createElement('div');
      wrapper.className = 'docs-table-wrap';
      table.before(wrapper);
      wrapper.append(table);
    });
  }

  function renderLoading() {
    article.setAttribute('aria-busy', 'true');
    article.innerHTML = '<div class="article-skeleton" aria-label="Cargando documentación"><i class="article-skeleton__hero"></i><i></i><i></i><i></i><i></i></div>';
    toc.innerHTML = '<p>Cargando contenido…</p>';
  }

  function renderError(error) {
    article.setAttribute('aria-busy', 'false');
    article.innerHTML = `
      <div class="docs-error">
        <span class="docs-error__mark" aria-hidden="true">!</span>
        <h1>No pudimos cargar esta página</h1>
        <p>GitHub Wiki no respondió o la página todavía no existe.</p>
        <div class="docs-error__actions">
          <button type="button" id="retry-page">Reintentar</button>
          <a href="${WIKI_WEB_BASE}" target="_blank" rel="noopener noreferrer">Abrir GitHub Wiki</a>
        </div>
      </div>`;
    article.querySelector('#retry-page').addEventListener('click', () => loadPage(state.activeSlug));
    syncStatus.textContent = 'Sin conexión con GitHub Wiki';
    announcer.textContent = `No se pudo cargar la página. ${error.message}`;
  }

  async function loadPage(slug) {
    const normalized = core.normalizePageSlug(slug);
    state.activeSlug = normalized;
    renderLoading();
    closeMobileNav();
    updateActiveNavigation(normalized);
    const title = currentPageTitle(normalized);
    updateBreadcrumbs(title);
    sourceLink.href = `${WIKI_WEB_BASE}/${encodeURIComponent(normalized)}`;

    try {
      const markdown = state.cache.get(normalized) || await fetchWikiPage(normalized);
      const fragment = sanitizeFragment(core.renderMarkdown(markdown));
      article.replaceChildren(fragment);
      wrapWideTables();
      article.setAttribute('aria-busy', 'false');
      buildTableOfContents();
      document.title = `${title} · DylanOSdocs`;
      syncStatus.textContent = 'Contenido sincronizado con GitHub Wiki';
      announcer.textContent = `${title} cargado`;
      window.scrollTo({ top: 0, behavior: 'instant' });
    } catch (error) {
      renderError(error);
    }
  }

  function closeSearch() {
    searchResults.hidden = true;
    searchResults.replaceChildren();
  }

  function searchPages(query) {
    const terms = query.toLocaleLowerCase('es').trim().split(/\s+/).filter(Boolean);
    if (!terms.length) return [];
    return state.pages
      .map(page => {
        const markdown = state.cache.get(page.slug) || '';
        const haystack = `${page.title} ${core.extractSearchText(markdown)}`.toLocaleLowerCase('es');
        const score = terms.reduce((total, term) => total + (page.title.toLocaleLowerCase('es').includes(term) ? 5 : haystack.includes(term) ? 1 : -20), 0);
        return { ...page, score, excerpt: core.extractSearchText(markdown).slice(0, 130) };
      })
      .filter(page => page.score >= 0)
      .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, 'es'))
      .slice(0, 8);
  }

  function renderSearchResults(query) {
    const results = searchPages(query);
    searchResults.replaceChildren();
    if (!results.length) {
      const empty = document.createElement('div');
      empty.className = 'search-empty';
      empty.textContent = state.searchStarted ? 'No encontramos una página con esas palabras.' : 'Escribe para buscar en la documentación.';
      searchResults.append(empty);
    } else {
      results.forEach(result => {
        const link = document.createElement('a');
        link.className = 'search-result';
        link.href = core.pageHash(result.slug);
        link.setAttribute('role', 'option');
        const title = document.createElement('strong');
        title.textContent = result.title;
        const excerpt = document.createElement('span');
        excerpt.textContent = result.excerpt || 'Página de DylanOSdocs';
        link.append(title, excerpt);
        searchResults.append(link);
      });
    }
    searchResults.hidden = false;
  }

  async function buildSearchIndex() {
    if (state.searchStarted) return;
    state.searchStarted = true;
    const pending = state.pages.filter(page => !state.cache.has(page.slug));
    for (let index = 0; index < pending.length; index += 4) {
      const batch = pending.slice(index, index + 4);
      await Promise.allSettled(batch.map(page => fetchWikiPage(page.slug)));
      if (searchInput.value.trim()) renderSearchResults(searchInput.value);
    }
  }

  function openMobileNav() {
    sidebar.classList.add('is-open');
    navBackdrop.hidden = false;
    navToggle.setAttribute('aria-expanded', 'true');
  }

  function closeMobileNav() {
    sidebar.classList.remove('is-open');
    navBackdrop.hidden = true;
    navToggle.setAttribute('aria-expanded', 'false');
  }

  async function bootstrap() {
    try {
      const sidebarMarkdown = await fetchWikiPage('_Sidebar');
      state.sections = core.parseSidebar(sidebarMarkdown);
      state.pages = state.sections.flatMap(section => section.pages);
      renderNavigation();
      await loadPage(slugFromHash());
    } catch (error) {
      chapterNav.innerHTML = '<p class="search-empty">No se pudo cargar el índice.</p>';
      renderError(error);
    }
  }

  window.addEventListener('hashchange', () => {
    if (location.hash.startsWith('#/')) loadPage(slugFromHash());
  });
  searchInput.addEventListener('focus', () => {
    renderSearchResults(searchInput.value);
    buildSearchIndex();
  });
  searchInput.addEventListener('input', () => renderSearchResults(searchInput.value));
  searchInput.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      closeSearch();
      searchInput.blur();
    }
    if (event.key === 'Enter') {
      const first = searchResults.querySelector('a');
      if (first) {
        event.preventDefault();
        first.click();
        closeSearch();
      }
    }
  });
  document.addEventListener('keydown', event => {
    if (event.key === '/' && document.activeElement !== searchInput) {
      event.preventDefault();
      searchInput.focus();
    }
  });
  document.addEventListener('click', event => {
    if (!event.target.closest('.docs-search-wrap')) closeSearch();
  });
  searchResults.addEventListener('click', closeSearch);
  navToggle.addEventListener('click', () => sidebar.classList.contains('is-open') ? closeMobileNav() : openMobileNav());
  navBackdrop.addEventListener('click', closeMobileNav);

  bootstrap();
})();
