# Formularios y fotos de productos

## Flujo

Productos permite elegir una imagen al crear o editar, previsualizarla y quitar la selección antes de guardar. Se admiten PNG/JPEG/WebP de hasta 5 MiB; se limita resolución y se convierte en el navegador a WebP de hasta 1024 px y 1 MiB. La conversión conserva transparencia, no elimina fondos de fotografías existentes.

El producto se guarda primero. Si falla la foto, el formulario informa del guardado parcial y conserva el UUID para reintentar sin crear duplicados. Los campos se bloquean mientras se procesa o guarda; cambiar/cerrar con un borrador requiere confirmar el descarte. Precio y existencias siguen entrando mediante lotes; el formulario lo explica.

## Servidor

`acemar-product-image` verifica origen, sesión y perfil administrador. No acepta URLs externas ni nombres de archivo del usuario. Limita el cuerpo incluso sin Content-Length, valida RIFF/WebP, dimensiones, chunks y ausencia de animación/metadatos externos; después decodifica y vuelve a codificar mediante ImageMagick WASM 0.0.45. El binario externo está fijado por versión y SHA-256, se carga una vez por instancia y tiene tiempo límite. El primer procesamiento puede tardar más por esa carga.

La key incluye UUID de producto y UUID aleatorio, sin sobrescribir archivos previos. El cliente administrativo se crea exclusivamente en el servidor con el secreto reservado API_KEY. No se abren políticas públicas de subida. PostgreSQL comprueba producto, administrador, key, dimensiones, tamaño, existencia del objeto y URL devuelta por Storage (incluida su versión). Guarda tanto URL exacta como key y registra auditoría. La cuota de carga es 50 intentos válidos por administrador/día.

Storage y PostgreSQL no forman una transacción conjunta: si la asociación falla después de subir, puede quedar un objeto huérfano. Se conservan imágenes anteriores y no se borran automáticamente objetos de usuarios. Una futura tarea de retención debe tratar esos archivos con una política explícita.

## Eliminación y calidad

Editar/Eliminar tienen texto visible; Eliminar también aparece en los formularios aplicables. El servidor solo elimina un producto sin lotes, movimientos, ventas o proformas, junto con sus unidades y metadatos. Conserva auditoría y objetos de Storage; productos con operaciones se rechazan con explicación. No se han eliminado productos existentes como parte del despliegue.

Los errores de eliminación aparecen dentro de la confirmación; duplicados y referencias tienen mensajes seguros. La paginación conserva la búsqueda aplicada, aunque se haya escrito otra consulta sin enviarla. Se bloquean exportaciones duplicadas y la proforma no permite exportar hasta recibir sus líneas. La unidad base conserva nombre/factor 1; solo presentaciones alternativas son editables y no cambian factores históricos.

## Verificación

Pruebas locales cubren reintento de foto sin duplicar, selección y acciones visibles, formato WebP, rechazo de sesiones/permisos, metadatos generados por servidor, eliminación con/sin historial y unidad base. La recodificación real con WASM se comprobó con una imagen RGBA 640×640, conservando alfa. El script opt-in `scripts/live-media-smoke.mjs` realiza una prueba con identidad/producto/objeto temporales en acemar-dev y los limpia al terminar; no usa la contraseña del propietario.

Prueba remota realizada: acceso de administrador temporal, subida autenticada con recodificación real del servidor, lectura pública WebP, URL exacta en catálogo y eliminación del producto sin historial. Los cinco controles pasaron; la identidad, el producto y el objeto temporales se limpiaron. Los informes quedan en `.insforge`, fuera de Git.
