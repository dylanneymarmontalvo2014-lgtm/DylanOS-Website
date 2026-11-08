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
    section.innerHTML = '<div class="max-w-7xl mx-auto px-5 sm:px-8"><div class="glass-strong rounded-2xl p-8 sm:p-12 border border-[#FF2B2B]/20"><div class="grid lg:grid-cols-[1fr_auto] gap-10 items-center"><div><span class="text-xs font-medium uppercase tracking-widest text-[#FF2B2B]">DylanOSforms</span><h2 class="mt-3 text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight">Convierte ideas en formularios.</h2><p class="mt-5 text-zinc-400 text-lg leading-relaxed max-w-2xl">Crea preguntas claras, compártelas con un enlace y recibe respuestas en tu propio espacio de Supabase.</p></div><a href="/DylanOSforms/" class="inline-flex items-center justify-center gap-2 bg-[#FF2B2B] hover:bg-[#ff4444] text-white font-medium px-6 py-3 rounded-full transition-colors glow-red">Crear un formulario <span aria-hidden="true">↗</span></a></div><div class="mt-10 pt-6 border-t border-white/10"><div class="flex flex-wrap items-center justify-between gap-3"><span class="text-xs uppercase tracking-widest text-zinc-500">Actividad real del repositorio DylanOS</span><a href="https://github.com/dylanneymarmontalvo2014-lgtm/DylanOS" target="_blank" rel="noreferrer" class="text-xs text-zinc-400 hover:text-white transition-colors">Ver en GitHub ↗</a></div><div class="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3"><div class="rounded-xl border border-white/10 bg-black/20 p-4"><strong data-repo-stat="commits" class="block text-xl font-bold text-white">—</strong><span class="text-xs text-zinc-500">confirmaciones</span></div><div class="rounded-xl border border-white/10 bg-black/20 p-4"><strong data-repo-stat="stars" class="block text-xl font-bold text-white">—</strong><span class="text-xs text-zinc-500">estrellas</span></div><div class="rounded-xl border border-white/10 bg-black/20 p-4"><strong data-repo-stat="contributors" class="block text-xl font-bold text-white">—</strong><span class="text-xs text-zinc-500">colaboradores</span></div><div class="rounded-xl border border-white/10 bg-black/20 p-4"><strong data-repo-stat="releases" class="block text-xl font-bold text-white">—</strong><span class="text-xs text-zinc-500">lanzamientos</span></div></div></div></div></div>';
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
