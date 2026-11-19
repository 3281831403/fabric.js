import { FabricObject } from './FabricObject';

import { describe, expect, it } from 'vitest';

describe('FabricObject', () => {
  it('setCoords should calculate control coords only if canvas ref is set', () => {
    const object = new FabricObject();
    // caches are empty until either setCoords or the first lazy read
    expect(
      (object as unknown as { _aCoords: unknown })._aCoords,
    ).toBeUndefined();
    expect(
      (object as unknown as { _oCoords: unknown })._oCoords,
    ).toBeUndefined();
    object.setCoords();
    expect((object as unknown as { _aCoords: unknown })._aCoords).toBeDefined();
    expect(
      (object as unknown as { _oCoords: unknown })._oCoords,
    ).toBeUndefined();
    // @ts-expect-error -- mock canvas
    object.canvas = { getZoom: () => 1 };
    object.setCoords();
    expect((object as unknown as { _aCoords: unknown })._aCoords).toBeDefined();
    expect((object as unknown as { _oCoords: unknown })._oCoords).toBeDefined();
  });

  it('lazily computes coordinates on read without a canvas', () => {
    const object = new FabricObject({ width: 10, height: 10 });
    // reading the public property triggers lazy calculation
    expect(object.aCoords).toBeDefined();
    // without a canvas, viewport control coordinates resolve to an empty record
    expect(object.oCoords).toEqual({});
  });
});
