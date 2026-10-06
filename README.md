# AI Hoodie Studio

Atelier digital de **lujo silencioso** para diseñar sudaderas con IA y compilar un **dossier de taller de alta costura** listo para producción. Dirección de arte monocroma (negro, grafito, marfil), tipografía de pasarela y el modelo 3D como protagonista absoluto.

```
┌──────────────────────────────────────────────────────────────────────────┐
│ ┌────────────────┐   FW26 | AHS-FW26-001                                 │
│ │ PANEL FLOTANTE │   NOCTURNE                       [Calibrar][Capturar] │
│ │ (negro, filete │   Felpa perchada 460 g/m²  ·  #0B0B0B                 │
│ │  blanco 10 %)  │                                                       │
│ │ Lienzo textil ─┼──▶ <Decal> en vivo sobre public/models/hoodie.glb     │
│ │ ────────────── │                                                       │
│ │ Generar  Texto │      VISOR 3D A SANGRE (gris estudio #141414)         │
│ │ Prenda   Pieza │                                                       │
│ │ Dossier        │                                                       │
│ └────────────────┘   FRENTE | ESPALDA | LAT. DER. | LAT. IZQ. | DETALLE  │
└──────────────────────────────────────────────────────────────────────────┘
  Al orbitar la prenda, cabecera y cámaras se desvanecen y el panel queda casi
  invisible (6 %); vuelve al pasar el ratón o 0,9 s después de soltar.
```

## Stack

| Capa | Tecnología |
| --- | --- |
| Framework | Next.js 16 (App Router) + React 19 + TypeScript |
| Lienzo 2D | Fabric.js 7 |
| 3D | three.js + @react-three/fiber 9 + @react-three/drei 10 |
| Estado | zustand |
| IA | OpenAI DALL·E 3 (key del usuario en localStorage o del servidor) · Recraft v3 como alternativa vectorial |
| Exportación | jsPDF (dossier de taller con cotas vectoriales) + JSZip (paquete) |
| Color | react-colorful (`HexColorPicker` + `HexColorInput`) |
| Tipografías | @fontsource autoalojadas: Inter 200–400, Bodoni Moda, Cormorant Garamond, IBM Plex Mono · Helvetica Neue de sistema |
| Estilos | Tailwind CSS 4 (tokens en `@theme`) |

## Dirección de arte: lujo silencioso

| Elemento | Decisión |
| --- | --- |
| Paleta | Monocroma: escenario 3D gris estudio `#141414` (nunca negro puro), panel negro `#000000` separado por un filete blanco al 10 %, filetes interiores `#2A2A2A`, texto principal blanco hueso `#EDEDED` (≈ 15:1) y secundario gris medio `#A0A0A0` (≈ 7:1); acento único `#F5F5F5`. |
| Tipografía UI | Inter 200–300 en versalitas diminutas con tracking muy amplio (0,22–0,42 em) para rótulos; **Bodoni Moda** (didona) para el nombre del modelo; Cormorant Garamond en cursiva para notas editoriales; IBM Plex Mono 300 para cifras tabulares (mm, HEX, códigos). |
| Superficies | Esquinas rectas, filetes de 1 px, panel de cristal (`backdrop-blur`) flotando sobre la escena; iconos reducidos a trazo 1,15. |
| Luz de estudio | Iluminación de configurador real (`ProductLighting`): un estudio de **softboxes generado en local** con `Lightformer` de drei (cenital, llave, relleno, dos tiras de contraluz y rebote del suelo; sin descargar HDRIs) que da la luz difusa y los reflejos, más llave y **contraluces direccionales** que recortan la silueta. Todo el estudio gira con el azimut de la cámara, así la prenda queda igual de bien iluminada desde cualquier vista. Tone mapping **Khronos PBR Neutral** (el estándar de e-commerce: no altera el color del tejido), sombra de contacto en dos capas y tejido con **punto de felpa** (normal map procedural, o el del GLB si lo trae). Ningún tejido devuelve menos de ~3 % de la luz: se aplica ese suelo de albedo a la prenda y a los decals, así un negro se ve con volumen y el ton-sur-ton sigue casando con el tejido. |
| Modo inmersivo | Al empezar a orbitar (`OrbitControls.onStart`) la interfaz se retira: cabecera y barra de cámaras a opacidad 0, panel al 6 %. Vuelve al pasar el ratón por el panel o 900 ms después de soltar. |
| Encuadre | Canvas a sangre con `camera.setViewOffset`: la prenda se centra en el espacio libre a la derecha del panel, no detrás de él. |
| Fichas | Los paneles se leen como una ficha técnica de autor: índices editoriales (01, 02…), códigos de pieza (`F·01`, `B·02`), calibres en mm y referencias de tinta/hilo. |

