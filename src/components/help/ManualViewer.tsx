'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  BookOpen,
  Box,
  Brush,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Crop,
  Image as ImageIcon,
  ImagePlus,
  Keyboard,
  LayoutPanelLeft,
  LifeBuoy,
  Move,
  Orbit,
  PackageCheck,
  Rocket,
  Search,
  Shirt,
  SlidersHorizontal,
  Sparkles,
  TriangleAlert,
  X,
  type LucideIcon,
} from 'lucide-react';
import { MarkdownLite } from './MarkdownLite';

export interface ManualSection {
  /** Título sin el número («Paso 1 · Diseño…»). */
  title: string;
  /** Contenido en Markdown. */
  body: string;
}

interface Shot {
  src: string;
  caption: string;
  /** Si no hay captura (o no se puede hacer), se enseña un hueco con este texto. */
  placeholder?: boolean;
}

interface Extras {
  match: RegExp;
  icon: LucideIcon;
  short: string;
  shots: Shot[];
}

/**
 * Icono, nombre corto y capturas de cada sección. Las capturas están en
 * public/manual/. Donde una imagen no se puede hacer sola (la ventana del
 * arranque, el PDF), queda un hueco que dice qué captura poner.
 */
const EXTRAS: Extras[] = [
  {
    match: /^Qué puedes hacer/,
    icon: Sparkles,
    short: 'Qué puedes hacer',
    shots: [{ src: '/manual/resultado.webp', caption: 'Un diseño con dos acabados: un ala en bordado dorado y la otra en cromo reflectante.' }],
  },
  {
    match: /^Antes de empezar/,
    icon: Rocket,
    short: 'Antes de empezar',
    shots: [{ src: '/manual/arranque.webp', caption: 'La ventana de Iniciar-Atelier.bat abierta y el navegador en localhost:3000', placeholder: true }],
  },
  {
    match: /^Recorrido/,
    icon: LayoutPanelLeft,
    short: 'La pantalla',
    shots: [{ src: '/manual/mover.webp', caption: 'Panel de pasos a la izquierda, la prenda en 3D en el centro y la barra «Añadir» junto al visor.' }],
  },
  {
    match: /^Paso 1/,
    icon: ImagePlus,
    short: 'Paso 1 · Diseño',
    shots: [
      { src: '/manual/diseno.webp', caption: 'Las cuatro formas de añadir algo: subir imagen, plantillas, texto o IA.' },
      { src: '/manual/plantillas.webp', caption: 'Plantillas listas: un clic y se colocan en la prenda.' },
    ],
  },
  {
    match: /^Paso 2/,
    icon: Shirt,
    short: 'Paso 2 · Prenda',
    shots: [{ src: '/manual/prenda.webp', caption: 'Color del tejido, tejido y fornituras.' }],
  },
  {
    match: /^Mover/,
    icon: Move,
    short: 'Mover el diseño',
    shots: [{ src: '/manual/mover.webp', caption: 'El marco de edición sobre la prenda: esquinas para el tamaño, círculo para girar y acciones rápidas.' }],
  },
  {
    match: /^Paso 3/,
    icon: SlidersHorizontal,
    short: 'Paso 3 · Ajustar',
    shots: [
      { src: '/manual/ajustar.webp', caption: 'Deshacer, duplicar, recortar, acabado y color de la pieza elegida.' },
      { src: '/manual/degradado.webp', caption: 'Degradado de dos colores con dirección.' },
    ],
  },
  {
    match: /^Recortar/,
    icon: Crop,
    short: 'Recortar',
    shots: [{ src: '/manual/recortar.webp', caption: 'El recorte: un rectángulo ajustable, con atajos de mitades.' }],
  },
  {
    match: /^Separar/,
    icon: Brush,
    short: 'Separar partes',
    shots: [{ src: '/manual/partes.webp', caption: 'Partes: se pinta la zona (en rojo) y se separa como pieza propia.' }],
  },
  {
    match: /^El visor/,
    icon: Orbit,
    short: 'El visor 3D',
    shots: [{ src: '/manual/visor-claro.webp', caption: 'El visor con el fondo claro y los botones de la esquina.' }],
  },
  {
    match: /^Paso 4/,
    icon: PackageCheck,
    short: 'Paso 4 · Entregar',
    shots: [
      { src: '/manual/entregar.webp', caption: 'Identidad del modelo y botón «Compilar dossier».' },
      { src: '/manual/dossier-pdf.webp', caption: 'La primera página del PDF del dossier, ya generado', placeholder: true },
    ],
  },
  {
    match: /^Configurador/,
    icon: ClipboardList,
    short: 'Configurador',
    shots: [{ src: '/manual/configurador.webp', caption: 'El configurador de taller: tejido, personalización, colocación, cantidades y orden.' }],
  },
  { match: /^Atajos/, icon: Keyboard, short: 'Atajos de teclado', shots: [] },
  { match: /^Problemas/, icon: LifeBuoy, short: 'Problemas frecuentes', shots: [] },
  { match: /^Límites/, icon: TriangleAlert, short: 'Límites', shots: [] },
  { match: /^Glosario/, icon: BookOpen, short: 'Glosario', shots: [] },
];

