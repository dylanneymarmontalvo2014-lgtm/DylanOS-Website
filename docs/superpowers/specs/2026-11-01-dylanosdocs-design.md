# Diseño de DylanOSdocs

## Intención

DylanOSdocs convierte la Wiki General de DylanOS Crimson en una experiencia de documentación propia dentro de la web oficial. La persona debe poder llegar desde el enlace “Documentación” del pie, reconocer inmediatamente la marca y encontrar una respuesta sin aprender la interfaz de GitHub.

## Alcance

- Nueva aplicación estática en `/DylanOSdocs/`.
- Fuente única: Wiki pública de GitHub de DylanOS.
- Navegación inspirada en MediaWiki: índice persistente, artículo, tabla de contenidos, búsqueda y fuente.
- Sincronización en lectura para reflejar publicaciones de la Wiki sin desplegar de nuevo la web.
- Integración del enlace “Documentación” del pie del sitio.
- Diseño adaptable, accesible y coherente con la web Crimson.
- Pruebas unitarias, de contrato, integración remota y servidor local.

## Dirección visual

La interfaz extiende “Crimson Silence”: negro `#050505`, superficie `#101012`, borde `#2E2736`, Crimson `#DC143C`, brillo `#FF5274`, blanco `#FFFFFF` y texto secundario `#B3B3B3`. La tipografía utiliza la familia ya incluida en el sitio. El encabezado es compacto; la navegación lateral organiza capítulos; el artículo conserva líneas cortas y ritmo editorial; la tabla de contenidos ocupa una tercera columna en pantallas amplias.

La portada de cada capítulo puede ocupar todo el ancho del artículo. El contenido general se alinea a la izquierda para lectura; la cabecera de producto y los elementos que ya vienen centrados desde la Wiki conservan esa intención.

## Decisiones técnicas

- JavaScript, HTML y CSS sin framework ni dependencia de ejecución adicional.
- Módulo UMD `wiki-core.js` para compartir parser y reglas de rutas entre navegador y Node Test.
- Rutas por hash para compatibilidad con hosting estático.
- `fetch` con `cache: "no-store"` y parámetro de versión por sesión.
- Saneamiento por DOM con lista explícita de etiquetas y atributos.
- Búsqueda local sobre títulos y contenido descargado, con carga progresiva del índice.

## Fuera de alcance

- Editar la Wiki desde DylanOSdocs.
- Mantener usuarios, sesiones o una base de datos MediaWiki independiente.
- Sustituir GitHub Wiki como fuente de verdad.
- Duplicar manualmente los artículos dentro del repositorio web.

## Criterios de aceptación

1. “Documentación” abre `/DylanOSdocs/`.
2. La portada obtiene `Home.md` desde GitHub y muestra el contenido DylanOS Crimson.
3. La barra lateral se genera desde `_Sidebar.md`.
4. Los enlaces internos cambian de artículo sin salir del frontend.
5. La búsqueda encuentra páginas por título y texto.
6. El contenido remoto se sanea antes de insertarse.
7. Existe un estado de carga y un estado de error recuperable.
8. Funciona en escritorio, tableta, móvil y con teclado.
9. La suite automatizada y una prueba visual real pasan antes de integrar en `main`.
