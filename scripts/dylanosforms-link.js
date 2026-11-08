(function () {
  'use strict';

  function mountFormsCallToAction() {
    document.querySelectorAll('a[href="#comunidad"]').forEach(function (link) {
      link.href = '/DylanOSforms/';
      link.textContent = 'Formularios';
      link.setAttribute('aria-label', 'Abrir DylanOSforms para crear formularios');
    });

    var section = document.getElementById('comunidad');
    if (!section || section.querySelector('a[href="/DylanOSforms/"]')) return;
    section.innerHTML = '<div class="max-w-7xl mx-auto px-5 sm:px-8"><div class="glass-strong rounded-2xl p-8 sm:p-12 grid lg:grid-cols-[1fr_auto] gap-10 items-center border border-[#FF2B2B]/20"><div><span class="text-xs font-medium uppercase tracking-widest text-[#FF2B2B]">DylanOSforms</span><h2 class="mt-3 text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight">Convierte ideas en formularios.</h2><p class="mt-5 text-zinc-400 text-lg leading-relaxed max-w-2xl">Crea preguntas claras, compártelas con un enlace y recibe respuestas en tu propio espacio de Supabase.</p></div><a href="/DylanOSforms/" class="inline-flex items-center justify-center gap-2 bg-[#FF2B2B] hover:bg-[#ff4444] text-white font-medium px-6 py-3 rounded-full transition-colors glow-red">Crear un formulario <span aria-hidden="true">↗</span></a></div></div>';
  }

  var mountScheduled = false;
  function scheduleMount() {
    if (mountScheduled) return;
    mountScheduled = true;
    window.setTimeout(function () {
      mountScheduled = false;
      mountFormsCallToAction();
    }, 0);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scheduleMount);
  else scheduleMount();
  window.addEventListener('load', scheduleMount);
  new MutationObserver(scheduleMount).observe(document.documentElement, { childList: true, subtree: true });
}());
