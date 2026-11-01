# Estado verificable

Fecha: 31/10/2026. Referencia funcional WPF: e6a97dd535e109f8a7aa83eafec192a03cfed12d.

## Alcance

| Pantallas                          | Implementación                                           | Verificación pendiente                                                                       |
| ---------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Acceso                             | SDK, campos, perfil autorizado y recuperación por código | Primera cuenta real y entrega del correo                                                     |
| Resumen / Caja                     | RPC, período, totales y arqueo                           | Recorrido autenticado y conciliación operativa                                               |
| POS / Cobro / Error / Confirmación | Carrito, unidades, contado/crédito, RPC atómico          | Recorrido completo en navegador autenticado; concurrencia remota de última unidad ya probada |
| Productos / Formulario / Unidades  | Crear, editar, factores históricos independientes        | Precios masivos y carga de imagen                                                            |
| Lotes / Formulario                 | Entrada atómica, proveedor, stock, cierre de agotados    | Navegador remoto                                                                             |
| Existencias                        | Catálogo paginado, consulta y mínimos                    | Filtro por estado                                                                            |
| Proveedores / Formulario           | Crear, editar, borrar sin dependencias                   | Navegador remoto                                                                             |
| Créditos / Cliente / Abono         | Crédito autorizado, límite, saldo, abono idempotente     | Navegador remoto y pruebas concurrentes                                                      |
| Ventas / Corrección / Auditoría    | Consulta, revisión, factor histórico, motivo y anulación | Navegador remoto; visualización más detallada de eventos no financieros                      |
| Proformas                          | Guardar, detalle, anular, cargar y vincular venta        | Prueba remota de conversión y cambios de precio                                              |
| Usuarios / Formulario              | Asociar y editar perfil de vendedor existente            | Creación de identidad y gestión de credenciales desde app                                    |
| Asistente                          | Reglas locales con indicadores actuales                  | Servicio externo Gemini sin configurar                                                       |

Exportaciones: XLSX de la página visible y PDF descargable de ventas/proformas, generados en navegador. No equivalen a generación/persistencia de documentos en servidor. Caja es resumen, no una sesión completa. No SUNAT ni pasarelas.

## Comprobaciones actualizadas

- 19 pruebas de interfaz, importes, recuperación, cierre de sesión y archivos reales (Vitest): correctas.
- 9 pruebas de PostgreSQL aislado (PGlite): correctas.
- 9 comprobaciones autenticadas contra InsForge real: correctas, incluida venta concurrente de la última unidad, reintento, autorización y restitución de lote.
- Cuentas y datos de prueba eliminados; se comprobaron cero perfiles, productos, ventas y lotes en el backend al terminar.
- Las 3 pruebas de acceso responsive y accesibilidad del primer CI pasaron en PC, tablet y celular. El siguiente CI también superó 6 pruebas de acceso y recuperación, distribuidas en PC/tablet/celular.
- Compilación, tipos y lint correctos; audit de dependencias sigue bloqueado por el aviso transitivo del SDK.
- Storage y metadatos confirmados; generación WebP optimizada.
- El último advisor dejó 15 avisos de funciones privilegiadas y 2 informativos, sin advertencias de índices ni tablas sin políticas. No se suprimieron observaciones.

## Credenciales y preparación de uso real

El usuario autorizó el uso de API_KEY exclusivamente en servidor para pruebas. Se recuperó sin mostrarla ni incorporarla a Git; se eliminó su copia local después de las pruebas. No se relajó la verificación de correo ni se habilitó registro público.

Falta elegir y habilitar la primera cuenta administrativa real. La autorización para pruebas no se utilizó para crear una cuenta permanente con datos inferidos. Creación de identidades desde app, carga de fotos validada en servidor, Gemini externo y operación completa siguen pendientes en #3. La alerta de dependencia permanece en #2.

Se publicó una vista previa privada en https://acemar-preview.braceddog.chatgpt.site con acceso mediante ChatGPT y autenticación adicional de ACEMAR. Es una versión de evaluación, no una aprobación de uso operativo. No se han mezclado ramas. Mantener los PR en borrador hasta completar la revisión.

Continuación #5: UUID v4 con alternativa criptográfica para navegadores que no exponen randomUUID en HTTP; pantalla de recuperación ante errores de renderizado sin mostrar detalles internos. Cinco pruebas de regresión nuevas. Estos cambios están en fix/5-recuperacion-vista-previa y todavía no se han publicado en la vista alojada. La cuenta administradora sigue pendiente del correo elegido por el usuario.
