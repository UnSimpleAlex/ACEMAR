# ACEMAR 0.1.0 — primera entrega web

## Incluido

- Aplicación responsive de ventas e inventario con autenticación y perfiles en InsForge.
- Productos con fotos WebP, unidades, proveedores, lotes, existencias y datos DEMO.
- Ventas contado/crédito, abonos, proformas, corrección y anulación con trazabilidad.
- PDF verificable por código/QR y firma, correo con PDF privado, reportes Excel con gráficos e imágenes.
- Asistente Gemini, acciones responsive y mejoras de formularios.
- Configuración Vercel con build validado, CSP y CORS por orígenes exactos.

## Verificación de integración

48 pruebas de frontend y 29 de backend aprobadas, TypeScript, lint y build de publicación correctos. Se conserva el historial de commits atómicos de las ramas anteriores.

## Límites conocidos

- Se conserva el backend `acemar-dev` y sus datos DEMO; no se crea un entorno aislado de producción.
- El correo depende de que Brevo autorice la IP de salida real de InsForge; una aceptación SMTP anterior no garantiza envíos futuros ni entrega en bandeja.
- El documento interno con QR no es comprobante electrónico SUNAT ni firma digital certificada.
- npm audit reporta tres alertas altas en la cadena SDK → shared-schemas → Zod 3 (GHSA-mrhx-c7xc-m3w5). El SDK actual no ofrece corrección compatible. No se oculta la alerta ni se fuerza Zod 4.
- Falta validar login, sesión, recuperación y permisos desde el dominio final de Vercel, añadirlo a ALLOWED_WEB_ORIGINS y comprobar backup/restauración antes de uso real.

Instrucciones de publicación: [despliegue-vercel.md](despliegue-vercel.md).
