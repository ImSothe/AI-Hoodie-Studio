'use client';

import { useEffect, useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import { Box3, MeshPhysicalMaterial, Vector3, type Color, type Material, type Mesh, type MeshStandardMaterial } from 'three';
import { TEXTURE_LAYERS } from '@/lib/fabric/registry';
import { HOODIE_VIEWS } from '@/lib/hoodie/spec';
import { useStudio } from '@/lib/store';
import { useCalibration } from '@/lib/three/calibration';
import { computeDecalPlacement } from '@/lib/three/decalPlacement';
import { fabricAlbedo } from '@/lib/three/fabricShading';
import { knitNormalMap } from '@/lib/three/fabricTexture';
import { FABRIC_MATERIAL, GLB_RECOLOR, GLB_TARGET_HEIGHT, HEM_Y, MODEL_HPS_Y } from '@/lib/three/modelConfig';
import { Hardware } from './Hardware';
import { PrintDecal } from './PrintDecal';
import type { DesignTextures } from './useDesignTextures';

/**
 * Carga public/models/hoodie.glb, aplica la orientación calibrada, lo
 * normaliza (escala, centrado, bajo en HEM_Y), lo tiñe con el color de la
 * prenda y estampa cada cara del lienzo con un <Decal> por técnica
 * (serigrafía, reflectante, bordado) sobre la malla principal.
 */
export function GltfHoodie({ url, textures }: { url: string; textures: DesignTextures | null }) {
  const { scene } = useGLTF(url);
  const rotationY = useCalibration((s) => s.rotationY);
  const offsetYCm = useCalibration((s) => s.offsetYCm);
  const scale = useCalibration((s) => s.scale);
  const debug = useCalibration((s) => s.debug);
  const layerCounts = useStudio((s) => s.layerCounts);

  const { root, materials } = useMemo(() => {
    const root = scene.clone(true);
    root.rotation.y = (rotationY * Math.PI) / 180;
    root.updateMatrixWorld(true);

    const box = new Box3().setFromObject(root);
    const size = box.getSize(new Vector3());
    root.scale.multiplyScalar(GLB_TARGET_HEIGHT / (size.y || 1));
    root.updateMatrixWorld(true);

    box.setFromObject(root);
    const center = box.getCenter(new Vector3());
    root.position.set(root.position.x - center.x, root.position.y + HEM_Y - box.min.y, root.position.z - center.z);
    root.updateMatrixWorld(true);

    // GLB_RECOLOR: un mismo tejido para todo el modelo, conservando el relieve
    // del GLB (normal, oclusión y rugosidad). Si no trae normal map se usa el
    // punto de felpa procedural. Sin recolor se clonan los materiales
    // originales (el clon de la escena los comparte con la caché).
    const materials = new Set<Material & { color?: Color }>();
    const fabric = (original: Material, hasUv: boolean) => {
      const src = original as MeshStandardMaterial;
      const mat = Object.assign(new MeshPhysicalMaterial({ ...FABRIC_MATERIAL }), fabricAlbedo);
      if (src.normalMap) {
        mat.normalMap = src.normalMap;
        mat.normalScale.copy(src.normalScale);
      } else if (hasUv) {
        mat.normalMap = knitNormalMap();
        mat.normalScale.set(0.24, 0.24);
      }
      if (src.aoMap) {
        mat.aoMap = src.aoMap;
        mat.aoMapIntensity = src.aoMapIntensity;
      }
      if (src.roughnessMap) mat.roughnessMap = src.roughnessMap;
      return mat;
    };
    root.traverse((obj) => {
      const mesh = obj as Mesh;
      if (!mesh.isMesh) return;
      const hasUv = !!mesh.geometry.getAttribute('uv');
      const convert = (m: Material) => (GLB_RECOLOR ? fabric(m, hasUv) : m.clone());
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(convert) : convert(mesh.material);
      (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((m) => materials.add(m));
    });
    return { root, materials: [...materials] };
  }, [scene, rotationY]);

  // Color de la prenda en tiempo real SIN re-renderizar React: suscripción
  // directa al store y mutación de material.color (R3F pinta en el siguiente frame).
  useEffect(() => {
    const tintable = materials.filter((m) => m.color);
    const apply = (hex: string) => tintable.forEach((m) => m.color!.set(hex));
    apply(useStudio.getState().garmentColor);
    return useStudio.subscribe((s, prev) => {
      if (s.garmentColor !== prev.garmentColor) apply(s.garmentColor);
    });
  }, [materials]);

  const placements = useMemo(
    () =>
      HOODIE_VIEWS.map((view) => {
        const p = computeDecalPlacement(root, view, { hpsY: MODEL_HPS_Y, scale, offsetYCm });
        if (!p) console.warn(`[hoodie] No se encontró superficie para la cara "${view}". Revisa la calibración.`);
        return p;
      }).filter((p) => p !== null),
    [root, scale, offsetYCm],
  );

  useEffect(() => () => materials.forEach((m) => m.dispose()), [materials]);

  return (
    <>
      <primitive object={root} />
      <Hardware root={root} />
      {textures &&
        placements.flatMap((p) => {
          // La key incluye la malla: si cambia (p. ej. al rotar el modelo) el portal se remonta en la nueva.
          const key = `${p.view}:${p.mesh.uuid}`;
          // Un <Decal> por técnica, montado sólo si esa cara tiene elementos con ella.
          return TEXTURE_LAYERS.filter((layer) => layerCounts[p.view][layer] > 0).map((layer, i) => (
            <PrintDecal
              key={`${key}:${layer}`}
              placement={p}
              texture={textures[p.view][layer]}
              bumpMap={layer === 'embroidery' ? textures[p.view].bump : undefined}
              roughnessMap={layer === 'embroidery' ? textures[p.view].rough : undefined}
              finish={layer}
              debug={debug && i === 0}
            />
          ));
        })}
    </>
  );
}
