# Arquitectura del sistema de versiones de DylanOS Crimson

Fecha de decisión: 27 de octubre de 2026. Las cuotas y precios deben revisarse antes de comprometer gasto.

## Decisión

El sistema separa cuatro responsabilidades:

- **Supabase PostgreSQL** conserva metadatos, canales, estados, historial, tamaño, SHA-256 y la ruta del archivo.
- **Supabase Auth** gestiona la sesión del panel. `release_admins`, RLS y RPC con comprobación de permisos aplican la autorización real.
- **SourceForge File Release System (FRS)** conserva y distribuye las ISO públicas mediante su red de espejos.
- **Vercel** sirve la web actual y funciones pequeñas de configuración/verificación. Ninguna ISO atraviesa una Vercel Function ni PostgreSQL.

SourceForge se selecciona porque DylanOS es un proyecto de software abierto, la ISO preparada (aproximadamente 3,4 GB) está por debajo del límite de espejo de 10 GB, FRS ofrece distribución pública y permite carga reanudable con rsync sin consumo por descarga facturado al proyecto. Esta elección depende de que SourceForge acepte y mantenga el proyecto como Open Source; no es almacenamiento gratuito de propósito general.

El panel no recibe credenciales SSH. La carga gráfica se realiza en el **File Manager oficial de SourceForge**, abierto desde el panel; al regresar, el administrador introduce la ruta inmutable y DylanOS verifica públicamente tamaño/URL antes de crear el registro. La CLI sí puede automatizar la carga con rsync sobre SSH.

## Modelo y consistencia

`public.releases` admite `pre-beta`, `beta` y `stable`, con estados `draft`, `published` y `retired`. Un índice único parcial impide más de una fila `published` por canal. `release_publish(uuid)` toma un bloqueo transaccional por canal, exige tamaño positivo y SHA-256, retira la principal anterior y promueve la nueva dentro de la misma transacción.

La ruta inmutable tiene esta forma:

```text
<canal>/<versión>/<uuid-de-carga>/<nombre-seguro>.iso
```

El UUID evita sobrescrituras aunque se reutilice el nombre o número de versión. Publicar cambia metadatos; nunca reemplaza físicamente una ISO. Retirar conserva el archivo y su descarga histórica. Los visitantes leen solo filas `published` y `retired`; los borradores y mutaciones requieren un administrador autorizado.

Las descargas SourceForge se construyen como:

```text
https://sourceforge.net/projects/<proyecto>/files/<ruta-codificada>/download
```

Las rutas aceptan únicamente el subconjunto ASCII documentado por SourceForge, terminan en `.iso` y rechazan traversal, separadores codificados y nombres ambiguos. Para filas heredadas con `storage_provider=r2`, el catálogo puede seguir usando `R2_PUBLIC_BASE`; no existe ya un flujo de carga R2.

## Comparación de almacenamiento

| Alternativa | Archivo/capacidad y carga grande | Descarga/coste y control | Evaluación para DylanOS |
|---|---|---|---|
| **SourceForge FRS** | Archivos de más de 10 GB no se replican ni descargan. Recomienda rsync por encima de 100 MB; rsync puede reanudar transferencias. No fija cuota rígida general: 5 GB o menos es ideal y 20–30 GB puede ser razonable, sujeto a revisión. | File Manager, SFTP/SCP/rsync, enlaces públicos y espejos mundiales. SSH se limita a miembros de proyectos Open Source. No ofrece URL privada/firmada para este catálogo público. | **Seleccionado.** Encaja con la ISO de 3,4 GB y el requisito de coste inicial cero, mientras el proyecto cumpla la licencia Open Source y mantenga un uso razonable. |
| Supabase Storage | Subida estándar hasta 5 GB; TUS/S3 reanudable hasta 50 GB según su guía actual. El límite global/bucket depende del plan y configuración. | Integra Auth, políticas y URL pública/firmada. Almacenamiento y egress consumen cuotas del proyecto y pueden generar coste. | Técnicamente adecuado, pero no para distribución gratuita sostenida de ISOs grandes en el plan actual. PostgreSQL sigue siendo la fuente de metadatos, nunca de bytes ISO. |
| Cloudflare R2 | Hasta 5 TiB por objeto con multipart; 10.000 partes y reanudación. Standard incluye 10 GB-mes gratis; después publica USD 0,015/GB-mes y operaciones por clase. | Egress a Internet sin cargo, URL pública/prefirmada, CORS y control S3. | Mejor alternativa comercial futura. No elegido porque el historial de varias ISO excederá la franquicia gratuita y el usuario pidió operación inicial sin coste. |
| GitHub Releases | Cada asset debe ser menor de 2 GiB; no publica límite de ancho de banda o tamaño total del release. La API de asset es una carga única, no multipart reanudable. | Enlaces públicos y automatización con REST/`gh`; permisos ligados al repositorio. | Descartado: la ISO actual (~3,4 GB) supera el límite individual. |
| Backblaze B2 | Consola hasta 5 GiB por archivo; API/CLI soportan flujo de archivos grandes. Primeros 10 GB de almacenamiento gratuitos; egress gratis hasta 3× el almacenamiento mensual y después tarifa publicada. | S3/API, buckets públicos/privados y automatización. | Alternativa económica, pero varias descargas de una ISO de 3,4 GB pueden rebasar rápidamente el egress gratuito. |
| Internet Archive | La ayuda no fija un límite duro general y recomienda no superar 50 GB por archivo/item para fiabilidad; ofrece web y CLI. La disponibilidad puede tardar de segundos a días. | Distribución pública y preservación; metadatos/licencia obligatorios, procesamiento asíncrono y menor control operativo del enlace. | Útil como copia/preservación secundaria, no como origen primario de publicaciones inmediatas. |
| Vercel Blob | Hasta 5 TB con multipart; Hobby incluye 1 GB de almacenamiento y 10 GB de transferencia mensual. Los blobs mayores de 512 MB no se cachean y generan miss/origin transfer. | Excelente integración y subida directa, pero almacenamiento/transferencia se cobran o el servicio se bloquea al agotar Hobby. Vercel Functions tienen payload de 4,5 MB. | Descartado para una ISO de 3,4 GB y descargas públicas: supera la cuota gratuita desde el primer archivo. |
| Servidor propio + File Browser | Capacidad, multipart y velocidad dependen del disco/enlace contratados. Requiere persistencia, HTTPS, proxy/auth externa, backups y restauraciones probadas. | Control total, pero también parches, monitorización, abuso, disponibilidad y coste de tránsito. | No se instala automáticamente. Alojar File Browser “en Vercel” no aporta disco persistente ni permite pasar una ISO por Functions. |

