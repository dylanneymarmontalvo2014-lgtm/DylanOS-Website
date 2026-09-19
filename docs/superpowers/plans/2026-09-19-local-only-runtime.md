# Local-Only Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Hacer que DylanOS cargue y funcione sin dependencias automáticas de Google, Base44, GitHub u otros servicios externos, manteniendo los enlaces externos como navegación opcional.

**Architecture:** La página utilizará únicamente rutas relativas a activos versionados en el repositorio. Las estadísticas de comunidad serán valores estáticos del HTML; se eliminarán el endpoint y el polling de GitHub. Una auditoría local analizará recursos y llamadas de red, permitiendo URLs externas solo en destinos explícitos de enlaces y namespaces estándar de SVG.

**Tech Stack:** HTML estático, CSS/JavaScript generados ya presentes, Node.js `http`/`fs`/`path`, Bash y Node.js sin dependencias nuevas.

**Spec:** `docs/superpowers/specs/2026-09-19-local-only-runtime-design.md`

## Global Constraints

- La web debe renderizarse y funcionar sin solicitar recursos ni datos a servicios externos.
- Los enlaces explícitos de navegación, incluido GitHub, se conservan como opciones del usuario.
- No se añadirán paquetes ni dependencias externas nuevas.
- Las imágenes, fuentes, CSS y JavaScript usados por runtime deben ser locales.
- La indisponibilidad de GitHub no debe afectar el renderizado.
- Se preservará la apariencia actual salvo los cambios necesarios para retirar dependencias.

---

### Task 1: Añadir auditoría local de dependencias externas

**Files:**
- Create: `scripts/check-local-runtime.js`
- Modify: `package.json` (solo si existe; en este repositorio no existe actualmente, por lo que se ejecutará directamente con Node.js)
- Test: comandos Node.js integrados en el propio script

**Interfaces:**
- Produces: proceso CLI `node scripts/check-local-runtime.js` que termina con código `0` si no encuentra dependencias automáticas remotas y código `1` con un informe de archivos y líneas.

- [x] **Step 1: Escribir casos de comprobación fallidos contra el estado actual**

Crear una función de auditoría que recorra `index.html`, `scripts`, `styles`, `server.js`, `robots.txt` y `sitemap.xml`, marque URLs remotas en atributos de recursos, `fetch`, `XMLHttpRequest`, `https.request`, `http.request`, `WebSocket`, imports y etiquetas `iframe`, y permita `a[href]` y `http://www.w3.org/2000/svg`. Ejecutar el script antes de limpiar y comprobar que falla identificando Base44, Google y GitHub API.

- [x] **Step 2: Implementar el auditor sin dependencias**

Usar únicamente `fs`, `path` y `process`. Para cada archivo, conservar el número de línea y aplicar expresiones regulares separadas para recursos automáticos y enlaces. No leer `.git` ni archivos binarios. Imprimir `No se encontraron dependencias automáticas externas.` cuando el resultado esté limpio.

- [x] **Step 3: Ejecutar la auditoría inicial**

Run: `node scripts/check-local-runtime.js`
Expected: FAIL mientras existan las referencias remotas actuales; el informe debe identificar cada hallazgo de runtime.

- [x] **Step 4: Mantener la comprobación como herramienta del repositorio**

Documentar en el encabezado del script qué categorías analiza y cuáles son las únicas excepciones permitidas. No añadir un gestor de paquetes para ejecutarla.

---

### Task 2: Sustituir activos Base44/Google por recursos locales

**Files:**
- Modify: `index.html:6-16,24,27`
- Modify: `styles/m-el_main_css.bin` solo si la auditoría confirma que contiene estilos exclusivos de Google Translate sin uso local
- Delete: ningún activo local existente

**Interfaces:**
- Consumes: activos locales existentes en `images/` y `styles/index-Dy2IKqv_.css`.
- Produces: `index.html` sin `preconnect` remoto, `srcset` remoto, `iframe` de traducción ni formularios de terceros; los enlaces externos `a[href]` permanecen.

- [x] **Step 1: Sustituir referencias de imagen**

En cada logo de `index.html`, conservar `src="./images/8357dd421_Screenshot_1-removebg-preview.webp"` y eliminar las entradas `srcset` de `media.base44.com`. No cambiar `alt`, dimensiones visuales ni clases.

- [x] **Step 2: Eliminar conexiones y artefactos Google**

Eliminar las dos etiquetas `preconnect` de Google Fonts y todo el bloque de markup generado por Google Translate (`goog-gt-tt`, `goog-gt-vt`, `votingFrame` y formulario hacia `translate.googleapis.com`). Conservar los elementos de la aplicación dentro de `#root` y la estructura HTML válida.

- [x] **Step 3: Revisar estilos de proveedor**

Buscar selectores `VIpgJd-*` y `goog-te-*` en `styles/m-el_main_css.bin`. Si el archivo solo contiene esos estilos y ningún estilo usado por DylanOS, eliminarlo; si contiene una mezcla, conservarlo y eliminar únicamente el bloque de proveedor sin alterar estilos de la aplicación.

