'use client';

import { useState } from 'react';
import { clearOpenAIKey, looksLikeOpenAIKey, maskKey, setOpenAIKey, useOpenAIKey } from '@/lib/settings';
import { cn } from '@/lib/utils';
import { Button } from '../ui/Button';
import { Section } from '../ui/Section';

/** Configuración: OpenAI API Key guardada en localStorage (sólo en este navegador). */
export function SettingsPanel() {
  const apiKey = useOpenAIKey();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    if (!looksLikeOpenAIKey(draft)) {
      setError('No parece una key de OpenAI (empieza por «sk-»).');
      return;
    }
    setOpenAIKey(draft);
    setDraft('');
    setError(null);
    setEditing(false);
  };

  const showForm = !apiKey || editing;

  return (
    <Section
      title="Configuración"
      index="01"
      aside={
        <span className="label-tech flex items-center gap-2">
          <span className={cn('size-1 rounded-full bg-fg', !apiKey && 'animate-pulse')} />
          {apiKey ? 'IA conectada' : 'Sin API key'}
        </span>
      }
    >
      {showForm ? (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <label className="block space-y-2" htmlFor="openai-key">
            <span className="label-tech">OpenAI API Key</span>
          </label>
          <div className="flex items-end gap-4">
            <input
              id="openai-key"
              type={visible ? 'text' : 'password'}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="sk-..."
              autoComplete="off"
              spellCheck={false}
              className="num min-w-0 flex-1 border-b border-line bg-transparent pb-2 text-[12px] text-fg placeholder:text-muted/60 focus:border-fg/60 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setVisible((v) => !v)}
              className="pb-2 text-[9px] tracking-[0.22em] text-muted uppercase hover:text-fg"
            >
              {visible ? 'Ocultar' : 'Ver'}
            </button>
            <Button type="submit" variant="outline" disabled={!draft.trim()}>
              Guardar
            </Button>
          </div>
          {error && <p className="border-l border-fg/40 pl-3 text-[11px] font-light text-fg">{error}</p>}
          <p className="text-[10.5px] leading-relaxed font-light text-muted">
            Consígala en{' '}
            <a
              href="https://platform.openai.com/api-keys"
              target="_blank"
              rel="noreferrer"
              className="text-fg underline-offset-4 hover:underline"
            >
              platform.openai.com/api-keys
            </a>
            . Se guarda sólo en este navegador.
          </p>
          {editing && (
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="text-[9px] tracking-[0.22em] text-muted uppercase hover:text-fg"
            >
              Cancelar
            </button>
          )}
        </form>
      ) : (
        <div className="flex items-baseline gap-4 border-b border-line/70 pb-2">
          <span className="num flex-1 truncate text-[12px] text-fg">{maskKey(apiKey)}</span>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-[9px] tracking-[0.22em] text-muted uppercase hover:text-fg"
          >
            Cambiar
          </button>
          <button
            type="button"
            onClick={clearOpenAIKey}
            className="text-[9px] tracking-[0.22em] text-muted uppercase hover:text-fg"
          >
            Borrar
          </button>
        </div>
      )}
      <p className="mt-4 font-editorial text-[13px] leading-snug font-light text-muted italic">
        Ponga un límite de gasto en su cuenta de OpenAI y no use la key en una web pública: cualquier script del sitio
        podría leer localStorage.
      </p>
    </Section>
  );
}