## Configurador de taller (`/configurador`)

El **atelier** (`/`) es donde se diseña: IA, lienzo libre, técnicas, fornituras y dossier. El **configurador de taller** es la herramienta para producir variantes del modelo sin tocar el lienzo: se elige sobre la prenda en 3D, con la luz de estudio, y sale una **orden de taller** lista para producción. No es una tienda: no hay precios ni cesta.

| Paso | Qué se define |
| --- | --- |
| 01 Tejido | Color de tejido en stock (la prenda gira sola en el plató hasta que se toca) y ficha del tejido: construcción, gramaje, composición y acabado. |
| 02 Personalización | Iniciales o palabra, tipografía (Bodoni Moda, Cormorant Garamond, Helvetica Neue) y técnica con su código: **BTT** bordado tono sobre tono, **BAR** bordado en relieve o **SER** serigrafía, con hilo o tinta y su referencia (`BAR-C9B37E`). Sin texto, la orden es de prenda lisa. |
| 03 Colocación | Corazón, pecho, nuca o espalda, cada una con su caja y cota en mm desde el HPS; tras aplicar se muestran el **calibre real** y las **coordenadas** medidas sobre el lienzo. |
| 04 Cantidades | Unidades por talla (XS–XXL). Las colocaciones se refieren a la talla M; el taller escala con su tabla de gradación. |
| 05 Orden | Número de orden (`OT-AAMMDD-XXX`), variante (`NOC-NOIR-BTT-HEART`), técnica, colocación, producción y desglose por tallas. |

- **Producción en vivo**: el pie del panel muestra unidades, técnica y, en bordados, las **puntadas estimadas por pieza**. Se calculan con la superficie real que cubre el hilo (píxeles opacos del render de la pieza) y una densidad de taller (3 pt/mm² en satén, 3,6 en relieve). Es una estimación para planificar máquina: el número real lo da el archivo digitalizado.
- **Emitir orden de taller** descarga el dossier con el número de OT: portada con el render de la pieza entera, lámina de colocación con cotas, materiales y fornituras, **orden de producción por tallas** y archivos por técnica (SVG / PNG 300 dpi).
- **Ambientes**: *Salon* (sala clara cálida) y *Nuit* (estudio gris oscuro). Cambian el plató 3D y la paleta del panel.
- **Catálogo del taller**: `src/lib/configurator/collection.ts`: modelo, colores en stock, técnicas, hilos, tipografías, colocaciones homologadas y tallas.
- **Mismo motor que el atelier**: la personalización se aplica como `fabric.IText` en lienzos de diseño fuera de pantalla, así los decals, el ton-sur-ton y el dossier son exactamente los mismos.

## Arranque rápido

```bash
npm install
# 1. Copia tu modelo 3D (obligatorio):
cp /ruta/a/tu/hoodie.glb public/models/hoodie.glb
npm run dev                  # http://localhost:3000
# 2. En la app: Generar → Configuración → pega tu OpenAI API Key
```

No hay modo demo ni modelo de reserva:

- **Sin `public/models/hoodie.glb`** el visor muestra un aviso a pantalla completa: *«Falta el archivo 3D. Sube tu hoodie.glb a public/models/»*. Ver `public/models/README.md` (orientación +Z, calibración del HPS).
- **Sin API key** el botón de generar queda desactivado hasta que pegues tu key en *Configuración*.

| Script | Qué hace |
| --- | --- |
| `npm run dev` | Servidor de desarrollo (detecta un GLB nuevo con «Reintentar») |
| `npm run build` | Build de producción (incluye typecheck). Rehazlo si cambias el GLB |
| `npm run typecheck` | Sólo TypeScript |
| `npm run fonts:pdf` | Regenera las TTF del dossier (`public/fonts/pdf/`) desde los WOFF de @fontsource |

### API keys

| Origen | Uso |
| --- | --- |
| **Configuración** (app) | La OpenAI API Key se guarda en el `localStorage` del navegador y viaja en la cabecera `x-openai-key` a `/api/generate`, que llama a DALL·E 3 y no la guarda ni la registra. |
| `OPENAI_API_KEY` (`.env.local`) | Key del servidor, usada si el usuario no ha pegado la suya. |
| `RECRAFT_API_KEY` (`.env.local`) | Alternativa vectorial (SVG puro) si no hay ninguna key de OpenAI. |