- [x] **Step 4: Verificar recursos locales**

Run: `node scripts/check-local-runtime.js`
Expected: todavía puede fallar por GitHub API y configuración; no debe informar Base44 ni Google Translate/Fonts como recursos automáticos.

---

### Task 3: Retirar estadísticas dinámicas de GitHub

**Files:**
- Modify: `server.js:1-83,88-92`
- Delete: `scripts/github-stats.js`
- Modify: `index.html` para eliminar la etiqueta que carga `scripts/github-stats.js`

**Interfaces:**
- Produces: servidor HTTP estático sin `/api/github-stats`, sin importación de `https`, sin token GitHub y sin llamadas de red salientes.
- Consumes: valores estadísticos ya presentes en `index.html` como contenido local.

- [x] **Step 1: Escribir la verificación de ausencia del endpoint**

Arrancar el servidor en un proceso de prueba, solicitar `/api/github-stats` y especificar que debe responder `404`; solicitar `/` y especificar `200`. Antes de eliminar el endpoint, esta prueba debe demostrar el comportamiento que cambiará.

- [x] **Step 2: Eliminar código de integración externa**

En `server.js`, eliminar `require('https')`, constantes de GitHub, caché, `githubRequest`, `getLastPage`, `getCollectionCount`, `getGithubStats`, `sendGithubStats` y la rama `/api/github-stats`. Mantener el servidor de archivos estáticos y su manejo de errores.

- [x] **Step 3: Eliminar polling del navegador**

Eliminar la etiqueta `<script src="./scripts/github-stats.js" defer>` de `index.html` y borrar `scripts/github-stats.js`. Mantener las cifras locales que ya aparecen en la tarjeta de comunidad.

- [x] **Step 4: Verificar servidor aislado**

Run: `node server.js` en segundo plano; después ejecutar solicitudes locales a `/`, `/scripts/index-viqq3O5v.js`, `/styles/index-Dy2IKqv_.css` y `/api/github-stats`.
Expected: recursos locales `200`, endpoint eliminado `404`, y ningún intento de conexión a `api.github.com`.

---

### Task 4: Corregir metadatos de rastreo y despliegue

**Files:**
- Modify: `robots.txt`
- Modify: `sitemap.xml`

**Interfaces:**
- Produces: metadatos que apuntan únicamente al dominio de DylanOS configurado en el repositorio y no contienen URLs de ejemplo.

- [x] **Step 1: Revisar los dominios canónicos existentes**

Usar el historial y el contenido actual para identificar el dominio publicado vigente, sin inventar un dominio alternativo. Conservar el namespace XML estándar de sitemap, que no es un recurso cargado por el navegador.

- [x] **Step 2: Corregir `robots.txt`**

Reemplazar `https://tuusuario.github.io/nombre-repo/sitemap.xml` por la URL canónica vigente del sitemap; conservar `User-agent: *` y `Allow: /`.

- [x] **Step 3: Corregir `sitemap.xml`**

Actualizar `<loc>` a la URL canónica vigente y conservar el XML válido. No introducir servicios de generación remota.

- [x] **Step 4: Validar ausencia de placeholders**

Run: `rg -n "tuusuario|nombre-repo|fonts\.google|base44|api\.github|translate\.google" . --glob '!.git/**'`
Expected: no coincidencias en archivos de runtime; los enlaces explícitos a `github.com` pueden permanecer.

---

### Task 5: Verificación integral y revisión del diff

**Files:**
- Modify: `docs/superpowers/specs/2026-09-19-local-only-runtime-design.md` solo si la implementación revela una decisión distinta; de lo contrario, sin cambios

- [x] **Step 1: Ejecutar auditoría de URLs y dependencias**

Run: `node scripts/check-local-runtime.js`
Expected: PASS con código `0` y mensaje de runtime local.

- [x] **Step 2: Comprobar sintaxis JavaScript**

Run: `node --check server.js && node --check scripts/check-local-runtime.js`
Expected: ambos comandos terminan correctamente.

- [x] **Step 3: Probar carga local**

Arrancar `node server.js`, consultar `/`, cada script/CSS/imagen referenciado localmente y una ruta inexistente.
Expected: página y recursos existentes responden `200`, recurso inexistente responde `404`, y no se producen solicitudes automáticas externas.

- [x] **Step 4: Buscar llamadas de red en runtime**

Run: `rg -n -i "fetch\\(|XMLHttpRequest|WebSocket|https?\.request|api\.github|media\.base44|fonts\.google|fonts\.gstatic|translate\.google|<iframe" index.html server.js scripts styles`
Expected: solo quedan enlaces de navegación externos y namespaces SVG permitidos; no quedan llamadas ni recursos automáticos.

- [x] **Step 5: Revisar el alcance del diff**

Run: `git diff --stat && git diff --check && git status --short`
Expected: cambios limitados a la migración aprobada, sin sobrescribir modificaciones ajenas en `index.html` o `server.js`.
