'use client';

import { useEffect, useState } from 'react';
import type { Canvas } from 'fabric';
import {
  centerActive,
  changeActiveStacking,
  duplicateActive,
  fitActiveToPrintArea,
  flipActive,
  removeActive,
  setActiveAngle,
  setActiveWidthCm,
} from '@/lib/fabric/editor';
import { getCanvas } from '@/lib/fabric/registry';
import type { HoodieView } from '@/lib/hoodie/spec';
import { useStudio } from '@/lib/store';
import { Button } from '../ui/Button';
import { Section, SpecRow } from '../ui/Section';

function withCanvas(fn: (canvas: Canvas, view: HoodieView) => void) {
  const view = useStudio.getState().activeView;
  const canvas = getCanvas(view);
  if (canvas) fn(canvas, view);
}

const mm = (cm: number) => Math.round(cm * 10);
const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);

/** Calibres y posición de la pieza en milímetros, referidos al HPS y al eje central. */
export function SelectionPanel() {
  const selection = useStudio((s) => s.selection);
  const [widthInput, setWidthInput] = useState('');

  useEffect(() => {
    if (selection) setWidthInput(String(mm(selection.widthCm)));
  }, [selection?.widthCm]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!selection) return null; // el panel Pieza muestra la lista de elementos

  const angle = selection.angle > 180 ? selection.angle - 360 : selection.angle;
  const commitWidth = () => {
    const value = parseFloat(widthInput.replace(',', '.'));
    if (value > 0 && value < 2000) withCanvas((c, v) => setActiveWidthCm(c, v, value / 10));
    else setWidthInput(String(mm(selection.widthCm)));
  };

  return (
    <Section title="Calibres · posición">
      <label className="flex items-baseline justify-between gap-4 border-b border-line/70 py-2">
        <span className="label-tech">Ancho</span>
        <span className="flex items-baseline gap-1">
          <input
            value={widthInput}
            onChange={(e) => setWidthInput(e.target.value)}
            onBlur={commitWidth}
            onKeyDown={(e) => e.key === 'Enter' && commitWidth()}
            inputMode="decimal"
            aria-label="Ancho de la pieza en milímetros"
            className="num w-16 border-b border-fg/30 bg-transparent text-right text-[11px] text-fg focus:border-fg focus:outline-none"
          />
          <span className="num text-[10px] text-muted">mm</span>
        </span>
      </label>
      <SpecRow label="Alto">{mm(selection.heightCm)} mm</SpecRow>
      <SpecRow label="Y · desde HPS">{mm(selection.topFromHpsCm)} mm</SpecRow>
      <SpecRow label="X · desde eje">{signed(mm(selection.offsetXCm))} mm</SpecRow>
      <SpecRow label="Área">{selection.insidePrintArea ? 'Dentro' : 'Fuera del área'}</SpecRow>

      <label className="mt-4 block">
        <span className="flex items-baseline justify-between">
          <span className="label-tech">Rotación</span>
          <span className="num text-[11px] text-fg">{angle}°</span>
        </span>
        <input
          type="range"
          min={-180}
          max={180}
          value={angle}
          onChange={(e) => withCanvas((c, v) => setActiveAngle(c, v, Number(e.target.value)))}
          onDoubleClick={() => withCanvas((c, v) => setActiveAngle(c, v, 0))}
          className="mt-2 w-full"
        />
      </label>

      <div className="mt-5 grid grid-cols-2 gap-px bg-line">
        {[
          ['Centrar en eje', () => withCanvas((c, v) => centerActive(c, v, 'x'))],
          ['Centrar en área', () => withCanvas((c, v) => centerActive(c, v, 'both'))],
          ['Ajustar al área', () => withCanvas(fitActiveToPrintArea)],
          ['Simetría', () => withCanvas(flipActive)],
          ['Duplicar', () => withCanvas((c, v) => void duplicateActive(c, v))],
          ['Subir capa', () => withCanvas((c, v) => changeActiveStacking(c, v, 'up'))],
        ].map(([label, onClick]) => (
          <Button key={label as string} className="border-0 bg-black" onClick={onClick as () => void}>
            {label as string}
          </Button>
        ))}
      </div>
      <div className="mt-px grid grid-cols-2 gap-px bg-line">
        <Button className="border-0 bg-black" onClick={() => withCanvas((c, v) => changeActiveStacking(c, v, 'down'))}>
          Bajar capa
        </Button>
        <Button variant="danger" className="border-0 bg-black" onClick={() => withCanvas(removeActive)}>
          Retirar pieza
        </Button>
      </div>
    </Section>
  );
}
