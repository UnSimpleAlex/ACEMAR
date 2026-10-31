# Plan de aceptación

## Datos y concurrencia

1. Dos solicitudes diferentes compiten por una última unidad: una confirma y otra falla; saldo final cero.
2. Reenvío de una misma clave idempotente y contenido: misma venta; contenido diferente: conflicto.
3. Venta repartida entre lotes: costo y asignación histórica por lote.
4. Error al final de un comando: ninguna escritura parcial.
5. Abonos concurrentes: deuda nunca negativa y recibos sin duplicación.
6. Corrección: revierte consumos originales, conserva historial y motivo, aplica los factores históricos.

## Autorización

Anon sin tablas comerciales; identidad sin perfil sin acceso; vendedor sin costos/deudas/administración; administrador con funciones específicas. Probar con roles y JWT reales, no solo project_admin.

## Interfaz

Acceso, estados vacíos, validación, carga, error y reintento. PC 1440, tablet 834, celular 390 y 320 px, navegación por teclado, foco y zoom. Confirmación financiera solo después del commit del servidor. Fallo de documento no revierte una venta ya confirmada.

## Preparación de producción

Sin datos ficticios ni usuarios predeterminados. Bootstrap administrativo por operador autorizado. Verificar configuración de sesiones, recuperación de acceso, CORS, MFA disponible, cabeceras, políticas de Storage, tamaño de archivos, backup y restauración. No habilitar producción sin esta revisión.