> ⚠️ localStorage es legible por cualquier script del mismo origen. Úsalo en local o en un dominio interno, y pon un **límite de gasto** a la key en OpenAI.

### Direcciones de colección

Cada concepto se envía a la IA con el estilo de la **dirección de colección** elegida en *Generar* (se añade también en inglés porque DALL·E 3 lo sigue mejor). Todas piden blanco sobre negro puro para recortar el fondo sin pérdidas:

| Código | Dirección | Estilo añadido al concepto |
| --- | --- | --- |
| `LS` | **Lujo silencioso** (por defecto) | *diseño aislado en blanco sobre fondo negro puro, emblema minimalista de casa de alta costura, trazo fino y constante, geometría precisa, mucho espacio negativo, sin sombras, flat vector* |
| `AT` | Archivo técnico | *… dibujo técnico de línea fina tipo plano de ingeniería o lámina botánica de archivo, trazo uniforme …* |
| `TG` | Tatuaje tribal gótico | *diseño aislado en blanco sobre fondo negro puro, estilo tatuaje tribal gótico, streetwear, sin sombras, flat vector* (la especificación original, intacta) |

Cada dirección trae sus propios conceptos de ejemplo. Opciones: formato **vertical 1024×1792** (espalda) o cuadrado, 1–4 variaciones y calidad HD. El panel muestra el coste aproximado. La API acepta `style: 'silence' | 'archive' | 'gothic'` y rechaza cualquier otro valor.

## Flujo de uso

1. **Configurar**: pega tu OpenAI API Key (una sola vez por navegador).
2. **Generar**: elige la dirección de colección, escribe un concepto (p. ej. `llave antigua estilizada`) y pulsa *Generar con DALL·E 3*.
3. **Ajustar en el lienzo textil** (panel izquierdo): mueve, escala y gira con el bounding-box; snapping al eje central y al centro del área. Cada cambio se ve **en tiempo real en el 3D**. También puedes soltar assets directamente sobre el visor 3D. En *Pieza* fijas el ancho real en mm, centras, volteas, duplicas u ordenas capas. `Supr` borra, flechas mueven (`⇧` ×10).
4. **Revisar en 3D** con la barra de cámaras: *Frente, Espalda, Lateral derecho, Lateral izquierdo, Detalle* (los laterales siguen el criterio de fábrica: lado de quien viste la prenda). *Capturar* guarda el render que abre la portada del dossier (sin el fondo de estudio, transparente, para recortarlo en la portada).
5. **Compilar dossier** (pestaña *Dossier*): nombre, referencia de estilo y temporada; descarga el ZIP para el taller.

## Texto, color y técnicas por elemento

| Pestaña | Qué hace |
| --- | --- |
| **Texto** | Composición tipográfica con fuentes de alta gama: **Helvetica Neue Light** (de sistema; donde no está instalada se previsualiza con Inter Light), Inter Extra Light, **Bodoni Moda** (didona de alta costura), Cormorant Garamond Light (romana editorial) e IBM Plex Mono Light (técnica). Añade un `fabric.IText` con tracking de pasarela; doble clic para editarlo letra a letra. Las fuentes se cargan con `document.fonts.load` antes de medir el texto. |
| **Prenda** | 01 *Color del tejido* (`material.color` del GLB en tiempo real, template 2D y planos del dossier) · 02 *Tejido* (construcción, gramaje 380–500 g/m², composición, acabado) · 03 *Fornituras*: ojales metálicos a medida (acabado gunmetal, negro mate, paladio, níquel o latón; Ø 8/10/12 mm; distancia entre centros y altura bajo HPS), herretes (acabado y largo) y cordón (tipo, tono sobre tono o contraste). Los ojales se pintan también en 3D (`Hardware.tsx`), con material metálico y reflejos del entorno. |
| **Pieza** | Ficha de autor de la pieza seleccionada: código (`B·02`), **técnica de aplicación**, referencia de tinta/hilo (`BTT-0B0B0B-SAT`), RGB / CMYK aprox., fuente, **color** (`HexColorPicker`) y calibres en mm. Sin selección muestra la lista de piezas de la cara. Al hacer clic en un objeto del lienzo se abre sola. |

**Color por elemento** — SVG: `fill`/`stroke` de todos sus paths · Texto: `fill` · PNG: `filters.BlendColor` en modo `tint` + `applyFilters()`.

