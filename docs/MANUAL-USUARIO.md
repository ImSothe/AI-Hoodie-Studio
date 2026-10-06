# Manual de usuario — AI Hoodie Studio

Para diseñar una sudadera con capucha, verla en 3D y enviar a fábrica un dossier con todo lo que el taller necesita. No hace falta saber de diseño ni de producción: este manual va de lo más sencillo a lo más completo.

## 1. Qué puedes hacer

- Subir un dibujo, un logo o un texto (o crearlo con inteligencia artificial) y colocarlo sobre una sudadera en 3D.
- Darle el acabado que quieras: estampado, reflectante, bordado en relieve o bordado tono sobre tono. Con color liso o degradado.
- Tratar por separado cada zona de un diseño (por ejemplo, un ala bordada y la otra reflectante).
- Generar un **dossier de taller** (PDF y archivos) para que la fábrica lo produzca.
- Hacer un **pedido de producción** con tallas y cantidades en el configurador.

Hay dos pantallas:

- **Atelier** (`/`): donde se diseña. Es la principal.
- **Configurador** (`/configurador`): para producir variantes de una prenda ya diseñada, con tallas y orden de taller. No tiene precios ni cesta.

## 2. Antes de empezar

- Tu modelo 3D debe estar en `public\models\hoodie.glb`. Sin él la app no abre el visor y lo avisa.
- Para arrancar: doble clic en `Iniciar-Atelier.bat`. Compila la app y abre el navegador en `http://localhost:3000`.
- La IA es opcional. Si quieres crear diseños con IA necesitas una clave de OpenAI (se pega una sola vez, ver el apartado 4).
- **Importante: la app no guarda tu trabajo.** Si recargas la página o cierras el navegador, el diseño se pierde. Cuando termines, compila el dossier (apartado 11). Antes de cerrar, haz una captura o descarga lo que necesites.

## 3. Recorrido por la pantalla

- **A la izquierda**, el panel con cuatro pasos numerados: **1 Diseño · 2 Prenda · 3 Ajustar · 4 Entregar**.
- **En el centro**, la sudadera en 3D. Es el lugar principal de trabajo: ahí se mueven y se ajustan las piezas.
- **A la izquierda del visor**, la barra **Añadir**: `+ Imagen`, `+ Plantilla`, `+ Texto`, `+ IA`. Siempre está a la vista.
- **Abajo del visor**, las cámaras: Frente, Espalda, Lateral derecho, Lateral izquierdo y Detalle.
- **Arriba a la derecha**: Deshacer, Fondo claro/oscuro, Fija/Girando, Modelo limpio/Con detalles, Calibrar y Capturar.
- **Lienzo 2D**: un editor plano de la prenda, plegado por defecto (botón «Mostrar» en el panel). Casi nunca hace falta.

## 4. Paso 1 · Diseño: añadir algo a la prenda

Elige primero **en qué cara** vas a trabajar: **Trasera** o **Delantera** (en el panel, bajo «Lienzo 2D», o con las cámaras Frente y Espalda).

### Subir una imagen
1. Pulsa `+ Imagen` (o «Subir imagen» en el paso 1) y elige el archivo. También puedes **arrastrar el archivo y soltarlo sobre la prenda**.
2. Se coloca al instante en la prenda y el panel pasa a «Ajustar».

Formatos: PNG, SVG, JPG y WebP. Lo mejor es un **PNG con fondo transparente de verdad** o un SVG. Si tu imagen trae el «damero» pintado (los cuadros grises y blancos que algunos buscadores muestran como transparencia), la app intenta convertirlo en transparente de forma automática. Funciona bien con dibujos de línea; si ves restos de fondo, usa mejor una versión con transparencia real.

### Plantillas
`+ Plantilla` ofrece doce motivos listos (alas, corona, rayo, laurel…). Un clic y se colocan. Son vectoriales: se pueden recolorear y separar en partes.

