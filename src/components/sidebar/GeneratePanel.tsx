'use client';

import { useEffect, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import { COLLECTION_STYLES, collectionStyle, type CollectionStyleId } from '@/lib/ai/prompt';
import { addAssetToCanvas, getDesignObjects } from '@/lib/fabric/editor';
import { getCanvas } from '@/lib/fabric/registry';
import { knockoutBlack } from '@/lib/image/knockout';
import { getOpenAIKey, useOpenAIKey } from '@/lib/settings';
import { useStudio } from '@/lib/store';
import type { GenerateResponse, GeneratedAsset, ImageFormat } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Button } from '../ui/Button';
import { Section } from '../ui/Section';
import { SpecSelect } from './ColorPanel';

/** Precio aproximado por imagen de DALL·E 3 (USD) según formato y calidad. */
const PRICE: Record<ImageFormat, { standard: number; hd: number }> = {
  square: { standard: 0.04, hd: 0.08 },
  portrait: { standard: 0.08, hd: 0.12 },
};

const FORMATS: ImageFormat[] = ['portrait', 'square'];
const FORMAT_LABEL: Record<ImageFormat, string> = {
  portrait: 'Vertical 1024 × 1792 · espalda',
  square: 'Cuadrado 1024 × 1024 · pecho',
};

/** ¿El servidor tiene claves propias? (sólo booleanos) */
function useServerKeys() {
  const [keys, setKeys] = useState<{ openai: boolean; recraft: boolean } | null>(null);
  useEffect(() => {
    fetch('/api/generate')
      .then((r) => r.json())
      .then(setKeys)
      .catch(() => setKeys({ openai: false, recraft: false }));
  }, []);
  return keys;
}

/** Dirección de colección: el estilo que se añade a cada concepto. */
function CollectionPicker({ value, onChange }: { value: CollectionStyleId; onChange: (id: CollectionStyleId) => void }) {
  return (
    <div role="radiogroup" aria-label="Dirección de colección">
      {COLLECTION_STYLES.map((style) => {
        const active = value === style.id;
        return (
          <button
            key={style.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(style.id)}
            className="group flex w-full items-baseline gap-4 border-b border-line/70 py-3 text-left last:border-b-0"
          >
            <span className={cn('num w-8 shrink-0 text-[10px]', active ? 'text-fg' : 'text-muted')}>{style.code}</span>
            <span className="min-w-0 flex-1">
              <span
                className={cn(
                  'block text-[11.5px] font-light tracking-[0.04em] transition',
                  active ? 'text-fg' : 'text-muted group-hover:text-fg',
                )}
              >
                {style.label}
              </span>
              {active && (
                <span className="mt-1 block font-editorial text-[13px] leading-snug font-light text-muted italic">
                  {style.note}
                </span>
              )}
            </span>
            <span className={cn('size-1.5 shrink-0 rounded-full', active ? 'bg-fg' : 'bg-transparent')} />
          </button>
        );
      })}
    </div>
  );
}

