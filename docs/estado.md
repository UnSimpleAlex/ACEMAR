# Estado verificable

Fecha: 31/10/2026. Referencia funcional WPF: e6a97dd535e109f8a7aa83eafec192a03cfed12d.

## Alcance

| Pantallas | Implementación | Verificación pendiente |
|---|---|---|
| Acceso | SDK, campos, validación, mostrar clave, perfil autorizado | Cuenta real, sesión, recuperación |
| Resumen / Caja | RPC, período, totales y arqueo | Recorrido autenticado y conciliación operativa |
| POS / Cobro / Error / Confirmación | Carrito, unidades, contado/crédito, RPC atómico | Concurrencia real y prueba completa remota |
| Productos / Formulario / Unidades | Crear, editar, factores históricos independientes | Precios masivos y carga de imagen |
| Lotes / Formulario | Entrada atómica, proveedor, stock, cierre de agotados | Navegador remoto |
| Existencias | Catálogo paginado, consulta y mínimos | Filtro por estado |
| Proveedores / Formulario | Crear, editar, borrar sin dependencias | Navegador remoto |
| Créditos / Cliente / Abono | Crédito autorizado, límite, saldo, abono idempotente | Navegador remoto y pruebas concurrentes |
| Ventas / Corrección / Auditoría | Consulta, revisión, factor histórico, motivo y anulación | Navegador remoto; visualización más detallada de eventos no financieros |
| Proformas | Guardar, detalle, anular, cargar y vincular venta | Prueba remota de conversión y cambios de precio |
| Usuarios / Formulario | Asociar y editar perfil de vendedor existente | Creación de identidad y gestión de credenciales desde app |
| Asistente | Reglas locales con indicadores actuales | Servicio externo Gemini sin configurar |

Exportaciones: CSV de página visible y PDF mediante impresión del navegador. No equivalen a XLSX o generación PDF del servidor. Caja es resumen, no una sesión completa. No SUNAT ni pasarelas.

## Comprobaciones

- 9 pruebas de PostgreSQL aislado con PGlite: inicialmente correctas; se repiten después de cada cambio relevante.
- 7 pruebas de interfaz e importes con Vitest: correctas.
- Compilación, tipos y lint ejecutados; ver informe de entrega/PR para resultado final.
- Pantalla de acceso observada en navegador real. No se han observado todas las pantallas autenticadas ni las tres dimensiones.
- Migraciones aplicadas a acemar-dev; tablas inicialmente vacías.
- Generación de ilustración y conversión WebP; subida y metadatos confirmados.
- npm audit identifica 3 entradas altas derivadas de un único aviso transitivo en Zod del SDK. No ignorado ni suprimido.

## Bloqueo de permisos

La revisión automática bloqueó la recuperación de API_KEY administrativa. No se obtuvo ni se buscó por otra ruta. Por ello no se crearon identidades temporales mediante la API administrativa ni se ejecutó la prueba remota autenticada/concurrente. No existe una cuenta administrativa de negocio predeterminada.

No se ha desplegado frontend en producción ni se han mezclado ramas. La implementación debe permanecer en un PR en borrador hasta resolver los bloqueos y completar las comprobaciones pendientes.
