import type { ReactNode } from 'react';

/**
 * Bloque de ficha técnica: rótulo en versalitas diminutas muy espaciadas,
 * índice opcional (01, 02…) y filete inferior de 1 px. Sin iconos: el
 * lujo silencioso se apoya en la tipografía y el espacio.
 */
export function Section({
  title,
  index,
  aside,
  children,
}: {
  title: string;
  /** Índice editorial (p. ej. "01"). */
  index?: string;
  /** Compatibilidad: los iconos ya no se muestran. */
  icon?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="border-b border-line px-6 py-6">
      <header className="mb-5 flex items-baseline justify-between gap-3">
        <h2 className="label-tech flex items-baseline gap-3">
          {index && <span className="num text-[9px] tracking-normal text-muted">{index}</span>}
          <span className="text-fg">{title}</span>
        </h2>
        {aside}
      </header>
      {children}
    </section>
  );
}

/** Fila clave/valor de ficha técnica con filete fino. */
export function SpecRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line/70 py-2 last:border-b-0">
      <span className="label-tech shrink-0">{label}</span>
      <span className="num truncate text-right text-[11px] text-fg">{children}</span>
    </div>
  );
}
