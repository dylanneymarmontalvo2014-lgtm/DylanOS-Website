/* ============================================================
   DylanOS — Nuestro equipo
   Funcionalidades: menú móvil de la navbar y animación de
   aparición de las tarjetas.
   ============================================================ */

(function () {
  "use strict";

  /* ---------- Menú móvil de la navbar ---------- */
  var toggle = document.getElementById("menu-toggle");
  var menu = document.getElementById("mobile-menu");

  if (toggle && menu) {
    toggle.addEventListener("click", function () {
      var isOpen = !menu.classList.contains("hidden");
      menu.classList.toggle("hidden", isOpen);
      toggle.setAttribute("aria-expanded", String(!isOpen));
      toggle.setAttribute("aria-label", isOpen ? "Abrir menú" : "Cerrar menú");
    });

    // Cierra el menú al pulsar un enlace
    menu.addEventListener("click", function (event) {
      if (event.target.closest("a")) {
        menu.classList.add("hidden");
        toggle.setAttribute("aria-expanded", "false");
      }
    });
  }

  /* ---------- Animación de aparición ---------- */
  var revealItems = document.querySelectorAll(".reveal");

  if ("IntersectionObserver" in window && revealItems.length > 0) {
    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15 }
    );

    revealItems.forEach(function (item) {
      observer.observe(item);
    });
  } else {
    // Fallback: muestra todo directamente
    revealItems.forEach(function (item) {
      item.classList.add("visible");
    });
  }
})();
