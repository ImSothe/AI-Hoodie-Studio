'use client';

import { Suspense, useEffect, useMemo, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, useGLTF } from '@react-three/drei';
import { Box3, BufferAttribute, MeshPhysicalMaterial, NeutralToneMapping, Vector3, type Mesh, type Texture } from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { analyzePattern, attachPatternUv, type PatternAnalysis } from '@/lib/pattern/analysis';
import type { PatternMode } from '@/lib/pattern/layout';
import { fabricPanels } from '@/lib/pattern/panels';
import { getPrintTexture } from '@/lib/pattern/print';
import { useCalibration } from '@/lib/three/calibration';
import { knitNormalMap } from '@/lib/three/fabricTexture';
import { FABRIC_MATERIAL, GLB_TARGET_HEIGHT, HEM_Y, MODEL_URL } from '@/lib/three/modelConfig';
import { ProductLighting, ProductShadows } from '../three/ProductLighting';

/** Sudadera con el patrón estampado: cada pieza lee su zona del lienzo plano por sus UV. */
function PatternGarment({
  color,
  mode,
  onAnalysis,
}: {
  color: string;
  mode: PatternMode;
  onAnalysis: (a: PatternAnalysis) => void;
}) {
  const { scene } = useGLTF(MODEL_URL);
  const rotationY = useCalibration((s) => s.rotationY);
  // Uniform compartido por todos los materiales: 0 = tendidos unidos, 1 = piezas sueltas.
  const piecesMode = useMemo(() => ({ value: 0 }), []);
  // Texturas de las capas reflectante y de bordado (la de estampado es `map`).
  const layerUniforms = useMemo(
    () => ({
      refl: { value: getPrintTexture('joined', 'reflective') as Texture },
      emb: { value: getPrintTexture('joined', 'embroidery') as Texture },
    }),
    [],
  );

  const { root, materials, analysis } = useMemo(() => {
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

    const panels = new Set<Mesh>(fabricPanels(root));
    // Geometría propia: la del GLB está en caché y aquí se le añaden atributos.
    panels.forEach((mesh) => (mesh.geometry = mesh.geometry.clone()));
    const analysis = analyzePattern(root);
    attachPatternUv(analysis);

    const materials: MeshPhysicalMaterial[] = [];
    root.traverse((obj) => {
      const mesh = obj as Mesh;
      if (!mesh.isMesh) return;
      if (!panels.has(mesh)) {
        mesh.visible = false; // cordones, cremalleras y puntadas: fuera
        return;
      }
      const count = mesh.geometry.getAttribute('position').count;
      mesh.geometry.setAttribute(
        'printMask',
        new BufferAttribute(analysis.masks.get(mesh) ?? new Float32Array(count).fill(1), 1),
      );
      const mat = new MeshPhysicalMaterial({ ...FABRIC_MATERIAL });
      mat.map = getPrintTexture('joined', 'print'); // el shader necesita el mapa desde el primer compilado
      mat.normalMap = knitNormalMap();
      mat.normalScale.set(0.24, 0.24);
      // El mapa no multiplica el color de la tela: el diseño se pinta encima, con su transparencia, y sólo en la
      // capa exterior (el forro no recibe dibujo). Tres capas, una por técnica, con su aspecto:
      //  - estampado: tinta plana y mate;  - reflectante: más metálico, liso y con algo de brillo propio;
      //  - bordado: hilo con puntadas, relieve (la altura sale del contorno difuminado) y brillo satinado.
      // En el modo unido se muestrean los dos tendidos (delantero y espalda) y se superponen: las mangas
      // y la capucha salen en ambos, y lo que se pinte en cualquiera se ve en la prenda.
      mat.onBeforeCompile = (shader) => {
        shader.uniforms.uPieces = piecesMode;
        shader.uniforms.uRefl = layerUniforms.refl;
        shader.uniforms.uEmb = layerUniforms.emb;
        shader.vertexShader = shader.vertexShader
          .replace(
            '#include <common>',
            [
              '#include <common>',
              'attribute float printMask;',
              'attribute vec2 uvFront;',
              'attribute vec2 uvBack;',
              'attribute vec2 uvPieces;',
              'varying float vPrintMask;',
              'varying vec2 vUvFront;',
              'varying vec2 vUvBack;',
              'varying vec2 vUvPieces;',
            ].join('\n'),
          )
          .replace(
            '#include <begin_vertex>',
            ['#include <begin_vertex>', 'vPrintMask = printMask;', 'vUvFront = uvFront;', 'vUvBack = uvBack;', 'vUvPieces = uvPieces;'].join('\n'),
          );
        shader.fragmentShader = shader.fragmentShader
          .replace(
            '#include <common>',
            [
              '#include <common>',
              'uniform float uPieces;',
              'uniform sampler2D uRefl;',
              'uniform sampler2D uEmb;',
              'varying float vPrintMask;',
              'varying vec2 vUvFront;',
              'varying vec2 vUvBack;',
              'varying vec2 vUvPieces;',
            ].join('\n'),
          )
          .replace(
            '#include <map_pars_fragment>',
            [
              '#include <map_pars_fragment>',
              'vec4 overRgba(vec4 a, vec4 b) {',
              '  float alpha = a.a + b.a * (1.0 - a.a);',
              '  vec3 rgb = (a.rgb * a.a + b.rgb * b.a * (1.0 - a.a)) / max(alpha, 0.0001);',
              '  return vec4(rgb, alpha);',
              '}',
              'vec4 sampleLayer(sampler2D t) {',
              '  if (uPieces > 0.5) return texture2D(t, vUvPieces);',
              '  return overRgba(texture2D(t, vUvFront), texture2D(t, vUvBack));',
              '}',
              'vec4 sampleLayerBlur(sampler2D t, float lod) {',
              '  if (uPieces > 0.5) return textureLod(t, vUvPieces, lod);',
              '  return overRgba(textureLod(t, vUvFront, lod), textureLod(t, vUvBack, lod));',
              '}',
            ].join('\n'),
          )
          .replace(
            '#include <map_fragment>',
            [
              '  vec4 pPrint = sampleLayer(map);',
              '  vec4 pRefl = sampleLayer(uRefl);',
              '  vec4 pEmb = sampleLayer(uEmb);',
              '  float aPrint = pPrint.a * vPrintMask;',
              '  float aRefl = pRefl.a * vPrintMask;',
              '  float aEmb = pEmb.a * vPrintMask;',
              '  vec2 stitchUv = (vUvFront.x + vUvFront.y > 0.001) ? vUvFront : ((uPieces > 0.5) ? vUvPieces : vUvBack);',
              '  float stitch = 0.84 + 0.16 * sin((stitchUv.x * 2600.0 + stitchUv.y * 1300.0) * 0.55);',
              '  diffuseColor.rgb = mix( diffuseColor.rgb, pPrint.rgb, aPrint );',
              '  diffuseColor.rgb = mix( diffuseColor.rgb, pRefl.rgb, aRefl );',
              '  diffuseColor.rgb = mix( diffuseColor.rgb, pEmb.rgb * stitch, aEmb );',
            ].join('\n'),
          )
          .replace(
            '#include <roughnessmap_fragment>',
            ['#include <roughnessmap_fragment>', '  roughnessFactor = mix( roughnessFactor, 0.14, aRefl );', '  roughnessFactor = mix( roughnessFactor, 0.34, aEmb );'].join('\n'),
          )
          .replace(
            '#include <metalnessmap_fragment>',
            ['#include <metalnessmap_fragment>', '  metalnessFactor = mix( metalnessFactor, 0.85, aRefl );'].join('\n'),
          )
          .replace(
            '#include <emissivemap_fragment>',
            ['#include <emissivemap_fragment>', '  totalEmissiveRadiance += pRefl.rgb * aRefl * 0.14;'].join('\n'),
          )
          .replace(
            '#include <normal_fragment_maps>',
            [
              '#include <normal_fragment_maps>',
              '  {',
              '    float height = sampleLayerBlur(uEmb, 2.2).a * vPrintMask;',
              '    vec2 dHdxy = vec2( dFdx( height ), dFdy( height ) ) * 90.0;',
              '    vec3 sigmaX = dFdx( - vViewPosition.xyz );',
              '    vec3 sigmaY = dFdy( - vViewPosition.xyz );',
              '    vec3 R1 = cross( sigmaY, normal );',
              '    vec3 R2 = cross( normal, sigmaX );',
              '    float fDet = dot( sigmaX, R1 ) * faceDirection;',
              '    vec3 vGrad = sign( fDet ) * ( dHdxy.x * R1 + dHdxy.y * R2 );',
              '    normal = normalize( abs( fDet ) * normal - vGrad );',
              '  }',
            ].join('\n'),
          );
      };
      mat.customProgramCacheKey = () => 'pattern-print';
      mesh.material = mat;
      materials.push(mat);
    });
    return { root, materials, analysis };
  }, [scene, rotationY, piecesMode, layerUniforms]);

  useEffect(() => onAnalysis(analysis), [analysis, onAnalysis]);
  // Cada modo lee su propia textura (y su propio juego de UV).
  useEffect(() => {
    piecesMode.value = mode === 'pieces' ? 1 : 0;
    layerUniforms.refl.value = getPrintTexture(mode, 'reflective');
    layerUniforms.emb.value = getPrintTexture(mode, 'embroidery');
    const texture = getPrintTexture(mode, 'print');
    materials.forEach((m) => {
      m.map = texture;
      m.needsUpdate = true;
    });
  }, [materials, mode, piecesMode, layerUniforms]);
  useEffect(() => {
    materials.forEach((m) => m.color.set(color));
  }, [materials, color]);
  useEffect(() => () => materials.forEach((m) => m.dispose()), [materials]);

  return <primitive object={root} />;
}

