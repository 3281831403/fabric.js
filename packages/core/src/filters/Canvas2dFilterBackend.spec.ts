import { describe, expect, it } from 'vitest';
import { getFabricDocument } from '../env';
import { Canvas2dFilterBackend } from './Canvas2dFilterBackend';
import { Invert } from './Invert';
import { Resize } from './Resize';

function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = getFabricDocument().createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function createSource(width: number, height: number): HTMLCanvasElement {
  const source = createCanvas(width, height);
  const ctx = source.getContext('2d')!;
  ctx.fillStyle = 'rgb(200,100,50)';
  ctx.fillRect(0, 0, width, height);
  return source;
}

function getPixels(canvas: HTMLCanvasElement): number[] {
  return Array.from(
    canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height)
      .data,
  );
}

describe('Canvas2dFilterBackend', () => {
  it('resizes a reused target canvas back to the source size', () => {
    const backend = new Canvas2dFilterBackend();
    const source = createSource(40, 20);
    // a target canvas left smaller by a previous Resize filter application
    const target = createCanvas(20, 10);

    backend.applyFilters([new Invert()], source, 40, 20, target);

    expect(target.width, 'target is restored to source width').toBe(40);
    expect(target.height, 'target is restored to source height').toBe(20);
    const pixels = getPixels(target);
    expect(
      pixels.filter((value, i) => i % 4 === 3 && value === 255).length,
      'every pixel is filtered, none is left transparent',
    ).toBe(800);
  });

  it('reapplying a resize filter on the same target matches a fresh run', () => {
    const backend = new Canvas2dFilterBackend();
    const source = createSource(40, 20);
    const target = createCanvas(40, 20);
    const resize = new Resize({ scaleX: 0.5, scaleY: 0.5 });

    backend.applyFilters([resize], source, 40, 20, target);
    const firstRun = getPixels(target);
    expect(target.width, 'target shrunk by the resize filter').toBe(20);

    backend.applyFilters([resize], source, 40, 20, target);
    expect(getPixels(target), 'second run recomputes from the source').toEqual(
      firstRun,
    );

    const freshTarget = createCanvas(40, 20);
    backend.applyFilters(
      [new Resize({ scaleX: 0.5, scaleY: 0.5 })],
      source,
      40,
      20,
      freshTarget,
    );
    expect(getPixels(target), 'matches a run on a fresh target').toEqual(
      getPixels(freshTarget),
    );
  });
});
