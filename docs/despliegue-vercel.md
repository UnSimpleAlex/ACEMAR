# Despliegue de ACEMAR en Vercel

Vercel aloja únicamente el frontend React/Vite. PostgreSQL, autenticación, imágenes, PDF privados, Gemini y SMTP continúan en el proyecto InsForge existente `acemar-dev`. Importar el repositorio no crea ni migra una base de datos. Este primer lanzamiento conserva datos DEMO; no es facturación electrónica SUNAT.

## Importación

1. Vercel → Add New → Project → importar `UnSimpleAlex/ACEMAR`.
2. Framework: **Vite**. Root Directory: **raíz del repositorio (`./`)**, NO `apps/web`.
3. Install Command: `npm ci`. Build Command: `node scripts/build-published.mjs`. Output Directory: `dist`. Node.js: **24.x** (el CI usa 24).
4. Production Branch: `main`. Los PR y `develop` pueden generar previews.
5. Configurar las dos variables siguientes para Production. Solo habilitar Preview si esas pruebas deben acceder a los mismos datos reales/DEMO.
6. Deploy. Al cambiar variables, volver a desplegar: Vite las inserta durante el build.

| Variable Vercel          | Valor                                                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `VITE_INSFORGE_URL`      | `https://beft7ipm.us-east.insforge.app`                                                                            |
| `VITE_INSFORGE_ANON_KEY` | Clave pública ANON del mismo proyecto, disponible en la conexión/SDK de InsForge. No usar API_KEY ni User API Key. |

Estas variables son públicas por diseño: el navegador puede leerlas. La autorización real depende de sesión, RLS, permisos de funciones y Storage. Nunca colocar secretos con prefijo `VITE_`.

`vercel.json` incluye fallback de React Router, cabeceras de seguridad y CSP que permite exactamente el API y host de funciones de este proyecto. Vercel sirve los archivos estáticos existentes antes del fallback. Las imágenes de productos permanecen en InsForge.

## Autorizar el dominio definitivo en InsForge

Cuando Vercel asigne el dominio, copiar su **origen exacto HTTPS**, sin ruta ni barra final. En los secretos de funciones de InsForge configurar:

```text
ALLOWED_WEB_ORIGINS=https://DOMINIO-REAL.vercel.app
```

Se admiten varios orígenes exactos separados por coma, por ejemplo producción y un dominio estable de staging. No usar `*.vercel.app`, una URL de GitHub ni autorizar todos los previews de otros usuarios. Los dominios aleatorios de previews no quedan automáticamente autorizados. El dominio original de Sites y localhost:5173 continúan admitidos.

El secreto es leído por `acemar-assistant`, `acemar-product-image` y `acemar-receipt`. Si los cambios de secretos no se aplican a una ejecución ya desplegada, volver a desplegar esas funciones. En la configuración de autenticación/CORS de InsForge, cuando exista restricción de dominio o redirect URL, añadir también el mismo origen final. Probar inicio/cierre de sesión, recuperación, lectura y escritura autorizadas desde ese origen; la configuración exacta de sesión de producción requiere comprobarse en el dominio real.

Las funciones se empaquetan antes de desplegar (incluyen `web-origins.mjs`):

```bash
node scripts/build-receipts.mjs
npx @insforge/cli functions deploy acemar-assistant --file .insforge/functions/acemar-assistant.mjs
npx @insforge/cli functions deploy acemar-product-image --file .insforge/functions/acemar-product-image.mjs
npx @insforge/cli functions deploy acemar-receipt --file .insforge/functions/acemar-receipt.mjs
```

No desplegar los fuentes con imports relativos sin empaquetar. Las migraciones existentes ya se aplicaron al proyecto vinculado: no volver a cargarlas ni ejecutar seeds sobre producción para publicar el frontend.

## Secretos que permanecen SOLO en InsForge

- `API_KEY`, `ANON_KEY`: credenciales del runtime; jamás trasladar la administrativa a Vercel.
- `GEMINI_API_KEY`: clave privada del modelo.
- `RECEIPT_SIGNING_KEY`: firma de boletas. No rotar sin plan de compatibilidad para documentos emitidos.
- `MAIL_SMTP_HOST=smtp-relay.brevo.com`, `MAIL_SMTP_PORT=587`.
- `MAIL_SMTP_USER`: usuario SMTP de Brevo; `MAIL_SMTP_PASS`: su clave SMTP.
- `MAIL_FROM=ACEMAR <unsimplealex@gmail.com>` (remitente verificado).
- `ALLOWED_WEB_ORIGINS`: lista anterior.

Las claves privadas no se documentan ni se versionan. Publicar en Vercel **no cambia la IP de salida SMTP de InsForge** ni resuelve el rechazo Brevo 525; conservar su protección y autorizar únicamente IP verificadas o acordar salida estable con el proveedor.

## Validación y rollback

- Acceso directo y recarga de una ruta interna de React Router.
- Fuentes, logo, iconos y fotos sin errores CSP.
- Login, consulta de inventario, IA, subida de foto y PDF con permisos reales.
- Correo: comprobar aceptación del proveedor y recepción; no repetir automáticamente envíos inciertos.
- El build aborta si falta una variable pública o la URL no es HTTPS.
- Para rollback, restaurar un deployment anterior de Vercel. No revertir datos o migraciones automáticamente.

## Flujo de ramas de esta entrega

`chore/25-preparar-vercel-release` → PR a `develop` → `release/0.1.0` → PR a `main` → sincronizar `main` a `develop`.

El historial de las ramas anteriores es acumulativo. Integrar el último commit incorpora todos los módulos sin squash ni pérdida de commits. Las ramas históricas se conservan. Los PR apilados anteriores quedan cerrados como incorporados por esta integración.

Limitación conocida: el SDK 1.5.2 depende transitivamente de Zod 3 y el auditor reporta GHSA-mrhx-c7xc-m3w5 (tres entradas de la misma cadena). No se fuerza un salto incompatible a Zod 4 ni se suprime el control de seguridad. Consultar el resultado actualizado del CI y resolver upstream antes de considerar este prototipo aprobado para producción real.
