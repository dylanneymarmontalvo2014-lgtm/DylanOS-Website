# DylanOSdocs: arquitectura y sincronización

## Objetivo

DylanOSdocs es el frontend de documentación de la web oficial de DylanOS. Presenta la Wiki de GitHub con la identidad Crimson del sitio y una arquitectura de lectura inspirada en MediaWiki: navegación persistente, artículo principal, tabla de contenidos, búsqueda y enlace a la fuente.

La fuente de verdad continúa siendo `DylanOS.wiki.git`. DylanOSdocs no mantiene una segunda copia editorial ni una base de datos propia.

## Flujo de datos

1. El navegador abre `/DylanOSdocs/`.
2. `app.js` solicita `_Sidebar.md` desde `raw.githubusercontent.com/wiki/dylanneymarmontalvo2014-lgtm/DylanOS/` con `cache: "no-store"`.
3. La barra lateral determina los capítulos y páginas disponibles.
4. La ruta `#/Nombre-de-pagina` solicita el Markdown correspondiente.
5. `wiki-core.js` transforma Markdown, enlaces Wiki y tablas en HTML.
6. `app.js` sanea el fragmento con una lista de elementos y atributos permitidos antes de insertarlo.
7. La tabla de contenidos se genera a partir de los encabezados del artículo ya renderizado.

Cada visita solicita la versión publicada en GitHub. Un cambio en la Wiki aparece en DylanOSdocs cuando el contenido crudo de GitHub lo entrega; no requiere volver a desplegar la web.

## Rutas

- `/DylanOSdocs/`: aplicación de documentación.
- `/DylanOSdocs/#/Home`: portada.
- `/DylanOSdocs/#/DylanOS-Explorer`: artículo concreto.
- `https://github.com/dylanneymarmontalvo2014-lgtm/DylanOS/wiki/<slug>`: fuente pública de cada artículo.

Se usa enrutamiento por hash para que la aplicación funcione en alojamiento estático, Vercel y el servidor Node local sin reglas de reescritura adicionales.

## Seguridad

La Wiki es contenido remoto. Antes de mostrarlo, el frontend elimina elementos ejecutables, atributos de eventos, estilos en línea y protocolos peligrosos. Solo conserva etiquetas estructurales necesarias para la documentación, enlaces HTTPS o internos e imágenes HTTPS.

## Fallos y recuperación

Si GitHub no responde, DylanOSdocs conserva la interfaz y muestra una explicación con acciones para reintentar o abrir la Wiki oficial. Una búsqueda parcial sigue mostrando las páginas ya cargadas.

## Pruebas

```bash
node --test tests/*.test.js tests/*/*.test.js
```

La suite comprueba el parser, la navegación, el contrato visual, el enlace del pie, las rutas estáticas y la obtención real de `Home.md` y `_Sidebar.md` desde GitHub.

## Verificación de entrega

- 17 pruebas automáticas cubren el núcleo Markdown, el contrato del frontend, la integración con el sitio y la Wiki pública.
- La portada y `_Sidebar.md` se cargaron desde GitHub y generaron una navegación de 53 artículos.
- En navegador real se verificaron el enlace del pie, la búsqueda, el artículo de DylanOS Explorer, la tabla de contenidos y el enlace a la fuente.
- Las vistas móvil y de escritorio se revisaron con el menú lateral, las tablas desplazables, los iconos con tamaño editorial y la preferencia de movimiento reducido.

La disponibilidad depende de GitHub y de `raw.githubusercontent.com`. La interfaz muestra un estado recuperable cuando esas fuentes no responden; no conserva una copia desactualizada en el despliegue.
