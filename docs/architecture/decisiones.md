# Arquitectura ACEMAR

Aplicación privada React/TypeScript con Vite y backend InsForge. La referencia funcional es el sistema WPF (commit e6a97dd535e109f8a7aa83eafec192a03cfed12d); las 72 referencias representan 24 pantallas × 3 dispositivos, no páginas duplicadas.

## Fronteras

- Presentación: componentes, formularios y navegación.
- Aplicación: casos de uso y contratos validados.
- Infraestructura: adaptadores del SDK; sin claves administrativas en el navegador.
- PostgreSQL: autorización, restricciones, idempotencia, bloqueos y comandos atómicos.
- Storage: archivos; PostgreSQL almacena sus metadatos.

No habrá acceso de demostración que eluda autenticación. El registro de una identidad no concede acceso al negocio: un perfil debe ser autorizado por administración. Las tablas financieras no admiten DML directo de clientes.

## Decisiones comerciales iniciales

- PEN, dos decimales monetarios; cantidades base con seis decimales. Redondeo de cada línea a dos decimales.
- Unidades y factores históricos se guardan por línea de venta.
- FIFO por fecha de ingreso e ID; precio base vigente = mayor precio de los lotes activos disponibles × factor de presentación.
- El carrito no reserva stock. Se revalida al confirmar.
- Venta confirmada y anulada son estados distintos. Una corrección requiere motivo y máximo 30 días; no se aplica ese límite a la anulación.
- Cerrar un lote con stock se rechaza: requiere un futuro proceso explícito de ajuste con trazabilidad, no hacer desaparecer stock.
- Crédito y caja son administrativos; vendedor puede vender a crédito a clientes autorizados mediante un selector con proyección mínima, sin consultar deudas.
- No se integra SUNAT, pasarelas ni vencimientos.
- No hay confirmación offline. Reintentos conservan la clave idempotente.

## Seguridad y validación

Modelo de amenazas: robo de sesión, XSS, escalada de rol, acceso por ID ajeno, alteración de precios/totales, ventas concurrentes, duplicación por reintentos y fuga de costos/deudas. Las mitigaciones requieren pruebas de privilegios reales, no consultas ejecutadas únicamente como project_admin.

Una revisión automatizada no certifica seguridad o WCAG. Producción requiere revisión de permisos, recuperación, MFA soportado por el proveedor y verificación de sesiones/CORS en el dominio final.
