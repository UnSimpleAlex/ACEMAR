# Revisión de seguridad

## Controles implementados

| Riesgo | Control y evidencia |
|---|---|
| Acceso sin sesión | `acemar_require`, RLS y revocación de privilegios; prueba remota anónima y prueba local |
| Escalada de rol | Perfil separado de auth metadata; sin UPDATE de cliente sobre profiles |
| Alteración de precio/stock | RPC calcula precio y valida cantidades; DML de cliente revocado |
| Duplicados | request_key única + hash del contenido + bloqueo de la clave |
| Venta parcial | Función PostgreSQL transaccional, excepción revierte escrituras |
| Carrera de inventario | Bloqueos de productos ordenados y lotes FIFO; falta prueba multi-conexión real |
| Datos históricos | Factor/precio por línea, asignaciones con costo, revisión y auditoría |
| XSS | Renderizado React sin HTML crudo; asistente en texto; CSP propuesta |
| Archivos | Bucket público solo para marca, sin escritura de cliente; cargador seguro pendiente |
| Secretos | Sin claves administrativas en frontend, commits o documentos |

## Resultados automatizados y límites

`npm audit --omit=dev` detectó GHSA-mrhx-c7xc-m3w5 en Zod 3.25.76 transitivo de @insforge/sdk 1.5.2 → @insforge/shared-schemas 1.2.1. Son tres entradas por una misma cadena. No hay corrección compatible indicada por npm; no se forzó Zod 4 en una biblioteca escrita para Zod 3. Se reportó al proveedor con la habilidad oficial `insforge` (reporte f7f9214a-6365-49f7-8c93-d35389e10af9). La puerta de seguridad de CI permanece activa.

El primer escaneo remoto del advisor detectó 44 observaciones: 15 funciones SECURITY DEFINER invocables por authenticated, 15 tablas con RLS sin políticas, 12 índices de FK faltantes y 2 informativas. La ausencia de políticas era una denegación intencional acompañada de REVOKE, no una apertura de datos. Se añaden políticas de denegación explícita e índices para hacer el contrato más claro.

Las funciones SECURITY DEFINER son una decisión de arquitectura para exponer comandos mientras se prohíbe DML directo. No deben convertirse a INVOKER ni concederse escrituras generales para silenciar el advisor. Sus entradas, actor, proyecciones y privilegios requieren revisión y pruebas autenticadas remotas. No se han suprimido observaciones ni se ha certificado que sean falsos positivos. Todas las referencias a tablas y funciones de aplicación están calificadas; el esquema public no debe permitir CREATE a clientes.

Pendientes: rate limiting perimetral para solicitudes inválidas, MFA si el proveedor lo soporta, cookies/CORS en dominio final, recuperación, revisión manual de autorización por recurso, pruebas de carga, backup y restauración. El bloqueo de obtención de clave administrativa impide completar las pruebas autenticadas y la provisión de cuentas desde este entorno.
