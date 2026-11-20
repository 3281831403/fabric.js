import { describe, expect, it, vi } from 'vitest';
import { Rect } from '../Rect';
import { Group } from '../Group';
import { ActiveSelection } from '../ActiveSelection';
import { Point } from '../../Point';
import { Canvas } from '../../canvas/Canvas';
import { StaticCanvas } from '../../canvas/StaticCanvas';
import { isTransparent } from '../../util/misc/isTransparent';

/**
 * A uniform stroke keeps a constant width on screen no matter how the object
 * (or any of its ancestor groups) is scaled. The rendered outer edge of an
 * object is therefore always `dimension * scale + strokeWidth`. These tests
 * pin that the geometry (bounding box, hit area, selection box) and the cache
 * clipping all match the actual painted extent, including for nested groups
 * and active selections.
 */
describe('strokeUniform across scaled groups and active selections', () => {
  const STROKE_WIDTH = 10;

  const makeRect = (options: Record<string, unknown> = {}) =>
    new Rect({
      width: 100,
      height: 60,
      strokeWidth: STROKE_WIDTH,
      strokeUniform: true,
      fill: 'red',
      stroke: 'blue',
      ...options,
    });

  const makeGroup = (scale: number) => {
    const rect = makeRect({ left: -50, top: -30 });
    const group = new Group([rect], { strokeWidth: 0 });
    group.scale(scale);
    group.setCoords();
    return { group, rect };
  };

  it('1. group bounding rect matches the painted extent for scale up and down', () => {
    const up = makeGroup(2);
    expect(up.group.getBoundingRect()).toMatchObject({
      width: 210,
      height: 130,
    });
    expect(up.rect.getBoundingRect()).toMatchObject({
      width: 210,
      height: 130,
    });

    const down = makeGroup(0.5);
    expect(down.group.getBoundingRect()).toMatchObject({
      width: 60,
      height: 40,
    });
    expect(down.rect.getBoundingRect()).toMatchObject({
      width: 60,
      height: 40,
    });
  });

  it('2. hit testing follows the painted edge instead of the old bounding box', () => {
    const { group } = makeGroup(0.5);
    const { left, top, width, height } = group.getBoundingRect();
    const centerX = left + width / 2;
    const centerY = top + height / 2;
    // painted half width/height is 30/20, equal to the bounding box half size
    expect(
      group.containsPoint(new Point(centerX - 29, centerY)),
      'point on the painted stroke is hit',
    ).toBe(true);
    expect(
      group.containsPoint(new Point(centerX - 32, centerY)),
      'point beyond the painted stroke is missed',
    ).toBe(false);
    expect(
      group.containsPoint(new Point(centerX, centerY + 22)),
      'point below the painted bottom edge is missed',
    ).toBe(false);
  });

  it('3. nested groups keep the stroke constant on screen', () => {
    const rect = makeRect({ left: -50, top: -30 });
    const inner = new Group([rect], { strokeWidth: 0 });
    const outer = new Group([inner], { strokeWidth: 0 });
    outer.scale(1.25);
    outer.setCoords();
    inner.setCoords();

    const expected = { width: 135, height: 85 };
    expect(outer.getBoundingRect(), 'outer group').toMatchObject(expected);
    expect(
      inner.getBoundingRect(),
      'inner group measured in scene plane',
    ).toMatchObject(expected);
  });

  it('4. active selection box matches the rendered children', () => {
    const canvas = new Canvas(undefined, { renderOnAddRemove: false });
    const r1 = makeRect({ left: 40, top: 40 });
    const r2 = makeRect({
      width: 50,
      height: 40,
      left: 160,
      top: 40,
    });
    canvas.add(r1, r2);
    const selection = new ActiveSelection([r1, r2], { canvas });
    canvas.setActiveObject(selection);
    selection.scale(2);
    selection.setCoords();

    const bounds = selection.getBoundingRect();
    const borderSpy = vi
      .spyOn(selection, 'strokeBorders')
      .mockImplementation(() => {});
    selection._renderControls(canvas.contextTop);
    const borderSize = borderSpy.mock.calls[0][1];

    // the border adds borderScaleFactor (1px) and no padding by default
    expect(borderSize.x, 'selection border width').toBeCloseTo(
      bounds.width + selection.borderScaleFactor,
      6,
    );
    expect(borderSize.y, 'selection border height').toBeCloseTo(
      bounds.height + selection.borderScaleFactor,
      6,
    );
    expect(r1.getBoundingRect(), 'first child painted extent').toMatchObject({
      width: 210,
      height: 130,
    });
  });

  it('5. cached rendering is clipped to the same extent as direct rendering', () => {
    const renderScene = (objectCaching: boolean) => {
      const canvas = new StaticCanvas(undefined, {
        enableRetinaScaling: false,
        width: 400,
        height: 400,
      });
      const rect = makeRect({
        left: -50,
        top: -30,
        objectCaching,
      });
      // force a dedicated cache layer for the object so its own clipping is
      // exercised instead of being absorbed by the group cache
      rect.needsItsOwnCache = () => true;
      const group = new Group([rect], { strokeWidth: 0 });
      group.set({ left: 200, top: 200 });
      group.scale(0.75);
      canvas.add(group);
      canvas.renderAll();
      return { canvas, rect };
    };

    const scanOpaqueSpan = (
      ctx: CanvasRenderingContext2D,
      horizontal: boolean,
    ) => {
      let min = -1;
      let max = -1;
      for (let i = 140; i < 260; i++) {
        const x = horizontal ? i : 200;
        const y = horizontal ? 200 : i;
        if (!isTransparent(ctx, x, y, 0)) {
          if (min === -1) {
            min = i;
          }
          max = i;
        }
      }
      return max - min + 1;
    };

    const cached = renderScene(true);
    const direct = renderScene(false);
    expect(
      scanOpaqueSpan(cached.canvas.contextContainer, true),
      'cached horizontal extent equals direct rendering',
    ).toBe(scanOpaqueSpan(direct.canvas.contextContainer, true));
    expect(
      scanOpaqueSpan(cached.canvas.contextContainer, false),
      'cached vertical extent equals direct rendering',
    ).toBe(scanOpaqueSpan(direct.canvas.contextContainer, false));

    // the cache canvas has to host the full painted extent, which is
    // 100 * 0.75 + 10 = 85 wide and 60 * 0.75 + 10 = 55 high, before aliasing
    const cacheDims = cached.rect._getCacheCanvasDimensions();
    expect(cacheDims.x, 'cache drawable width').toBe(85);
    expect(cacheDims.y, 'cache drawable height').toBe(55);
    const cacheContext = cached.rect._cacheContext!;
    const cacheCanvas = cached.rect._cacheCanvas!;
    const scanCache = (horizontal: boolean) => {
      let min = -1;
      let max = -1;
      for (
        let i = 0;
        i < (horizontal ? cacheCanvas.width : cacheCanvas.height);
        i++
      ) {
        const x = horizontal ? i : Math.floor(cacheCanvas.width / 2);
        const y = horizontal ? Math.floor(cacheCanvas.height / 2) : i;
        if (!isTransparent(cacheContext, x, y, 0)) {
          if (min === -1) {
            min = i;
          }
          max = i;
        }
      }
      return max - min + 1;
    };
    expect(scanCache(true), 'full width painted inside the cache').toBe(85);
    expect(scanCache(false), 'full height painted inside the cache').toBe(55);
  });

  it('6. width/height survive serialization round trips unchanged', async () => {
    const { group } = makeGroup(2);
    const serialized = group.toObject();
    const restored = await Group.fromObject(
      JSON.parse(JSON.stringify(serialized)),
    );

    expect(restored.width, 'group width').toBe(serialized.width);
    expect(restored.height, 'group height').toBe(serialized.height);

    restored.scale(2);
    restored.setCoords();
    expect(restored.getBoundingRect(), 'restored group geometry').toMatchObject(
      { width: 210, height: 130 },
    );

    const object = makeRect({ scaleX: 2, scaleY: 3 });
    const objectData = object.toObject();
    const restoredObject = await Rect.fromObject(
      JSON.parse(JSON.stringify(objectData)),
    );
    expect(restoredObject.width, 'object width').toBe(100);
    expect(restoredObject.height, 'object height').toBe(60);
    expect(restoredObject.scaleX, 'object scaleX').toBe(2);
    expect(restoredObject.scaleY, 'object scaleY').toBe(3);
  });
});