### Texto
`+ Texto`: escribe y elige la tipografía. Hay finas (Inter Extra Light, Bodoni Moda, Cormorant Garamond…) y **gruesas** (Inter Black, Archivo Black, Anton, Bodoni Moda Black, Playfair Display Black). Pulsa «Aplicar en la espalda» (o la cara que estés usando).

### Crear con IA
`+ IA`: escribe una idea corta, por ejemplo «llave antigua estilizada», o elige una de las sugerencias. Antes, pega **una vez** tu clave de OpenAI en «Configuración» (empieza por `sk-`; se guarda solo en este navegador). Elige la dirección de colección (estilo) y el formato; después pulsa «Generar». Los resultados aparecen en la biblioteca: tócalos para colocarlos.

Consejo: pon un límite de gasto en tu cuenta de OpenAI y no uses la clave en un ordenador compartido.

## 5. Paso 2 · Prenda

- **Color del tejido**: carta de colores o un HEX exacto. El 3D cambia en tiempo real.
- **Tejido**: construcción (felpa perchada, French terry…), gramaje, composición y acabado.
- **Fornituras**: ojales, herretes y cordón (acabado metálico, diámetro, posición). Los ojales no se muestran en el 3D por defecto.

## 6. Mover el diseño sobre la prenda

Pulsa una pieza **sobre la prenda 3D**. Aparece un marco con puntos:

- **Arrastrar dentro del marco** la mueve por la prenda.
- **Las esquinas** cambian el tamaño.
- **El círculo de arriba** la gira (se imanta cada 15°).
- **La barra bajo el marco**: Centrar, Espejo, Duplicar, Recortar, Partes y Quitar. Muestra el tamaño en milímetros.

Para editar en 3D, la cámara debe mirar a la cara que estás editando. Si giras demasiado, aparece un botón para volver a la espalda o al frente.

Para dejar de editar una pieza, pulsa **Esc** o pulsa la prenda en un sitio sin diseño.

Teclado: **flechas** mueven la pieza (con Mayús, más rápido) y **Supr** la quita.

Cada cara imprime solo en su mitad de la prenda: un diseño de la espalda no pasa al frente, y al revés. En los costados se corta limpio.

## 7. Paso 3 · Ajustar: acabado, color y tamaño

Con una pieza seleccionada, el panel «Ajustar» tiene, de arriba abajo:

1. **Deshacer / Rehacer** y **Duplicar / Recortar / Partes**.
2. **Acabado** — cómo se aplica en la fábrica:
   - **Estampado**: tinta plana y mate. El acabado más versátil.
   - **Reflectante**: refleja la luz del flash. La tinta reflectante es de **un solo color**.
   - **Bordado en relieve**: hilo cosido con volumen (se ven las puntadas).
   - **Tono sobre tono**: bordado del color de la prenda. Solo se ve con la luz. Si cambias el color de la prenda, el hilo lo sigue.
3. **Color** — **Liso** o **Degradado**:
   - Liso: elige una muestra, el selector o escribe el código HEX.
   - Degradado: dos colores y una dirección (0° = de izquierda a derecha, 90° = de arriba abajo).
   - «Colores originales» devuelve el dibujo a como venía.
4. **Tamaño y posición**: ancho en milímetros, altura desde el hombro, desplazamiento desde el centro y giro.
5. **Dividir la pieza**: recortar o separar por zonas (apartados 8 y 9).
6. **Atajos de estilo (opcional)**: nueve estilos de un toque (blanco, plata reflectante, cromo, hielo, oro bordado, fuego bordado, atardecer, neón, tono sobre tono). Úsalos solo si no quieres ajustar a mano.

Consejo: si aplicas un color liso a un dibujo con sombreado (como un grabado), todo lo que queda opaco pasa a ese color y se pierde el detalle. Para conservar los grises, déjalo en sus «Colores originales».

### Deshacer
**Deshacer** (botón en el panel o en el visor, o **Ctrl+Z**) revierte el último cambio. **Rehacer** (Ctrl+Y) lo vuelve a aplicar. Los cambios seguidos, como un arrastre, cuentan como un solo paso.

