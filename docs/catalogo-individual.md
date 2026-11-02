# Catálogo individual y acciones responsive

`data/catalog-v2/products.json` incluye 12 referencias anteriores para sustituir su ilustración y ocho nuevas: alicate, llave ajustable, destornillador, nivel, lentes, guantes, cinta teflón y silicona. Se conservan identificadores, precios, stock y operaciones de los productos existentes. La carga solo crea stock para referencias nuevas. Las imágenes anteriores permanecen disponibles para documentos históricos.

Se generó una imagen independiente por cada una de las 20 referencias; los prompts y hashes están en `data/catalog-v2/prompts.json`. Las imágenes WebP RGBA de 640 × 640 se almacenan en InsForge `acemar-public/products/catalog/v2/`; `assets.json` registra URL, clave, dimensiones y SHA-256. Son ilustraciones de producto, no fotografías verificadas de un fabricante. El proceso verifica transparencia y rechaza hashes duplicados o idénticos a las imágenes antiguas. Se conserva margen uniforme alrededor del producto.

Carga explícita del operador, solo acemar-dev:

```sh
node scripts/upload-expanded-catalog.mjs
ACEMAR_SEED_ACTOR=<uuid-del-administrador> node scripts/import-expanded-catalog.mjs --apply
```

El upload requiere los WebP preparados en `.insforge/catalog-v2-images`; el import usa manifiestos versionados y una transacción con bloqueo, valida identidad administrativa y relaciones, y es idempotente: no repone existencias consumidas ni duplica productos, lotes o imágenes al repetir.

`ActionBar` conserva las acciones de los diálogos en un pie separado del cuerpo desplazable mediante un portal de React. El botón de envío mantiene la asociación nativa con su formulario mediante `form`, sin duplicar handlers ni saltar validación. Se aplica a productos, proveedores, créditos/abonos, proformas, ventas/correcciones, unidades, POS y recuperación de acceso. Fuera de un diálogo conserva la ubicación normal. Las acciones de tabla usan dos columnas y objetivos táctiles de al menos 44 px; los botones del pie tienen 48 px. Los layouts de celular evitan estirar unos botones más que otros y respetan el área segura del dispositivo.