**Técnica por elemento** — se guarda como custom data en el objeto de Fabric (`obj.set({ tecnica })`, incluida en `clone()`/`toObject()`):

| Técnica | Representación 3D |
| --- | --- |
| Serigrafía Plana | `<Decal>` con `MeshStandardMaterial` mate |
| Tinta Reflectante D3O/3M | `<Decal>` con `MeshPhysicalMaterial` (`roughness 0.1`, `metalness 0.8`, `clearcoat 1`, emissive del propio color) + entorno local `RoomEnvironment` |
| Bordado Alto Relieve | `<Decal>` con `MeshPhysicalMaterial` con *sheen* de hilo y `bumpMap` generado en 2D: silueta desenfocada (acolchado) × patrón de puntadas |
| Bordado Ton-sur-Ton (Tono sobre Tono) | Mismo `<Decal>` de bordado, pero el hilo **sigue al HEX del tejido** (exacto, o un matiz ±7 % casi imperceptible) y su acabado (satinado o mate) se pinta en un `roughnessMap` por píxel: el motivo apenas se ve de frente y aparece cuando la luz rasante toca el relieve y el brillo del hilo. |

Cada cara tiene una textura por técnica (filtrada desde el mismo lienzo Fabric) y un `<Decal>` por técnica, montado sólo si se usa. Las dos técnicas de bordado comparten capa: su relieve (`bumpMap`) y su brillo (`roughnessMap`) se generan por pieza, de modo que una pieza ton-sur-ton mate y otra satinada conviven en la misma cara.

**Ton-sur-ton y color de la prenda** — al pasar una pieza a ton-sur-ton se guarda su tinta anterior y se tiñe con el color del tejido; si después cambias el color de la prenda, el hilo lo sigue automáticamente. Al salir de ton-sur-ton recupera su tinta.

## Dossier de taller (ZIP)

```
AHS-FW26-001_nocturne_dossier.zip
├── dossier-technique.pdf   # Dossier de alta costura (A4, ver abajo)
├── spec.json               # Formato máquina: styleCode, season, fabric, hardware, inks[], views[].elements[] (mm)
├── render-3d.png           # (si se capturó en el visor)
├── back/
│   ├── artwork.svg         # Conjunto aislado, SVG con tamaño físico (width="32.40cm")
│   ├── print-300dpi.png    # Raster transparente a 300 dpi (baja de dpi solo si supera 6000 px)
│   ├── plano-tecnico.png   # Plano de la cara (prenda + arte) sobre blanco
│   ├── serigrafia-plana/   # artwork.svg + print-300dpi.png sólo con las piezas de esa técnica
│   ├── reflectante/
│   ├── bordado-alto-relieve/   # base para digitalizar el bordado (DST/PES)
│   └── bordado-ton-sur-ton/
└── front/ …
```

**El PDF** se maqueta como un dossier de atelier: páginas blancas, filetes de 0,07–0,1 mm y **las mismas tipografías que la interfaz**, incrustadas (sólo los glifos usados): Bodoni Moda para títulos, Cormorant Garamond para nombres y notas, Inter para rótulos en versalitas con tracking real (jsPDF no lo considera al alinear, así que se calcula a mano) e IBM Plex Mono para cifras, códigos y rutas.

> jsPDF sólo incrusta TrueType y @fontsource distribuye WOFF: `scripts/pdf-fonts.mjs` descomprime las tablas del WOFF y reescribe la cabecera sfnt (sin dependencias). Las TTF resultantes y sus licencias (SIL OFL 1.1) viven en `public/fonts/pdf/`. Si no se pudieran descargar, el dossier se compone con Times / Helvetica / Courier.

| Página | Contenido |
| --- | --- |
| Portada | Temporada · referencia de estilo, nombre del modelo en versalitas didonas, render 3D recortado (o los planos de las caras) y bloque de datos: dossier, fecha, tejido, gramaje, color, piezas. |
| Planche por cara | Plano de colocación con **cotas vectoriales** de arquitecto (ancho, alto y HPS → borde superior), **reglas en mm** desde el HPS (vertical) y desde el eje (horizontal), área de impresión, eje central y línea HPS dibujados sobre la prenda (marfil sobre tejidos oscuros, tinta sobre claros). Ficha del conjunto, leyenda de trazos y **desglose de piezas**: código, pieza / fuente, técnica, calibre mm, **X desde el eje y Y bajo el HPS en mm**, rotación y referencia de tinta/hilo con muestra. Notas de taller por técnica (con **superficie bordada y puntadas estimadas** de cada pieza bordada) y archivos de producción. |
| Materiales y fornituras | Tejido (construcción, **gramaje g/m² y oz/yd²**, composición, acabado, HEX / RGB / CMYK aprox.), tabla de **tintas e hilos** (referencia, muestra, técnica, HEX, RGB, CMYK, acabado y piezas que la usan), **fornituras** (ojales `OJ-GM-10`, herretes `HR-GM-30`, cordón `CR-R08-…` con acabado, calibre, cantidad y posición en mm) y casillas de visto bueno. Desde el configurador de taller añade la **orden de producción** con las unidades por talla. |

