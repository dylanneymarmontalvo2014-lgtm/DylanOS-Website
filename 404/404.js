/* ============================================================
   DylanOS — 404.js
   1. Animación de tecleo en la terminal
   2. Menú móvil de la navbar
   ============================================================ */

/* ---------- Terminal con tecleo ---------- */

const terminalBody = document.getElementById('terminal-body');

const LINES = [
  { html: '<span class="t-prompt">$</span> <span class="t-path">dylanos --locate /pagina-no-encontrada</span>' },
  { html: '<span class="t-muted">Buscando en /boot, /usr, /var...</span>', delay: 550 },
  { html: '<span class="t-error">error 404:</span> la ruta solicitada no existe en este sistema', delay: 700 },
  { html: '<span class="t-ok">sugerencia:</span> ejecuta <span class="t-path">cd /inicio</span> para volver a casa', delay: 450 },
];

function typeText(el, text, speed = 22) {
  return new Promise((resolve) => {
    let i = 0;
    const timer = setInterval(() => {
      el.textContent = text.slice(0, ++i);
      if (i >= text.length) {
        clearInterval(timer);
        resolve();
      }
    }, speed);
  });
}

async function runTerminal() {
  if (!terminalBody) return;

  for (const line of LINES) {
    const p = document.createElement('p');
    p.style.margin = '0';
    terminalBody.appendChild(p);
    if (line.delay) await new Promise((r) => setTimeout(r, line.delay));
    await typeText(p, line.html.replace(/<[^>]+>/g, ''), 18);
    // Sustituye el texto plano por la versión con HTML coloreado
    p.innerHTML = line.html;
  }

  // Cursor parpadeante final
  const cursor = document.createElement('p');
  cursor.style.margin = '0';
  cursor.innerHTML = '<span class="t-prompt">$</span> <span class="e404-cursor"></span>';
  terminalBody.appendChild(cursor);
}

if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  // Sin animación: muestra todo directamente
  if (terminalBody) {
    terminalBody.innerHTML = LINES.map((l) => `<p style="margin:0">${l.html}</p>`).join('') +
      '<p style="margin:0"><span class="t-prompt">$</span> <span class="e404-cursor" style="animation:none;opacity:.6"></span></p>';
  }
} else {
  runTerminal();
}

/* ---------- Menú móvil ---------- */

const menuToggle = document.getElementById('menu-toggle');
const mobileMenu = document.getElementById('mobile-menu');

if (menuToggle && mobileMenu) {
  menuToggle.addEventListener('click', () => {
    const isOpen = !mobileMenu.classList.contains('hidden');
    mobileMenu.classList.toggle('hidden', isOpen);
    menuToggle.setAttribute('aria-expanded', String(!isOpen));
  });

  // Cierra el menú al navegar a un enlace
  mobileMenu.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      mobileMenu.classList.add('hidden');
      menuToggle.setAttribute('aria-expanded', 'false');
    });
  });
}
