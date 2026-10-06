import type { HoodieView } from './hoodie/spec';

export type AIProvider = 'openai' | 'recraft';

export type AssetKind = 'svg' | 'png';

export type ImageFormat = 'square' | 'portrait';

export interface GeneratedAsset {
  id: string;
  name: string;
  kind: AssetKind;
  /** data: URL apto para <img> y para Fabric. */
  src: string;
  /** Código SVG saneado (sólo kind === 'svg'). */
  svg?: string;
  provider: AIProvider | 'upload';
  prompt?: string;
  /** Prompt reescrito por DALL·E 3 (útil para iterar). */
  revisedPrompt?: string;
  createdAt: number;
  /** Arte blanco sobre negro: hay que convertir el negro en transparencia en cliente. */
  needsBlackKnockout?: boolean;
  /** Tinta conocida del asset (p. ej. #FFFFFF tras convertir el arte de DALL·E). */
  inkColor?: string;
}

export interface GenerateRequest {
  prompt: string;
  count?: number;
  format?: ImageFormat;
  hd?: boolean;
  /** Dirección de colección (ver lib/ai/prompt.ts). */
  style?: string;
}

export interface GenerateResponse {
  provider: AIProvider;
  assets: GeneratedAsset[];
}

/** Métricas de producción de un objeto o del conjunto de la vista. */
export interface PlacementMetrics {
  view: HoodieView;
  widthCm: number;
  heightCm: number;
  /** Desvío del centro del gráfico respecto al eje central (+ = derecha mirando la prenda). */
  offsetXCm: number;
  /** Distancia del HPS al borde superior del gráfico. */
  topFromHpsCm: number;
  angle: number;
  insidePrintArea: boolean;
}
