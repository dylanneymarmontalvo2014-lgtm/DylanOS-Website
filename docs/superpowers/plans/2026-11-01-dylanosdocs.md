# DylanOSdocs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Los pasos usan casillas para registrar el avance.

**Goal:** Crear un frontend de documentación Crimson que lea y navegue la Wiki de GitHub desde la web oficial.

**Architecture:** Una SPA estática por hash solicita `_Sidebar.md` y cada artículo desde `raw.githubusercontent.com/wiki`. Un módulo compartido transforma Markdown y rutas; la aplicación sanea el resultado, construye navegación, búsqueda y tabla de contenidos.

**Tech Stack:** HTML, CSS, JavaScript UMD, Fetch API, Node Test y navegador real para verificación visual.

**Spec:** `docs/superpowers/specs/2026-11-01-dylanosdocs-design.md`

## Global Constraints

- GitHub Wiki es la única fuente editorial.
- La interfaz se llama DylanOSdocs y vive en `/DylanOSdocs/`.
- El sitio debe funcionar en Vercel y en `server.js`.
- El contenido remoto debe sanearse antes de insertarse.
- El diseño usa la paleta Crimson oficial y respeta `prefers-reduced-motion`.

## Review Focus

- Slugs manipulados o con protocolos peligrosos deben caer en `Home`.
- HTML remoto ejecutable debe desaparecer antes de insertarse.
- Un fallo de GitHub debe mostrar reintento y enlace a la Wiki oficial.
- Enlaces Markdown, Wiki y HTML relativos deben permanecer dentro de DylanOSdocs.
- El buscador debe seguir siendo útil mientras el índice se carga progresivamente.

### Task 1: Núcleo de Wiki y rutas

**Files:**
- Create: `DylanOSdocs/wiki-core.js`
- Create: `tests/dylanosdocs/wiki-core.test.js`

**Interfaces:**
- Produces: `normalizePageSlug`, `pageHash`, `githubWikiPageUrl`, `parseSidebar`, `renderMarkdown`, `extractSearchText`.

- [x] Escribir pruebas fallidas para slugs, enlaces, barra lateral, tablas, avisos y código.
- [x] Ejecutar las pruebas y comprobar el fallo por módulo inexistente.
- [x] Implementar el módulo mínimo.
- [x] Ejecutar las pruebas y comprobar que pasan.

### Task 2: Shell accesible y sincronización

**Files:**
- Create: `DylanOSdocs/index.html`
- Create: `DylanOSdocs/dylanosdocs.css`
- Create: `DylanOSdocs/app.js`
- Create: `tests/dylanosdocs/frontend-contract.test.js`

**Interfaces:**
- Consumes: API global `DylanOSWikiCore`.
- Produces: navegación, carga remota, saneamiento, TOC, búsqueda y estados de interfaz.

- [x] Escribir pruebas fallidas del contrato de accesibilidad, fuentes remotas, saneamiento y estados.
- [x] Comprobar el fallo por archivos inexistentes.
- [x] Construir el shell y la aplicación con contenido real.
- [x] Ejecutar pruebas unitarias y de contrato.

### Task 3: Integración con el sitio y servidor

**Files:**
- Modify: `index.html`
- Modify: `scripts/index-viqq3O5v.js`
- Modify: `server.js`
- Modify: `sitemap.xml`
- Create: `tests/dylanosdocs/site-integration.test.js`

**Interfaces:**
- Produces: enlace del pie y resolución local de `/DylanOSdocs/`.

- [x] Escribir pruebas fallidas del enlace y de la ruta de directorio.
- [x] Comprobar los fallos esperados.
- [x] Integrar el enlace y la resolución estática.
- [x] Ejecutar la suite completa.

### Task 4: Integración remota y verificación visual

**Files:**
- Create: `tests/dylanosdocs/github-wiki.integration.test.js`
- Modify: `docs/dylanosdocs-architecture.md`
- Verify: navegador real con vistas móvil y escritorio.

**Interfaces:**
- Consumes: servidor local y Wiki pública.
- Produces: evidencia de sincronización y comportamiento responsive.

- [x] Probar que GitHub entrega `Home.md` y `_Sidebar.md` reconocibles.
- [x] Probar navegación, búsqueda, artículo y móvil en navegador real.
- [x] Ejecutar la suite completa y revisar capturas.
- [x] Documentar resultados y limitaciones operativas.