Las coordenadas toman como origen el **HPS sobre el eje central**: X = centro de la pieza (+ derecha mirando la prenda), Y = borde superior bajo el HPS. Las referencias internas combinan código de técnica + HEX exacto (+ acabado del hilo en ton-sur-ton); la equivalencia Pantone TCX / Madeira se casa en taller sobre muestra física y el CMYK es orientativo (sin perfil ICC).

## Arquitectura

```
src/
├── app/
│   ├── api/generate/route.ts      # POST → DALL·E 3 (key de cabecera o servidor) / Recraft. GET → claves del servidor (booleanos)
│   ├── layout.tsx · page.tsx · globals.css
├── components/
│   ├── studio/StudioShell.tsx     # Atelier: visor 3D a sangre + panel flotante (modo inmersivo)
│   ├── configurator/              # Configurador de taller: ConfiguratorShell (pasos, tallas, orden) · ConfiguratorViewer
│   ├── sidebar/                   # Sidebar (pestañas) · Generate/Text/Color(Garment)/Element/Selection/Export panels
│   ├── canvas/                    # TextileCanvas (lienzo miniatura, drop, teclado) · FabricView (un lienzo por cara)
│   ├── three/                     # HoodieViewer · HoodieScene · ProductLighting (estudio) · GltfHoodie · PrintDecal (<Decal>) · Hardware (ojales) · CalibrationPanel · CameraRig
│   └── ui/                        # Section · SpecRow · Button · Segmented
└── lib/
    ├── hoodie/spec.ts             # ⭐ Fuente de verdad física: 7 px = 1 cm, HPS, áreas, técnicas, fuentes, tejido y fornituras
    ├── hoodie/references.ts       # Referencias de tinta/hilo (SER-FFFFFF, BTT-0B0B0B-SAT) y desglose RGB/CMYK
    ├── fabric/editor.ts           # Init del lienzo, template, guías, snapping, assets, métricas, acciones
    ├── fabric/render.ts           # Render de regiones (textura, PNG 300 dpi, plano técnico) y mapas de relieve/brillo del bordado
    ├── fabric/registry.ts         # Puente Fabric ⇄ Three (lienzos, canvas de textura, eventos)
    ├── ai/                        # Direcciones de colección (prompt) + proveedores (openai, recraft)
    ├── settings.ts                # OpenAI API Key en localStorage (useSyncExternalStore)
    ├── image/knockout.ts          # Negro → transparente (brillo a alfa)
    ├── svg/                       # sanitize · stripBackground · colors
    ├── export/techPack.ts         # SVG, PNG, dossier PDF (cotas vectoriales, materiales, fornituras) y ZIP
    ├── fabric/tint.ts             # Tinte SVG/texto (fill/stroke) y PNG (BlendColor tint), técnica y ton-sur-ton por pieza
    ├── fabric/garment.ts          # Recoloreado del template 2D por tonos (tejido, costuras, ojales, herretes, cordón)
    ├── color.ts                   # Utilidades HEX: mezcla, luminancia, contraste, CMYK aproximado
    ├── three/modelConfig.ts       # Ruta del GLB, normalización, HPS del modelo, material
    ├── three/stage.ts             # Ambientes del plató (Salon / Nuit): fondo, luces, exposición, sombras
    ├── three/fabricTexture.ts     # Normal map procedural de punto de felpa
    ├── three/fabricShading.ts     # Suelo de albedo del tejido (prenda y decals)
    ├── configurator/              # Catálogo del taller (collection) y su aplicación a los lienzos con medidas (apply)
    ├── fabric/coverage.ts         # Superficie real de una pieza y puntadas estimadas
    ├── three/decalPlacement.ts    # Posición/rotación/escala del <Decal> en espacio local de la malla
    ├── three/calibration.ts       # Orientación, altura y escala del estampado (persistido)
    └── store.ts                   # Estado global (zustand): cara activa, cámara, pestañas, assets, tejido, fornituras, modo inmersivo
```

