import { describe, test, expect } from 'vitest';
import { Canvas } from '../../canvas/Canvas';
import { Rect } from '../Rect';
import { Color } from '../../color/Color';
import { Circle } from '../Circle';
import { FabricText, Object, version } from '../../../../../fabric';
import { Group } from '../Group';

describe('Object - clipPath', () => {
  test('constructor & properties', () => {
    const cObj = new Object();

    expect(
      cObj.clipPath,
      'clipPath should not be defined out of the box',
    ).toBeUndefined();
  });

  test('toObject with clipPath', () => {
    const emptyObjectRepr = {
      version: version,
      type: 'FabricObject',
      originX: 'center',
      originY: 'center',
      left: 0,
      top: 0,
      width: 0,
      height: 0,
      fill: 'rgb(0,0,0)',
      stroke: null,
      strokeWidth: 1,
      strokeDashArray: null,
      strokeLineCap: 'butt',
      strokeDashOffset: 0,
      strokeLineJoin: 'miter',
      strokeMiterLimit: 4,
      scaleX: 1,
      scaleY: 1,
      angle: 0,
      flipX: false,
      flipY: false,
      opacity: 1,
      shadow: null,
      visible: true,
      backgroundColor: '',
      fillRule: 'nonzero',
      paintFirst: 'fill',
      globalCompositeOperation: 'source-over',
      skewX: 0,
      skewY: 0,
      strokeUniform: false,
    };

    const cObj = new Object();

    expect(cObj.toObject(), 'initial object representation').toEqual(
      emptyObjectRepr,
    );

    cObj.clipPath = new Object();

    expect(cObj.toObject(), 'object with clipPath representation').toEqual({
      ...emptyObjectRepr,
      clipPath: {
        ...emptyObjectRepr,
        inverted: cObj.clipPath.inverted,
        absolutePositioned: cObj.clipPath.absolutePositioned,
      },
    });

    cObj.clipPath.excludeFromExport = true;

    expect(
      cObj.toObject().clipPath,
      'clipPath should be undefined when excludeFromExport is true',
    ).toBeUndefined();
  });

  test('from object with clipPath', async () => {
    const rect = new Rect({ width: 100, height: 100 });

    rect.clipPath = new Circle({ radius: 50 });

    const toObject = rect.toObject();
    const newRect = await Rect.fromObject(toObject);

    expect(newRect.clipPath, 'clipPath is enlived').toBeInstanceOf(Circle);
    expect(newRect.clipPath, 'radius is restored correctly').toHaveProperty(
      'radius',
      50,
    );
  });

  test('from object with clipPath inverted, absolutePositioned', async () => {
    const rect = new Rect({ width: 100, height: 100 });

    rect.clipPath = new Circle({
      radius: 50,
      inverted: true,
      absolutePositioned: true,
    });

    const toObject = rect.toObject();
    const newRect = await Rect.fromObject(toObject);

    expect(newRect.clipPath, 'clipPath is enlived').toBeInstanceOf(Circle);
    expect(newRect.clipPath, 'radius is restored correctly').toHaveProperty(
      'radius',
      50,
    );
    expect(newRect.clipPath!.inverted, 'inverted is restored correctly').toBe(
      true,
    );
    expect(
      newRect.clipPath!.absolutePositioned,
      'absolutePositioned is restored correctly',
    ).toBe(true);
  });

  test('from object with clipPath, nested', async () => {
    const rect = new Rect({ width: 100, height: 100 });

    rect.clipPath = new Circle({ radius: 50 });
    rect.clipPath.clipPath = new FabricText('clipPath');

    const toObject = rect.toObject();
    const newRect = await Rect.fromObject(toObject);

    expect(newRect.clipPath, 'clipPath is enlived').toBeInstanceOf(Circle);
    expect(newRect.clipPath, 'radius is restored correctly').toHaveProperty(
      'radius',
      50,
    );
    expect(
      newRect.clipPath!.clipPath,
      'nested clipPath is enlived',
    ).toBeInstanceOf(FabricText);
    expect(
      newRect.clipPath!.clipPath,
      'instance is restored correctly',
    ).toHaveProperty('text', 'clipPath');
  });

  test('from object with clipPath, nested inverted, absolutePositioned', async () => {
    const rect = new Rect({ width: 100, height: 100 });

    rect.clipPath = new Circle({ radius: 50 });
    rect.clipPath.clipPath = new FabricText('clipPath', {
      inverted: true,
      absolutePositioned: true,
    });

    const toObject = rect.toObject();
    const newRect = await Rect.fromObject(toObject);

    expect(newRect.clipPath, 'clipPath is enlived').toBeInstanceOf(Circle);
    expect(newRect.clipPath, 'radius is restored correctly').toHaveProperty(
      'radius',
      50,
    );
    expect(
      newRect.clipPath!.clipPath,
      'nested clipPath is enlived',
    ).toBeInstanceOf(FabricText);
    expect(
      newRect.clipPath!.clipPath,
      'instance is restored correctly',
    ).toHaveProperty('text', 'clipPath');
    expect(
      newRect.clipPath!.clipPath!.inverted,
      'instance inverted is restored correctly',
    ).toBe(true);
    expect(
      newRect.clipPath!.clipPath!.absolutePositioned,
      'instance absolutePositioned is restored correctly',
    ).toBe(true);
  });

  test('_setClippingProperties fix the context props', () => {
    const canvas = new Canvas();
    const rect = new Rect({ width: 100, height: 100 });

    canvas.contextContainer.fillStyle = 'red';
    canvas.contextContainer.strokeStyle = 'blue';
    canvas.contextContainer.globalAlpha = 0.3;

    rect._setClippingProperties(canvas.contextContainer);

    expect(canvas.contextContainer.fillStyle, 'fillStyle is reset').toBe(
      '#000000',
    );
    expect(
      new Color(canvas.contextContainer.strokeStyle).getAlpha(),
      'stroke style is reset',
    ).toBe(0);
    expect(canvas.contextContainer.globalAlpha, 'globalAlpha is reset').toBe(1);
  });

  describe('cache invalidation', () => {
    const objectWithClipPath = () => {
      const rect = new Rect({ width: 100, height: 100 });
      rect.clipPath = new Circle({ radius: 50 });
      // simulate a completed render
      rect.dirty = false;
      return rect;
    };

    test('assigning a clipPath marks the object dirty', () => {
      const rect = new Rect({ width: 100, height: 100 });
      rect.dirty = false;

      rect.clipPath = new Circle({ radius: 50 });

      expect(rect.dirty, 'object is dirty').toBe(true);
      expect(
        rect.clipPath.clipPathTarget,
        'clipPath references the clipped object',
      ).toBe(rect);
    });

    test('removing a clipPath marks the object dirty and detaches it', () => {
      const rect = objectWithClipPath();
      const clipPath = rect.clipPath!;

      rect.clipPath = undefined;

      expect(rect.dirty, 'object is dirty').toBe(true);
      expect(
        clipPath.clipPathTarget,
        'detached clipPath has no target',
      ).toBeUndefined();
    });

    test('replacing a clipPath moves the back reference to the new clipPath', () => {
      const rect = objectWithClipPath();
      const prevClipPath = rect.clipPath!;
      const nextClipPath = new Rect({ width: 20, height: 20 });

      rect.clipPath = nextClipPath;

      expect(rect.dirty, 'object is dirty').toBe(true);
      expect(prevClipPath.clipPathTarget, 'previous clipPath is detached').toBe(
        undefined,
      );
      expect(nextClipPath.clipPathTarget, 'new clipPath is attached').toBe(
        rect,
      );
    });

    test('mutating the clipPath geometry marks the object dirty', () => {
      const rect = objectWithClipPath();

      rect.clipPath!.set({ radius: 20, left: 10 });

      expect(rect.dirty, 'object is dirty').toBe(true);
    });

    test('mutating a nested clipPath marks the object dirty', () => {
      const rect = objectWithClipPath();
      const nested = new Circle({ radius: 10 });
      rect.clipPath!.clipPath = nested;
      rect.dirty = false;
      rect.clipPath!.dirty = false;

      nested.set('radius', 20);

      expect(rect.clipPath!.dirty, 'clipPath is dirty').toBe(true);
      expect(rect.dirty, 'object is dirty').toBe(true);
    });

    test('mutating the clipPath of an object in a group dirties the group', () => {
      const rect = objectWithClipPath();
      const group = new Group([rect]);
      rect.dirty = false;
      group.dirty = false;

      rect.clipPath!.set('radius', 20);

      expect(rect.dirty, 'object is dirty').toBe(true);
      expect(group.dirty, 'group cache is invalidated').toBe(true);
    });

    test('clipPath stays wired to the object after deserialization', async () => {
      const rect = objectWithClipPath();
      const newRect = await Rect.fromObject(rect.toObject());

      expect(
        newRect.clipPath!.clipPathTarget,
        'clipPath references the enlived object',
      ).toBe(newRect);

      newRect.dirty = false;
      newRect.clipPath!.set('radius', 20);

      expect(newRect.dirty, 'enlived object is dirty').toBe(true);
    });
  });
});
