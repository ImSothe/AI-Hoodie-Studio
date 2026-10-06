'use client';

import type { Texture } from 'three';
import type { TextureLayer } from '@/lib/fabric/registry';
import type { DecalPatch } from '@/lib/three/decalPlacement';
import { useReflectionEnv } from './useReflectionEnv';
import { fabricAlbedo } from '@/lib/three/fabricShading';

const POLYGON_OFFSET = -10;

/** Propiedades pedidas para simular tinta reflectante tipo 3M Scotchlite / D3O. */
const REFLECTIVE = {
  roughness: 0.1,
  metalness: 0.8,
  clearcoat: 1,
  clearcoatRoughness: 0.05,
  // El emissive toma el color de cada gráfico a través de su propia textura.
  emissive: '#FFFFFF',
  emissiveIntensity: 0.22,
  envMapIntensity: 1.4,
} as const;

/**
 * Bordado (alto relieve y ton-sur-ton): rugosidad por píxel (roughnessMap),
 * sheen de hilo y relieve de puntadas. El ton-sur-ton satinado comparte color
 * con el tejido y sólo se revela por el brillo cuando le da la luz.
 */
const EMBROIDERY = {
  roughness: 1,
  metalness: 0,
  sheen: 0.7,
  sheenRoughness: 0.3,
  sheenColor: '#FFFFFF',
  bumpScale: 3,
} as const;

/**
 * Estampa la textura del lienzo Fabric sobre los paneles de la prenda con los
 * parches de DecalGeometry del proyector global (uno por panel, misma
 * proyección: el gráfico cruza las costuras). La textura no usa las UVs del modelo.
 *
 * Los parches ya vienen en coordenadas de mundo: cada malla se monta con su
 * matriz fija en identidad para que no herede transformaciones del padre.
 *
 * Un decal por técnica de aplicación:
 * - print → MeshStandardMaterial mate (serigrafía plana).
 * - reflective → MeshPhysicalMaterial metálico con clearcoat y un ligero
 *   emissive del propio color del gráfico.
 * - embroidery → MeshPhysicalMaterial con sheen de hilo y bumpMap de relieve.
 */
export function PrintDecal({
  patches,
  texture,
  bumpMap,
  roughnessMap,
  finish,
  debug,
}: {
  patches: DecalPatch[];
  texture: Texture;
  bumpMap?: Texture;
  roughnessMap?: Texture;
  finish: TextureLayer;
  debug?: boolean;
}) {
  const envMap = useReflectionEnv();
  const offset = finish === 'embroidery' ? POLYGON_OFFSET - 4 : POLYGON_OFFSET;
  const common = {
    ...fabricAlbedo,
    map: texture,
    transparent: true,
    // depthTest activo: la estampa de la espalda no se ve a través del cuerpo.
    depthTest: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: offset,
    wireframe: debug,
  };

  return (
    <>
      {patches.map((patch, i) => (
        <mesh
          key={`${patch.mesh.uuid}:${i}`}
          geometry={patch.geometry}
          matrixAutoUpdate={false}
          matrixWorldAutoUpdate={false}
          renderOrder={{ print: 2, reflective: 3, embroidery: 4 }[finish]}
        >
          {finish === 'reflective' ? (
            <meshPhysicalMaterial {...common} {...REFLECTIVE} emissiveMap={texture} envMap={envMap} />
          ) : finish === 'embroidery' ? (
            <meshPhysicalMaterial {...common} {...EMBROIDERY} bumpMap={bumpMap} roughnessMap={roughnessMap} />
          ) : (
            <meshStandardMaterial {...common} roughness={0.88} metalness={0} />
          )}
        </mesh>
      ))}
    </>
  );
}