export function GeneratePanel() {
  const styleId = useStudio((s) => s.collectionStyle);
  const style = collectionStyle(styleId);
  const [prompt, setPrompt] = useState<string>(style.examples[0]);
  const [format, setFormat] = useState<ImageFormat>('portrait');
  const [count, setCount] = useState(1);
  const [hd, setHd] = useState(false);
  const [knockout, setKnockout] = useState(true);

  const apiKey = useOpenAIKey();
  const serverKeys = useServerKeys();
  const isGenerating = useStudio((s) => s.isGenerating);
  const error = useStudio((s) => s.generateError);

  const canGenerate = !!apiKey || !!serverKeys?.openai || !!serverKeys?.recraft;
  const cost = count * PRICE[format][hd ? 'hd' : 'standard'];

  // Al cambiar de dirección, si el concepto era un ejemplo de otra línea se sustituye por uno de la nueva.
  const pickStyle = (id: CollectionStyleId) => {
    useStudio.getState().setCollectionStyle(id);
    if (COLLECTION_STYLES.some((s) => (s.examples as readonly string[]).includes(prompt))) {
      setPrompt(collectionStyle(id).examples[0]);
    }
  };

  async function generate() {
    const { setGenerating, setGenerateError, addAssets, setLastProvider, activeView } = useStudio.getState();
    setGenerating(true);
    setGenerateError(null);
    try {
      const key = getOpenAIKey();
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(key ? { 'x-openai-key': key } : {}) },
        body: JSON.stringify({ prompt, count, format, hd, style: styleId }),
      });
      const json = (await res.json()) as GenerateResponse & { error?: string };
      if (!res.ok) throw new Error(json.error ?? `Error ${res.status}`);

      const assets: GeneratedAsset[] = await Promise.all(
        json.assets.map(async (a) =>
          knockout && a.needsBlackKnockout
            ? { ...a, src: await knockoutBlack(a.src), needsBlackKnockout: false, inkColor: '#FFFFFF' }
            : a,
        ),
      );
      addAssets(assets);
      setLastProvider(json.provider);

      // Si la cara activa está vacía, la primera variación se estampa directamente.
      const canvas = getCanvas(activeView);
      if (canvas && assets[0] && getDesignObjects(canvas).length === 0) {
        await addAssetToCanvas(canvas, activeView, assets[0]);
      }
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : 'Error generando el diseño.');
    } finally {
      setGenerating(false);
    }
  }

  return (
    <>
      <Section title="Dirección de colección" index="02">
        <CollectionPicker value={styleId} onChange={pickStyle} />
        <p className="mt-4 border-l border-line pl-3 font-editorial text-[13px] leading-snug font-light text-muted italic">
          «{style.es}»
        </p>
      </Section>

      <Section title="Generar con IA" index="03">
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (!isGenerating && canGenerate && prompt.trim()) void generate();
          }}
        >
          <label className="block space-y-2">
            <span className="label-tech">Concepto</span>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) e.currentTarget.form?.requestSubmit();
              }}
              maxLength={500}
              rows={2}
              placeholder="Describa el motivo"
              className="w-full resize-none border-b border-line bg-transparent pb-2 font-serif text-[15px] leading-snug tracking-[0.02em] text-fg placeholder:text-muted/60 focus:border-fg/60 focus:outline-none"
            />
          </label>

          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {style.examples.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => setPrompt(ex)}
                className={cn(
                  'border-b pb-0.5 text-[10.5px] font-light transition',
                  prompt === ex ? 'border-fg/60 text-fg' : 'border-line text-muted hover:border-fg/50 hover:text-fg',
                )}
              >
                {ex}
              </button>
            ))}
          </div>

          <div>
            <SpecSelect
              label="Formato"
              value={format}
              options={FORMATS}
              onChange={setFormat}
              format={(f) => FORMAT_LABEL[f]}
            />
            <SpecSelect label="Variaciones" value={count} options={[1, 2, 3, 4]} onChange={setCount} format={(n) => `× ${n}`} />
          </div>

          <div className="space-y-2 text-[10.5px] font-light text-muted">
            <label className="flex items-center gap-2.5">
              <input type="checkbox" checked={hd} onChange={(e) => setHd(e.target.checked)} />
              Calidad HD (más detalle en líneas finas)
            </label>
            <label className="flex items-center gap-2.5">
              <input type="checkbox" checked={knockout} onChange={(e) => setKnockout(e.target.checked)} />
              Negro → transparente (listo para la prenda)
            </label>
          </div>

          <Button
            type="submit"
            variant="primary"
            className="w-full py-3.5"
            disabled={isGenerating || !canGenerate || !prompt.trim()}
          >
            {isGenerating && <LoaderCircle size={13} className="animate-spin" />}
            {isGenerating ? 'DALL·E 3 está dibujando…' : 'Generar con DALL·E 3'}
          </Button>
          <p className="text-center text-[9.5px] font-light tracking-[0.14em] text-muted uppercase">
            {apiKey || serverKeys?.openai
              ? `≈ $${cost.toFixed(2)} por generación · precio aprox. de OpenAI`
              : serverKeys?.recraft
                ? 'Sin key de OpenAI: se usará Recraft v3 del servidor'
                : 'Pegue su OpenAI API Key en Configuración'}
          </p>

          {error && (
            <p role="alert" className="border-l border-fg/40 pl-3 text-[11px] font-light text-fg">
              {error}
            </p>
          )}
        </form>
      </Section>
    </>
  );
}
