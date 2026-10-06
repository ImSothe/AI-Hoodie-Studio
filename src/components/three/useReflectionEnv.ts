'use client';

import { useThree } from '@react-three/fiber';
import { PMREMGenerator, type Texture, type WebGLRenderer } from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

/** Un único entorno por renderer: es pequeño y vive lo mismo que el contexto WebGL. */
const envByRenderer = new WeakMap<WebGLRenderer, Texture>();

/**
 * Mapa de entorno local (sin descargar HDRs) para que el material reflectante
 * tenga algo que reflejar: sin él, un metalness de 0.8 se vería casi negro.
 * Sólo lo usan los decals reflectantes; el tejido no cambia de aspecto.
 */
export function useReflectionEnv(): Texture {
  const gl = useThree((s) => s.gl);
  let env = envByRenderer.get(gl);
  if (!env) {
    const pmrem = new PMREMGenerator(gl);
    env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    envByRenderer.set(gl, env);
  }
  return env;
}
