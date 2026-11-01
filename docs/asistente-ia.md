# Asistente Gemini

La interfaz invoca `acemar-assistant` mediante el SDK y la sesión actual. La función en InsForge valida método, origen, sesión, longitud y perfil administrador. No confía en cifras enviadas por el navegador: obtiene contexto mediante `acemar_assistant_context()`.

La clave se guarda exclusivamente como secreto `GEMINI_API_KEY` en InsForge. No se usa prefijo VITE, no se devuelve al cliente y no se almacena en Git. El modelo configurado es `gemini-3.5-flash`, comprobado con una respuesta real de Google. La selección debe revisarse si Google retira ese modelo; no se cambia silenciosamente a un proveedor diferente.

## Datos y límites

El contexto incluye fecha de Lima, resumen de ventas del día, contado, abonos, deuda total e indicadores de existencias; añade hasta diez productos con stock bajo con código, nombre, unidad, mínimo y stock. No envía identidades/contactos de clientes ni proveedores, credenciales o líneas de venta individuales. El texto que el propio usuario escriba en su pregunta sí se envía a Google.

Las recomendaciones se limitan al contexto actual: no equivalen a una predicción de demanda, utilidad contable ni decisión automática. El asistente no dispone de herramientas para crear ventas, modificar inventario o conceder créditos. Los textos se muestran como texto plano, sin HTML generado.

Una fila de cuota por administrador aplica 20 solicitudes por hora y 100 por día mediante UPSERT atómico. Las preguntas y respuestas no se guardan en esa tabla. Una consulta autorizada consume cuota aunque el proveedor falle; no se reintenta automáticamente para evitar consumos duplicados. La salida tiene un máximo de 1500 tokens y la solicitud externa un límite de 25 segundos. Google puede aplicar cuotas adicionales.

## Operación

La función está en `functions/acemar-assistant.mjs`; la migración aditiva en `migrations/20261101150635_assistant-gemini-context.sql`. Para desplegar cambios se usa `npx -y @insforge/cli functions deploy acemar-assistant --file functions/acemar-assistant.mjs`. El secreto debe introducirse mediante la gestión de secretos de InsForge, nunca en archivos públicos.

El origen publicado permitido es la vista previa ACEMAR, además de localhost/127.0.0.1:5173 para desarrollo. Si cambia el dominio hay que actualizar la lista explícita. La autorización del servidor se mantiene aunque un cliente no envíe Origin.

Validación: pruebas locales de sesión, permisos, cuota, contexto del servidor, errores del proveedor e interfaz; respuesta real del modelo. La prueba completa desde la sesión administrativa del usuario sigue pendiente, porque no se conoce ni se restablece su contraseña.
