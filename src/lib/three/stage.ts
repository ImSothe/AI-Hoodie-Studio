/**
 * Ambientes del escenario 3D. Los valores imitan un estudio de fotografía de
 * producto: un fondo continuo (sin horizonte), softboxes que dan forma al
 * tejido y una sombra de contacto que asienta la prenda en el suelo.
 *
 * - salon: sala clara cálida, la de un configurador de casa de lujo.
 * - nuit:  estudio gris oscuro (nunca negro puro) para el atelier.
 */
export type StageMood = 'salon' | 'nuit';

export interface StageConfig {
  label: string;
  /** Fondo continuo del canvas (también el color de la sala en el entorno). */
  background: string;
  /** Tono base del estudio que rodea a los softboxes (relleno ambiental). */
  room: string;
  environmentIntensity: number;
  exposure: number;
  keyIntensity: number;
  /** Contraluces que recortan la silueta. */
  rimIntensity: number;
  shadowColor: string;
  /** Opacidad de la sombra de contacto (cercana) y de la oclusión amplia. */
  contactShadow: number;
  softShadow: number;
}

export const STAGE_MOODS: Record<StageMood, StageConfig> = {
  salon: {
    label: 'Salon',
    background: '#ECEAE6',
    room: '#3a3835',
    environmentIntensity: 1.05,
    exposure: 1,
    keyIntensity: 1.1,
    rimIntensity: 2.4,
    shadowColor: '#1f1d1b',
    contactShadow: 0.5,
    softShadow: 0.22,
  },
  nuit: {
    label: 'Nuit',
    background: '#141414',
    room: '#121212',
    environmentIntensity: 0.8,
    exposure: 1.05,
    keyIntensity: 2,
    rimIntensity: 6.5,
    shadowColor: '#000000',
    contactShadow: 0.8,
    softShadow: 0.4,
  },
};