const POSES = {
  espalda: [0, 0.08, -2.3],
  frente: [0, 0.08, 2.3],
  izquierda: [-2.3, 0.08, 0],
  derecha: [2.3, 0.08, 0],
  capucha: [0, 0.45, -1.3],
} as const;
export type PatternPose = keyof typeof POSES;

interface Props {
  garmentColor: string;
  mode: PatternMode;
  onAnalysis: (a: PatternAnalysis) => void;
  /** Cambia cuando se pide otra vista de cámara. */
  pose: { name: PatternPose; n: number };
}

export function PatternViewer({ garmentColor, mode, onAnalysis, pose }: Props) {
  const controls = useRef<OrbitControlsImpl>(null);

  useEffect(() => {
    const c = controls.current;
    if (!c) return;
    const [x, y, z] = POSES[pose.name];
    c.object.position.set(x, y, z);
    c.target.set(0, pose.name === 'capucha' ? 0.3 : -0.02, 0);
    c.update();
  }, [pose]);

  return (
    <Canvas
      dpr={[1, 2]}
      camera={{ position: [...POSES.espalda], fov: 30, near: 0.05, far: 20 }}
      gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true, toneMapping: NeutralToneMapping }}
    >
      <ProductLighting mood="nuit" />
      <Suspense fallback={null}>
        <PatternGarment color={garmentColor} mode={mode} onAnalysis={onAnalysis} />
      </Suspense>
      <ProductShadows mood="nuit" />
      <OrbitControls ref={controls} makeDefault enablePan={false} minDistance={0.5} maxDistance={4} />
    </Canvas>
  );
}
