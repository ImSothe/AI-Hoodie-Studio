'use client';

import { useMemo } from 'react';
import { Quaternion, Vector3, type Object3D } from 'three';
import { metalFinish } from '@/lib/hoodie/spec';
import { useStudio } from '@/lib/store';
import { useCalibration } from '@/lib/three/calibration';
import { surfaceHit } from '@/lib/three/decalPlacement';
import { MODEL_HPS_Y } from '@/lib/three/modelConfig';
import { useReflectionEnv } from './useReflectionEnv';

const Z = new Vector3(0, 0, 1);

/**
 * Ojales metálicos del cordón con el acabado elegido. Se colocan por raycast
 * sobre la malla principal a la separación y altura (mm desde el HPS) de la
 * ficha de fornituras, orientados según la normal de la superficie.
 */
export function Hardware({ root }: { root: Object3D }) {
  const hw = useStudio((s) => s.hardware);
  const scale = useCalibration((s) => s.scale);
  const offsetYCm = useCalibration((s) => s.offsetYCm);
  const envMap = useReflectionEnv();
  const finish = metalFinish(hw.eyeletFinish);

  const eyelets = useMemo(() => {
    if (!hw.show3d) return [];
    const y = MODEL_HPS_Y + offsetYCm / 100 - (hw.eyeletDropMm / 1000) * scale;
    const half = (hw.eyeletSpacingMm / 2000) * scale;
    const placed = [-half, half].flatMap((x) => {
      const hit = surfaceHit(root, x, y, 'front', { anyMesh: true });
      if (!hit) return [];
      const quaternion = new Quaternion().setFromUnitVectors(Z, hit.normal);
      const position = hit.point.add(hit.normal.clone().multiplyScalar(0.0012));
      return [{ position, quaternion }];
    });
    if (placed.length < 2) console.warn('[hoodie] No se encontró superficie para los ojales. Ajusta la altura en «Calibrar».');
    return placed;
  }, [root, hw.show3d, hw.eyeletDropMm, hw.eyeletSpacingMm, scale, offsetYCm]);

  const outer = ((hw.eyeletDiameterMm / 2) * scale) / 1000;
  const tube = Math.max(0.0009, outer * 0.28);

  return (
    <>
      {eyelets.map((e, i) => (
        <group key={i} position={e.position} quaternion={e.quaternion}>
          {/* Arandela + boca del ojal */}
          <mesh>
            <torusGeometry args={[outer - tube, tube, 16, 48]} />
            <meshStandardMaterial
              color={finish.hex}
              metalness={finish.metalness}
              roughness={finish.roughness}
              envMap={envMap}
              envMapIntensity={1.2}
            />
          </mesh>
          <mesh position={[0, 0, -0.0004]}>
            <circleGeometry args={[outer - tube * 1.6, 32]} />
            <meshStandardMaterial color="#050505" roughness={1} />
          </mesh>
        </group>
      ))}
    </>
  );
}
