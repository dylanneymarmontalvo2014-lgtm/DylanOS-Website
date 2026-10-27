# Configuración del sistema de versiones

## Requisitos

- Node.js 20 o posterior; `rsync`, OpenSSH (`ssh`, `sftp`) y `sha256sum` para la CLI.
- El proyecto Supabase ya asociado a DylanOS; no se crea un segundo proyecto.
- Una cuenta y un proyecto SourceForge aprobados para DylanOS. SourceForge exige software Open Source y una licencia compatible con la Open Source Definition.
- El despliegue Vercel existente para la web y sus funciones pequeñas.

## 1. Variables locales

```bash
cp .env.example .env.local
```

| Variable | Dónde | Uso |
|---|---|---|
| `SUPABASE_URL` | Vercel + local | URL del proyecto existente. Es pública. |
| `SUPABASE_ANON_KEY` | Vercel + local | Clave publicable para Auth y catálogo. |
| `SUPABASE_SERVICE_ROLE_KEY` | solo CLI/local seguro | Primer administrador y gestión por terminal. Nunca se expone en `/api/public-config`. |
| `SOURCEFORGE_PROJECT` | Vercel + local | Slug público del proyecto (`dylanos`, por ejemplo). |
| `SOURCEFORGE_USERNAME` | solo CLI/local/CI seguro | Usuario miembro del proyecto con permiso de releases. |
| `SOURCEFORGE_SSH_HOST` | solo CLI/local | Opcional; por defecto `frs.sourceforge.net`. |
| `SOURCEFORGE_SSH_KEY` | solo CLI/local/CI seguro | Ruta absoluta opcional a una clave privada; si falta se usa el agente SSH. |
| `SOURCEFORGE_DOWNLOAD_BASE` | Vercel + local, opcional | Override público; normalmente se deriva del slug. |
| `SOURCEFORGE_FILE_MANAGER_URL` | Vercel + local, opcional | Override público del File Manager; normalmente se deriva del slug. |
| `R2_PUBLIC_BASE` | Vercel, opcional | Solo permite leer filas históricas `storage_provider=r2`; no habilita cargas. |

No introduzcas en Vercel el usuario, la clave SSH ni `SUPABASE_SERVICE_ROLE_KEY` si no existe una función que lo necesite. El panel usa la sesión Supabase del administrador, no una clave secreta embebida.

## 2. Crear el proyecto SourceForge

1. Inicia sesión en SourceForge y abre [Create a New Project](https://sourceforge.net/p/forge/documentation/Create%20a%20New%20Project/).
2. Registra DylanOS con su licencia Open Source real y un slug estable de 3–30 caracteres. No inventes una licencia: el código fuente y la licencia que declares deben estar disponibles.
3. Espera la aprobación/activación y confirma que el menú **Files** abre el File Manager.
4. En la configuración de la cuenta, registra una clave SSH pública siguiendo la [guía SSH de SourceForge](https://sourceforge.net/p/forge/documentation/SSH/).
5. Comprueba la huella del host publicada por SourceForge antes de aceptarla por primera vez.
6. Verifica acceso sin subir la ISO:

```bash
ssh TU_USUARIO@frs.sourceforge.net
```

El archivo privado permanece en el equipo. `SOURCEFORGE_SSH_KEY` contiene una ruta, nunca el contenido de la clave.

## 3. Supabase y migraciones

La CLI ya está vinculada al proyecto existente. Para una instalación nueva o para revisar el estado:

```bash
npx supabase login
npx supabase link --project-ref TU_PROJECT_REF
npx supabase db push --dry-run
npx supabase db push
```

Migraciones versionadas:

- `20261025000100_releases_system.sql`: `releases`, `release_admins`, índices, RLS y RPC atómicas.
- `20261025000200_storage_policies.sql`: marcador no-op; no crea almacenamiento ISO en Supabase.
- `20261026000100_sourceforge_provider.sql`: admite `sourceforge` sin romper filas heredadas `r2`/`supabase`.

No ejecutes `db reset` contra el proyecto remoto. `npx supabase db reset` se usa exclusivamente con la pila local.

## 4. Primer administrador

1. En Supabase Dashboard abre **Authentication > Users** y crea/invita al usuario que administrará DylanOS.
2. El usuario debe completar la invitación y establecer su método de inicio de sesión.
3. Copia el UUID de ese usuario y registra exactamente ese UUID:

```bash
npm run releases:admin:add -- \
  --user-id "UUID_DEL_USUARIO" \
  --email "correo-del-admin@example.com"
```

4. Abre `/admin/versions/` e inicia sesión. Una cuenta autenticada que no esté en `release_admins` recibe “sin autorización” y RLS rechaza sus escrituras.

El acceso de la Supabase CLI se obtiene con el inicio OAuth/device flow de `npx supabase login`; no sustituye la sesión del panel. Habilitar Google/GitHub OAuth para el panel requeriría registrar un cliente OAuth del proveedor y configurar sus credenciales en Supabase. Esta implementación no inventa esas credenciales y mantiene el login seguro de Supabase por correo.

## 5. Vercel

En **Project Settings > Environment Variables** añade para Production/Preview:

```text
SUPABASE_URL
SUPABASE_ANON_KEY
SOURCEFORGE_PROJECT
```

Añade los overrides públicos solo si SourceForge usa una URL distinta. No añadas `SOURCEFORGE_USERNAME`, `SOURCEFORGE_SSH_KEY` ni claves privadas. Después despliega el proyecto existente y revisa:

```bash
curl -s https://TU_SITIO/api/public-config
```

La respuesta puede incluir URL/anon key públicas de Supabase, slug/bases públicas SourceForge y banderas de preparación. No debe contener service role, usuario SSH ni una ruta/clave privada.

## 6. Desarrollo local

```bash
npm install
npm test
npm run dev
```

- Web: `http://127.0.0.1:5502/`
- Panel: `http://127.0.0.1:5502/admin/versions/`

Para probar RLS localmente:

```bash
npx supabase start
npx supabase db reset
node --test tests/integration/supabase-releases.test.js
```

## 7. Checklist de la ISO preparada (~3,4 GB)

Antes de publicarla:

1. `stat -c '%s %n' ./dist/DylanOS-Crimson.iso` confirma archivo no vacío y tamaño menor de 10 GiB.
2. `sha256sum ./dist/DylanOS-Crimson.iso` se guarda fuera del archivo y se compara con el calculado por panel/CLI.
3. El nombre termina en `.iso` y la ruta destino usa solo ASCII permitido.
4. Existe al menos una copia local/verificada; SourceForge no restaura archivos individuales.
5. El canal y versión son definitivos, por ejemplo `pre-beta/0.3.0-prebeta/<uuid>/DylanOS-Crimson.iso`.
6. Se sube primero como borrador si es la primera prueba de producción.
7. Solo después de verificar URL pública, tamaño y descarga se promueve mediante el panel o la CLI.
