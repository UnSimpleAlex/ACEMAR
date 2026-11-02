# Pruebas contra InsForge real

Proyecto: acemar-dev. Entorno de desarrollo, sin información real del negocio.

Se crearon una identidad administrativa y dos de vendedor, con contraseñas aleatorias que no se registraron en el repositorio ni en las salidas. La creación se hizo por la API administrativa con `autoConfirm`, sin deshabilitar la verificación general ni abrir registro público. La API puede omitir el usuario en la respuesta de alta: el script resuelve el ID mediante una consulta administrativa por correo exacto antes de asignar el perfil.

## Resultado

| Caso                                                   | Resultado observado           |
| ------------------------------------------------------ | ----------------------------- |
| Consulta del catálogo sin sesión                       | Rechazada                     |
| Dos vendedores venden simultáneamente una única unidad | Una confirmación, un rechazo  |
| Reintento con la misma clave y contenido               | Devuelve el mismo ID de venta |
| Existencia después de la competencia                   | Cero                          |
| Vendedor consulta deudas                               | Rechazado                     |
| Vendedor consulta costo directamente en lotes          | Sin acceso                    |
| Vendedor cambia su rol                                 | Rechazado                     |
| Vendedor anula una venta                               | Rechazado                     |
| Administrador anula la venta de prueba                 | Restituye una unidad al lote  |

Al terminar se eliminaron exclusivamente datos e identidades temporales; se comprobaron cero perfiles, productos, ventas y lotes. El registro de las primeras altas de diagnóstico también se limpió. La clave administrativa no se devuelve al frontend y su copia local se retiró.

## Alcance y límites

Estas pruebas usan el SDK y PostgreSQL remoto con identidades auténticas. No sustituyen pruebas de carga, concurrencia de crédito/abonos, navegación autenticada completa, revisión de todos los RPC ni una auditoría de seguridad. Las pruebas de navegador de CI usan respuestas de autenticación simuladas exclusivamente dentro del test y verifican presentación/validaciones; no son pruebas de sesión real.
