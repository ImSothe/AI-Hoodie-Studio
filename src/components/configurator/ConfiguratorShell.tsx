'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { LoaderCircle } from 'lucide-react';
import { applyPersonalization, measurePersonalization, type PieceMetrics } from '@/lib/configurator/apply';
import {
  ATELIER,
  COLORWAYS,
  DEFAULT_PERSONALIZATION,
  DEFAULT_SIZE_RUN,
  FINISHES,
  MONOGRAM_FONTS,
  PLACEMENTS,
  SIZES,
  THREADS,
  colorway,
  finish,
  newOrderNumber,
  placement,
  techniqueCode,
  thread,
  totalUnits,
  variantCode,
  type ColorwayId,
  type Personalization,
  type SizeRun,
} from '@/lib/configurator/collection';
import { buildTechPack, downloadBlob } from '@/lib/export/techPack';
import { colorReference } from '@/lib/hoodie/references';
import { CANVAS_HEIGHT, CANVAS_WIDTH, FONT_OPTIONS, HOODIE_VIEWS, fontOption } from '@/lib/hoodie/spec';
import { useStudio } from '@/lib/store';
import { STAGE_MOODS, type StageMood } from '@/lib/three/stage';
import { cn } from '@/lib/utils';
import { FabricView } from '../canvas/FabricView';
import { useDesktop } from '../useDesktop';

// Three.js depende de WebGL/window: sólo se carga en el cliente.
const ConfiguratorViewer = dynamic(() => import('./ConfiguratorViewer').then((m) => m.ConfiguratorViewer), {
  ssr: false,
});

type StepId = 'fabric' | 'personalize' | 'placement' | 'quantities' | 'order';

/** Ancho del panel de configuración en escritorio. */
const PANEL_WIDTH = 420;

const thousands = (n: number) => n.toLocaleString('es-ES');
const cm2 = (mm2: number) => (mm2 / 100).toFixed(1).replace('.', ',');
const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

/**
 * Lienzos de diseño fuera de pantalla: son los mismos del atelier y generan
 * las texturas que el visor proyecta sobre la prenda (y el dossier de taller).
 */
function DesignCanvases() {
  const box = { width: 400, height: Math.round((400 * CANVAS_HEIGHT) / CANVAS_WIDTH) };
  return (
    <div aria-hidden className="pointer-events-none fixed top-0 left-[-10000px] w-[400px] opacity-0">
      {HOODIE_VIEWS.map((view) => (
        <FabricView key={view} view={view} visible box={box} />
      ))}
    </div>
  );
}

function MoodToggle({ mood, onChange }: { mood: StageMood; onChange: (m: StageMood) => void }) {
  return (
    <div role="radiogroup" aria-label="Ambiente" className="flex gap-4">
      {(Object.keys(STAGE_MOODS) as StageMood[]).map((m) => (
        <button
          key={m}
          type="button"
          role="radio"
          aria-checked={mood === m}
          onClick={() => onChange(m)}
          className={cn(
            'border-b pb-1 text-[10px] tracking-[0.28em] uppercase transition duration-500',
            mood === m ? 'border-(--cfg-fg)' : 'border-transparent text-(--cfg-muted) hover:text-(--cfg-fg)',
          )}
        >
          {STAGE_MOODS[m].label}
        </button>
      ))}
    </div>
  );
}

/** Paso del configurador (acordeón): índice, título, elección actual y contenido. */
function Step({
  index,
  title,
  value,
  open,
  onOpen,
  children,
}: {
  index: string;
  title: string;
  value: ReactNode;
  open: boolean;
  onOpen: () => void;
  children: ReactNode;
}) {
  return (
    <section className="border-b border-(--cfg-line)">
      <button type="button" aria-expanded={open} onClick={onOpen} className="flex w-full items-baseline gap-4 py-5 text-left">
        <span className="num w-6 shrink-0 text-[10px] text-(--cfg-muted)">{index}</span>
        <span className="shrink-0 text-[10.5px] tracking-[0.28em] uppercase">{title}</span>
        <span className="min-w-0 flex-1 truncate text-right font-editorial text-[15px] font-light italic text-(--cfg-muted)">
          {value}
        </span>
        <span aria-hidden className="w-3 shrink-0 text-right text-[13px] font-light text-(--cfg-muted)">
          {open ? '−' : '+'}
        </span>
      </button>
      {open && <div className="animate-[cfg-in_0.5s_ease-out] pb-8 pl-10">{children}</div>}
    </section>
  );
}

