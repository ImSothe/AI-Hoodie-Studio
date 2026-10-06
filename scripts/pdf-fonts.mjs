/**
 * Convierte a TTF las fuentes de @fontsource que usa el dossier PDF.
 *
 * jsPDF sólo incrusta TrueType (.ttf) y @fontsource distribuye WOFF/WOFF2.
 * Un WOFF 1.0 es un sfnt con cada tabla comprimida con zlib: basta con
 * descomprimir las tablas y volver a escribir la cabecera sfnt.
 * jsPDF incrusta después sólo los glifos usados (subset), así que el PDF
 * apenas crece.
 *
 *   npm run fonts:pdf   →   public/fonts/pdf/*.ttf (+ LICENSES.txt, SIL OFL 1.1)
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public/fonts/pdf');

/** [paquete, archivo WOFF (subset latin), nombre de salida] */
const FONTS = [
  ['@fontsource/bodoni-moda', 'bodoni-moda-latin-400-normal.woff', 'BodoniModa-Regular.ttf'],
  ['@fontsource/cormorant-garamond', 'cormorant-garamond-latin-400-normal.woff', 'CormorantGaramond-Regular.ttf'],
  ['@fontsource/cormorant-garamond', 'cormorant-garamond-latin-400-italic.woff', 'CormorantGaramond-Italic.ttf'],
  ['@fontsource/inter', 'inter-latin-300-normal.woff', 'Inter-Light.ttf'],
  ['@fontsource/inter', 'inter-latin-400-normal.woff', 'Inter-Regular.ttf'],
  ['@fontsource/ibm-plex-mono', 'ibm-plex-mono-latin-300-normal.woff', 'IBMPlexMono-Light.ttf'],
];

function woffToSfnt(woff) {
  if (woff.readUInt32BE(0) !== 0x774f4646) throw new Error('No es un WOFF 1.0');
  const flavor = woff.readUInt32BE(4);
  if (flavor === 0x4f54544f) throw new Error('Contornos CFF (OTTO): jsPDF necesita TrueType');
  const numTables = woff.readUInt16BE(12);
  const tables = [];
  for (let i = 0; i < numTables; i++) {
    const e = 44 + i * 20;
    const offset = woff.readUInt32BE(e + 4);
    const compLength = woff.readUInt32BE(e + 8);
    const origLength = woff.readUInt32BE(e + 12);
    const raw = woff.subarray(offset, offset + compLength);
    const data = compLength < origLength ? inflateSync(raw) : raw;
    if (data.length !== origLength) throw new Error('Tabla con longitud inesperada');
    tables.push({ tag: woff.subarray(e, e + 4), checksum: woff.readUInt32BE(e + 16), data });
  }

  const entrySelector = Math.floor(Math.log2(numTables));
  const searchRange = 2 ** entrySelector * 16;
  let offset = 12 + numTables * 16;
  const size = tables.reduce((n, t) => n + Math.ceil(t.data.length / 4) * 4, offset);
  const out = Buffer.alloc(size);
  out.writeUInt32BE(flavor, 0);
  out.writeUInt16BE(numTables, 4);
  out.writeUInt16BE(searchRange, 6);
  out.writeUInt16BE(entrySelector, 8);
  out.writeUInt16BE(numTables * 16 - searchRange, 10);
  tables.forEach((t, i) => {
    const r = 12 + i * 16;
    t.tag.copy(out, r);
    out.writeUInt32BE(t.checksum, r + 4);
    out.writeUInt32BE(offset, r + 8);
    out.writeUInt32BE(t.data.length, r + 12);
    t.data.copy(out, offset);
    offset += Math.ceil(t.data.length / 4) * 4;
  });
  return out;
}

mkdirSync(outDir, { recursive: true });
const licenses = new Map();
for (const [pkg, file, name] of FONTS) {
  const dir = dirname(require.resolve(`${pkg}/package.json`));
  const ttf = woffToSfnt(readFileSync(join(dir, 'files', file)));
  writeFileSync(join(outDir, name), ttf);
  licenses.set(pkg, readFileSync(join(dir, 'LICENSE'), 'utf8').trim());
  console.log(`${name.padEnd(32)} ${(ttf.length / 1024).toFixed(1)} KB`);
}
// La OFL exige que la licencia acompañe a las fuentes redistribuidas.
writeFileSync(
  join(outDir, 'LICENSES.txt'),
  [...licenses].map(([pkg, text]) => `${pkg}\n${'='.repeat(pkg.length)}\n\n${text}\n`).join('\n\n'),
);