### Escala y posición (cómo se calculan las medidas)

`lib/hoodie/spec.ts` define el template a escala: **7 unidades de escena = 1 cm** (pecho 66 cm = 462 px) y el **HPS** (*High Point Shoulder*, punto alto del hombro) en `y = 190`. Las áreas de impresión se definen en cm (trasera 38 × 48 cm a 10 cm del HPS, delantera 30 × 24 cm a 15 cm). Cualquier objeto del lienzo se mide con su bounding box → cm, y su posición se expresa como distancia desde el HPS y desvío respecto al eje central, que es como lo especifica una fábrica.

### Conexión Fabric.js → Three.js (`<Decal>` de drei, sin UVs)

1. Cada cara (pecho / espalda) tiene un `<canvas>` de textura estable en `registry.ts`.
2. Cualquier cambio en el lienzo (añadir, mover, escalar, rotar…) emite `notifyDesignChanged(view)`.
3. `useDesignTextures` repinta, como máximo una vez por frame, **sólo el área de impresión** (sin template ni guías, fondo transparente) y marca `CanvasTexture.needsUpdate`.
4. `lib/three/decalPlacement.ts` calcula dónde va cada estampa **sin mirar las UVs del modelo**:
   - define el proyector en mundo: eje central de la prenda, altura real del área respecto al HPS, mirando de frente (pecho) o desde atrás (espalda), con el tamaño físico del área (cm → m);
   - lanza un raycast para encontrar la superficie y la **malla principal** en ese punto (ignora piezas pequeñas como cordones o etiquetas);
   - convierte posición, rotación y escala al **espacio local de esa malla**, que es como trabaja `<Decal>`. Así funciona aunque el GLB tenga nodos rotados o escalados (Sketchfab, Blender en Z-up…).
5. `PrintDecal` monta `<Decal>` **dentro** de la malla con `createPortal`, con `depthTest` activo (la espalda no se transparenta desde delante) y un `meshStandardMaterial` para que la tinta reciba luz.

### Calibración del modelo

Botón **Calibrar** en el visor (se guarda en el navegador):

| Ajuste | Cuándo usarlo |
| --- | --- |
| Orientación 0/90/180/270° | El estampado del pecho aparece en la espalda o en un lateral (el GLB no mira a +Z) |
| Altura del estampado (±20 cm) | Sale demasiado alto o bajo (el HPS de tu modelo no está donde se estima) |
| Escala del estampado (60–150 %) | La prenda 3D no mide 66 cm de pecho como el lienzo 2D |
| Mostrar caja de proyección | Ver el volumen exacto que proyecta cada `<Decal>` |

### Modelo 3D

Sólo se carga `public/models/hoodie.glb`: se comprueba con un `HEAD` antes de montar el visor, se normaliza (0,84 m de alto, centrado, bajo en `HEM_Y`) y se tiñe con el color del tejido conservando su relieve (normal map, oclusión y rugosidad del GLB; si no trae normal map se usa el punto de felpa procedural). Si falta o está corrupto, el visor muestra el aviso con un botón «Reintentar» (que vacía la caché de `useGLTF`).

## Seguridad

- La key del usuario sólo se usa para la petición en curso: el servidor no la guarda ni la registra (los logs sólo llevan el mensaje de error). Se valida su formato (`sk-…`).
- Validación de entrada (longitud de prompt, formato, nº de variaciones) y cabeceras de endurecimiento (`X-Frame-Options`, `nosniff`, `Referrer-Policy`).
- Anti-SSRF: sólo se descargan resultados de dominios `*.recraft.ai` por HTTPS.
- Los SVG (IA o subidos) se sanean: sin `<script>`, `on*=`, `foreignObject`, entidades XML ni recursos externos.
- Todo llega al cliente como `data:` URL → sin CORS y sin *tainted canvas* al exportar o texturizar.

## Próximos pasos sugeridos

- Persistencia de proyectos (Supabase / Postgres + almacenamiento de assets).
- Vectorizado del PNG de DALL·E (potrace / Recraft `vectorize`) para que el arte salga en SVG puro: el blanco sobre negro es ideal para trazar.
- Más prendas y tallas (tabla de gradación de la impresión por talla).
- Biblioteca física de hilos (Madeira / Gunold) y Pantone TCX para sustituir las referencias internas por códigos de proveedor.
- Autenticación del equipo y rate-limit del endpoint de IA.