/** Muestra de color circular (tejido o hilo) con anillo fino cuando está elegida. */
function Swatch({
  hex,
  name,
  active,
  onClick,
  size = 34,
}: {
  hex: string;
  name: string;
  active: boolean;
  onClick: () => void;
  size?: number;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      aria-label={name}
      title={`${name} · ${hex}`}
      onClick={onClick}
      className={cn(
        'rounded-full outline-offset-[3px] transition duration-300',
        active ? 'outline-1 outline-(--cfg-fg)' : 'outline-1 outline-transparent hover:outline-(--cfg-line)',
      )}
    >
      <span className="block rounded-full border border-(--cfg-line)" style={{ background: hex, width: size, height: size }} />
    </button>
  );
}

function OptionRow({
  active,
  title,
  note,
  aside,
  onClick,
}: {
  active: boolean;
  title: string;
  note?: string;
  aside?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className="group flex w-full items-baseline gap-4 border-b border-(--cfg-line) py-3.5 text-left last:border-b-0"
    >
      <span
        className={cn(
          'mt-1 size-1.5 shrink-0 self-start rounded-full border border-(--cfg-fg) transition',
          active ? 'bg-(--cfg-fg)' : 'bg-transparent opacity-40',
        )}
      />
      <span className="min-w-0 flex-1">
        <span className={cn('block text-[12.5px] transition', active ? '' : 'text-(--cfg-muted) group-hover:text-(--cfg-fg)')}>
          {title}
        </span>
        {note && <span className="mt-0.5 block font-editorial text-[14px] leading-snug font-light italic text-(--cfg-muted)">{note}</span>}
      </span>
      {aside && <span className="num shrink-0 text-[11px] text-(--cfg-muted)">{aside}</span>}
    </button>
  );
}

