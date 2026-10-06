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
 * UV del GLB → píxel del lienzo. Las UV de este modelo están dibujadas «desde dentro»
 * (espejadas en horizontal): el lienzo las voltea para que cada pieza se vea como se
 * ve la prenda desde fuera y lo que se coloque se lea bien en 3D. Arriba = v mayor.
 */
export const uvToPx = (u: number, v: number): [number, number] => [
  ((PATTERN_UV.u1 - u) / (PATTERN_UV.u1 - PATTERN_UV.u0)) * PATTERN_W,
  ((PATTERN_UV.v1 - v) / (PATTERN_UV.v1 - PATTERN_UV.v0)) * PATTERN_H,
];
