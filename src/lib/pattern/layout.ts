/**
 * Patrón plano de la sudadera. El GLB trae las piezas de tela dibujadas en su
 * espacio UV (espalda, delantero, mangas, capucha, bandas): ese espacio ES el
 * patrón. Aquí se fija la región que ocupan y el lienzo donde se diseña.
 */

/** Región UV que ocupan las piezas de tela del hoodie.glb (con un pequeño margen). */
export const PATTERN_UV = { u0: 0.012, u1: 0.788, v0: -0.988, v1: -0.25 } as const;

/** Lienzo del patrón (px). El alto sale de la proporción de la región UV. */
export const PATTERN_W = 1800;
export const PATTERN_H = Math.round((PATTERN_W * (PATTERN_UV.v1 - PATTERN_UV.v0)) / (PATTERN_UV.u1 - PATTERN_UV.u0));

/**
 * UV del GLB → píxel del lienzo. En vertical, v crece hacia abajo (convención glTF): así el
 * cuello queda arriba y el bajo abajo. Si alguna pieza del modelo está dibujada en espejo, el
 * análisis (`isMirrored`) la voltea sobre sí misma para que se vea como desde fuera.
 */
export const uvToPx = (u: number, v: number): [number, number] => [
  ((u - PATTERN_UV.u0) / (PATTERN_UV.u1 - PATTERN_UV.u0)) * PATTERN_W,
  ((v - PATTERN_UV.v0) / (PATTERN_UV.v1 - PATTERN_UV.v0)) * PATTERN_H,
];