const FALLBACK: Extras = { match: /.*/, icon: Box, short: '', shots: [] };
const extrasOf = (title: string) => EXTRAS.find((e) => e.match.test(title)) ?? FALLBACK;

/** Para buscar sin importar mayúsculas ni acentos. */
const plain = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

/** Hueco para una captura que falta: dice qué imagen poner. */
function Placeholder({ caption }: { caption: string }) {
  return (
    <div className="grid aspect-[16/9] place-items-center rounded-sm border border-dashed border-white/15 bg-[#111] p-6 text-center">
      <div>
        <ImageIcon className="mx-auto size-8 text-gray-500" strokeWidth={1.1} />
        <p className="mt-4 text-[11px] tracking-[0.18em] text-gray-400 uppercase">Aquí imagen</p>
        <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed font-light text-gray-500">{caption}</p>
      </div>
    </div>
  );
}

function Figure({ shot, onOpen }: { shot: Shot; onOpen: (shot: Shot) => void }) {
  const [broken, setBroken] = useState(!!shot.placeholder);
  return (
    <figure>
      {broken ? (
        <Placeholder caption={shot.caption} />
      ) : (
        <button
          type="button"
          onClick={() => onOpen(shot)}
          aria-label={`Ampliar: ${shot.caption}`}
          className="group block w-full cursor-zoom-in overflow-hidden rounded-sm border border-white/10 bg-[#111] transition hover:border-white/30"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={shot.src}
            alt={shot.caption}
            loading="lazy"
            onError={() => setBroken(true)}
            className="block w-full transition duration-500 group-hover:scale-[1.01]"
          />
        </button>
      )}
      {!broken && <figcaption className="mt-3 text-[12.5px] leading-snug font-light text-gray-400">{shot.caption}</figcaption>}
    </figure>
  );
}

/**
 * Manual interactivo: menú lateral con iconos y buscador, una sección cada vez,
 * capturas reales ampliables y huecos donde falta una imagen. La sección se
 * guarda en la dirección (#s-4), así que se puede enlazar.
 */
