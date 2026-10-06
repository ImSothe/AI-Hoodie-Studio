'use client';

import { useEffect, useState } from 'react';

/** ¿Pantalla de escritorio (≥ 768 px)? Paneles flotantes y encuadre desplazado sólo ahí. */
export function useDesktop() {
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const update = () => setDesktop(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return desktop;
}
