import { sanitizeSvg, svgToDataUrl } from '../svg/sanitize';
import type { GeneratedAsset } from '../types';

/**
 * Motivos de partida incluidos en la app, para empezar a diseñar sin subir
 * nada ni usar IA. Son vectoriales (se pueden recolorear, separar en partes y
 * bordar) y salen en blanco sobre fondo transparente.
 */

const W = '#FFFFFF';
const svg = (body: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${body}</svg>`;
const f = (n: number) => +n.toFixed(2);

function star(points: number, outer: number, inner: number) {
  const pts: string[] = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (Math.PI * i) / points - Math.PI / 2;
    pts.push(`${f(50 + r * Math.cos(a))},${f(52 + r * Math.sin(a))}`);
  }
  return `<polygon fill="${W}" points="${pts.join(' ')}"/>`;
}

/** Ala: abanico de plumas que sale del hombro, de las cortas de arriba a las largas de abajo; con `mirror` sale la otra. */
function wing(mirror: boolean) {
  const base = { x: 47, y: 44 };
  const lengths = [32, 39, 46, 51, 53, 49, 41];
  const feathers: string[] = [];
  lengths.forEach((length, k) => {
    const theta = ((150 + k * 15) * Math.PI) / 180;
    const tip = { x: base.x + length * Math.cos(theta), y: base.y - length * Math.sin(theta) };
    const mid = { x: (base.x + tip.x) / 2, y: (base.y + tip.y) / 2 };
    const bulge = 6.5;
    const a = { x: mid.x + Math.sin(theta) * bulge, y: mid.y + Math.cos(theta) * bulge };
    const b = { x: mid.x - Math.sin(theta) * bulge, y: mid.y - Math.cos(theta) * bulge };
    const x = (v: number) => f(mirror ? 100 - v : v);
    feathers.push(
      `<path fill="${W}" d="M${x(base.x)} ${f(base.y)} Q${x(a.x)} ${f(a.y)} ${x(tip.x)} ${f(tip.y)} Q${x(b.x)} ${f(b.y)} ${x(base.x)} ${f(base.y)}Z"/>`,
    );
  });
  return feathers.join('');
}

function laurel() {
  const leaves: string[] = [];
  for (const side of [-1, 1]) {
    for (let i = 0; i < 9; i++) {
      const t = i / 8;
      const ang = ((200 + t * 105) * Math.PI) / 180; // arco inferior, de un lado a otro
      const cx = 50 + side * 36 * Math.cos(ang - Math.PI) * -1;
      const cy = 52 - 36 * Math.sin(ang - Math.PI) * -1;
      const rot = side * (30 + t * 110);
      leaves.push(`<ellipse fill="${W}" cx="${f(cx)}" cy="${f(cy)}" rx="4.2" ry="9" transform="rotate(${f(rot)} ${f(cx)} ${f(cy)})"/>`);
    }
  }
  return leaves.join('');
}

function rays() {
  const lines: string[] = [];
  for (let i = 0; i < 12; i++) {
    const a = (Math.PI * 2 * i) / 12;
    lines.push(`<line x1="${f(50 + 28 * Math.cos(a))}" y1="${f(50 + 28 * Math.sin(a))}" x2="${f(50 + (i % 2 ? 40 : 47) * Math.cos(a))}" y2="${f(50 + (i % 2 ? 40 : 47) * Math.sin(a))}" stroke="${W}" stroke-width="5" stroke-linecap="round"/>`);
  }
  return lines.join('');
}

const defs: { id: string; name: string; body: string }[] = [
  { id: 'alas', name: 'Alas', body: wing(false) + wing(true) },
  { id: 'estrella', name: 'Estrella', body: star(5, 46, 19) },
  { id: 'estrella-8', name: 'Brújula', body: star(8, 47, 13) },
  { id: 'rayo', name: 'Rayo', body: `<polygon fill="${W}" points="60,2 20,56 46,56 38,98 80,40 54,40"/>` },
  {
    id: 'corazon',
    name: 'Corazón',
    body: `<path fill="${W}" d="M50 90 C8 58 4 30 27 20 C39 15 50 24 50 33 C50 24 61 15 73 20 C96 30 92 58 50 90Z"/>`,
  },
  {
    id: 'corona',
    name: 'Corona',
    body: `<path fill="${W}" d="M8 80 L8 32 L30 54 L50 20 L70 54 L92 32 L92 80Z"/><circle fill="${W}" cx="8" cy="26" r="6"/><circle fill="${W}" cx="50" cy="14" r="6"/><circle fill="${W}" cx="92" cy="26" r="6"/>`,
  },
  { id: 'sol', name: 'Sol', body: `<circle fill="${W}" cx="50" cy="50" r="19"/>${rays()}` },
  { id: 'luna', name: 'Luna', body: `<path fill="${W}" d="M62 6 A44 44 0 1 0 94 68 A35 35 0 1 1 62 6Z"/>` },
  {
    id: 'llama',
    name: 'Llama',
    body: `<path fill="${W}" d="M50 3 C55 27 80 36 80 63 C80 83 67 97 50 97 C33 97 20 83 20 64 C20 49 31 43 35 30 C42 39 44 45 46 50 C51 36 47 19 50 3Z"/>`,
  },
  {
    id: 'escudo',
    name: 'Escudo',
    body: `<path fill="${W}" fill-rule="evenodd" d="M50 3 L91 17 V50 C91 75 71 91 50 98 C29 91 9 75 9 50 V17Z M50 12 L82 23 V50 C82 69 67 83 50 89 C33 83 18 69 18 50 V23Z"/>`,
  },
  {
    id: 'aro',
    name: 'Aro',
    body: `<path fill="${W}" fill-rule="evenodd" d="M50 4 A46 46 0 1 0 50 96 A46 46 0 1 0 50 4Z M50 12 A38 38 0 1 1 50 88 A38 38 0 1 1 50 12Z"/>`,
  },
  { id: 'laurel', name: 'Laurel', body: laurel() },
  { id: 'montanas', name: 'Montañas', body: `<polygon fill="${W}" points="3,88 33,30 50,58 67,20 97,88"/>` },
];

export const TEMPLATES = defs.map((d) => ({ id: d.id, name: d.name, svg: svg(d.body) }));

export function templateAsset(id: string): GeneratedAsset | null {
  const t = TEMPLATES.find((x) => x.id === id);
  if (!t) return null;
  const clean = sanitizeSvg(t.svg);
  return {
    id: `asset_${crypto.randomUUID()}`,
    name: t.name,
    kind: 'svg',
    svg: clean,
    src: svgToDataUrl(clean),
    provider: 'upload',
    createdAt: Date.now(),
    inkColor: '#FFFFFF',
  };
}
