'use client';

import { useState } from 'react';
import { LoaderCircle, X } from 'lucide-react';
import { buildTechPack, downloadBlob } from '@/lib/export/techPack';
import { useStudio } from '@/lib/store';
import { Button } from '../ui/Button';
import { Section, SpecRow } from '../ui/Section';

type ExportSpec = Awaited<ReturnType<typeof buildTechPack>>['spec'];

function Field({ label, value, onChange, mono }: { label: string; value: string; onChange: (v: string) => void; mono?: boolean }) {
  return (
    <label className="block space-y-2">
      <span className="label-tech">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={40}
        className={
          mono
            ? 'num w-full border-b border-line bg-transparent pb-2 text-[12px] tracking-[0.12em] text-fg uppercase focus:border-fg/60 focus:outline-none'
            : 'w-full border-b border-line bg-transparent pb-2 font-serif text-[15px] tracking-[0.08em] text-fg focus:border-fg/60 focus:outline-none'
        }
      />
    </label>
  );
}

/** Pestaña Dossier: identidad del modelo y compilación del dossier de taller (PDF + archivos). */
export function ExportPanel() {
  const designName = useStudio((s) => s.designName);
  const styleCode = useStudio((s) => s.styleCode);
  const season = useStudio((s) => s.season);
  const counts = useStudio((s) => s.designCounts);
  const snapshot3d = useStudio((s) => s.snapshot3d);
  const garmentColor = useStudio((s) => s.garmentColor);
  const fabric = useStudio((s) => s.fabric);
  const hardware = useStudio((s) => s.hardware);
  const { setDesignName, setStyleCode, setSeason, setSnapshot3d } = useStudio.getState();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ filename: string; spec: ExportSpec } | null>(null);

  const total = counts.front + counts.back;

  async function exportPack() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const { blob, filename, spec } = await buildTechPack({
        designName,
        styleCode,
        season,
        garmentColor,
        fabric,
        hardware,
        snapshot3d,
      });
      downloadBlob(blob, filename);
      setResult({ filename, spec });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo compilar el dossier.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Section title="Identidad del modelo" index="01">
        <div className="space-y-5">
          <Field label="Nombre" value={designName} onChange={setDesignName} />
          <div className="grid grid-cols-[1fr_88px] gap-5">
            <Field label="Referencia de estilo" value={styleCode} onChange={(v) => setStyleCode(v.toUpperCase())} mono />
            <Field label="Temporada" value={season} onChange={(v) => setSeason(v.toUpperCase())} mono />
          </div>
        </div>
      </Section>

      <Section title="Dossier de taller" index="02">
        <div className="space-y-5">
          <div>
            <SpecRow label="Tejido">
              {fabric.construction} · {fabric.weightGsm} g/m²
            </SpecRow>
            <SpecRow label="Color">
              <span className="inline-flex items-center gap-2">
                <span className="inline-block size-2 ring-1 ring-white/25" style={{ background: garmentColor }} />
                {garmentColor}
              </span>
            </SpecRow>
            <SpecRow label="Piezas">
              {counts.front} delantera · {counts.back} espalda
            </SpecRow>
          </div>

          {snapshot3d ? (
            <div className="flex items-center gap-3 border border-line p-2">
              <img src={snapshot3d} alt="Render 3D capturado" className="h-10 w-16 object-contain" />
              <span className="flex-1 text-[10.5px] font-light text-muted">Render en la portada del dossier</span>
              <button
                type="button"
                aria-label="Quitar render 3D"
                onClick={() => setSnapshot3d(null)}
                className="p-1 text-muted hover:text-fg"
              >
                <X size={13} />
              </button>
            </div>
          ) : (
            <p className="font-editorial text-[13px] leading-snug font-light text-muted italic">
              Pulse «Capturar» en el visor para abrir el dossier con el render 3D; si no, la portada usa los planos.
            </p>
          )}

          <Button variant="primary" className="w-full py-3.5" disabled={busy || total === 0} onClick={exportPack}>
            {busy && <LoaderCircle size={13} className="animate-spin" />}
            {busy ? 'Compilando dossier…' : 'Compilar dossier'}
          </Button>
          <p className="text-center text-[9.5px] font-light tracking-[0.14em] text-muted uppercase">
            PDF de taller · SVG / PNG por técnica · spec.json
            {total === 0 && <span className="mt-1 block normal-case tracking-normal">Añada alguna pieza primero.</span>}
          </p>

          {error && (
            <p role="alert" className="border-l border-fg/40 pl-3 text-[11px] font-light text-fg">
              {error}
            </p>
          )}

          {result && (
            <div className="border-t border-line pt-4">
              <p className="num mb-3 truncate text-[10.5px] text-ivory">{result.filename}</p>
              <div>
                {result.spec.views.map((v) => (
                  <SpecRow key={v.view} label={v.label}>
                    {v.widthMm} × {v.heightMm} mm · {v.topFromHpsMm} bajo HPS
                  </SpecRow>
                ))}
                {result.spec.inks.map((ink) => (
                  <SpecRow key={ink.ref} label={ink.pieces.join(' ')}>
                    {ink.ref}
                  </SpecRow>
                ))}
              </div>
            </div>
          )}
        </div>
      </Section>
    </>
  );
}
