# Estado verificable

Fecha: 01/11/2026. Referencia funcional WPF: e6a97dd535e109f8a7aa83eafec192a03cfed12d.

## Alcance

| Pantallas                          | Implementación                                           | Verificación pendiente                                                                         |
| ---------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Acceso                             | SDK, campos, perfil autorizado y recuperación por código | Cuenta administradora habilitada; completar contraseña y recorrido de usuario                  |
| Resumen / Caja                     | RPC, período, totales y arqueo                           | Recorrido autenticado y conciliación operativa                                                 |
| POS / Cobro / Error / Confirmación | Carrito, unidades, contado/crédito, RPC atómico          | Recorrido completo en navegador autenticado; concurrencia remota de última unidad ya probada   |
| Productos / Formulario / Unidades  | Crear, editar, factores históricos independientes        | Precios masivos y formulario de carga de imagen; 12 ilustraciones WebP importadas por operador |
| Lotes / Formulario                 | Entrada atómica, proveedor, stock, cierre de agotados    | Navegador remoto                                                                               |
| Existencias                        | Catálogo paginado, consulta y mínimos                    | Filtro por estado                                                                              |
| Proveedores / Formulario           | Crear, editar, borrar sin dependencias                   | Navegador remoto                                                                               |
| Créditos / Cliente / Abono         | Crédito autorizado, límite, saldo, abono idempotente     | Navegador remoto y pruebas concurrentes                                                        |
| Ventas / Corrección / Auditoría    | Consulta, revisión, factor histórico, motivo y anulación | Navegador remoto; visualización más detallada de eventos no financieros                        |
| Proformas                          | Guardar, detalle, anular, cargar y vincular venta        | Prueba remota de conversión y cambios de precio                                                |
| Usuarios / Formulario              | Asociar y editar perfil de vendedor existente            | Creación de identidad y gestión de credenciales desde app                                      |
| Asistente                          | Reglas locales con indicadores actuales                  | Servicio externo Gemini sin configurar                                                         |

Exportaciones: XLSX de la página visible y PDF descargable de ventas/proformas, generados en navegador. No equivalen a generación/persistencia de documentos en servidor. Caja es resumen, no una sesión completa. No SUNAT ni pasarelas.

## Comprobaciones actualizadas

- 30 pruebas de interfaz, importes, recuperación, cierre de sesión y archivos reales (Vitest): correctas.
- 13 pruebas de PostgreSQL aislado (PGlite): correctas.
- 9 comprobaciones autenticadas contra InsForge real: correctas, incluida venta concurrente de la última unidad, reintento, autorización y restitución de lote.
- Cuentas y datos de prueba eliminados; se comprobaron cero perfiles, productos, ventas y lotes en el backend al terminar.
- Las 3 pruebas de acceso responsive y accesibilidad del primer CI pasaron en PC, tablet y celular. El siguiente CI también superó 6 pruebas de acceso y recuperación, distribuidas en PC/tablet/celular.
- Compilación, tipos y lint correctos; audit de dependencias sigue bloqueado por el aviso transitivo del SDK.
- Storage y metadatos confirmados; generación WebP optimizada.
- El último advisor dejó 15 avisos de funciones privilegiadas y 2 informativos, sin advertencias de índices ni tablas sin políticas. No se suprimieron observaciones.

## Credenciales y preparación de uso real

El usuario autorizó el uso de API_KEY exclusivamente en servidor para pruebas. Se recuperó sin mostrarla ni incorporarla a Git; se eliminó su copia local después de las pruebas. No se relajó la verificación de correo ni se habilitó registro público.

La primera cuenta administrativa fue habilitada con el correo elegido explícitamente por el usuario. Se comprobó la correspondencia entre identidad y perfil admin y se solicitó recuperación; falta que el usuario establezca su contraseña y complete el recorrido autenticado. La clave administrativa temporal fue eliminada. Creación de identidades desde app, carga de fotos validada en servidor, Gemini externo y operación completa siguen pendientes en #3. La alerta de dependencia permanece en #2.

Se publicó una vista previa privada en https://acemar-preview.braceddog.chatgpt.site con acceso mediante ChatGPT y autenticación adicional de ACEMAR. Es una versión de evaluación, no una aprobación de uso operativo. No se han mezclado ramas. Mantener los PR en borrador hasta completar la revisión.

Continuación #5: UUID v4 con alternativa criptográfica para navegadores que no exponen randomUUID en HTTP; pantalla de recuperación ante errores de renderizado sin mostrar detalles internos. Cinco pruebas de regresión nuevas. Estos cambios ya fueron publicados en la vista alojada. La continuación está en feature/7-catalogo-imagenes: catálogo de evaluación, carga de WebP por operador y recuperación de imágenes en POS y detalles.

## Catálogo de evaluación (#7)

Se importaron 12 productos basados en el seed original, con unidad base, lote inicial, costo al 70 %, movimiento de entrada y auditoría. Las 12 imágenes ilustrativas generadas están en InsForge Storage, WebP 640 × 640, 206.422 bytes en conjunto. Se comprobaron remotamente tipo, firma, longitud y SHA-256 de los 12 objetos. Los metadatos y la procedencia están en data/evaluation y docs/catalogo-evaluacion.md.

No se importaron ventas, pagos, deudas ni usuarios de prueba del WPF. Las categorías están documentadas en el manifiesto; el filtro de categorías no se ha implementado en la aplicación. Las unidades alternativas de arena quedan pendientes de una regla comercial consistente. El formulario de subida segura por usuarios, precios masivos, Gemini externo y recorrido autenticado completo siguen pendientes.

## Presentación y exportaciones (#9)

Productos y Existencias incorporan miniaturas en los listados y tarjetas móviles. Exportar Excel adapta las tipografías y la distribución del archivo de referencia: marca ACEMAR, azul, indicadores, tabla y hojas principal/Resumen/Datos. Las imágenes se incrustan en el documento. Exportar PDF añade inventario con miniaturas, fichas y tablas A4 con marca, fuentes libres incrustadas y paginación. El PDF descargado se imprime desde su visor; no imprime los controles de la interfaz.

Los reportes siguen limitados a la página visible y sus filtros. El valor mostrado es a precio de venta y no costo contable. Validación: 30 pruebas locales, tipos, lint y compilación; revisión visual de las tres hojas y de PDF paginados. El audit mantiene las mismas tres entradas de la cadena del SDK, sin hallazgo nuevo para fontkit. Ver docs/reportes.md.

## Afinado visual (#11)

Las 12 ilustraciones se editan para retirar el fondo y se publican como WebP RGBA 640 × 640 (524.308 bytes en conjunto); el fondo lo controla CSS. Se preserva transparencia en las miniaturas exportadas. Se conservan los objetos anteriores y las nuevas asociaciones no modifican precios ni stock. El PDF centra verticalmente encabezados y contenido. El Excel recupera los iconos originales y dos gráficos nativos editables (barras y dona), con series vinculadas al Resumen y datos reales de la página exportada. Verificación: 30 pruebas, tipos, lint, compilación, lectura independiente de ambos gráficos y revisión visual de las hojas y PDF.
