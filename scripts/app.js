(() => {
  const OPEN_CLASSES = [
    'absolute',
    'top-16',
    'left-0',
    'right-0',
    'flex',
    'flex-col',
    'glass-strong',
    'border-b',
    'border-white/5',
    'px-5',
    'py-4'
  ];

  function toggleMenu(menu, button) {
    const isClosed = menu.classList.contains('hidden');
    if (isClosed) {
      menu.classList.remove('hidden');
      menu.classList.add(...OPEN_CLASSES);
    } else {
      menu.classList.add('hidden');
      menu.classList.remove(...OPEN_CLASSES);
    }
    button.setAttribute('aria-expanded', String(isClosed));
  }

  function initialiseNavigation(document) {
    const header = document.querySelector('header');
    if (!header) return;

    const button = header.querySelector('button[aria-label="Menú"]');
    const menu = [...header.querySelectorAll('nav > div')]
      .find(candidate => candidate.classList.contains('hidden')
        && candidate.classList.contains('md:flex'));
    if (!button || !menu) return;

    button.setAttribute('aria-expanded', 'false');
    button.addEventListener('click', () => toggleMenu(menu, button));
    menu.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        if (!menu.classList.contains('hidden')) toggleMenu(menu, button);
      });
    });
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { toggleMenu, initialiseNavigation };
  } else if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => initialiseNavigation(document));
  }
})();
