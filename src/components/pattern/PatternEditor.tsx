'use client';

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import {
  Canvas,
  Ellipse,
  FabricImage,
  Point,
  Polygon,
  Polyline,
  Rect,
  Triangle,
  loadSVGFromString,
  util,
  type FabricObject,
  type TPointerEvent,
} from 'fabric';
import { importFiles } from '@/lib/assets/importFiles';
import { TEMPLATES, templateAsset } from '@/lib/assets/templates';
import { techniqueOfObject } from '@/lib/fabric/editor';
import { restoreObject, setTechnique, tintObject, tonalInk, isTonal, type Styled } from '@/lib/fabric/tint';
import { TECHNIQUE_INFO, TECHNIQUES, TONAL_TECHNIQUE, type Technique } from '@/lib/hoodie/spec';
import type { PatternAnalysis } from '@/lib/pattern/analysis';
import { bakeToPieces } from '@/lib/pattern/bake';
import { drawPatternGuide } from '@/lib/pattern/guide';
import { History, capture, restore } from '@/lib/pattern/history';
import { sizeOf, type PatternMode } from '@/lib/pattern/layout';
import {
  bindPrintSource,
  exportPatternPng,
  renderTechnique,
  schedulePrint,
  setPrintMode,
  techniquesInUse,
} from '@/lib/pattern/print';
import type { GeneratedAsset } from '@/lib/types';
import { cn } from '@/lib/utils';

const SWATCHES = ['#FFFFFF', '#EDE8DF', '#BFC1C2', '#8E8A83', '#3A3A3A', '#0A0A0A', '#5A1622', '#B5A27A'];
const EVENTS = ['object:added', 'object:removed', 'object:modified', 'object:moving', 'object:scaling', 'object:rotating'] as const;

const TECH_UI: { tech: Technique; label: string; hint: string }[] = [
  { tech: TECHNIQUES[0], label: 'Estampado', hint: 'Tinta plana y mate. Lo más versátil.' },
  { tech: TECHNIQUES[1], label: 'Reflectante', hint: 'Brilla con el flash: metálico y liso.' },
  { tech: TECHNIQUES[2], label: 'Bordado', hint: 'Hilo con puntadas y relieve. Para logos y detalles.' },
  { tech: TONAL_TECHNIQUE, label: 'Ton-sur-ton', hint: 'Hilo del color de la tela: sólo se ve por el relieve y el brillo.' },
];

type CropKind = 'rect' | 'ellipse' | 'triangle' | 'free';
const CROP_UI: { kind: CropKind; label: string }[] = [
  { kind: 'rect', label: 'Rectángulo' },
  { kind: 'ellipse', label: 'Círculo' },
  { kind: 'triangle', label: 'Triángulo' },
  { kind: 'free', label: 'Libre' },
];

async function createObject(asset: GeneratedAsset): Promise<FabricObject> {
  if (asset.kind === 'svg' && asset.svg) {
    const { objects, options } = await loadSVGFromString(asset.svg);
    return util.groupSVGElements(
      objects.filter((o): o is FabricObject => Boolean(o)),
      options,
    );
  }
  return FabricImage.fromURL(asset.src);
}

const isDesignObject = (o: FabricObject | undefined | null) =>
  !!o && (o as FabricObject & { hoodieRole?: string }).hoodieRole === 'design';
const SAVED_PROPS = ['hoodieRole', 'assetName', 'tecnica'];

/** Tiradores grandes y visibles: el lienzo se ve reducido en pantalla, así que se dimensionan según la escala. */
function styleControls(obj: FabricObject, scale: number) {
  obj.set({
    cornerStyle: 'circle',
    cornerSize: 26 / scale,
    touchCornerSize: 44 / scale,
    transparentCorners: false,
    cornerColor: '#ffffff',
    cornerStrokeColor: '#111111',
    borderColor: '#ffffff',
    borderScaleFactor: 2.5 / scale,
    borderDashArray: [10 / scale, 6 / scale],
    padding: 4 / scale,
  });
}

