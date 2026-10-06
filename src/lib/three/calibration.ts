'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Calibración del GLB del usuario (se guarda en este navegador).
 *
 * Cada modelo viene orientado y proporcionado a su manera. Estos tres ajustes
 * bastan para alinear el estampado sin tocar las UVs del archivo:
 * - rotationY: gira el modelo si su "frente" no mira hacia +Z.
 * - offsetYCm: sube/baja el estampado si el HPS estimado no coincide.
 * - scale: agranda/reduce el estampado si la prenda 3D no mide 66 cm de pecho.
 */
interface CalibrationState {
  rotationY: 0 | 90 | 180 | 270;
  offsetYCm: number;
  scale: number;
  /** Muestra la caja del proyector de cada <Decal>. */
  debug: boolean;
  set: (patch: Partial<Omit<CalibrationState, 'set' | 'reset'>>) => void;
  reset: () => void;
}

const DEFAULTS = { rotationY: 0 as const, offsetYCm: 0, scale: 1, debug: false };

export const useCalibration = create<CalibrationState>()(
  persist(
    (set) => ({
      ...DEFAULTS,
      set: (patch) => set(patch),
      reset: () => set(DEFAULTS),
    }),
    { name: 'aihs.modelCalibration', version: 1 },
  ),
);
