# Diseño: ejecución local sin dependencias automáticas de terceros

## Objetivo

La web de DylanOS debe renderizarse y funcionar sin solicitar recursos ni datos a servicios externos. Los enlaces explícitos de navegación, incluido GitHub, se conservan como opciones del usuario y no forman parte del runtime.

## Alcance

- Eliminar conexiones automáticas a Google Fonts y Google Translate.
- Sustituir las variantes remotas de imágenes Base44 por activos locales.
- Retirar la consulta periódica a la API de GitHub y mostrar estadísticas locales estáticas.
- Corregir referencias de sitemap y robots.txt que no sean del sitio real.
- Añadir una comprobación local para evitar que vuelvan a introducirse recursos remotos o llamadas automáticas.
- Conservar enlaces manuales externos como navegación opcional.

## Diseño técnico

`index.html` será la única entrada que carga recursos locales mediante rutas relativas. Las imágenes usarán el archivo WebP local sin `srcset` remoto. Se eliminarán los nodos generados por Google Translate y sus estilos asociados cuando no sean usados por la aplicación.

El servidor Node.js dejará de importar `https` y de exponer `/api/github-stats`; no habrá polling desde el navegador. Las tarjetas de actividad conservarán contenido local ya existente, por lo que una indisponibilidad de GitHub no afectará el renderizado.

La verificación de dependencias recorrerá archivos de aplicación y rechazará URLs externas en atributos de recursos, imports, llamadas de red y configuración de proveedores. Se permitirán URLs externas que sean destinos de navegación explícitos (`a[href]`) y namespaces estándar de SVG.

## Compatibilidad y errores

La página deberá seguir funcionando al desconectar la red después de iniciar el servidor local. Los enlaces de navegación externa podrán fallar sin conexión, pero no bloquearán la aplicación. El servidor mantendrá respuestas 404 para recursos inexistentes.

## Verificación

1. Buscar referencias remotas en archivos de runtime.
2. Ejecutar el verificador local.
3. Arrancar `server.js` y solicitar la página y recursos principales.
4. Confirmar que `/api/github-stats` ya no existe.
5. Confirmar que no se inicia ninguna conexión HTTP/HTTPS automática durante la carga.
6. Revisar el diff para garantizar que solo se modificó el alcance aprobado.