Fuentes oficiales consultadas:

- [SourceForge: Release Files for Download](https://sourceforge.net/p/forge/documentation/Release%20Files%20for%20Download/)
- [SourceForge: File Management y rsync](https://sourceforge.net/p/forge/documentation/File%20Management/)
- [SourceForge: cuotas de disco](https://sourceforge.net/p/forge/documentation/Disk%20Quotas/)
- [SourceForge: crear un proyecto Open Source](https://sourceforge.net/p/forge/documentation/Create%20a%20New%20Project/)
- [SourceForge: acceso SSH](https://sourceforge.net/p/forge/documentation/SSH/)
- [Supabase: restricciones de tamaño](https://supabase.com/kb/troubleshooting/upload-file-size-restrictions-Y4wQLT)
- [Supabase: cargas reanudables](https://supabase.com/docs/guides/storage/uploads/resumable-uploads)
- [Cloudflare R2: límites](https://developers.cloudflare.com/r2/platform/limits/)
- [Cloudflare R2: precios](https://developers.cloudflare.com/r2/pricing/)
- [GitHub Releases: cuotas de assets](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases#storage-and-bandwidth-quotas)
- [Backblaze B2: precios](https://help.backblaze.com/hc/en-us/articles/217667478-Understanding-B2-Pricing-Structure)
- [Internet Archive: consejos de carga](https://archivesupport.zendesk.com/hc/en-us/articles/360016475032-Uploading-Tips)
- [Vercel Blob: uso, precios y límites](https://vercel.com/docs/vercel-blob/usage-and-pricing)
- [Vercel: límite de payload de Functions](https://vercel.com/docs/errors/function_payload_too_large)

## Seguridad y límites operativos

- Solo `SOURCEFORGE_PROJECT` y las URL públicas opcionales pertenecen al despliegue web. `SOURCEFORGE_USERNAME` y `SOURCEFORGE_SSH_KEY` se quedan en el equipo/CI autorizado.
- Las descargas son públicas y permanentes; no se emplean URL firmadas. El catálogo conserva enlaces históricos.
- La verificación previa a insertar comprueba respuesta HTTP pública y `Content-Length` exacto. El SHA-256 se calcula localmente y se almacena; una comprobación HEAD no sustituye una verificación criptográfica descargando el archivo.
- Un retraso de espejo puede hacer fallar temporalmente la verificación. La CLI reintenta; si se agotan los intentos no crea fila.
- SourceForge indica que el usuario debe respaldar sus archivos y que no restaura archivos individuales.
- La aplicación no intenta alojar la ISO dentro del repositorio Git, Vercel, PostgreSQL ni el filesystem efímero del despliegue.

## Migración de proveedor

1. Mantener SourceForge operativo y crear el destino sin cambiar el catálogo.
2. Exportar cada ISO por rsync y comparar tamaño + SHA-256 con Supabase.
3. Copiar los archivos al destino usando rutas inmutables o registrar un mapa de rutas.
4. Verificar públicamente cada objeto antes de modificar metadatos.
5. Actualizar `storage_provider` y `file_path` en una migración transaccional por lotes.
6. Añadir el constructor de URL del nuevo proveedor y probar principal + historial de cada canal.
7. Mantener SourceForge durante una ventana de reversión y eliminarlo solo cuando ninguna fila lo referencie y exista backup verificado.
