# Catálogo de evaluación e imágenes

## Origen y alcance

La selección de 12 productos procede de `SeedProductos` de `software_ACEMAR/Backend/Data/AppDbContext.cs` en DavidMTB/software_ACEMAR, commit `e6a97dd535e109f8a7aa83eafec192a03cfed12d`. Nombres, códigos, precios base, mínimos y existencias están en `data/evaluation/products.json`. Los costos siguen `SeedLotesIniciales`: 70 % del precio, redondeado a dos decimales.

Son datos de evaluación, no inventario ni precios comerciales vigentes. No se copian contraseñas del programa de escritorio, identidades de ejemplo, ventas, deudas ni pagos ficticios. Los precios de marca se conservan como parte del ejemplo; las ilustraciones no son fotografías oficiales del fabricante.

Se carga solamente la unidad base de cada producto, con factor 1. En arena se conserva la etiqueta original `Metros`; debe definirse comercialmente si representa m³ antes de uso operativo. Las presentaciones alternativas no se importan: el original contiene precios independientes que no equivalen a multiplicar por el factor (Bolsa: 6,50 frente a 65 × 0,04 = 2,60). La aplicación actual usa precio base por factor; no se sustituye silenciosamente una regla por otra.

## Archivos y carga

- `scripts/upload-evaluation-images.mjs`: operador autenticado; verifica formato real WebP, 640 × 640, una sola imagen y tamaño máximo de 2 MiB. Requiere Python con Pillow, además de Node y CLI InsForge. Consume archivos locales en `.insforge/product-images/CODIGO.webp`; solo publica ilustraciones en `acemar-public`.
- `data/evaluation/assets.json`: URL exacta devuelta por Storage, key, tipo, dimensiones, bytes, huella SHA-256 y asociación por código. Los archivos binarios residen en InsForge; no se guardan dentro de una columna de la base de datos.
- `scripts/catalog-seed.mjs`: valida manifiestos y construye una transacción con bloqueo de importación. Solo admite el bucket esperado. Los UUID son estables por producto.
- `scripts/import-evaluation.mjs`: limita el proyecto a `acemar-dev`. Lee el ID de un administrador existente de `ACEMAR_SEED_ACTOR`; no contiene contraseñas, tokens ni claves administrativas.

```bash
node scripts/upload-evaluation-images.mjs
ACEMAR_SEED_ACTOR='<UUID de administrador existente>' node scripts/import-evaluation.mjs
ACEMAR_SEED_ACTOR='<UUID de administrador existente>' node scripts/import-evaluation.mjs --apply
```

Sin `--apply`, el importador solo valida. No ejecuta operaciones de negocio durante el arranque de la aplicación. Repetir la importación no aumenta existencias, no cambia precios y no duplica lotes, movimientos o auditoría. Si un código ya pertenece a otro producto, se revierte toda la transacción. Storage y PostgreSQL no comparten una transacción: una falla entre subida e importación puede dejar ilustraciones sin asociar; el manifiesto permite inspeccionarlas y completar la asociación, sin borrado automático.

No se habilitan políticas de escritura para navegadores. Esto es una importación del operador, no un formulario de subida de fotografías por usuarios; ese flujo sigue pendiente.

## Generación y optimización

Se utilizó la herramienta integrada ImageGen, una imagen independiente por producto. Prompt común: `Use case: product-mockup. Create a single square catalog product photograph for a hardware store web application. Subject: SUBJECT. Entire object centered with generous margins, soft studio lighting, very pale cool gray seamless background, realistic materials and restrained soft shadow, matching premium ecommerce photography. No labels, no words, no logos, no watermark, no collage, no extra objects. Illustrative generated representation, not an official brand photograph.`

| Código  | SUBJECT                                                                                                                                                                   |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CEM-001 | one upright unbranded kraft paper 50kg cement sack                                                                                                                        |
| ARE-003 | a clean small mound of coarse washed construction sand                                                                                                                    |
| LAD-004 | one orange terracotta hollow King Kong masonry brick, viewed from its solid unperforated long side at a low eye-level angle; perforations face upward and are out of view |
| CLA-005 | a small pile of shiny two-inch steel construction nails                                                                                                                   |
| TUB-008 | two straight white PVC water pipes, open ends visible                                                                                                                     |
| CAB-011 | one neatly coiled twin insulated electrical cable                                                                                                                         |
| INT-013 | one white single rocker wall light switch with rectangular faceplate                                                                                                      |
| MAR-039 | one steel claw hammer with orange fiberglass handle                                                                                                                       |
| FLE-021 | one compact yellow and black five-metre retractable tape measure                                                                                                          |
| PIN-017 | one sealed one-gallon metal can of white latex paint, blank neutral label                                                                                                 |
| BRO-018 | one three-inch paintbrush with natural bristles and wooden handle                                                                                                         |
| CAN-019 | one brass 50mm padlock with closed steel shackle                                                                                                                          |

El ladrillo se selecciona desde una cara sin perforaciones expuestas para no atribuir un conteo incorrecto a la ilustración. Conversión con Pillow: RGB, 640 × 640, remuestreo Lanczos, WebP calidad 82 y método 6, sin metadatos copiados. El nombre del objeto incorpora 12 caracteres de su SHA-256 para versionar el contenido. El POS conserva `Ilustración del producto`, carga diferida, dimensiones reservadas y recuperación ante errores de imagen.

## Validación

Las pruebas de PostgreSQL verifican asociación en `acemar_catalog`, costos, carga repetida tras consumir stock, conflictos y rechazo de actores no administradores y URLs externas. Las pruebas de interfaz verifican texto alternativo, carga diferida, imagen fallida y actualización de URL. La comprobación remota contrasta firma WebP, tamaño y SHA-256 de cada objeto con el manifiesto; los resultados se conservan fuera de Git en `.insforge`.