/** Sangrado: el borde del arte se prolonga unos píxeles más allá del contorno de cada pieza (para el corte). */
function addBleed(src: HTMLCanvasElement, px: number) {
  const out = document.createElement('canvas');
  out.width = src.width;
  out.height = src.height;
  const ctx = out.getContext('2d')!;
  ctx.drawImage(src, 0, 0);
  ctx.globalCompositeOperation = 'destination-over';
  for (let r = 1; r <= px; r++) {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) ctx.drawImage(src, dx * r, dy * r);
  }
  return out;
}

const btn =
  'border border-fg/20 px-3 py-2 text-[10px] tracking-[0.2em] text-fg uppercase transition hover:border-fg/60 disabled:opacity-30 disabled:hover:border-fg/20';

const isTonalName = (tech: Technique) => tech === TONAL_TECHNIQUE;

/**
 * Lienzo plano del patrón: las piezas de tela desplegadas. Todo lo que se
 * coloca aquí aparece cosido en la prenda 3D (por las UV del modelo).
 */
export function PatternEditor({
  analysis,
  mode,
  garmentColor,
}: {
  analysis: PatternAnalysis | null;
  mode: PatternMode;
  garmentColor: string;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const guideRef = useRef<HTMLCanvasElement>(null);
  const canvasRef = useRef<Canvas | null>(null);
  // Espacio disponible en pantalla; la escala sale de él y del tamaño del lienzo del modo actual.
  const [room, setRoom] = useState({ w: 800, h: 700 });
  const size = sizeOf(mode);
  const sizeRef = useRef(size);
  sizeRef.current = size;
  const scale = Math.max(0.1, Math.min(room.w / size.w, room.h / size.h));
  const scaleRef = useRef(scale);
  scaleRef.current = scale;
  const garmentRef = useRef(garmentColor);
  garmentRef.current = garmentColor;
  const [hasSelection, setHasSelection] = useState(false);
  const [labels, setLabels] = useState(true);
  const [busy, setBusy] = useState(false);
  const [activeTech, setActiveTech] = useState<Technique | null>(null);
  const [clipped, setClipped] = useState(false);
  const [notice, setNotice] = useState('');
  const [exporting, setExporting] = useState(false);
  const [, bump] = useState(0);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 3500);
    return () => clearTimeout(timer);
  }, [notice]);

  /* ------------------------------------------------------------------ historial */
  const histories = useRef<Record<PatternMode, History>>({ joined: new History(), pieces: new History() });
  const restoring = useRef(false);
  const modeRef = useRef(mode);
  const modeObjects = useRef<Partial<Record<PatternMode, FabricObject[]>>>({});
  const recordTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Guarda el estado actual como un paso (los cambios seguidos se agrupan). */
  const record = useCallback(() => {
    if (restoring.current) return;
    if (recordTimer.current) clearTimeout(recordTimer.current);
    recordTimer.current = setTimeout(() => {
      recordTimer.current = null;
      const canvas = canvasRef.current;
      if (!canvas) return;
      if (histories.current[modeRef.current].push(capture(canvas))) bump((n) => n + 1);
    }, 350);
  }, []);

  const step = useCallback((dir: 'undo' | 'redo') => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (recordTimer.current) {
      clearTimeout(recordTimer.current);
      recordTimer.current = null;
      histories.current[modeRef.current].push(capture(canvas)); // lo pendiente entra antes de deshacer
    }
    const h = histories.current[modeRef.current];
    const snap = dir === 'undo' ? h.undo() : h.redo();
    if (!snap) return;
    restoring.current = true;
    restore(canvas, snap);
    restoring.current = false;
    schedulePrint();
    setHasSelection(false);
    setActiveTech(null);
    bump((n) => n + 1);
  }, []);

  /* ------------------------------------------------------------------ lienzo */
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const el = document.createElement('canvas');
    host.appendChild(el);
    const canvas = new Canvas(el, {
      width: sizeRef.current.w,
      height: sizeRef.current.h,
      preserveObjectStacking: true,
      enableRetinaScaling: false,
      skipOffscreen: false,
      selectionColor: 'rgba(255,255,255,0.05)',
      selectionBorderColor: '#ffffff',
      selectionLineWidth: 2,
    });
    canvasRef.current = canvas;
    bindPrintSource(canvas);
    const offs = EVENTS.map((evt) => canvas.on(evt, schedulePrint));
    const sel = () => {
      const active = canvas.getActiveObject();
      setHasSelection(canvas.getActiveObjects().length > 0);
      const design = isDesignObject(active) ? active! : null;
      setActiveTech(design ? techniqueOfObject(design) : null);
      setClipped(!!design?.clipPath);
    };
    offs.push(canvas.on('selection:created', sel), canvas.on('selection:updated', sel), canvas.on('selection:cleared', sel));
    const changed = ({ target }: { target?: FabricObject }) => {
      if (isDesignObject(target)) record();
    };
    offs.push(canvas.on('object:modified', changed), canvas.on('object:added', changed), canvas.on('object:removed', changed));

    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.closest('input, textarea, select')) return;
      const k = e.key.toLowerCase();
      // Deshacer / rehacer
      if ((e.ctrlKey || e.metaKey) && k === 'z' && !e.shiftKey) {
        e.preventDefault();
        step('undo');
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (k === 'y' || (k === 'z' && e.shiftKey))) {
        e.preventDefault();
        step('redo');
        return;
      }
      // Flechas: mover la pieza (Mayús = 10 veces más).
      const stepPx = e.shiftKey ? 20 : 2;
      const arrows: Record<string, [number, number]> = {
        ArrowLeft: [-stepPx, 0],
        ArrowRight: [stepPx, 0],
        ArrowUp: [0, -stepPx],
        ArrowDown: [0, stepPx],
      };
      const move = arrows[e.key];
      const selected = canvas.getActiveObject();
      if (move && selected) {
        e.preventDefault();
        selected.set({ left: selected.left + move[0], top: selected.top + move[1] });
        selected.setCoords();
        canvas.requestRenderAll();
        schedulePrint();
        if (isDesignObject(selected)) record();
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const active = canvas.getActiveObjects();
        if (!active.length) return;
        e.preventDefault();
        canvas.discardActiveObject();
        canvas.remove(...active);
        canvas.requestRenderAll();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      offs.forEach((off) => off());
      if (recordTimer.current) clearTimeout(recordTimer.current);
      bindPrintSource(null);
      canvasRef.current = null;
      void canvas.dispose();
      el.parentElement?.remove();
    };
  }, [record, step]);

  // Escala de pantalla: el patrón cabe entero en el espacio disponible.
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setRoom({ w: width, h: height });
    });
    ro.observe(box);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setDimensions({ width: `${size.w * scale}px`, height: `${size.h * scale}px` }, { cssOnly: true });
  }, [scale, size.w, size.h]);

  // Tiradores visibles para cualquier escala de pantalla.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.getObjects().forEach((o) => styleControls(o, scale));
    canvas.requestRenderAll();
  }, [scale, mode]);

  // Guía: las piezas planas con su nombre.
  useEffect(() => {
    const guide = guideRef.current;
    if (!guide) return;
    const ctx = guide.getContext('2d')!;
    ctx.clearRect(0, 0, size.w, size.h);
    ctx.fillStyle = '#1b1b1b';
    ctx.fillRect(0, 0, size.w, size.h);
    if (analysis) drawPatternGuide(ctx, analysis, mode, labels);
  }, [analysis, mode, labels, size.w, size.h]);

  // Cada modo tiene sus propios diseños (las mismas piezas de Fabric): al cambiar se guardan los actuales y se ponen los del otro.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || modeRef.current === mode) return;
    if (recordTimer.current) {
      clearTimeout(recordTimer.current);
      recordTimer.current = null;
      histories.current[modeRef.current].push(capture(canvas));
    }
    restoring.current = true;
    modeObjects.current[modeRef.current] = canvas.getObjects().filter(isDesignObject);
    canvas.discardActiveObject();
    canvas.getObjects().forEach((o) => canvas.remove(o));
    modeRef.current = mode;
    // Cada modo tiene su propio lienzo, con su propio tamaño.
    canvas.setDimensions({ width: sizeOf(mode).w, height: sizeOf(mode).h }, { backstoreOnly: true });
    for (const o of modeObjects.current[mode] ?? []) {
      styleControls(o, scaleRef.current);
      canvas.add(o);
    }
    restoring.current = false;
    canvas.requestRenderAll();
    setPrintMode(mode);
    setHasSelection(false);
    setActiveTech(null);
    bump((n) => n + 1);
  }, [mode]);

  // El hilo ton-sur-ton sigue al color del tejido.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let any = false;
    for (const list of [canvas.getObjects(), ...Object.values(modeObjects.current)]) {
      for (const o of list ?? []) {
        if (isDesignObject(o) && isTonal(o)) {
          tintObject(o as Styled, tonalInk(garmentColor, (o as Styled).tonoShift));
          any = true;
        }
      }
    }
    if (any) {
      canvas.requestRenderAll();
      schedulePrint();
    }
  }, [garmentColor]);

  const place = useCallback(async (assets: GeneratedAsset[]) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    for (const asset of assets) {
      const obj = await createObject(asset);
      const { w, h } = sizeRef.current;
      const k = (Math.min(w, h) * 0.3) / Math.max(obj.width || 1, obj.height || 1);
      obj.set({ originX: 'center', originY: 'center', left: w / 2, top: h / 2, scaleX: k, scaleY: k });
      Object.assign(obj, { hoodieRole: 'design', assetName: asset.name });
      styleControls(obj, scaleRef.current);
      canvas.add(obj);
      canvas.setActiveObject(obj);
    }
    canvas.requestRenderAll();
    schedulePrint();
  }, []);

  const onFiles = async (e: ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    setBusy(true);
    try {
      await place(await importFiles(e.target.files));
    } finally {
      setBusy(false);
      e.target.value = '';
    }
  };

  /** Aplica un cambio al diseño elegido, repinta y lo anota para poder deshacerlo. */
  const withActive = (fn: (obj: FabricObject, canvas: Canvas) => void | Promise<void>) => async () => {
    const canvas = canvasRef.current;
    const obj = canvas?.getActiveObject();
    if (!canvas || !obj) return;
    await fn(obj, canvas);
    canvas.requestRenderAll();
    schedulePrint();
    record();
  };

  const setTech = (tech: Technique) =>
    void withActive((obj) => {
      setTechnique(obj as Styled, tech, garmentRef.current);
      setActiveTech(tech);
    })();

  /* ------------------------------------------------------------------ recortar */
  // Una forma ajustable sobre el diseño: al aplicarla se queda como recorte de la propia pieza,
  // o se separa esa parte en una pieza nueva (con su propia técnica y color).
  const [crop, setCrop] = useState<{ target: FabricObject; shape: FabricObject | null; kind: CropKind; points: Point[] } | null>(null);
  const cropRef = useRef(crop);
  cropRef.current = crop;
  const preview = useRef<FabricObject | null>(null);

  const shapeStyle = () => ({
    fill: 'rgba(255,255,255,0.14)',
    stroke: '#ffffff',
    strokeWidth: 3 / scaleRef.current,
    strokeUniform: true,
    strokeDashArray: [18 / scaleRef.current, 12 / scaleRef.current],
    objectCaching: false,
  });

  const makeShape = (kind: Exclude<CropKind, 'free'>, target: FabricObject) => {
    const b = target.getBoundingRect();
    const w = b.width * 0.8;
    const h = b.height * 0.8;
    const common = { ...shapeStyle(), left: b.left + b.width * 0.1, top: b.top + b.height * 0.1 };
    return kind === 'ellipse'
      ? new Ellipse({ ...common, rx: w / 2, ry: h / 2 })
      : kind === 'triangle'
        ? new Triangle({ ...common, width: w, height: h })
        : new Rect({ ...common, width: w, height: h });
  };

  const clearCropShape = (canvas: Canvas) => {
    const c = cropRef.current;
    if (c?.shape) canvas.remove(c.shape);
    if (preview.current) canvas.remove(preview.current);
    preview.current = null;
    canvas.skipTargetFind = false;
    canvas.defaultCursor = 'default';
  };

  const chooseShape = (kind: CropKind) => {
    const canvas = canvasRef.current;
    const c = cropRef.current;
    if (!canvas || !c) return;
    clearCropShape(canvas);
    if (kind === 'free') {
      // Forma libre: clic punto a punto; se cierra con «Cerrar forma», Intro o pulsando el primer punto.
      canvas.discardActiveObject();
      canvas.skipTargetFind = true;
      canvas.defaultCursor = 'crosshair';
      setCrop({ ...c, shape: null, kind, points: [] });
    } else {
      const shape = makeShape(kind, c.target);
      styleControls(shape, scaleRef.current);
      canvas.add(shape);
      canvas.setActiveObject(shape);
      setCrop({ ...c, shape, kind, points: [] });
    }
    canvas.requestRenderAll();
  };

  const closeFree = () => {
    const canvas = canvasRef.current;
    const c = cropRef.current;
    if (!canvas || !c || c.kind !== 'free' || c.points.length < 3) return;
    clearCropShape(canvas);
    const shape = new Polygon(
      c.points.map((p) => ({ x: p.x, y: p.y })),
      shapeStyle(),
    );
    styleControls(shape, scaleRef.current);
    canvas.add(shape);
    canvas.setActiveObject(shape);
    canvas.requestRenderAll();
    setCrop({ ...c, shape, points: [] });
  };

  const startCrop = () => {
    const canvas = canvasRef.current;
    const target = canvas?.getActiveObject();
    if (!canvas || !target || !isDesignObject(target)) return;
    const shape = makeShape('rect', target);
    styleControls(shape, scaleRef.current);
    canvas.add(shape);
    canvas.setActiveObject(shape);
    canvas.requestRenderAll();
    setCrop({ target, shape, kind: 'rect', points: [] });
  };

  // Forma libre: los clics del ratón van sumando puntos.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !crop || crop.kind !== 'free' || crop.shape) return;
    const onDown = (opt: { e: TPointerEvent }) => {
      const c = cropRef.current;
      if (!c || c.kind !== 'free' || c.shape) return;
      const p = canvas.getScenePoint(opt.e);
      const first = c.points[0];
      if (first && c.points.length >= 3 && Math.hypot(p.x - first.x, p.y - first.y) < 30 / scaleRef.current) {
        closeFree();
        return;
      }
      const points = [...c.points, p];
      if (preview.current) canvas.remove(preview.current);
      const line = new Polyline(
        points.map((q) => ({ x: q.x, y: q.y })),
        { fill: '', stroke: '#ffffff', strokeWidth: 3 / scaleRef.current, strokeUniform: true, selectable: false, evented: false, objectCaching: false },
      );
      preview.current = line;
      canvas.add(line);
      canvas.requestRenderAll();
      setCrop({ ...c, points });
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') closeFree();
      if (e.key === 'Escape') void finishCrop('cancel');
    };
    canvas.on('mouse:down', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      canvas.off('mouse:down', onDown);
      window.removeEventListener('keydown', onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crop?.kind, crop?.shape]);

  /** La forma, pasada al espacio de la pieza (que puede estar escalada o girada), lista para usar como recorte. */
  const clipFrom = async (target: FabricObject, shape: FabricObject, inverted: boolean) => {
    const inverse = util.invertTransform(target.calcTransformMatrix());
    const d = util.qrDecompose(util.multiplyTransformMatrices(inverse, shape.calcTransformMatrix()));
    const clip = await shape.clone();
    clip.set({
      left: d.translateX,
      top: d.translateY,
      scaleX: d.scaleX,
      scaleY: d.scaleY,
      angle: d.angle,
      skewX: d.skewX,
      skewY: d.skewY,
      originX: 'center',
      originY: 'center',
      fill: '#000000',
      stroke: undefined,
      strokeWidth: 0,
      strokeDashArray: undefined,
      inverted,
      absolutePositioned: false,
    } as never);
    return clip;
  };

  const finishCrop = async (action: 'apply' | 'split' | 'cancel') => {
    const canvas = canvasRef.current;
    const c = cropRef.current;
    if (!canvas || !c) return;
    const { target, shape } = c;
    if (action !== 'cancel' && shape) {
      if (action === 'apply') {
        target.clipPath = await clipFrom(target, shape, false);
        target.dirty = true;
      } else {
        // Separar: una copia con sólo esa parte y el original con todo lo demás.
        const part = await target.clone(SAVED_PROPS);
        part.clipPath = await clipFrom(target, shape, false);
        part.dirty = true;
        target.clipPath = await clipFrom(target, shape, true);
        target.dirty = true;
        styleControls(part, scaleRef.current);
        canvas.add(part);
        canvas.setActiveObject(part);
      }
    }
    clearCropShape(canvas);
    if (action !== 'split') canvas.setActiveObject(target);
    canvas.requestRenderAll();
    setCrop(null);
    setClipped(!!canvas.getActiveObject()?.clipPath);
    schedulePrint();
    if (action !== 'cancel') record();
  };

  /* ------------------------------------------------------------------ exportar */
  const download = () => {
    const a = document.createElement('a');
    a.href = exportPatternPng();
    a.download = mode === 'joined' ? 'patron-unido.png' : 'patron-piezas.png';
    a.click();
  };

  /**
   * Para fábrica: el dibujo cortado en las piezas sueltas de taller (cada pieza con su trozo, ya encajado con las
   * vecinas), un archivo por técnica, con sangrado, + un plano con los contornos y nombres.
   */
  const downloadFactory = async () => {
    if (!analysis) return;
    setExporting(true);
    try {
      await new Promise((r) => setTimeout(r, 30)); // deja pintar el aviso antes del cálculo
      const used = techniquesInUse();
      if (!used.length) {
        setNotice('Aún no hay ningún diseño en el plano.');
        return;
      }
      const BLEED = 6;
      const arts = used.map((tech) => {
        const raw = renderTechnique(tech, mode === 'joined' ? 2 : 1) ?? document.createElement('canvas');
        return { tech, canvas: addBleed(mode === 'joined' ? bakeToPieces(analysis, raw) : raw, BLEED) };
      });
      const outline = document.createElement('canvas');
      outline.width = sizeOf('pieces').w;
      outline.height = sizeOf('pieces').h;
      const octx = outline.getContext('2d')!;
      octx.fillStyle = '#3a3a3a';
      octx.fillRect(0, 0, outline.width, outline.height);
      drawPatternGuide(octx, analysis, 'pieces', true);
      for (const { canvas } of arts) octx.drawImage(canvas, 0, 0);
      const blobOf = (c: HTMLCanvasElement) => new Promise<Blob>((res) => c.toBlob((b) => res(b!), 'image/png'));
      const { default: JSZip } = await import('jszip');
      const zip = new JSZip();
      const lines: string[] = [];
      for (const { tech, canvas } of arts) {
        const info = TECHNIQUE_INFO[tech];
        const name = `${info.code}-${info.slug}.png`;
        zip.file(name, await blobOf(canvas));
        lines.push(`${name}: ${tech}. ${info.note}`);
      }
      zip.file('plano-con-nombres.png', await blobOf(outline));
      zip.file(
        'LEEME.txt',
        'Diseño cortado en las piezas de taller, un archivo por técnica (fondo transparente, todas las piezas en una imagen):\n' +
          lines.join('\n') +
          '\n\nplano-con-nombres.png: todo sobre las siluetas de cada pieza, con su nombre, para que el taller sepa cuál es cuál.\n' +
          `Los dibujos que pasan de una pieza a otra encajan en las costuras. El arte se prolonga ${BLEED} px más allá del contorno de cada pieza (sangrado). No incluye margen de costura.\n`,
      );
      const url = URL.createObjectURL(await zip.generateAsync({ type: 'blob' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'patron-para-fabrica.zip';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } finally {
      setExporting(false);
    }
  };

  const h = histories.current[mode];
  const hintOf = (tech: Technique | null) => TECH_UI.find((t) => t.tech === tech)?.hint ?? 'Elija un diseño del plano.';
  const tonal = !!activeTech && isTonalName(activeTech);

  return (
    <section className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3">
        <label className={cn(btn, 'cursor-pointer')}>
          {busy ? 'Cargando…' : '+ Imagen'}
          <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" multiple className="sr-only" onChange={onFiles} />
        </label>
        <select
          aria-label="Añadir plantilla"
          className={cn(btn, 'bg-black')}
          value=""
          onChange={(e) => {
            const a = templateAsset(e.target.value);
            if (a) void place([a]);
          }}
        >
          <option value="">+ Plantilla</option>
          {TEMPLATES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <span className="mx-1 h-5 w-px bg-line" />
        <button type="button" className={btn} disabled={!h.canUndo} onClick={() => step('undo')} title="Deshacer (Ctrl+Z)">
          ↶ Deshacer
        </button>
        <button type="button" className={btn} disabled={!h.canRedo} onClick={() => step('redo')} title="Rehacer (Ctrl+Y)">
          Rehacer ↷
        </button>
        <span className="mx-1 h-5 w-px bg-line" />
        <button
          type="button"
          disabled={!hasSelection || !!crop}
          className={btn}
          onClick={withActive(async (obj, canvas) => {
            const copy = await obj.clone(SAVED_PROPS);
            copy.set({ left: obj.left + 40, top: obj.top + 40 });
            styleControls(copy, scaleRef.current);
            canvas.add(copy);
            canvas.setActiveObject(copy);
          })}
        >
          Duplicar
        </button>
        <button type="button" disabled={!hasSelection || !!crop} className={btn} onClick={withActive((obj) => void obj.set({ flipX: !obj.flipX }))}>
          Espejo
        </button>
        <button type="button" disabled={!hasSelection || !!crop} className={btn} onClick={withActive((obj, canvas) => void canvas.bringObjectForward(obj))}>
          Subir
        </button>
        <button type="button" disabled={!hasSelection || !!crop} className={btn} onClick={withActive((obj, canvas) => void canvas.sendObjectBackwards(obj))}>
          Bajar
        </button>
        {!crop && (
          <>
            <button type="button" disabled={!hasSelection || !activeTech} className={btn} onClick={startCrop} title="Deja sólo una parte del diseño (o la separa en una pieza nueva)">
              Recortar
            </button>
            {clipped && (
              <button
                type="button"
                className={btn}
                onClick={withActive((obj) => {
                  obj.clipPath = undefined;
                  obj.dirty = true;
                  setClipped(false);
                })}
              >
                Quitar recorte
              </button>
            )}
          </>
        )}
        <button
          type="button"
          disabled={!hasSelection || !!crop}
          className={btn}
          onClick={withActive((obj, canvas) => {
            canvas.discardActiveObject();
            canvas.remove(obj);
          })}
        >
          Quitar
        </button>
        <span className="mx-1 h-5 w-px bg-line" />
        <button type="button" className={btn} aria-pressed={labels} onClick={() => setLabels((v) => !v)}>
          Nombres {labels ? 'sí' : 'no'}
        </button>
        <button type="button" className={cn(btn, 'ml-auto')} onClick={download}>
          PNG de este plano
        </button>
        <button type="button" className={btn} disabled={!analysis || exporting} onClick={() => void downloadFactory()}>
          {exporting ? 'Preparando…' : 'Para fábrica (piezas)'}
        </button>
      </div>

      {crop && (
        <div className="flex flex-wrap items-center gap-2 border-b border-line bg-white/[0.03] px-5 py-2.5">
          <span className="label-tech mr-1">Recorte</span>
          {CROP_UI.map((c) => (
            <button key={c.kind} type="button" aria-pressed={crop.kind === c.kind} className={cn(btn, crop.kind === c.kind && 'border-fg bg-white/10')} onClick={() => chooseShape(c.kind)}>
              {c.label}
            </button>
          ))}
          <span className="mx-1 h-5 w-px bg-line" />
          {crop.kind === 'free' && !crop.shape ? (
            <>
              <button type="button" className={btn} disabled={crop.points.length < 3} onClick={closeFree}>
                Cerrar forma
              </button>
              <span className="font-editorial text-[14px] font-light text-muted italic">
                Pulse sobre el plano punto a punto; para cerrar, el primer punto o Intro.
              </span>
            </>
          ) : (
            <>
              <button type="button" className={cn(btn, 'border-fg')} onClick={() => void finishCrop('apply')}>
                Aplicar recorte
              </button>
              <button type="button" className={btn} onClick={() => void finishCrop('split')} title="Esa parte pasa a ser una pieza aparte, con su propia técnica y color">
                Separar parte
              </button>
            </>
          )}
          <button type="button" className={btn} onClick={() => void finishCrop('cancel')}>
            Cancelar
          </button>
        </div>
      )}

      <div className={cn('flex flex-wrap items-center gap-2 border-b border-line px-5 py-2.5', !activeTech && 'opacity-40')}>
        <span className="label-tech mr-1">Técnica</span>
        {TECH_UI.map((t) => (
          <button
            key={t.tech}
            type="button"
            disabled={!activeTech || !!crop}
            aria-pressed={activeTech === t.tech}
            title={t.hint}
            className={cn(btn, activeTech === t.tech && 'border-fg bg-white/10')}
            onClick={() => setTech(t.tech)}
          >
            {t.label}
          </button>
        ))}
        <span className="font-editorial text-[14px] font-light text-muted italic">{hintOf(activeTech)}</span>
      </div>

      <div className={cn('flex flex-wrap items-center gap-3 border-b border-line px-5 py-2.5', (!hasSelection || tonal) && 'opacity-40')}>
        <span className="label-tech">{activeTech && TECHNIQUE_INFO[activeTech].layer === 'embroidery' ? 'Color del hilo' : 'Color de la tinta'}</span>
        {SWATCHES.map((hex) => (
          <button
            key={hex}
            type="button"
            disabled={!hasSelection || tonal}
            aria-label={`Color ${hex}`}
            title={hex}
            className="size-5 border border-white/25"
            style={{ background: hex }}
            onClick={withActive((obj) => tintObject(obj as Styled, hex))}
          />
        ))}
        <input
          type="color"
          aria-label="Otro color"
          disabled={!hasSelection || tonal}
          className="h-5 w-8 cursor-pointer border border-white/25 bg-transparent"
          onChange={(e) => {
            const canvas = canvasRef.current;
            const obj = canvas?.getActiveObject();
            if (!canvas || !obj) return;
            tintObject(obj as Styled, e.target.value);
            canvas.requestRenderAll();
            schedulePrint();
            record();
          }}
        />
        <button type="button" disabled={!hasSelection || tonal} className="label-tech underline" onClick={withActive((obj) => restoreObject(obj as Styled))}>
          Original
        </button>
        {tonal && <span className="font-editorial text-[14px] font-light text-muted italic">El hilo toma el color del tejido.</span>}
      </div>

      <div ref={boxRef} className="relative min-h-0 flex-1 overflow-hidden bg-[#0d0d0d] p-3">
        <div className="relative mx-auto" style={{ width: size.w * scale, height: size.h * scale }}>
          <canvas
            ref={guideRef}
            width={size.w}
            height={size.h}
            className="absolute inset-0"
            style={{ width: size.w * scale, height: size.h * scale }}
          />
          <div ref={hostRef} className="absolute inset-0" />
          {notice && (
            <p role="status" className="label-tech absolute top-2 left-1/2 -translate-x-1/2 bg-black/80 px-3 py-2">
              {notice}
            </p>
          )}
          {!analysis && <p className="label-tech absolute inset-0 grid place-items-center text-center">Preparando el patrón…</p>}
        </div>
      </div>
    </section>
  );
}
