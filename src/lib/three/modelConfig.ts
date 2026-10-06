/**
 * Configuración del modelo 3D. Unidades: metros (1 cm de la spec = 0,01).
 *
 * El visor carga SIEMPRE este archivo: no hay modelo de reserva. El GLB se
 * normaliza (escala, centrado, bajo en HEM_Y) para que las áreas de
 * impresión midan en 3D exactamente lo mismo que en el lienzo 2D.
 */

export const MODEL_URL = '/models/hoodie.glb';

/** Altura del bajo de la sudadera en la escena. */
export const HEM_Y = -0.4;
/** Altura total a la que se normaliza el GLB (bajo → punto más alto). */
export const GLB_TARGET_HEIGHT = 0.84;
/**
 * Distancia desde el punto más alto del modelo hasta su HPS (unión
 * cuello-hombro). Ajústala si tu GLB trae la capucha puesta o es más corto.
 */
export const GLB_HPS_FROM_TOP = 0.1;
/** HPS resultante tras la normalización. */
export const MODEL_HPS_Y = HEM_Y + GLB_TARGET_HEIGHT - GLB_HPS_FROM_TOP;
/** Recolorear el GLB con el tejido negro de la colección. */
export const GLB_RECOLOR = true;

export const FABRIC_MATERIAL = {
  color: '#161618',
  roughness: 0.94,
  metalness: 0,
  // El sheen (brillo rasante del tejido) es lo que dibuja el filo del contraluz
  // en una prenda negra: el difuso de un #0B0B0B apenas devuelve luz.
  sheen: 1,
  sheenRoughness: 0.55,
  sheenColor: '#77777a',
} as const;

