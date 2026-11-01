# Reportes y presentación del inventario

## Excel de referencia

La exportación de Productos y Existencias toma como referencia el archivo entregado por el usuario: título en las filas 2–3, marca en el espacio A2:B3, banda de identidad en fila 4, línea de acento, cuatro indicadores en filas 7–9 y tabla desde la fila 12. Mantiene las familias declaradas por la referencia: Copperplate Gothic Bold en el título, Bahnschrift en encabezados y Consolas en datos. Excel usa sustitución si el equipo no tiene esas fuentes; no se redistribuyen fuentes propietarias.

El acento rojo se reemplaza por azul #2855D9, con texto #18212F, grises claros y el logo naranja de ACEMAR. Se conservan tres hojas para productos: principal, Resumen y Datos. La adaptación elimina categorías y estados de la pollería que no existen en el catálogo de ACEMAR.

Los reportes contienen exclusivamente la página visible y sus filtros, declarados en el documento. No representan todo el catálogo cuando hay más páginas. Las miniaturas se incrustan como PNG para compatibilidad con Excel y PDF; los originales continúan alojados como WebP en InsForge. Una imagen no disponible se identifica y no impide exportar los datos.

Indicadores: productos exportados, productos con existencias, productos con stock bajo o agotado y valor a precio de venta. Este último es la suma de stock × precio base con redondeo monetario, no el costo contable. No se suman cantidades de unidades incompatibles. El Resumen muestra disponibilidad y los cinco productos de mayor valor de venta. Los datos son una instantánea; no se copian los filtros interactivos ni fórmulas de categorías de la pollería.

Los números se guardan como números, los códigos como texto. El texto que comienza con `=` no se transforma en fórmula. Se repite el encabezado fijo en pantalla y se selecciona orientación horizontal. La exportación de otros módulos reutiliza el encabezado y sus columnas correspondientes.

## PDF y documento imprimible

El motor compartido produce A4, marca vectorial, acento azul, título, contexto, tabla, filas alternadas, importes alineados y pie con número de página. Repite cabecera en páginas nuevas, ajusta descripciones al ancho y evita cortes silenciosos: un registro excepcional que exceda la capacidad de una página se rechaza con un error.

Las ventas y proformas usan columnas de producto, unidad, cantidad, precio e importe, con un bloque final de totales. El total de venta se toma del servidor; no se sustituye por una estimación del cliente. Las proformas mantienen su condición de no reservar stock. El PDF de inventario y las fichas de producto incluyen miniaturas; los documentos de venta conservan el nombre histórico registrado en sus líneas, sin sustituirlo por el nombre actual de un producto.

El detalle descarga el documento PDF completo en lugar de imprimir la interfaz y sus controles. El archivo se puede abrir e imprimir desde el visor PDF del navegador o del sistema. Los listados también ofrecen Exportar PDF.

Se incrustan variantes regular y negrita de DejaVu Sans, con subconjunto latino, para evitar diferencias de sustitución entre equipos. Se conservan atribución y licencia en `public/fonts/LICENSE.txt`. La dependencia @pdf-lib/fontkit se carga al generar el PDF; las fuentes se solicitan desde el propio sitio. La exportación no contacta servicios externos de conversión.

## Imágenes en la aplicación

Productos y Existencias muestran imagen, nombre y aviso de ilustración en sus tablas y tarjetas móviles. Se mantienen las imágenes de Vender y del detalle del producto. La recuperación de imágenes fallidas sigue ofreciendo una alternativa accesible.

La conversión para exportar limita las solicitudes al bucket público de ACEMAR, omite credenciales y referente, aplica tiempo límite, verifica MIME y límites de tamaño/dimensiones y convierte a miniatura PNG. No habilita subidas del navegador ni modifica permisos del backend.

## Verificación

Pruebas: estructura y marca del XLSX, tres hojas, estilos, imágenes incrustadas, números y estados, texto con fórmula aparente, PDF real paginado y errores por registros excesivos. Pruebas de integración de interfaz verifican miniaturas y botones de exportación en Productos y Existencias.

Se generaron muestras con el código real, se inspeccionaron visualmente las tres hojas con Artifact Tool y los PDF con Poppler, y se comprobó la incrustación de fuentes. Es una revisión de archivos e interfaz automatizada; el recorrido autenticado completo en Excel de escritorio y en todos los dispositivos sigue siendo una validación del usuario.
