import { Canvas } from './Canvas';
import { Rect } from '../shapes/Rect';
import { Control } from '../controls/Control';
import { Group } from '../shapes/Group';
import { Point } from '../Point';
import { createPointerEvent } from '../../../../test/utils';

import { describe, expect, it, beforeEach, vi } from 'vitest';

/**
 * Controls, hit areas and interaction sessions must always reflect the current
 * state of the object without requiring manual `setCoords` calls or per-frame
 * recomputation. Coordinates are cached and invalidated lazily.
 */
describe('controls and hit areas stay in sync with object state', () => {
  let canvas: Canvas;

  beforeEach(() => {
    canvas = new Canvas(undefined, {
      width: 600,
      height: 600,
      enableRetinaScaling: false,
    });
  });

  const makeRect = (options = {}) =>
    new Rect({
      left: 100,
      top: 100,
      width: 100,
      height: 100,
      angle: 0,
      ...options,
    });

  describe('active object: control drawing positions follow geometry changes', () => {
    const geometryChanges: [string, Record<string, number>][] = [
      ['angle', { angle: 45 }],
      ['width', { width: 200 }],
      ['left/top', { left: 300, top: 300 }],
      ['scale', { scaleX: 1.5, scaleY: 1.5 }],
      ['skew', { skewX: 20 }],
      ['rotate', { angle: 30 }],
    ];

    it.each(geometryChanges)(
      'control positions follow the new %s without calling setCoords',
      (_label, props) => {
        const rect = makeRect();
        canvas.add(rect);
        canvas.setActiveObject(rect);
        const before = Object.fromEntries(
          Object.entries(rect.oCoords).map(([key, coord]) => [
            key,
            new Point(coord.x, coord.y),
          ]),
        );

        rect.set(props);

        // reading oCoords lazily rebuilds them from the current state
        const oCoords = rect._getOCoords();
        // expected positions computed from scratch from current state
        const expected = rect.calcOCoords();
        let moved = 0;
        Object.entries(expected).forEach(([key, coord]) => {
          expect(oCoords[key].x, `${key}.x`).toBeCloseTo(coord.x, 6);
          expect(oCoords[key].y, `${key}.y`).toBeCloseTo(coord.y, 6);
          const dx = oCoords[key].x - before[key].x;
          const dy = oCoords[key].y - before[key].y;
          moved += Math.sqrt(dx * dx + dy * dy);
        });
        expect(
          moved,
          'the control box must move away from its old position overall',
        ).toBeGreaterThan(0.5);
      },
    );
  });

  describe('inactive object: hit area follows the object', () => {
    it('selects the object at its new center and not at the old one', () => {
      const rect = makeRect();
      canvas.add(rect);
      const oldCenter = rect.getCenterPoint();
      const newCenter = oldCenter.clone().add(new Point(150, 150));
      rect.set({ left: newCenter.x, top: newCenter.y });

      expect(
        canvas._searchPossibleTargets(
          canvas._objects,
          new Point(oldCenter.x, oldCenter.y),
          [],
        ).target,
        'old center must not hit anymore',
      ).toBeUndefined();
      expect(
        canvas._searchPossibleTargets(
          canvas._objects,
          new Point(newCenter.x, newCenter.y),
          [],
        ).target,
        'new center must hit',
      ).toBe(rect);
    });
  });

  describe('replacing the control set at runtime', () => {
    it('does not crash on renderAll and uses the new controls', () => {
      const rect = makeRect();
      canvas.add(rect);
      canvas.setActiveObject(rect);

      expect(() => {
        rect.controls = { custom: new Control({ x: 0.5, y: 0.5 }) };
        canvas.renderAll();
      }).not.toThrow();

      const oCoords = rect._getOCoords();
      expect(Object.keys(oCoords)).toEqual(['custom']);
      // hit testing against the freshly computed control quad works
      const hit = rect.findControl(
        new Point(oCoords.custom.x, oCoords.custom.y),
      );
      expect(hit?.key).toBe('custom');
      expect(() => canvas.renderAll()).not.toThrow();
    });

    it('removing a control from the set does not leave stale entries behind', () => {
      const rect = makeRect();
      canvas.add(rect);
      canvas.setActiveObject(rect);
      const controls = { ...rect.controls };
      delete controls.mtr;
      rect.controls = controls;

      expect(Object.keys(rect._getOCoords())).not.toContain('mtr');
      expect(() => canvas.renderAll()).not.toThrow();
    });
  });

  describe('cornerSize changes', () => {
    it('updates both the drawn size and the hit quad', () => {
      const rect = makeRect();
      canvas.add(rect);
      canvas.setActiveObject(rect);
      rect.set({ cornerSize: 30 });

      const quad = rect._getOCoords().tl.corner;
      const width = quad.tr.x - quad.tl.x;
      const height = quad.bl.y - quad.tl.y;
      expect(width).toBeCloseTo(30, 6);
      expect(height).toBeCloseTo(30, 6);
      // and touch corners follow touchCornerSize independently
      const touchWidth =
        rect._getOCoords().tl.touchCorner.tr.x -
        rect._getOCoords().tl.touchCorner.tl.x;
      expect(touchWidth).toBeCloseTo(rect.touchCornerSize, 6);
    });
  });

  describe('drag session ends on empty space', () => {
    it('resets isMoving so controls and borders leave the moving opacity', () => {
      const rect = makeRect({ width: 50, height: 50 });
      canvas.add(rect);
      canvas.setActiveObject(rect);

      const start = rect.getCenterPoint();
      canvas._onMouseDown(
        createPointerEvent({ clientX: start.x, clientY: start.y }),
      );
      canvas._onMouseMove(
        createPointerEvent({ clientX: start.x + 40, clientY: start.y + 40 }),
      );
      expect(rect.isMoving).toBe(true);

      // release far away from any object
      canvas._onMouseUp(createPointerEvent({ clientX: 590, clientY: 590 }));

      expect(rect.isMoving).toBe(false);
      expect(canvas._currentTransform).toBeNull();
    });
  });

  describe('coordinates are recomputed lazily, not per frame', () => {
    it('does not recompute oCoords when nothing changed', () => {
      const rect = makeRect();
      canvas.add(rect);
      canvas.setActiveObject(rect);
      const first = rect._getOCoords();
      const calcSpy = vi.spyOn(rect, 'calcOCoords');

      expect(rect._getOCoords()).toBe(first);
      expect(rect._getOCoords()).toBe(first);
      expect(calcSpy).not.toHaveBeenCalled();

      rect.set({ angle: 10 });
      const recomputed = rect._getOCoords();
      expect(recomputed).not.toBe(first);
      expect(calcSpy).toHaveBeenCalledTimes(1);
      // subsequent reads reuse the fresh cache
      expect(rect._getOCoords()).toBe(recomputed);
      expect(calcSpy).toHaveBeenCalledTimes(1);
      calcSpy.mockRestore();
    });

    it('recomputes aCoords lazily only after a geometry change', () => {
      const rect = makeRect();
      canvas.add(rect);
      const calcSpy = vi.spyOn(rect, 'calcACoords');

      rect.getCoords();
      const callsAfterFirstRead = calcSpy.mock.calls.length;
      rect.getCoords();
      rect.getCoords();
      expect(calcSpy.mock.calls.length).toBe(callsAfterFirstRead);
      expect(rect.aCoords).toBeDefined();

      rect.set({ left: 250 });
      expect(
        (rect as unknown as { _aCoords: unknown })._aCoords,
        'cache is cleared on change',
      ).toBeUndefined();
      rect.getCoords();
      expect(calcSpy.mock.calls.length).toBe(callsAfterFirstRead + 1);
      calcSpy.mockRestore();
    });
  });

  describe('viewport changes', () => {
    it('repositions controls after zoom without manual setCoords', () => {
      const rect = makeRect();
      canvas.add(rect);
      canvas.setActiveObject(rect);
      const before = rect._getOCoords().tl;

      canvas.setViewportTransform([2, 0, 0, 2, 0, 0]);

      const after = rect._getOCoords().tl;
      expect(after.x).toBeCloseTo(before.x * 2, 6);
      expect(after.y).toBeCloseTo(before.y * 2, 6);
    });
  });

  describe('nested objects in groups', () => {
    it('child hit area and controls follow group geometry changes', () => {
      const child = makeRect();
      const group = new Group([child], {
        left: 50,
        top: 50,
        subTargetCheck: true,
        interactive: true,
      });
      canvas.add(group);
      const childCenter = child.getCenterPoint();
      expect(
        canvas._searchPossibleTargets(
          canvas._objects,
          new Point(childCenter.x, childCenter.y),
          [],
        ).target,
        'child is hittable at its initial position',
      ).toBe(group);

      group.set({ left: 200, top: 200 });
      const movedCenter = child.getCenterPoint();

      expect(
        canvas._searchPossibleTargets(
          canvas._objects,
          new Point(childCenter.x, childCenter.y),
          [],
        ).target,
        'old position must not hit after the group moved',
      ).toBeUndefined();
      expect(
        canvas._searchPossibleTargets(
          canvas._objects,
          new Point(movedCenter.x, movedCenter.y),
          [],
        ).target,
        'child stays hittable at its new position',
      ).toBe(group);

      // control coordinates of the child follow the group as well
      const expected = child.calcOCoords();
      Object.entries(expected).forEach(([key, coord]) => {
        expect(child._getOCoords()[key].x, `${key}.x`).toBeCloseTo(coord.x, 6);
        expect(child._getOCoords()[key].y, `${key}.y`).toBeCloseTo(coord.y, 6);
      });
    });
  });
});
