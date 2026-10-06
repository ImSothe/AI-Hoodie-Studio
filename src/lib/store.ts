'use client';

import { create } from 'zustand';
import {
  DEFAULT_FABRIC,
  DEFAULT_HARDWARE,
  type FabricSpec,
  type HardwareSpec,
  type HoodieView,
  type TechniqueLayer,
} from './hoodie/spec';
import { DEFAULT_COLLECTION_STYLE, type CollectionStyleId } from './ai/prompt';
import type { ElementSummary, SelectionStyle } from './fabric/editor';
import type { StageMood } from './three/stage';
import type { AIProvider, GeneratedAsset, PlacementMetrics } from './types';

/** Color por defecto de la prenda (negro de colección). */
export const DEFAULT_GARMENT_COLOR = '#0B0B0B';

/** Presets de cámara del configurador. Los laterales siguen el criterio de fábrica (lado de quien la viste). */
export type CameraPreset = 'front' | 'back' | 'right' | 'left' | 'detail';

export type SidebarTab = 'design' | 'text' | 'garment' | 'element' | 'production';

interface StudioState {
  activeView: HoodieView;
  sidebarTab: SidebarTab;
  camera: { preset: CameraPreset; nonce: number };
  assets: GeneratedAsset[];
  isGenerating: boolean;
  generateError: string | null;
  lastProvider: AIProvider | null;
  /** Métricas del objeto seleccionado en el lienzo activo. */
  selection: PlacementMetrics | null;
  /** Color y acabado de los gráficos seleccionados. */
  selectionStyle: SelectionStyle | null;
  /** Nº de gráficos colocados por vista (para saber qué exportar). */
  designCounts: Record<HoodieView, number>;
  /** Elementos por capa de técnica y vista (activa cada <Decal> 3D sólo si hace falta). */
  layerCounts: Record<HoodieView, Record<TechniqueLayer, number>>;
  /** Elementos de la cara activa (lista del panel Elemento). */
  elements: ElementSummary[];
  /** HEX exacto del tejido. */
  garmentColor: string;
  designName: string;
  /** Dirección de colección con la que la IA genera los gráficos. */
  collectionStyle: CollectionStyleId;
  /** Código de modelo del atelier (aparece en fichas y dossier). */
  styleCode: string;
  season: string;
  fabric: FabricSpec;
  hardware: HardwareSpec;
  /** El usuario está manipulando el 3D: la interfaz se retira para dar protagonismo a la prenda. */
  immersive: boolean;
  /** Ambiente del escenario 3D del atelier: estudio oscuro (nuit) o sala clara (salon). */
  stageMood: StageMood;
  /** Captura del visor 3D para incluir en el Tech Pack. */
  snapshot3d: string | null;

  setActiveView: (view: HoodieView) => void;
  /** Cambia de cara de la prenda y gira la cámara 3D hacia ella. */
  focusView: (view: HoodieView) => void;
  setSidebarTab: (tab: SidebarTab) => void;
  requestCamera: (preset: CameraPreset) => void;
  addAssets: (assets: GeneratedAsset[]) => void;
  removeAsset: (id: string) => void;
  setGenerating: (value: boolean) => void;
  setGenerateError: (error: string | null) => void;
  setLastProvider: (provider: AIProvider | null) => void;
  setSelection: (metrics: PlacementMetrics | null) => void;
  setDesignCount: (view: HoodieView, count: number) => void;
  setLayerCounts: (view: HoodieView, counts: Record<TechniqueLayer, number>) => void;
  setElements: (elements: ElementSummary[]) => void;
  setSelectionStyle: (style: SelectionStyle | null) => void;
  setGarmentColor: (hex: string) => void;
  setDesignName: (value: string) => void;
  setCollectionStyle: (value: CollectionStyleId) => void;
  setStyleCode: (value: string) => void;
  setSeason: (value: string) => void;
  setFabric: (patch: Partial<FabricSpec>) => void;
  setHardware: (patch: Partial<HardwareSpec>) => void;
  setImmersive: (value: boolean) => void;
  setStageMood: (mood: StageMood) => void;
  setSnapshot3d: (dataUrl: string | null) => void;
}

export const useStudio = create<StudioState>((set) => ({
  activeView: 'back',
  sidebarTab: 'design',
  camera: { preset: 'back', nonce: 0 },
  assets: [],
  isGenerating: false,
  generateError: null,
  lastProvider: null,
  selection: null,
  selectionStyle: null,
  designCounts: { front: 0, back: 0 },
  layerCounts: {
    front: { print: 0, reflective: 0, embroidery: 0 },
    back: { print: 0, reflective: 0, embroidery: 0 },
  },
  elements: [],
  garmentColor: DEFAULT_GARMENT_COLOR,
  designName: 'Nocturne',
  collectionStyle: DEFAULT_COLLECTION_STYLE,
  styleCode: 'AHS-FW26-001',
  season: 'FW26',
  fabric: DEFAULT_FABRIC,
  hardware: DEFAULT_HARDWARE,
  immersive: false,
  stageMood: 'nuit',
  snapshot3d: null,

  // Al cambiar de cara se limpia la selección (el lienzo oculto la descarta);
  // si la cara no cambia se conserva para no "perder" el gráfico seleccionado.
  setActiveView: (activeView) =>
    set((s) => (s.activeView === activeView ? {} : { activeView, selection: null, selectionStyle: null })),
  focusView: (activeView) =>
    set((s) => ({
      ...(s.activeView === activeView ? {} : { activeView, selection: null, selectionStyle: null }),
      camera: { preset: activeView, nonce: s.camera.nonce + 1 },
    })),
  setSidebarTab: (sidebarTab) => set({ sidebarTab }),
  requestCamera: (preset) => set((s) => ({ camera: { preset, nonce: s.camera.nonce + 1 } })),
  addAssets: (assets) => set((s) => ({ assets: [...assets, ...s.assets] })),
  removeAsset: (id) => set((s) => ({ assets: s.assets.filter((a) => a.id !== id) })),
  setGenerating: (isGenerating) => set({ isGenerating }),
  setGenerateError: (generateError) => set({ generateError }),
  setLastProvider: (lastProvider) => set({ lastProvider }),
  setSelection: (selection) => set({ selection }),
  setDesignCount: (view, count) =>
    set((s) => ({ designCounts: { ...s.designCounts, [view]: count } })),
  setLayerCounts: (view, counts) => set((s) => ({ layerCounts: { ...s.layerCounts, [view]: counts } })),
  setElements: (elements) => set({ elements }),
  setSelectionStyle: (selectionStyle) => set({ selectionStyle }),
  setGarmentColor: (garmentColor) => set({ garmentColor }),
  setDesignName: (designName) => set({ designName }),
  setCollectionStyle: (collectionStyle) => set({ collectionStyle }),
  setStyleCode: (styleCode) => set({ styleCode }),
  setSeason: (season) => set({ season }),
  setFabric: (patch) => set((s) => ({ fabric: { ...s.fabric, ...patch } })),
  setHardware: (patch) => set((s) => ({ hardware: { ...s.hardware, ...patch } })),
  setImmersive: (immersive) => set((s) => (s.immersive === immersive ? {} : { immersive })),
  setStageMood: (stageMood) => set({ stageMood }),
  setSnapshot3d: (snapshot3d) => set({ snapshot3d }),
}));