## 8. Recortar una pieza

Sirve, por ejemplo, para un diseño con **texto arriba y un dibujo abajo**, y querer un acabado distinto en cada uno.

1. Selecciona la pieza y pulsa **Recortar**.
2. Ajusta el rectángulo: arrastra esquinas o lados, o dibuja uno nuevo. Hay atajos de mitades (superior, inferior, izquierda, derecha).
3. Marca **«Conservar también la pieza original»** si quieres sacar varios recortes de la misma pieza.
4. **Aplicar recorte**.

Repite sobre la pieza original para el segundo recorte y asigna a cada uno su acabado. El recorte queda en el mismo sitio y tamaño que tenía.

## 9. Separar partes (pincel)

Para tratar aparte una zona que no es un rectángulo, por ejemplo las alas de un dragón.

1. Selecciona la pieza y pulsa **Partes**.
2. Pinta con el **pincel** encima de la zona (la **goma** borra lo que sobra). La **varita** selecciona de un clic una zona del mismo color, y puede ser en todo el dibujo.
3. **Invertir** selecciona justo lo contrario dentro del dibujo; **Deshacer** y **Limpiar** corrigen la máscara.
4. **Separar parte**: la zona pasa a ser una pieza nueva con su propio color, degradado y acabado. La pieza original se queda con el resto.

Solo se separa lo que tiene dibujo; pintar sobre huecos transparentes no crea nada.

Las partes son imágenes (no vectores). Si necesitas vectores para pantalla o bordado, el taller tendrá que vectorizarlas.

## 10. El visor 3D

- **Girar**: arrastra con el ratón sobre una zona vacía. **Zoom**: rueda del ratón.
- **Cámaras**: Frente, Espalda, Lateral derecho, Lateral izquierdo y Detalle. Los laterales son los de quien viste la prenda.
- **Fondo claro / oscuro**: cambia la luz y el fondo del estudio.
- **Fija / Girando**: la prenda gira sola mientras no editas nada.
- **Modelo limpio / Con detalles**: oculta o muestra cordones, cremalleras y puntadas del modelo.
- **Calibrar**: ajusta el modelo a la escala real (rotación, altura y escala del estampado). Si tu modelo tiene otra proporción, empieza por aquí.
- **Capturar**: hace una imagen del 3D que se usa en la portada del dossier.

## 11. Paso 4 · Entregar: el dossier para la fábrica

1. Pon un **nombre** al modelo, una **referencia de estilo** (por ejemplo `AHS-FW26-001`) y la **temporada**.
2. Pulsa **Capturar** en el visor si quieres el render 3D en la portada.
3. Pulsa **Compilar dossier**. Se descarga un archivo `.zip`.

Qué trae el ZIP:

- **`dossier-technique.pdf`**: portada, plano de colocación con cotas en milímetros desde el HPS (el punto alto del hombro junto al cuello), desglose de piezas, notas de taller, materiales, tintas e hilos y fornituras.
- **Una carpeta por cara** (`back/`, `front/`) con el diseño en SVG y en PNG a 300 dpi, el plano técnico, y una subcarpeta **por técnica** (estampado, reflectante, bordado), para que cada taller reciba solo lo suyo.
- **`render-3d.png`** y **`spec.json`** (todas las medidas y referencias para quien lo procese a máquina).

### Qué mira el dossier por ti
- Cada pieza lleva su código (`B·01`, `F·02`…), tamaño, posición, giro, técnica y referencia de color.
- Si una pieza tiene **degradado**, el dossier dice los dos colores y la dirección, y añade una nota de fabricación según la técnica. Ojo: **el degradado no se puede hacer tal cual en tinta reflectante**; el taller propondrá una solución.
- Indica la **ubicación estimada** de cada pieza (cuerpo, mangas, capucha). Izquierda y derecha son las de quien viste la prenda.
- Avisa de las **piezas raster** (imágenes subidas, de IA o partes separadas): para pantalla o bordado hay que vectorizarlas o entregar el original a 300 dpi o más.
- Si una pieza sale de la zona recomendada del cuerpo, lo marca como aviso: es válido, pero conviene confirmar con el taller.

