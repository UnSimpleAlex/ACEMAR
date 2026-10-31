# ACEMAR Web

Aplicación privada de ventas e inventario para ferretería. React + TypeScript + Vite, con InsForge/PostgreSQL. Identidad azul y naranja basada en las 24 pantallas y estados aprobados para PC, tablet y celular.

**Estado: implementación inicial en revisión, no preparada para producción.** El frontend y los comandos SQL están implementados; faltan la primera cuenta administrativa, pruebas autenticadas contra InsForge y la revisión visual completa de todos los dispositivos. No existe un acceso de demostración ni datos comerciales ficticios en el backend.

## Ejecutar

Requiere Node 24 y npm.

```bash
npm ci
cp .env.example .env.local
# Completar VITE_INSFORGE_URL y VITE_INSFORGE_ANON_KEY con los valores públicos del proyecto vinculado.
npm run dev
```

`npm run dev` sirve por defecto en `127.0.0.1`. En una máquina propia, puede usarse `npm run dev -- --host 0.0.0.0` para revisar desde la red local. No expongas un servidor de desarrollo a Internet.

```bash
npm run typecheck
npm run lint
npm test
npm run db:test
npm run build
```

`db:test` ejecuta PostgreSQL mediante PGlite, con esquemas de autenticación y Storage mínimos exclusivos de pruebas. Verifica SQL real, transacciones y privilegios locales. **No prueba concurrencia multi-conexión, cookies del proveedor ni autenticación real de InsForge.**

## Backend

Proyecto de desarrollo creado: `acemar-dev`, región `us-east`. La vinculación local `.insforge/project.json` y las credenciales se excluyen de Git. No contiene datos reales del negocio.

Sigue `AGENTS.md` y las habilidades oficiales de InsForge. Desde un checkout autorizado:

```bash
npx -y @insforge/cli login
npx -y @insforge/cli link --project-id 2ce08e4d-e48d-4377-8228-2911916fc828 --org-id 875463e3-3c76-4e61-bbf0-698c2b330a8e
npx -y @insforge/cli db migrations list
npx -y @insforge/cli db migrations up --all
```

No crees otro proyecto si ya tienes el directorio vinculado. Las migraciones están en `migrations/`, como requiere el CLI. No edites migraciones aplicadas: crea una nueva.

Configuración aplicada en desarrollo: registro público deshabilitado, correo verificado, contraseña mínima de 12 caracteres y archivos limitados a 2 MB. Deben definirse los dominios finales antes de desplegar.

### Primera cuenta

Un operador autorizado debe crear una identidad en el panel de autenticación de InsForge con su correo y contraseña elegidos de forma privada. Luego debe crear el perfil administrativo mediante el CLI, sustituyendo el UUID real y el nombre:

```sql
INSERT INTO public.profiles(id,name,role,counter)
VALUES ('UUID-DE-LA-IDENTIDAD','Nombre del administrador','admin',1);
```

No existe una cuenta predeterminada. El rol no se toma de metadatos editables por el usuario. El módulo Usuarios puede asociar o editar perfiles de vendedor para identidades ya creadas; crear identidades y gestionar sus contraseñas desde la aplicación sigue pendiente de una función administrativa segura.

## Funcionalidades implementadas en código

- Acceso con el SDK y carga inicial de sesión.
- Catálogo paginado y búsqueda por nombre/código.
- Productos y unidades/presentaciones con factores.
- Proveedores y entradas por lotes.
- Consulta de existencias.
- Ticket, validación de cantidad, cobro contado/crédito y confirmación.
- Venta SQL atómica, precio máximo de lotes activos y consumo FIFO multilote.
- Idempotencia y bloqueos de productos/clientes.
- Historial y detalle de ventas.
- Corrección de cantidades con factores históricos, revisión y motivo.
- Anulación con restitución de consumos y auditoría.
- Clientes, límite de crédito, abonos y saldos derivados.
- Proformas sin reserva y conversión vinculada a venta.
- Resumen por período y arqueo de día con importe contado.
- Auditoría y consultas administrativas.
- Asistente local por reglas, sin llamadas externas.
- Exportación CSV de la página filtrada e impresión/Guardar PDF mediante el navegador.

Una implementación en código no equivale a un flujo validado en el backend remoto. Consulta la matriz de estado antes de considerarla terminada.

## Imágenes

`public/warehouse.webp`: ilustración generada para la pantalla de acceso, 1200×600, 112306 bytes. También almacenada en `acemar-public`, objeto `brand/warehouse.webp`, con metadatos en `public.assets`. El SVG de marca se reconstruyó como recurso vectorial sencillo. Los productos sin foto muestran un icono; no se insertaron productos ficticios.

Los archivos de negocio se almacenan en Storage y sus referencias en PostgreSQL. El bucket público solo debe contener imágenes que puedan ser leídas por cualquiera. No hay políticas de escritura de clientes. El cargador de fotografías validado en servidor sigue pendiente.

## Seguridad y límites

- RLS en todas las tablas de aplicación y privilegios de cliente revocados salvo la consulta autorizada del perfil.
- RPC con permisos explícitos, identidad de sesión, `search_path` fijado y validación de operaciones.
- No DML directo de clientes sobre stock, roles, ventas, abonos o auditoría.
- Claves administrativas ausentes del frontend y de Git.
- Cabeceras de despliegue propuestas en `vercel.json`; solo se aplican al desplegar en Vercel.
- Auditoría protegida contra modificación del cliente ordinario, no contra un operador con privilegios administrativos.
- No hay certificación de seguridad o WCAG.

**Bloqueo de dependencia:** `npm audit --omit=dev` reporta GHSA-mrhx-c7xc-m3w5 en Zod 3 transitivo de `@insforge/shared-schemas`, utilizado por `@insforge/sdk`. La aplicación utiliza Zod 4 actualizado. No se ha forzado una actualización mayor incompatible dentro del SDK. CI mantiene este control y debe bloquear la entrega mientras no se resuelva o se revise formalmente su alcance.

## Pendientes antes de uso real

- Primera cuenta administrativa y pruebas autenticadas end-to-end.
- Concurrencia real con varias conexiones y reintentos de red.
- Pruebas de navegador en PC/tablet/celular y auditoría de accesibilidad completa.
- Recuperación de contraseña en interfaz y revisión de sesión/CORS en los dominios finales.
- MFA administrativo según soporte del proveedor; no se afirma que esté habilitado.
- Crear identidades desde la app, carga segura de imágenes, XLSX y PDF generado como archivo por el servidor.
- Configurar proveedor de IA si se requiere Gemini; el modo local ya funciona.
- Límites de solicitud perimetrales, backup/restauración y monitoreo operativo.
- Revisar peso del SDK y advertencia de módulo `crypto` externo antes de habilitar OAuth.

## Git

`main` estable; `develop` integración; `feature/1-acemar-web` implementación. PR hacia `develop`, commits Conventional Commits en español. No se mezclan cambios ni se publica producción automáticamente.

Documentación: [arquitectura](docs/architecture/decisiones.md), [validación](docs/architecture/validacion.md), [diseño](docs/design/sistema.md), [estado](docs/estado.md).
