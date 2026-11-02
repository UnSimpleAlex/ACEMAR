# Activar el correo de boletas en ACEMAR

La función `acemar-receipt` ya construye el correo profesional y adjunta el PDF privado original. Requiere un servicio SMTP y un remitente autorizado. Añadir los siguientes valores como **secrets del proyecto acemar-dev en InsForge**, no como variables VITE ni archivos del repositorio.

## Opción para remitente comercial: Brevo

1. Crear una cuenta y habilitar el correo transaccional.
2. Añadir y verificar el remitente real. Para usar dominio propio, completar la autenticación DNS que indique Brevo (incluidos DKIM/DMARC y cualquier registro exigido por el proveedor). No inventar el dominio de ACEMAR.
3. Abrir la configuración SMTP y copiar **SMTP login**. Crear una **clave SMTP**, diferente de la API key de Brevo.
4. Configurar estos secrets:

| Secret | Valor |
| --- | --- |
| `MAIL_SMTP_HOST` | `smtp-relay.brevo.com` |
| `MAIL_SMTP_PORT` | `587` |
| `MAIL_SMTP_USER` | Login SMTP que muestra Brevo |
| `MAIL_SMTP_PASS` | Clave SMTP generada |
| `MAIL_FROM` | `ACEMAR <correo-remitente-verificado@tu-dominio-real>` |

El puerto 587 usa STARTTLS obligatorio; 465 usa TLS desde el inicio. El servidor exige TLS 1.2 o posterior. Después de guardar los secrets, volver a desplegar `acemar-receipt` si la plataforma no los carga automáticamente, comprobar la disponibilidad y realizar un envío controlado al destinatario autorizado. Revisar los logs del proveedor para confirmar entrega, no solo aceptación SMTP.

## Alternativa para pruebas con Gmail

Si la cuenta lo permite, activar verificación en dos pasos y crear una contraseña de aplicación. Configurar `MAIL_SMTP_HOST=smtp.gmail.com`, puerto `587`, usuario igual al correo completo de Gmail, contraseña de aplicación en `MAIL_SMTP_PASS` y `MAIL_FROM=ACEMAR <el-mismo-correo@gmail.com>`. No usar la contraseña habitual de Google. Algunas cuentas administradas o con Protección Avanzada no permiten contraseñas de aplicación; en ese caso usar un proveedor SMTP compatible o implementar OAuth antes de conectar Gmail.

## Estado y alcance

Sin estos secrets no se simula un envío exitoso: se ofrece descargar un `.eml` con el PDF adjunto. La integración de envío y TLS está implementada, pero no puede comprobarse contra un servidor SMTP real hasta configurarlo. Nunca enviar pruebas a clientes ficticios ni direcciones `.invalid`. La aceptación SMTP no garantiza que el correo llegue a la bandeja de entrada. La protección contra doble envío y el registro de entregas ya están implementados.

Documentación oficial:
- https://help.brevo.com/hc/es/articles/7924908994450-Enviar-emails-transaccionales-con-Brevo-SMTP
- https://help.brevo.com/hc/es/articles/7959631848850-Crear-y-administrar-claves-SMTP
- https://support.google.com/mail/answer/185833?hl=es
- https://support.google.com/a/answer/176600?hl=es
