-- ============================================================================
-- DylanOS — Sistema de versiones (Crimson)
-- 002: marcador de compatibilidad para instalaciones anteriores.
--
-- La arquitectura de producción usa SourceForge FRS. No se crea un bucket de
-- Supabase Storage automáticamente: hacerlo daría una falsa impresión de que
-- el límite global del proyecto está preparado para ISOs de varios GiB.
-- Consulta docs/version-system-architecture.md antes de migrar un despliegue
-- antiguo que ya use el bucket `dylanos-iso`.
-- ============================================================================

select 1;
