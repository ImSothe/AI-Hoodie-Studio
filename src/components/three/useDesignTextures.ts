'use client';

import { useEffect, useState } from 'react';
import { CanvasTexture, NoColorSpace, SRGBColorSpace } from 'three';
import { getTextureCanvas, onDesignChanged, TEXTURE_LAYERS, type TextureLayer } from '@/lib/fabric/registry';
import { paintEmbroideryMaps, paintPrintTexture } from '@/lib/fabric/render';
import { HOODIE_VIEWS, type HoodieView } from '@/lib/hoodie/spec';

/** Por cara: una textura por técnica + el mapa de relieve del bordado. */
export type DesignTextures = Record<HoodieView, Record<TextureLayer, CanvasTexture> & { bump: CanvasTexture; rough: CanvasTexture }>;

/**
 * Conexión Fabric → Three: una CanvasTexture por cara y técnica (serigrafía,
 * reflectante, bordado), apuntando a los canvas de textura del registro. Cuando Fabric
 * avisa de un cambio se repinta el área de impresión (máx. una vez por frame)
 * y se marca `needsUpdate`.
 */
export function useDesignTextures(): DesignTextures | null {
  const [textures, setTextures] = useState<DesignTextures | null>(null);

  useEffect(() => {
    const created = Object.fromEntries(
      HOODIE_VIEWS.map((view) => {
        const layers = Object.fromEntries(
          TEXTURE_LAYERS.map((layer) => {
            const texture = new CanvasTexture(getTextureCanvas(view, layer));
            texture.colorSpace = SRGBColorSpace;
            texture.anisotropy = 8;
            return [layer, texture];
          }),
        );
        const bump = new CanvasTexture(getTextureCanvas(view, 'bump'));
        bump.colorSpace = NoColorSpace; // datos de altura, no color
        const rough = new CanvasTexture(getTextureCanvas(view, 'rough'));
        rough.colorSpace = NoColorSpace; // rugosidad por píxel (hilo satinado / mate)
        return [view, { ...layers, bump, rough }];
      }),
    ) as DesignTextures;

    const refresh = (view: HoodieView) => {
      for (const layer of TEXTURE_LAYERS) {
        paintPrintTexture(view, layer);
        created[view][layer].needsUpdate = true;
      }
      paintEmbroideryMaps(view);
      created[view].bump.needsUpdate = true;
      created[view].rough.needsUpdate = true;
    };
    HOODIE_VIEWS.forEach(refresh);
    setTextures(created);

    const pending = new Set<HoodieView>();
    let frame = 0;
    const off = onDesignChanged((view) => {
      pending.add(view);
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        pending.forEach(refresh);
        pending.clear();
      });
    });

    return () => {
      off();
      cancelAnimationFrame(frame);
      HOODIE_VIEWS.forEach((v) => {
        TEXTURE_LAYERS.forEach((l) => created[v][l].dispose());
        created[v].bump.dispose();
        created[v].rough.dispose();
      });
    };
  }, []);

  return textures;
}