export function ManualViewer({ title, intro, sections }: { title: string; intro: string; sections: ManualSection[] }) {
  const [current, setCurrent] = useState<number | null>(null); // null = inicio
  const [query, setQuery] = useState('');
  const [zoom, setZoom] = useState<Shot | null>(null);

  const select = useCallback((index: number | null) => {
    setCurrent(index);
    history.replaceState(null, '', index === null ? '#inicio' : `#s-${index + 1}`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  useEffect(() => {
    const read = () => {
      const m = /^#s-(\d+)$/.exec(window.location.hash);
      const n = m ? Number(m[1]) - 1 : null;
      setCurrent(n !== null && n >= 0 && n < sections.length ? n : null);
    };
    read();
    window.addEventListener('hashchange', read);
    return () => window.removeEventListener('hashchange', read);
  }, [sections.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setZoom(null);
      if (zoom || (e.target as HTMLElement | null)?.closest('input')) return;
      if (e.key === 'ArrowRight' && (current ?? -1) < sections.length - 1) select((current ?? -1) + 1);
      if (e.key === 'ArrowLeft' && current !== null) select(current === 0 ? null : current - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [current, sections.length, select, zoom]);

  const visible = useMemo(() => {
    const q = plain(query.trim());
    return sections
      .map((s, index) => ({ s, index }))
      .filter(({ s }) => !q || plain(s.title).includes(q) || plain(s.body).includes(q));
  }, [query, sections]);

  const section = current === null ? null : sections[current];
  const extras = section ? extrasOf(section.title) : null;

  const nav = (
    <>
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-gray-500" strokeWidth={1.4} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar en el manual"
          aria-label="Buscar en el manual"
          className="w-full border border-white/10 bg-[#111] py-2.5 pr-3 pl-9 text-[12.5px] font-light text-gray-200 placeholder:text-gray-600 focus:border-white/30 focus:outline-none"
        />
      </div>
      <ul className="mt-5 space-y-px">
        <li>
          <button
            type="button"
            onClick={() => select(null)}
            aria-current={current === null}
            className={`flex w-full items-center gap-3 border-l px-3 py-2.5 text-left text-[13px] font-light transition ${current === null ? 'border-[#F5F5F5] bg-white/[0.06] text-[#F5F5F5]' : 'border-transparent text-gray-400 hover:bg-white/[0.03] hover:text-gray-200'}`}
          >
            <BookOpen className="size-4 shrink-0" strokeWidth={1.3} />
            Inicio
          </button>
        </li>
        {visible.map(({ s, index }) => {
          const { icon: Icon, short } = extrasOf(s.title);
          const active = current === index;
          return (
            <li key={s.title}>
              <button
                type="button"
                onClick={() => select(index)}
                aria-current={active}
                className={`flex w-full items-center gap-3 border-l px-3 py-2.5 text-left text-[13px] font-light transition ${active ? 'border-[#F5F5F5] bg-white/[0.06] text-[#F5F5F5]' : 'border-transparent text-gray-400 hover:bg-white/[0.03] hover:text-gray-200'}`}
              >
                <Icon className="size-4 shrink-0" strokeWidth={1.3} />
                <span className="min-w-0 flex-1 truncate">{short || s.title}</span>
                <span className="num text-[10px] text-gray-600">{String(index + 1).padStart(2, '0')}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {query && visible.length === 0 && <p className="mt-5 text-[12.5px] font-light text-gray-500">Nada coincide con «{query}».</p>}
    </>
  );

  const prev = current === null ? null : current === 0 ? -1 : current - 1;
  const next = current === null ? 0 : current < sections.length - 1 ? current + 1 : null;

  return (
    <div className="min-h-dvh bg-[#0B0B0B] text-gray-300">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-[#0B0B0B]/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1240px] items-center justify-between gap-4 px-5 py-4">
          <Link href="/" className="inline-flex items-center gap-2 text-[10.5px] tracking-[0.26em] text-gray-400 uppercase transition hover:text-[#F5F5F5]">
            <ArrowLeft className="size-3.5" strokeWidth={1.4} /> Volver al atelier
          </Link>
          <span className="text-[10px] tracking-[0.3em] text-gray-500 uppercase">Manual de usuario</span>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1240px] gap-10 px-5 py-8 md:grid-cols-[280px_minmax(0,1fr)] md:py-12">
        {/* Menú: lateral en pantallas anchas, desplegable arriba en estrechas */}
        <aside className="md:sticky md:top-24 md:self-start">
          <details className="md:hidden [&_summary::-webkit-details-marker]:hidden">
            <summary className="flex cursor-pointer list-none items-center justify-between border border-white/10 bg-[#111] px-4 py-3 text-[12px] tracking-[0.2em] text-gray-300 uppercase">
              {section ? extras?.short || section.title : 'Contenido'}
              <ChevronRight className="size-4 rotate-90" strokeWidth={1.3} />
            </summary>
            <div className="mt-3">{nav}</div>
          </details>
          <div className="hidden md:block">{nav}</div>
        </aside>

        <main className="min-w-0">
          {section === null ? (
            <div>
              <p className="text-[10.5px] tracking-[0.3em] text-gray-500 uppercase">Guía completa</p>
              <h1 className="mt-4 font-serif text-4xl font-normal tracking-[0.03em] text-[#F5F5F5] md:text-5xl">{title}</h1>
              <p className="mt-6 max-w-2xl text-[16px] leading-[1.75] font-light text-gray-300">{intro}</p>
              <div className="mt-10">
                <Figure shot={EXTRAS[0].shots[0]} onOpen={setZoom} />
              </div>
              <h2 className="mt-14 text-[11px] tracking-[0.3em] text-gray-500 uppercase">Elige por dónde empezar</h2>
              <div className="mt-5 grid gap-px bg-white/10 sm:grid-cols-2">
                {sections.map((s, index) => {
                  const { icon: Icon, short } = extrasOf(s.title);
                  return (
                    <button
                      key={s.title}
                      type="button"
                      onClick={() => select(index)}
                      className="group flex items-center gap-4 bg-[#0B0B0B] px-5 py-5 text-left transition hover:bg-[#141414]"
                    >
                      <Icon className="size-5 shrink-0 text-gray-500 transition group-hover:text-[#F5F5F5]" strokeWidth={1.2} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[14px] font-light text-gray-200 group-hover:text-[#F5F5F5]">{short || s.title}</span>
                        <span className="num text-[10px] text-gray-600">{String(index + 1).padStart(2, '0')}</span>
                      </span>
                      <ChevronRight className="size-4 text-gray-600 transition group-hover:translate-x-0.5 group-hover:text-gray-300" strokeWidth={1.3} />
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <article className="max-w-3xl pb-10">
              <p className="num text-[10.5px] tracking-[0.2em] text-gray-500">
                {String(current! + 1).padStart(2, '0')} / {String(sections.length).padStart(2, '0')}
              </p>
              <h1 className="mt-4 flex items-start gap-4 font-serif text-3xl font-normal tracking-[0.03em] text-[#F5F5F5] md:text-4xl">
                {extras && <extras.icon className="mt-1.5 size-7 shrink-0 text-gray-500" strokeWidth={1.1} />}
                {section.title}
              </h1>

              {extras && extras.shots.length > 0 && (
                <div className="mt-8 space-y-6">
                  {extras.shots.map((shot) => (
                    <Figure key={shot.src} shot={shot} onOpen={setZoom} />
                  ))}
                </div>
              )}

              <div className="mt-6">
                <MarkdownLite source={section.body} />
              </div>
            </article>
          )}

          <nav aria-label="Anterior y siguiente" className="mt-12 grid max-w-3xl grid-cols-2 gap-px bg-white/10">
            <button
              type="button"
              disabled={prev === null}
              onClick={() => select(prev === -1 ? null : prev)}
              className="flex items-center gap-3 bg-[#0B0B0B] px-5 py-4 text-left text-[12px] tracking-[0.12em] text-gray-400 uppercase transition hover:bg-[#141414] hover:text-[#F5F5F5] disabled:opacity-25 disabled:hover:bg-[#0B0B0B]"
            >
              <ChevronLeft className="size-4" strokeWidth={1.3} />
              {prev === null ? '' : prev === -1 ? 'Inicio' : extrasOf(sections[prev].title).short || sections[prev].title}
            </button>
            <button
              type="button"
              disabled={next === null}
              onClick={() => select(next)}
              className="flex items-center justify-end gap-3 bg-[#0B0B0B] px-5 py-4 text-right text-[12px] tracking-[0.12em] text-gray-400 uppercase transition hover:bg-[#141414] hover:text-[#F5F5F5] disabled:opacity-25 disabled:hover:bg-[#0B0B0B]"
            >
              {next === null ? '' : extrasOf(sections[next].title).short || sections[next].title}
              <ChevronRight className="size-4" strokeWidth={1.3} />
            </button>
          </nav>
        </main>
      </div>

      {zoom && (
        <div role="dialog" aria-modal="true" aria-label="Captura ampliada" onClick={() => setZoom(null)} className="fixed inset-0 z-50 grid cursor-zoom-out place-items-center bg-black/90 p-4 backdrop-blur-sm">
          <button type="button" aria-label="Cerrar" onClick={() => setZoom(null)} className="absolute top-5 right-5 text-gray-400 hover:text-white">
            <X className="size-6" strokeWidth={1.2} />
          </button>
          <figure className="max-h-full max-w-6xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={zoom.src} alt={zoom.caption} className="max-h-[85dvh] w-auto border border-white/10" />
            <figcaption className="mt-3 text-center text-[13px] font-light text-gray-400">{zoom.caption}</figcaption>
          </figure>
        </div>
      )}
    </div>
  );
}
