/**
 * Direcciones de colección para la generación de gráficos.
 *
 * Cada estilo lleva su especificación en español (la que se muestra en la
 * interfaz) y su equivalente en inglés, porque DALL·E 3 la sigue con más
 * precisión. Todas piden blanco sobre negro puro: así el fondo se convierte en
 * transparencia sin pérdidas y el blanco queda como una única tinta / hilo.
 */

/** Especificación literal pedida para la línea gótica (se conserva tal cual). */
export const GOTHIC_STYLE_ES =
  'diseño aislado en blanco sobre fondo negro puro, estilo tatuaje tribal gótico, streetwear, sin sombras, flat vector';

const GOTHIC_STYLE_EN =
  'isolated white design on a pure black background, gothic tribal tattoo style, streetwear, no shadows, flat vector';

export const COLLECTION_STYLES = [
  {
    id: 'silence',
    label: 'Lujo silencioso',
    code: 'LS',
    note: 'Emblemas mínimos de casa de costura: trazo fino constante, geometría precisa y mucho aire.',
    es: 'diseño aislado en blanco sobre fondo negro puro, emblema minimalista de casa de alta costura, trazo fino y constante, geometría precisa, mucho espacio negativo, sin sombras, flat vector',
    en: 'isolated white design on a pure black background, minimalist haute couture house emblem, fine consistent stroke weight, precise geometry, generous negative space, no shadows, flat vector',
    examples: ['llave antigua estilizada', 'escudo heráldico de línea fina', 'corona de laurel abierta', 'constelación geométrica mínima'],
  },
  {
    id: 'archive',
    label: 'Archivo técnico',
    code: 'AT',
    note: 'Láminas de archivo: dibujo técnico o botánico de línea uniforme, como un plano de ingeniería.',
    es: 'diseño aislado en blanco sobre fondo negro puro, dibujo técnico de línea fina tipo plano de ingeniería o lámina botánica de archivo, trazo uniforme, sin sombras, flat vector',
    en: 'isolated white design on a pure black background, fine-line technical drawing like an engineering blueprint or an archival botanical plate, uniform stroke, no shadows, flat vector',
    examples: ['despiece de una brújula antigua', 'lámina botánica de una rosa', 'alzado de una catedral gótica', 'anatomía de una polilla'],
  },
  {
    id: 'gothic',
    label: 'Tatuaje tribal gótico',
    code: 'TG',
    note: 'La línea streetwear original: tatuaje tribal gótico de alto contraste.',
    es: GOTHIC_STYLE_ES,
    en: GOTHIC_STYLE_EN,
    examples: ['columna vertebral tribal con espinas', 'alas de murciélago góticas', 'cruz gótica con alambre de espino', 'cráneo tribal con cuernos'],
  },
] as const;

export type CollectionStyleId = (typeof COLLECTION_STYLES)[number]['id'];
export const DEFAULT_COLLECTION_STYLE: CollectionStyleId = 'silence';

export const isCollectionStyle = (id: unknown): id is CollectionStyleId =>
  COLLECTION_STYLES.some((s) => s.id === id);

export const collectionStyle = (id: CollectionStyleId) => COLLECTION_STYLES.find((s) => s.id === id)!;

export function buildPrintPrompt(concept: string, styleId: CollectionStyleId = DEFAULT_COLLECTION_STYLE) {
  const style = collectionStyle(styleId);
  return [
    `${concept.trim()}.`,
    `${style.es}.`,
    `${style.en}.`,
    'Single centered graphic for a hoodie print or embroidery: only solid white ink, crisp clean edges, high contrast,',
    'no gradients, no grey tones, no text, no mockup, no garment, no frame, nothing touching the borders.',
  ].join(' ');
}

export const MAX_PROMPT_LENGTH = 500;
export const MAX_VARIATIONS = 4;
