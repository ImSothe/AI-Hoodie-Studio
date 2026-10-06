import { FabricImage, type Canvas, type FabricObject } from 'fabric';
import { gradientBase } from '../fabric/tint';

/**
 * Deshacer/rehacer del editor de patrón. Cada paso es una fotografía de los diseños del lienzo: las MISMAS
 * piezas de Fabric (no copias) con sus propiedades, su imagen actual (el color y el degradado cambian la imagen),
 * sus pintas si son vectores y su recorte. Así no se duplican las imágenes en memoria.
 */

const PROPS = [
  'left',
  'top',
  'scaleX',
  'scaleY',
  'angle',
  'flipX',
  'flipY',
  'skewX',
  'skewY',
  'opacity',
  'originX',
  'originY',
  'tecnica',
  'clipPath',
  'inkColor',
  'originalInk',
  'inkBeforeTonal',
  'gradient',
] as const;

type Paint = FabricObject['fill'];

interface Item {
  obj: FabricObject;
  props: Record<string, unknown>;
  element?: unknown;
  base?: CanvasImageSource;
  /** Vectores (SVG): relleno y trazo de cada trazado. */
  paints: [FabricObject, Paint, Paint][];
}
export type Snapshot = Item[];

const isDesign = (o: FabricObject) => (o as FabricObject & { hoodieRole?: string }).hoodieRole === 'design';

function leaves(obj: FabricObject): FabricObject[] {
  const children = (obj as FabricObject & { getObjects?: () => FabricObject[] }).getObjects?.();
  return children ? children.flatMap(leaves) : [];
}

export function capture(canvas: Canvas): Snapshot {
  return canvas
    .getObjects()
    .filter(isDesign)
    .map((obj) => {
      const props: Record<string, unknown> = {};
      for (const key of PROPS) props[key] = (obj as unknown as Record<string, unknown>)[key];
      return {
        obj,
        props,
        element: obj instanceof FabricImage ? obj.getElement() : undefined,
        base: gradientBase.get(obj),
        paints: leaves(obj).map((leaf) => [leaf, leaf.fill, leaf.stroke] as [FabricObject, Paint, Paint]),
      };
    });
}

export function restore(canvas: Canvas, snapshot: Snapshot) {
  canvas.discardActiveObject();
  for (const o of canvas.getObjects().filter(isDesign)) canvas.remove(o);
  for (const item of snapshot) {
    const { obj, props } = item;
    obj.set(props as never);
    if (obj instanceof FabricImage && item.element && obj.getElement() !== item.element) {
      obj.setElement(item.element as HTMLImageElement);
    }
    if (item.base) gradientBase.set(obj, item.base);
    else gradientBase.delete(obj);
    for (const [leaf, fill, stroke] of item.paints) {
      leaf.set({ fill, stroke });
      leaf.set('dirty', true);
    }
    obj.set('dirty', true);
    obj.setCoords();
    canvas.add(obj);
  }
  canvas.requestRenderAll();
}

const ids = new WeakMap<object, number>();
let nextId = 1;
const idOf = (o: object | undefined | null) => {
  if (!o) return 0;
  if (!ids.has(o)) ids.set(o, nextId++);
  return ids.get(o)!;
};

/** Huella del estado: sirve para no guardar dos veces el mismo paso. */
export function signature(snapshot: Snapshot) {
  return snapshot
    .map((item) =>
      [
        idOf(item.obj),
        idOf(item.element as object),
        idOf(item.props.clipPath as object),
        PROPS.map((k) => (k === 'clipPath' || k === 'gradient' ? '' : String(item.props[k]))).join(','),
        JSON.stringify(item.props.gradient ?? null),
        item.paints.map(([, f, s]) => `${String(f)}|${String(s)}`).join(';'),
      ].join('~'),
    )
    .join('||');
}

/** Pasos de un lienzo (40 como máximo). */
export class History {
  private stack: { snap: Snapshot; sig: string }[] = [];
  private index = 0;

  constructor(initial: Snapshot = []) {
    this.stack = [{ snap: initial, sig: signature(initial) }];
  }

  push(snap: Snapshot) {
    const sig = signature(snap);
    if (this.stack[this.index].sig === sig) return false;
    this.stack = this.stack.slice(0, this.index + 1);
    this.stack.push({ snap, sig });
    if (this.stack.length > 40) this.stack.shift();
    this.index = this.stack.length - 1;
    return true;
  }

  undo(): Snapshot | null {
    if (this.index <= 0) return null;
    this.index--;
    return this.stack[this.index].snap;
  }

  redo(): Snapshot | null {
    if (this.index >= this.stack.length - 1) return null;
    this.index++;
    return this.stack[this.index].snap;
  }

  get canUndo() {
    return this.index > 0;
  }

  get canRedo() {
    return this.index < this.stack.length - 1;
  }
}
