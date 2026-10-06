# Modelo 3D (obligatorio)

El visor carga **siempre** `public/models/hoodie.glb`. No hay modelo de reserva: si el archivo
no existe, el visor muestra el aviso «Falta el archivo 3D».

- Formato: GLB (glTF 2.0 binario). Si usa compresión Draco, drei descarga el decoder desde su CDN.
- Orientación: lo ideal es que la prenda mire hacia **+Z** (convención glTF); si no, corrígelo con «Calibrar modelo».
- El modelo se normaliza solo: se escala a 0,84 m de alto, se centra y el bajo queda en `HEM_Y`.
- Los diseños se proyectan con `<Decal>` de drei sobre la malla principal que hay en el pecho/espalda
  (se localiza por raycast): **no se usan las UVs del modelo**, así que da igual cómo esté desplegado.
- Si el estampado sale en el lado equivocado, alto/bajo o con otro tamaño, usa **Calibrar modelo**
  en el visor (orientación, altura y escala). Para fijar el valor por defecto edita `GLB_HPS_FROM_TOP`
  en `src/lib/three/modelConfig.ts`.
- `GLB_RECOLOR = true` sustituye los materiales por el tejido negro de la colección.
- Con `npm run dev` basta con copiar el archivo y pulsar «Reintentar». En producción hay que volver a
  ejecutar `npm run build`, porque Next.js sólo sirve lo que había en `public/` al compilar.

Fuentes de modelos: Sketchfab (filtro «Downloadable»), CGTrader, TurboSquid o exportado desde
CLO3D / Marvelous Designer / Blender. Revisa siempre la licencia antes de usarlo comercialmente.
