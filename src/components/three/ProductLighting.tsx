'use client';

import { useEffect, useRef } from 'react';
import { ContactShadows, Environment, Lightformer } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import type { Group, Vector3 } from 'three';
import { HEM_Y } from '@/lib/three/modelConfig';
import { STAGE_MOODS, type StageMood } from '@/lib/three/stage';

/** Azimut de la cámara alrededor del objetivo de OrbitControls. */
function cameraAzimuth(camera: { position: Vector3 }, controls: unknown) {
  const target = (controls as { target?: Vector3 } | null)?.target;
  return Math.atan2(camera.position.x - (target?.x ?? 0), camera.position.z - (target?.z ?? 0));
}

/**
 * Softboxes del estudio, generados en local (sin descargar HDRIs): cenital
 * grande, llave delante a la derecha, relleno a la izquierda, dos tiras de
 * contraluz detrás y el rebote cálido del suelo. Se renderizan una vez a un
 * cubemap que da la luz difusa y los reflejos (sheen del tejido, metal de
 * los ojales, tinta reflectante).
 */
function Softboxes({ room }: { room: string }) {
  return (
    <>
      <color attach="background" args={[room]} />
      <Lightformer form="rect" intensity={2.6} position={[0, 5, 0.8]} scale={[5, 3, 1]} />
      <Lightformer form="rect" intensity={2.2} position={[3.2, 1.8, 3.2]} scale={[2.2, 3.4, 1]} />
      <Lightformer form="rect" intensity={0.9} position={[-3.6, 1.2, 2.8]} scale={[2.2, 3, 1]} />
      <Lightformer form="rect" intensity={3.2} position={[-3, 1.6, -3.2]} scale={[0.6, 4.5, 1]} />
      <Lightformer form="rect" intensity={3.2} position={[3, 1.6, -3.2]} scale={[0.6, 4.5, 1]} />
      <Lightformer form="rect" intensity={0.35} color="#efe7da" position={[0, -3, 0]} scale={[8, 8, 1]} />
    </>
  );
}

/**
 * Iluminación de configurador: entorno de softboxes + llave y contraluces
 * direccionales. Todo el estudio gira con el azimut de la cámara, como en una
 * sesión de producto: la prenda queda igual de bien iluminada (y con la
 * silueta recortada) desde el frente, la espalda o los laterales.
 * Tone mapping neutro (Khronos PBR Neutral): no altera el color del tejido.
 */
export function ProductLighting({ mood }: { mood: StageMood }) {
  const stage = STAGE_MOODS[mood];
  const rig = useRef<Group>(null);
  const scene = useThree((s) => s.scene);
  const gl = useThree((s) => s.gl);

  useEffect(() => {
    gl.toneMappingExposure = stage.exposure;
  }, [gl, stage.exposure]);

  useFrame(({ camera, controls }) => {
    const azimuth = cameraAzimuth(camera, controls);
    if (rig.current) rig.current.rotation.y = azimuth;
    scene.environmentRotation.y = -azimuth;
  });

  return (
    <>
      <color attach="background" args={[stage.background]} />
      <Environment resolution={256} frames={1} environmentIntensity={stage.environmentIntensity}>
        <Softboxes room={stage.room} />
      </Environment>
      <group ref={rig}>
        {/* Llave: delante a la derecha, alta y ligeramente cálida */}
        <directionalLight position={[1.8, 2.4, 2.6]} intensity={stage.keyIntensity} color="#fff7ee" />
        {/* Contraluces: detrás y arriba, uno a cada lado; recortan hombros, capucha y mangas */}
        <directionalLight position={[2.8, 2.4, -2.2]} intensity={stage.rimIntensity} color="#f7f8fb" />
        <directionalLight position={[-2.8, 2.4, -2.2]} intensity={stage.rimIntensity} color="#f7f8fb" />
      </group>
    </>
  );
}

/** Sombra de contacto en dos capas: una cercana y nítida y una oclusión amplia y suave. */
export function ProductShadows({ mood }: { mood: StageMood }) {
  const stage = STAGE_MOODS[mood];
  return (
    <>
      <ContactShadows
        position={[0, HEM_Y - 0.004, 0]}
        opacity={stage.contactShadow}
        scale={2.2}
        blur={1.8}
        far={0.5}
        resolution={1024}
        color={stage.shadowColor}
      />
      <ContactShadows
        position={[0, HEM_Y - 0.008, 0]}
        opacity={stage.softShadow}
        scale={3.6}
        blur={4}
        far={1.6}
        resolution={512}
        color={stage.shadowColor}
      />
    </>
  );
}
