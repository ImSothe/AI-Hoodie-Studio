import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Metadata, Viewport } from 'next';
import { ManualViewer, type ManualSection } from '@/components/help/ManualViewer';

export const metadata: Metadata = {
  title: 'Manual de usuario — AI Hoodie Studio',
  description: 'Cómo diseñar una sudadera con capucha en 3D, darle acabado y enviar el dossier a fábrica.',
};

export const viewport: Viewport = {
  themeColor: '#0B0B0B',
};

/**
 * El manual vive en docs/MANUAL-USUARIO.md y esta página lo muestra (se lee al
 * compilar): título y presentación, y una sección por cada «## n. Título».
 */
async function loadManual() {
  const source = (await readFile(path.join(process.cwd(), 'docs', 'MANUAL-USUARIO.md'), 'utf8')).replace(/\r\n/g, '\n');
  const [head, ...chunks] = source.split(/^## /m);
  const title = /^# (.+)$/m.exec(head)?.[1] ?? 'Manual de usuario';
  const intro = head
    .replace(/^# .+$/m, '')
    .trim()
    .replace(/\n+/g, ' ');
  const sections: ManualSection[] = chunks.map((chunk) => {
    const newline = chunk.indexOf('\n');
    return {
      title: chunk.slice(0, newline).replace(/^\d+\.\s*/, '').trim(),
      body: chunk.slice(newline + 1).trim(),
    };
  });
  return { title, intro, sections };
}

export default async function HelpPage() {
  const { title, intro, sections } = await loadManual();
  return <ManualViewer title={title} intro={intro} sections={sections} />;
}
