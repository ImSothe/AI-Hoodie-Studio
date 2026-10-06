export { clsx as cn } from 'clsx';

/** Agrupa llamadas en un único frame de animación. */
export function rafThrottle(fn: () => void) {
  let frame = 0;
  const run = () => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      fn();
    });
  };
  run.cancel = () => {
    cancelAnimationFrame(frame);
    frame = 0;
  };
  return run;
}

/** MIME propio para arrastrar assets de la galería al lienzo. */
export const ASSET_DRAG_MIME = 'application/x-hoodie-asset';
