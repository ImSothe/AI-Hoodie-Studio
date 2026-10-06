'use client';

import { CanvasTexture, NoColorSpace, RepeatWrapping } from 'three';

/**
 * Normal map procedural de punto de felpa (jersey): columnas de bucles en
 * «V» ligeramente irregulares. Con luz rasante y contraluz es lo que hace que
 * el tejido se lea como algodón y no como plástico. Se usa sólo si el GLB no
 * trae su propio normal map. Se genera una vez y se comparte.
 */
const SIZE = 256;
const COLUMNS = 16;
const ROWS = 22;

let cached: CanvasTexture | null = null;

function heightField() {
  const h = new Float32Array(SIZE * SIZE);
  const colW = SIZE / COLUMNS;
  const rowH = SIZE / ROWS;
  // Ruido determinista para que cada bucle varíe un poco (hilo real).
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const jitter = Array.from({ length: COLUMNS * ROWS }, () => 0.85 + rand() * 0.3);

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const col = Math.floor(x / colW);
      const row = Math.floor(y / rowH);
      // Coordenadas locales del bucle (-1..1); cada columna son dos patas inclinadas (la «V»).
      const u = ((x % colW) / colW) * 2 - 1;
      const v = ((y % rowH) / rowH) * 2 - 1;
      const leg = Math.abs(u) - 0.5 - v * 0.22;
      const loop = Math.max(0, 1 - (leg * leg) / 0.11) * (1 - v * v * 0.35);
      h[y * SIZE + x] = loop * jitter[row * COLUMNS + col];
    }
  }
  return h;
}

export function knitNormalMap() {
  if (cached) return cached;
  const h = heightField();
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(SIZE, SIZE);
  const at = (x: number, y: number) => h[((y + SIZE) % SIZE) * SIZE + ((x + SIZE) % SIZE)];
  const strength = 2.2;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * SIZE + x) * 4;
      img.data[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      img.data[i + 1] = ((dy / len) * 0.5 + 0.5) * 255;
      img.data[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  const texture = new CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.repeat.set(14, 14);
  texture.colorSpace = NoColorSpace;
  texture.anisotropy = 8;
  cached = texture;
  return texture;
}