### Antes de enviarlo
Revisa que cada pieza tenga la técnica que quieres, que no haya fondos raros en las imágenes y que las medidas sean las pensadas. Los CMYK y las puntadas son estimaciones; la equivalencia exacta con Pantone o hilos Madeira la casa el taller con una muestra.

## 12. Configurador de taller

En `/configurador`, la versión para producir:

1. **Tejido**: color del stock.
2. **Personalización**: prenda lisa, o un texto con tipografía y técnica (tono sobre tono, bordado en relieve o serigrafía) y color del hilo.
3. **Colocación**: corazón, pecho, nuca o espalda (medidas homologadas).
4. **Cantidades**: unidades por talla (de XS a XXL).
5. **Orden**: resumen y botón **Emitir orden de taller**, que genera el dossier con un número de orden `OT-AAMMDD-XXX`.

Arriba a la derecha puedes cambiar entre ambiente claro (Salon) y oscuro (Nuit).

## 13. Atajos de teclado

- **Ctrl+Z**: deshacer. **Ctrl+Y** (o Ctrl+Mayús+Z): rehacer.
- **Esc**: soltar la selección.
- **Flechas**: mover la pieza (con Mayús, 10 veces más).
- **Supr / Retroceso**: quitar la pieza seleccionada.
- **Doble clic** sobre un texto en el lienzo 2D: corregirlo letra a letra.

## 14. Problemas frecuentes

- **«Falta el archivo 3D»**: copia tu `hoodie.glb` en `public\models\`.
- **Mi imagen sale con fondo**: usa un PNG con transparencia real. Si es un JPG con el damero pintado, la app lo limpia; si quedan restos, prueba con otra versión de la imagen.
- **El diseño se ve apagado en una prenda negra**: un dibujo oscuro sobre una prenda oscura se ve poco. Cambia el color o usa un acabado claro (plata, reflectante, blanco).
- **Aparece «Volver a la trasera para mover la pieza»**: la cámara no mira a la cara que editas. Pulsa el botón o elige la cámara Espalda o Frente.
- **No puedo crear con IA**: falta la clave de OpenAI. Pégala en «Configuración» dentro de `+ IA`.
- **Perdí mi diseño al recargar**: la app aún no guarda proyectos. Compila el dossier antes de cerrar.
- **La app no abre**: comprueba que `Iniciar-Atelier.bat` sigue abierto (su ventana es el servidor) y que la dirección es `http://localhost:3000`.

## 15. Límites que conviene conocer

- No hay guardado de proyectos todavía.
- La IA depende de tu cuenta de OpenAI.
- Las medidas están referidas al HPS y a una talla M; las demás tallas se resuelven en el taller con la gradación.
- Las fuentes gruesas no se incrustan aún en el PDF del dossier (usa una fuente de reserva).
- Las partes y los recortes son imágenes, no vectores.

## 16. Glosario

- **HPS**: punto alto del hombro, donde se unen cuello y hombro. Todas las medidas del dossier parten de ahí.
- **Serigrafía**: estampado con pantalla y tinta plana. Una pantalla por color.
- **Reflectante**: tinta que devuelve la luz (tipo 3M Scotchlite). De un solo color.
- **Bordado en relieve**: hilo en satén sobre una espuma de 3 mm, que da volumen.
- **Tono sobre tono**: bordado del mismo color que el tejido; solo se percibe por relieve y brillo.
- **Raster / vector**: raster es una imagen de píxeles; vector son formas y líneas. Los talleres prefieren vector.
- **Dossier**: el paquete de documentos que se manda a la fábrica.
- **OT**: orden de taller.
- **Zona recomendada**: el área ideal del cuerpo para estampar (38 × 48 cm en la espalda y 30 × 24 cm en el pecho). Puedes salirte de ella.
