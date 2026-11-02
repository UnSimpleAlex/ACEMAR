# Boletas verificables y demostración

La descarga de una venta se genera en `acemar-receipt` usando exclusivamente el detalle autorizado del servidor. Cada revisión tiene un código aleatorio de 64 caracteres hexadecimales. El PDF contiene QR, revisión, importe y huella del contenido; sus bytes se guardan en el bucket **privado** `acemar-receipts`. SHA-256 identifica el PDF original y HMAC-SHA256 vincula código, contenido y archivo mediante `RECEIPT_SIGNING_KEY`, secreto solo del backend. No rotar esa clave sin un procedimiento para documentos anteriores.

El QR abre `acemar-verify-receipt`, público para quien posee el código, sin exponer clientes, contactos, artículos ni archivos. Indica vigencia, reemplazo por corrección o anulación. Comparar visualmente importe y estado no verifica todos los campos: el cliente puede seleccionar el PDF recibido; su navegador calcula SHA-256 y envía solo la huella. Un QR copiado a un archivo manipulado no supera esta comprobación. No equivale a firma digital certificada ni comprobante electrónico SUNAT.

La emisión comprueba sesión, propiedad de la venta o rol administrador y revisión vigente. Las tablas y helpers de finalización, validación y entregas no tienen acceso directo para usuarios autenticados ni anónimos. La finalización conserva un único original por revisión y descarta cargas sobrantes en carreras concurrentes. La descarga vuelve a comprobar firma y bytes. La consulta pública usa CSP y no almacena caché.

## Correo

La venta permite indicar destinatario, descargar un `.eml` profesional con HTML/texto y el mismo PDF adjunto, o enviarlo desde el backend cuando existe remitente SMTP. Configurar como secretos de InsForge: `MAIL_SMTP_HOST`, `MAIL_SMTP_PORT` (465 TLS o 587 STARTTLS), `MAIL_SMTP_USER`, `MAIL_SMTP_PASS`, `MAIL_FROM`. El proveedor debe verificar el remitente/dominio y configurar SPF, DKIM y DMARC. No introducir secretos en VITE ni Git. Las credenciales SMTP todavía no están configuradas: el botón de envío muestra este estado sin fingir éxito.

El backend valida destinatarios, rechaza dominios de prueba `.invalid`, usa TLS 1.2 mínimo, registra estado/idempotencia, bloquea duplicados durante cinco minutos y limita **correos salientes** a 20 por administrador en 24 horas para evitar abuso. Este control no limita consultas de IA. Un timeout SMTP puede ocurrir después de la aceptación del mensaje: se muestra estado desconocido y no se reintenta automáticamente. Aceptación SMTP no garantiza entrega en bandeja; no hay tracking de rebotes ni cola durable todavía.

## Demostración

`data/demo` amplía el catálogo con 16 productos, imágenes WebP transparentes generadas, proveedores, clientes, ventas al contado/crédito, abonos, proformas y arqueo. Los datos ficticios se marcan DEMO y utilizan direcciones `example.invalid`. No son facturas ni documentos legales. El stock y los precios del catálogo anterior se conservan. La carga transaccional y su marcador impiden duplicados y reposiciones al repetir.

`scripts/import-demo.mjs --apply` requiere `ACEMAR_SEED_ACTOR` y el proyecto acemar-dev. Usa un operador temporal autenticado, procedimiento de una sola ejecución autorizado por rol y auditoría; luego conserva la atribución al administrador que autorizó la carga y elimina operador/procedimiento. Nunca cambia la contraseña del propietario ni envía correos. `scripts/live-receipt-smoke.mjs`, con `ACEMAR_LIVE_TESTS=1`, usa y limpia solo sus propios registros y archivos temporales.

Las proformas abiertas o canceladas pueden eliminarse con confirmación y snapshot de auditoría; las vinculadas a una venta se conservan.
