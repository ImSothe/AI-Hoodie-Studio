'use client';

import { addAssetToCanvas } from '../fabric/editor';
import { getCanvas } from '../fabric/registry';
import { useStudio } from '../store';
import { importFiles } from './importFiles';

/**
 * Importa archivos (SVG/PNG/JPG), los guarda en la biblioteca y los coloca en
 * la cara activa. Es el camino de «subir una imagen»: sin pasos intermedios.
 */
export async function placeFiles(files: FileList | File[]) {
  const imported = await importFiles(files);
  if (!imported.length) return 0;
  const store = useStudio.getState();
  store.addAssets(imported);
  const view = store.activeView;
  const canvas = getCanvas(view);
  if (!canvas) return 0;
  for (const asset of imported) await addAssetToCanvas(canvas, view, asset);
  store.setSidebarTab('element');
  return imported.length;
}
