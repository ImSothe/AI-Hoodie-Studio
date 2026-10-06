import type { WebGLProgramParametersWithUniforms } from 'three';

/**
 * Albedo mínimo de un tejido real. Ningún algodón devuelve menos de ~3 % de
 * la luz: un negro #0B0B0B (0,3 % lineal) renderizado tal cual se ve como un
 * agujero sin volumen. Se aplica el mismo suelo a la prenda y a los decals
 * para que el bordado ton-sur-ton siga casando exactamente con el tejido.
 */
export const FABRIC_ALBEDO_FLOOR = 0.03;

function liftAlbedo(shader: WebGLProgramParametersWithUniforms) {
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <map_fragment>',
    `#include <map_fragment>
    diffuseColor.rgb = vec3(${FABRIC_ALBEDO_FLOOR.toFixed(3)}) + diffuseColor.rgb * ${(1 - FABRIC_ALBEDO_FLOOR).toFixed(3)};`,
  );
}

/** Props para materiales de tejido y de decals (se pueden esparcir en JSX o con Object.assign). */
export const fabricAlbedo = { onBeforeCompile: liftAlbedo };
