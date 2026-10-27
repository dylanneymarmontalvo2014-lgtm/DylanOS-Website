# Operación del sistema de versiones

## Panel gráfico: publicación con File Manager

1. Abre `/admin/versions/` e inicia sesión con el administrador de Supabase.
2. Pulsa **Nueva versión**, selecciona la ISO y completa nombre, versión, canal, arquitectura y notas.
3. El navegador valida extensión/tamaño/MIME, inspecciona una firma ISO como advertencia y calcula SHA-256 por bloques sin cargar el archivo completo en memoria.
4. Pulsa **Abrir File Manager**. SourceForge se abre en otra pestaña; crea la ruta inmutable sugerida y carga allí la ISO. Los bytes van a SourceForge, nunca a Vercel/Supabase.
5. Regresa al panel, pega la ruta relativa exacta y pulsa **Verificar archivo público**. Si los espejos aún no lo exponen, espera y reintenta; no se simula progreso ni se crea una fila.
6. Cuando tamaño y URL estén verificados, confirma el resumen. El panel crea primero un borrador y, si elegiste publicación inmediata, llama a la promoción atómica.

La versión principal anterior del mismo canal pasa a historial; los otros canales no cambian. El panel permite buscar/filtrar, editar metadatos, publicar borradores, retirar, verificar, copiar enlaces y eliminar registros no activos con confirmación. Eliminar un registro desde el panel conserva deliberadamente el archivo SourceForge; la limpieza física se hace por CLI tras comprobar referencias.

## CLI: publicación reanudable por rsync

Estado e historial:

```bash
npm run releases:status
npm run releases:list
npm run releases:history -- --channel "pre-beta"
```

Publicación (promueve por defecto):

```bash
npm run releases:publish -- \
  --file "./dist/DylanOS-Crimson.iso" \
  --name "DylanOS Crimson 0.3.0" \
  --version "0.3.0-prebeta" \
  --channel "pre-beta"
```

Guardar como borrador:

```bash
npm run releases:publish -- \
  --file "./dist/DylanOS-Crimson.iso" \
  --name "DylanOS Crimson 0.3.0 Beta" \
  --version "0.3.0-beta" \
  --channel "beta" \
  --draft
```

La CLI valida archivo/canal/versión, calcula SHA-256 por stream, crea una ruta con UUID, prepara carpetas por SFTP, ejecuta `rsync -avP --partial`, y espera a que el enlace público responda con el tamaño exacto. Solo entonces inserta el borrador y opcionalmente lo promueve. La salida JSON contiene id, estado, proveedor, ruta, URL, SHA-256 y tamaño; no contiene credenciales.

Otras operaciones:

```bash
npm run releases:verify
npm run releases:retire -- --id "UUID_RELEASE"
npm run releases:delete -- --id "UUID_RELEASE" --yes
npm run releases:cleanup -- --key "pre-beta/0.3.0-prebeta/UUID/DylanOS.iso" --yes
```

`delete` solo acepta borradores o retiradas y elimina registro + archivo SourceForge. `cleanup` es para un archivo huérfano: valida la ruta y se niega si aún hay una fila SourceForge que la referencia.

## Retraso de espejos

SourceForge distribuye FRS a espejos. Inmediatamente después de una carga, la URL `/download` puede no informar todavía el tamaño final. El panel permite reintentar manualmente; la CLI hace varios intentos con espera creciente. Agotar los reintentos se reporta como fallo de verificación distinto de un fallo rsync y no crea un registro.

## Recuperación ante fallos

### rsync interrumpido

No se crea ninguna fila. Repite exactamente el mismo comando: `--partial` permite que rsync reutilice la transferencia parcial. No cambies la ruta UUID entre intentos manuales.

### Archivo cargado, espejo aún pendiente

No se crea fila. Espera unos minutos y ejecuta de nuevo la publicación con cuidado: la CLI genera una nueva ruta en cada ejecución. Para evitar duplicados, elimina la ruta huérfana anterior con `cleanup` o termina/verifica manualmente la misma ruta desde el panel.

### Archivo cargado, inserción Supabase fallida

El error muestra la ruta huérfana y el comando exacto, sin secretos:

```bash
npm run releases:cleanup -- --key "RUTA_EXACTA.iso" --yes
```

El comando consulta Supabase y no elimina si la ruta sigue referenciada.

### Borrador creado, promoción fallida

La principal anterior sigue intacta. Corrige el problema y publica el borrador desde el panel; no vuelvas a subir la ISO.

### Registro eliminado, SFTP falló

La CLI informa la ruta huérfana. Corrige SSH y ejecuta `releases:cleanup` con esa ruta exacta.

### Descarga rota o integridad dudosa

```bash
npm run releases:verify
rsync -avP TU_USUARIO@frs.sourceforge.net:/home/frs/project/TU_PROYECTO/ ./backup-sourceforge/
sha256sum ./backup-sourceforge/RUTA/DylanOS-Crimson.iso
```

El hash debe coincidir con `releases.sha256`. `Content-Length` verifica completitud aparente; no sustituye SHA-256.

## Rollback

- Para retirar una principal sin reemplazo: `npm run releases:retire -- --id UUID`.
- Para volver a una versión anterior, la fila histórica permanece `retired`; crea un nuevo borrador que apunte a una copia inmutable verificada o implementa una RPC específica de republicación. No cambies `status` directamente: los privilegios lo bloquean y se perdería atomicidad.
- No renombres/muevas archivos ya publicados en SourceForge: cambia la URL y reinicia estadísticas. Copia a una nueva ruta, verifica, migra la fila y conserva el origen durante la reversión.

## Backups y mantenimiento

SourceForge deja el backup al proyecto. Exporta periódicamente todo FRS:

```bash
rsync -avP TU_USUARIO@frs.sourceforge.net:/home/frs/project/TU_PROYECTO/ ./backup-sourceforge/
```

Además:

- exporta `releases` y `release_admins` desde Supabase y prueba restauración;
- conserva al menos una copia offline de cada ISO y su fichero SHA-256;
- revisa que el proyecto siga cumpliendo licencia/uso Open Source y la guía de espacio razonable;
- audita `release_admins`, elimina usuarios antiguos y rota claves SSH;
- prueba mensualmente una descarga principal y una histórica por canal;
- no borres una ISO física hasta confirmar que ninguna fila la referencia.

## Limitaciones pendientes

- El formulario web no transmite la ISO: por seguridad y límites de Vercel, la carga gráfica ocurre en el File Manager externo y el panel verifica el resultado.
- La primera carga real depende de que el propietario cree/active el proyecto SourceForge y registre su clave SSH.
- Una ISO mayor de 10 GB no sirve desde los espejos SourceForge; antes de llegar a ese tamaño debe migrarse el proveedor.
- SourceForge no publica un SLA/capacidad fija para FRS y puede pedir reducir almacenamiento; 5 GB es su guía ideal, por lo que conservar muchas ISO de 3,4 GB requiere consultarles o migrar.
- La firma ISO local es una advertencia; una ISO híbrida válida puede no coincidir con una comprobación simple.
- No se configura OAuth social del panel sin credenciales reales del proveedor. Supabase Auth por correo y RLS sí están implementados.
