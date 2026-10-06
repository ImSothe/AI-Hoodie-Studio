'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { Box3, Matrix4, MeshPhysicalMaterial, Vector3, type Color, type Material, type Mesh, type MeshStandardMaterial, type Object3D } from 'three';
import { TEXTURE_LAYERS } from '@/lib/fabric/registry';
import { HOODIE_VIEWS } from '@/lib/hoodie/spec';
import { useStudio } from '@/lib/store';
import { useCalibration } from '@/lib/three/calibration';
import { buildDecalPatches, computeProjector, garmentMeshes } from '@/lib/three/decalPlacement';
import { fabricAlbedo } from '@/lib/three/fabricShading';
import { splitHood } from '@/lib/three/hoodSplit';
import { setGarmentRoot } from '@/lib/three/garmentRegistry';
import { knitNormalMap } from '@/lib/three/fabricTexture';
import { FABRIC_MATERIAL, GLB_RECOLOR, GLB_TARGET_HEIGHT, HEM_Y, HOOD_LIFT_M, HOOD_PIVOT_Z, HOOD_TILT_RAD, MODEL_HPS_Y } from '@/lib/three/modelConfig';
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
  const showDetails = useStudio((s) => s.showDetails);

  const { root, materials, hoodParts } = useMemo(() => {
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
    const hoodParts = splitHood(root);
    return { root, materials: [...materials], hoodParts };
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

  // El modelo queda accesible para la edición directa (arrastrar gráficos sobre la prenda).
  useEffect(() => {
    setGarmentRoot(root);
    return () => setGarmentRoot(null);
  }, [root]);

  // Modelo limpio: sólo los paneles del tejido. Cordones, cremalleras y puntadas se muestran a petición.
  useEffect(() => {
    const panels = new Set<Object3D>(garmentMeshes(root));
    root.traverse((obj) => {
      if ((obj as Mesh).isMesh && !panels.has(obj) && !obj.userData.hood) obj.visible = showDetails;
    });
  }, [root, showDetails]);

  // Levantar la capucha: bisagra en el cuello. La capucha se echa hacia atrás y sube,
  // con una animación suave; el cuerpo queda a la vista debajo.
  const hoodRig = useMemo(
    () =>
      hoodParts.map((mesh) => {
        mesh.updateMatrix();
        mesh.matrixAutoUpdate = false;
        return { mesh, rest: mesh.matrix.clone() };
      }),
    [hoodParts],
  );
  const hoodT = useRef(0);
  useFrame((_, dt) => {
    const target = useStudio.getState().hoodUp ? 1 : 0;
    if (hoodT.current === target || !hoodRig.length) return;
    const diff = target - hoodT.current;
    hoodT.current = Math.abs(diff) < 0.002 ? target : hoodT.current + diff * Math.min(1, dt * 5);
    const t = hoodT.current;
    const pivot = new Vector3(0, MODEL_HPS_Y, HOOD_PIVOT_Z);
    const anim = new Matrix4()
      .makeTranslation(0, HOOD_LIFT_M * t, -HOOD_LIFT_M * 0.4 * t)
      .multiply(new Matrix4().makeTranslation(pivot.x, pivot.y, pivot.z))
      .multiply(new Matrix4().makeRotationX(HOOD_TILT_RAD * t))
      .multiply(new Matrix4().makeTranslation(-pivot.x, -pivot.y, -pivot.z));
    for (const { mesh, rest } of hoodRig) {
      const parentWorld = mesh.parent ? mesh.parent.matrixWorld : new Matrix4();
      mesh.matrix.copy(parentWorld.clone().invert().multiply(anim).multiply(parentWorld).multiply(rest));
      mesh.matrixWorldNeedsUpdate = true;
    }
  });

  // Un proyector por cara y un parche de decal por panel del tejido.
  const projections = useMemo(
    () =>
      HOODIE_VIEWS.flatMap((view) => {
        const projector = computeProjector(root, view, { hpsY: MODEL_HPS_Y, scale, offsetYCm });
        if (!projector) {
          console.warn(`[hoodie] No se encontró tejido para la cara "${view}". Revisa la calibración.`);
          return [];
        }
        return [{ view, patches: buildDecalPatches(projector) }];
      }),
    [root, scale, offsetYCm],
  );

  useEffect(() => () => projections.forEach((p) => p.patches.forEach((patch) => patch.geometry.dispose())), [projections]);
  useEffect(() => () => materials.forEach((m) => m.dispose()), [materials]);

  return (
    <>
      <primitive object={root} />
      <Hardware root={root} />
      {textures &&
        projections.flatMap(({ view, patches }) =>
          // Un decal por técnica, montado sólo si esa cara tiene elementos con ella.
          TEXTURE_LAYERS.filter((layer) => layerCounts[view][layer] > 0).map((layer, i) => (
            <PrintDecal
              key={`${view}:${layer}`}
              patches={patches}
              texture={textures[view][layer]}
              bumpMap={layer === 'embroidery' ? textures[view].bump : undefined}
              roughnessMap={layer === 'embroidery' ? textures[view].rough : undefined}
              finish={layer}
              debug={debug && i === 0}
            />
          )),
        )}
    </>
  );
}
