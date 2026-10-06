'use client';

import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { Point } from 'fabric';
import { Raycaster, Vector2, Vector3 } from 'three';
import { getDesignObjects, nudgeActive, syncCanvasState } from '@/lib/fabric/editor';
import { getCanvas } from '@/lib/fabric/registry';
import type { HoodieView } from '@/lib/hoodie/spec';
import { useStudio } from '@/lib/store';
import { useCalibration } from '@/lib/three/calibration';
import { projectionMapper } from '@/lib/three/decalPlacement';
import { getGarmentPanels } from '@/lib/three/garmentRegistry';
import { MODEL_HPS_Y } from '@/lib/three/modelConfig';

/** La cámara debe mirar a la cara activa dentro de este coseno (≈ 55°) para editar sobre ella. */
const MIN_FACING = 0.57;

/** ¿La cámara está mirando a la cara activa? Fuera de ahí la proyección se deforma y no se edita. */
export function cameraFacesView(camera: { position: Vector3 }, view: HoodieView) {
  const to = camera.position.clone().normalize();
  return to.z * (view === 'front' ? 1 : -1) >= MIN_FACING;
}

export function currentMapper(view: HoodieView) {
  const { scale, offsetYCm } = useCalibration.getState();
  return projectionMapper(view, { hpsY: MODEL_HPS_Y, scale, offsetYCm });
}

/**
 * Edición directa sobre la prenda: pulsar un gráfico en el 3D lo selecciona y
 * arrastrarlo lo mueve por la superficie (se pasa por la inversa de la
 * proyección, así el gráfico sigue al cursor). Pulsar la prenda vacía quita la
 * selección. Fuera de los gráficos, el 3D se orbita como siempre.
 */
export function DirectEdit() {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as { enabled: boolean } | null;

  useEffect(() => {
    const el = gl.domElement;
    const raycaster = new Raycaster();
    const ndc = new Vector2();
    let drag: { view: HoodieView; last: { x: number; y: number }; pointerId: number } | null = null;
    let hoverFrame = 0;

    const pick = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      return raycaster.intersectObjects(getGarmentPanels(), false)[0] ?? null;
    };

    /** Gráfico (el de más arriba) que hay bajo el cursor, con su punto del lienzo. */
    const designAt = (e: PointerEvent) => {
      const { activeView: view } = useStudio.getState();
      if (!cameraFacesView(camera, view)) return null;
      const canvas = getCanvas(view);
      const hit = pick(e);
      if (!canvas || !hit) return null;
      const pt = currentMapper(view).toCanvas(hit.point);
      const target = [...getDesignObjects(canvas)].reverse().find((o) => o.containsPoint(new Point(pt.x, pt.y)));
      return { view, canvas, pt, target: target ?? null };
    };

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 || !e.isPrimary) return;
      const found = designAt(e);
      if (!found) return;
      const { view, canvas, pt, target } = found;
      if (!target) {
        // Pulsar tejido sin gráfico: se deselecciona y el gesto sigue siendo orbitar.
        if (canvas.getActiveObject()) {
          canvas.discardActiveObject();
          canvas.requestRenderAll();
          syncCanvasState(canvas, view);
        }
        return;
      }
      // Gesto del gráfico: que OrbitControls no lo vea.
      e.stopImmediatePropagation();
      canvas.setActiveObject(target);
      canvas.requestRenderAll();
      syncCanvasState(canvas, view);
      useStudio.getState().setSidebarTab('element');
      if (controls) controls.enabled = false;
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* puntero sintético: se sigue sin captura */
      }
      el.style.cursor = 'grabbing';
      drag = { view, last: pt, pointerId: e.pointerId };
    };

    const onMove = (e: PointerEvent) => {
      if (drag) {
        if (e.pointerId !== drag.pointerId) return;
        const canvas = getCanvas(drag.view);
        const hit = pick(e);
        if (!canvas || !hit) return; // fuera de la prenda: el gráfico espera
        const pt = currentMapper(drag.view).toCanvas(hit.point);
        nudgeActive(canvas, drag.view, pt.x - drag.last.x, pt.y - drag.last.y);
        drag.last = pt;
        return;
      }
      // Cursor de mano sobre los gráficos (como mucho una vez por frame).
      if (hoverFrame || e.buttons) return;
      hoverFrame = requestAnimationFrame(() => {
        hoverFrame = 0;
        el.style.cursor = designAt(e)?.target ? 'grab' : '';
      });
    };

    const onUp = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.pointerId) return;
      drag = null;
      if (controls) controls.enabled = true;
      if (el.hasPointerCapture?.(e.pointerId)) el.releasePointerCapture(e.pointerId);
      el.style.cursor = '';
    };

    // En captura y antes que OrbitControls (que escucha en la fase normal del mismo elemento).
    el.addEventListener('pointerdown', onDown, { capture: true });
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    return () => {
      el.removeEventListener('pointerdown', onDown, { capture: true });
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      cancelAnimationFrame(hoverFrame);
      if (controls) controls.enabled = true;
      el.style.cursor = '';
    };
  }, [gl, camera, controls]);

  return null;
}
