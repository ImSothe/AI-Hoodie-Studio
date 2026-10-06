import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import { MarkdownLite, slugify } from '@/components/help/MarkdownLite';

export const metadata: Metadata = {
  title: 'Manual de usuario — AI Hoodie Studio',
  description: 'Cómo diseñar una sudadera con capucha en 3D, darle acabado y enviar el dossier a fábrica.',
};

export const viewport: Viewport = {
  themeColor: '#000000',
};

/** El manual vive en docs/MANUAL-USUARIO.md; esta página lo muestra tal cual (se lee al compilar). */
async function loadManual() {
  return readFile(path.join(process.cwd(), 'docs', 'MANUAL-USUARIO.md'), 'utf8');
}

export default async function HelpPage() {
  const source = await loadManual();
  const sections = [...source.matchAll(/^## (.+)$/gm)].map((m) => m[1]);

  return (
    <div className="min-h-dvh bg-ink text-fg">
      <header className="sticky top-0 z-10 border-b border-line bg-black/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
          <Link href="/" className="text-[10px] tracking-[0.28em] text-muted uppercase transition hover:text-fg">
            ← Volver al atelier
          </Link>
          <span className="label-tech">Manual de usuario</span>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-12 px-6 py-12 lg:grid-cols-[240px_minmax(0,1fr)]">
        <nav aria-label="Contenido del manual" className="lg:sticky lg:top-24 lg:self-start">
          <p className="label-tech mb-4">Contenido</p>
          <ol className="thin-scroll space-y-2 text-[12.5px] font-light lg:max-h-[calc(100dvh-9rem)] lg:overflow-y-auto">
            {sections.map((title) => (
              <li key={title}>
                <a href={`#${slugify(title)}`} className="text-muted transition hover:text-fg">
                  {title.replace(/^\d+\.\s*/, '')}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <article className="max-w-3xl pb-24">
          <MarkdownLite source={source} />
        </article>
      </div>
    </div>
  );
}