/** Fila de ficha técnica del resumen. */
function SpecLine({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-6 border-b border-(--cfg-line) py-2.5">
      <dt className="label-tech shrink-0">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}

/**
 * Configurador de taller: la prenda a sangre en el plató y un panel de pasos
 * (tejido, personalización, colocación, cantidades por talla y orden). Cada
 * cambio se ve en 3D con la luz de estudio; al emitir la orden se descarga el
 * dossier de producción con el número de OT y el desglose por tallas.
 */
export function ConfiguratorShell() {
  const desktop = useDesktop();
  const [mood, setMood] = useState<StageMood>('salon');
  const [colorId, setColorId] = useState<ColorwayId>('noir');
  const [p, setP] = useState<Personalization>(DEFAULT_PERSONALIZATION);
  const [sizes, setSizes] = useState<SizeRun>(DEFAULT_SIZE_RUN);
  const [step, setStep] = useState<StepId>('fabric');
  const [touched, setTouched] = useState(false);
  const [metrics, setMetrics] = useState<PieceMetrics | null>(null);
  // El número de OT se asigna en el cliente (la página se prerenderiza estática).
  const [orderNumber, setOrderNumber] = useState<string | null>(null);
  const [issued, setIssued] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [issueError, setIssueError] = useState<string | null>(null);
  const captureRef = useRef<((view: 'front' | 'back') => string | null) | null>(null);

  const color = colorway(colorId);
  const spot = placement(p.placement);
  const chosenFinish = finish(p.finish);
  const code = techniqueCode(p.finish);
  const hasText = p.text.trim().length > 0;
  const units = totalUnits(sizes);
  const variant = variantCode(colorId, p);
  const font = fontOption(p.font) ?? FONT_OPTIONS[0];
  const ink = chosenFinish.threads ? thread(p.thread).hex : color.hex;
  const inkRef = colorReference(chosenFinish.technique, ink, chosenFinish.threads ? null : 'satin');
  // En el plano de detalle la ficha del modelo se retira para no tapar la prenda.
  const zoomed = useStudio((s) => s.camera.preset === 'detail');

  useEffect(() => {
    setOrderNumber(newOrderNumber());
  }, []);

  // Color → prenda 3D, template 2D e hilo ton-sur-ton (vía store).
  useEffect(() => {
    useStudio.getState().setGarmentColor(color.hex);
  }, [color.hex]);

  // Personalización → lienzos de diseño → decals sobre la prenda, y medidas reales de la pieza.
  useEffect(() => {
    let alive = true;
    void applyPersonalization(p, useStudio.getState().garmentColor).then(() => {
      if (alive) setMetrics(measurePersonalization(p));
    });
    return () => {
      alive = false;
    };
  }, [p]);

  /** Encuadre de cada paso: la cara y, si hay texto, el detalle de la colocación. */
  const frame = (view: 'front' | 'back', detail: boolean) => {
    const { focusView, requestCamera } = useStudio.getState();
    focusView(view);
    if (detail) requestCamera('detail');
  };

  const go = (next: StepId) => {
    setStep(next);
    if (next === 'fabric' || next === 'quantities') frame('front', false);
    else frame(spot.view, hasText && next !== 'order');
  };

  const changed = () => setIssued(false);

  const update = (patch: Partial<Personalization>) => {
    const next = { ...p, ...patch };
    const nextSpot = placement(next.placement);
    next.text = next.text.slice(0, nextSpot.maxChars);
    setP(next);
    changed();
    // Al escribir la primera letra o cambiar de colocación, la cámara va al detalle.
    if ((patch.text !== undefined && !hasText && next.text.trim()) || patch.placement) {
      setTouched(true);
      frame(nextSpot.view, !!next.text.trim());
    }
  };

  const setQty = (size: (typeof SIZES)[number], delta: number) => {
    setSizes((run) => ({ ...run, [size]: Math.max(0, Math.min(999, run[size] + delta)) }));
    changed();
  };

  const issueOrder = async () => {
    if (!orderNumber || !units) return;
    setIssuing(true);
    setIssueError(null);
    try {
      const { fabric, hardware } = useStudio.getState();
      const { blob, filename } = await buildTechPack({
        designName: hasText ? `${ATELIER.model} «${p.text.trim()}»` : ATELIER.model,
        styleCode: variant,
        season: ATELIER.season,
        garmentColor: color.hex,
        fabric,
        hardware,
        snapshot3d: captureRef.current?.(hasText ? spot.view : 'front') ?? null,
        order: {
          number: orderNumber,
          sizes: SIZES.map((size) => ({ size, qty: sizes[size] })),
          baseSize: ATELIER.baseSize,
        },
      });
      downloadBlob(blob, filename);
      setIssued(true);
    } catch (err) {
      setIssueError(err instanceof Error ? err.message : 'No se pudo emitir la orden.');
    } finally {
      setIssuing(false);
    }
  };

  const newOrder = () => {
    setOrderNumber(newOrderNumber());
    setIssued(false);
    go('fabric');
  };

  const modelBlock = (
    <>
      <p className="label-tech">{ATELIER.category}</p>
      <h1 className="mt-3 font-serif text-5xl font-normal tracking-[0.06em] md:text-6xl">{ATELIER.model}</h1>
      <p className="num mt-4 text-[12px] tracking-[0.06em]">{ATELIER.reference}</p>
      <p className="num mt-1 text-[11px] tracking-[0.06em] text-(--cfg-muted)">{variant}</p>
    </>
  );

  const runLabel =
    SIZES.filter((s) => sizes[s])
      .map((s) => `${s} ${sizes[s]}`)
      .join(' · ') || 'Sin unidades';

  return (
    <div className="cfg relative h-dvh overflow-hidden" data-mood={mood}>
      <DesignCanvases />

      <main className="absolute inset-x-0 top-0 h-[54dvh] md:inset-0 md:h-auto">
        <ConfiguratorViewer
          mood={mood}
          autoRotate={step === 'fabric' && !touched}
          frameOffsetPx={desktop ? -PANEL_WIDTH / 2 : 0}
          onInteract={() => setTouched(true)}
          captureRef={captureRef}
        />
      </main>

      {/* Cabecera del atelier */}
      <header className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-6 py-5 md:right-[420px] md:px-10 md:py-7">
        <p className="label-tech hidden md:block">
          Orden de taller <span className="num ml-2 tracking-[0.08em] text-(--cfg-fg)">{orderNumber ?? '…'}</span>
        </p>
        <p className="text-[11px] tracking-[0.5em] uppercase md:absolute md:left-1/2 md:-translate-x-1/2">
          {ATELIER.house}
        </p>
        <MoodToggle mood={mood} onChange={setMood} />
      </header>

      {/* Ficha del modelo sobre el plató (escritorio) */}
      <section
        className={cn(
          'pointer-events-none absolute top-28 left-10 z-10 hidden transition-opacity duration-700 md:block',
          zoomed && 'opacity-0',
        )}
      >
        {modelBlock}
      </section>

      {/* Vistas de cámara */}
      <nav aria-label="Vistas" className="absolute inset-x-0 bottom-0 z-10 hidden flex-col items-center gap-3 pb-9 md:right-[420px] md:flex">
        <div className="flex items-center gap-6">
          {(
            [
              ['Frente', () => frame('front', false)],
              ['Espalda', () => frame('back', false)],
              ['Detalle', () => frame(hasText ? spot.view : 'front', true)],
            ] as const
          ).map(([label, action]) => (
            <button
              key={label}
              type="button"
              onClick={() => {
                setTouched(true);
                action();
              }}
              className="text-[10px] tracking-[0.28em] text-(--cfg-muted) uppercase transition hover:text-(--cfg-fg)"
            >
              {label}
            </button>
          ))}
        </div>
        <p className={cn('font-editorial text-[13px] font-light italic text-(--cfg-muted) transition-opacity duration-700', touched && 'opacity-0')}>
          Arrastre para girar la pieza · rueda para acercar
        </p>
      </nav>

      {/* Panel de la orden */}
      <aside className="absolute inset-x-0 top-[54dvh] bottom-0 z-20 flex flex-col border-t border-(--cfg-line) bg-(--cfg-panel) backdrop-blur-xl md:top-0 md:left-auto md:w-[420px] md:border-t-0 md:border-l">
        <div className="thin-scroll min-h-0 flex-1 overflow-y-auto px-7 pt-6 md:px-9 md:pt-24">
          <div className="mb-6 md:hidden">{modelBlock}</div>
          <p className="label-tech mb-2">{ATELIER.unit}</p>

          <Step index="01" title="Tejido" value={color.name} open={step === 'fabric'} onOpen={() => go('fabric')}>
            <div role="radiogroup" aria-label="Color del tejido" className="flex flex-wrap gap-3.5">
              {COLORWAYS.map((c) => (
                <Swatch
                  key={c.id}
                  hex={c.hex}
                  name={c.name}
                  active={c.id === colorId}
                  onClick={() => {
                    setColorId(c.id);
                    changed();
                  }}
                />
              ))}
            </div>
            <dl className="mt-5 text-[11.5px]">
              <SpecLine label="Color">
                {color.name} <span className="num ml-1 text-[10.5px] text-(--cfg-muted)">{color.hex}</span>
              </SpecLine>
              <FabricSpecLines />
            </dl>
          </Step>

          <Step
            index="02"
            title="Personalización"
            value={hasText ? `«${p.text.trim()}»` : 'Prenda lisa'}
            open={step === 'personalize'}
            onOpen={() => go('personalize')}
          >
            <label className="block">
              <span className="label-tech">Iniciales o palabra</span>
              <input
                value={p.text}
                onChange={(e) => update({ text: e.target.value.toUpperCase() })}
                maxLength={spot.maxChars}
                placeholder="A.S."
                aria-label="Texto de la personalización"
                className="mt-3 w-full border-b border-(--cfg-line) bg-transparent pb-3 text-[26px] tracking-[0.22em] uppercase placeholder:text-(--cfg-muted) placeholder:opacity-40 focus:border-(--cfg-fg) focus:outline-none"
                style={{ fontFamily: font.stack, fontWeight: font.weight }}
              />
              <span className="num mt-2 block text-right text-[10px] text-(--cfg-muted)">
                {p.text.length} / {spot.maxChars}
              </span>
            </label>

            <p className="label-tech mt-6 mb-3">Tipografía</p>
            <div role="radiogroup" aria-label="Tipografía" className="grid grid-cols-3 gap-2">
              {MONOGRAM_FONTS.map((family) => {
                const f = fontOption(family)!;
                const active = p.font === family;
                return (
                  <button
                    key={family}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => update({ font: family })}
                    className={cn(
                      'border px-2 pt-3 pb-2.5 text-center transition',
                      active ? 'border-(--cfg-fg)' : 'border-(--cfg-line) text-(--cfg-muted) hover:text-(--cfg-fg)',
                    )}
                  >
                    <span className="block text-[22px] leading-none" style={{ fontFamily: f.stack, fontWeight: f.weight }}>
                      Aa
                    </span>
                    <span className="mt-2 block truncate text-[9px] tracking-[0.12em] uppercase">{family}</span>
                  </button>
                );
              })}
            </div>

            <p className="label-tech mt-7 mb-1">Técnica</p>
            <div role="radiogroup" aria-label="Técnica">
              {FINISHES.map((f) => (
                <OptionRow
                  key={f.id}
                  active={p.finish === f.id}
                  title={f.name}
                  note={f.note}
                  aside={techniqueCode(f.id)}
                  onClick={() => update({ finish: f.id })}
                />
              ))}
            </div>

            {chosenFinish.threads && (
              <>
                <p className="label-tech mt-6 mb-3">
                  {chosenFinish.id === 'print' ? 'Tinta' : 'Hilo'} ·{' '}
                  <span className="normal-case tracking-normal">{thread(p.thread).name}</span>
                </p>
                <div role="radiogroup" aria-label="Color del hilo" className="flex flex-wrap gap-3">
                  {THREADS.map((t) => (
                    <Swatch key={t.id} hex={t.hex} name={t.name} size={26} active={p.thread === t.id} onClick={() => update({ thread: t.id })} />
                  ))}
                </div>
              </>
            )}
            <p className="num mt-5 text-[10.5px] text-(--cfg-muted)">Ref. {inkRef}</p>
          </Step>

          <Step index="03" title="Colocación" value={spot.name} open={step === 'placement'} onOpen={() => go('placement')}>
            <div role="radiogroup" aria-label="Colocación">
              {PLACEMENTS.map((pl) => (
                <OptionRow
                  key={pl.id}
                  active={p.placement === pl.id}
                  title={pl.name}
                  note={`${pl.note} · caja ${pl.widthCm * 10} × ${pl.heightCm * 10} mm · ${pl.topCm * 10} mm bajo HPS`}
                  aside={`${pl.maxChars} car.`}
                  onClick={() => update({ placement: pl.id })}
                />
              ))}
            </div>
            {metrics && (
              <dl className="mt-5 text-[11.5px]">
                <SpecLine label="Calibre real">
                  <span className="num">
                    {metrics.widthMm} × {metrics.heightMm} mm
                  </span>
                </SpecLine>
                <SpecLine label="Coordenadas">
                  <span className="num">
                    X {signed(metrics.xFromAxisMm)} · Y {metrics.topFromHpsMm} mm
                  </span>
                </SpecLine>
              </dl>
            )}
          </Step>

          <Step index="04" title="Cantidades" value={`${units} uds`} open={step === 'quantities'} onOpen={() => go('quantities')}>
            <div className="grid grid-cols-6 gap-1.5">
              {SIZES.map((size) => (
                <div key={size} className="border border-(--cfg-line) py-2.5 text-center">
                  <p className="label-tech">{size}</p>
                  <p className={cn('num my-1.5 text-[18px]', !sizes[size] && 'text-(--cfg-muted)')}>{sizes[size]}</p>
                  <div className="flex justify-center gap-2.5 text-[13px] text-(--cfg-muted)">
                    <button type="button" aria-label={`Restar talla ${size}`} onClick={() => setQty(size, -1)} className="hover:text-(--cfg-fg)">
                      −
                    </button>
                    <button type="button" aria-label={`Sumar talla ${size}`} onClick={() => setQty(size, 1)} className="hover:text-(--cfg-fg)">
                      +
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-4 font-editorial text-[14px] leading-snug font-light italic text-(--cfg-muted)">
              Colocaciones referidas a la talla {ATELIER.baseSize}; el taller escala según su tabla de gradación.
            </p>
          </Step>

          <Step index="05" title="Orden" value={orderNumber ?? '…'} open={step === 'order'} onOpen={() => go('order')}>
            {issued && (
              <div className="mb-6 border-l border-(--cfg-fg) pl-4">
                <p className="font-serif text-2xl">Orden emitida</p>
                <p className="mt-2 text-[12px] leading-relaxed text-(--cfg-muted)">
                  Dossier descargado: lámina de colocación con cotas, materiales, desglose por tallas y archivos por técnica.
                </p>
              </div>
            )}
            <dl className="text-[11.5px]">
              <SpecLine label="Orden">
                <span className="num">{orderNumber}</span>
              </SpecLine>
              <SpecLine label="Modelo">
                {ATELIER.model} · <span className="num text-[10.5px]">{ATELIER.reference}</span>
              </SpecLine>
              <SpecLine label="Variante">
                <span className="num text-[10.5px]">{variant}</span>
              </SpecLine>
              <SpecLine label="Tejido">
                {color.name} <span className="num ml-1 text-[10.5px] text-(--cfg-muted)">{color.hex}</span>
              </SpecLine>
              {hasText ? (
                <>
                  <SpecLine label="Personalización">
                    «{p.text.trim()}» · {p.font}
                  </SpecLine>
                  <SpecLine label="Técnica">
                    {chosenFinish.name} · <span className="num text-[10.5px]">{inkRef}</span>
                  </SpecLine>
                  <SpecLine label="Colocación">
                    {spot.name}
                    {metrics && (
                      <span className="num ml-1 text-[10.5px] text-(--cfg-muted)">
                        {metrics.widthMm} × {metrics.heightMm} · X {signed(metrics.xFromAxisMm)} · Y {metrics.topFromHpsMm}
                      </span>
                    )}
                  </SpecLine>
                  {metrics && (
                    <SpecLine label="Producción">
                      <span className="num">
                        {cm2(metrics.areaMm2)} cm²
                        {metrics.stitches !== null && ` · ≈ ${thousands(metrics.stitches)} pt/u`}
                      </span>
                    </SpecLine>
                  )}
                </>
              ) : (
                <SpecLine label="Personalización">Prenda lisa</SpecLine>
              )}
              <SpecLine label="Unidades">
                <span className="num">
                  {runLabel} = {units}
                </span>
              </SpecLine>
            </dl>
            {issued && (
              <button
                type="button"
                onClick={newOrder}
                className="mt-6 border-b border-(--cfg-fg) pb-1 text-[10px] tracking-[0.26em] uppercase"
              >
                Nueva orden
              </button>
            )}
            {issueError && <p className="mt-3 text-[11px] text-(--cfg-muted)">{issueError}</p>}
          </Step>
        </div>

        <footer className="border-t border-(--cfg-line) px-7 pt-5 pb-6 md:px-9">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <p className="label-tech">Unidades</p>
              <p className="num mt-1.5 text-[17px]">{units}</p>
            </div>
            <div>
              <p className="label-tech">Técnica</p>
              <p className="num mt-1.5 text-[17px]">{hasText ? code : '—'}</p>
            </div>
            <div className="text-right">
              <p className="label-tech">{metrics?.stitches != null ? 'Puntadas / u' : 'Superficie'}</p>
              <p className="num mt-1.5 text-[17px]">
                {!metrics ? '—' : metrics.stitches != null ? `≈ ${thousands(metrics.stitches)}` : `${cm2(metrics.areaMm2)} cm²`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              go('order');
              void issueOrder();
            }}
            disabled={issuing || !units || !orderNumber}
            className="mt-5 flex w-full items-center justify-center gap-2 bg-(--cfg-cta) py-4 text-[10.5px] tracking-[0.32em] text-(--cfg-cta-fg) uppercase transition duration-300 hover:opacity-90 disabled:opacity-40"
          >
            {issuing && <LoaderCircle size={13} className="animate-spin" />}
            {issuing ? 'Preparando el dossier…' : issued ? 'Volver a emitir la orden' : 'Emitir orden de taller'}
          </button>
          <p className="mt-3 text-center font-editorial text-[13px] font-light italic text-(--cfg-muted)">
            {units ? 'Dossier PDF con cotas, materiales y tallas · archivos por técnica' : 'Indique al menos una unidad'}
          </p>
        </footer>
      </aside>
    </div>
  );
}

/** Ficha del tejido del modelo (la misma que define el atelier en «Prenda»). */
function FabricSpecLines() {
  const fabric = useStudio((s) => s.fabric);
  return (
    <>
      <SpecLine label="Construcción">{fabric.construction}</SpecLine>
      <SpecLine label="Gramaje">
        <span className="num">{fabric.weightGsm} g/m²</span>
      </SpecLine>
      <SpecLine label="Composición">{fabric.composition}</SpecLine>
      <SpecLine label="Acabado">{fabric.finish}</SpecLine>
    </>
  );
}
