import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ImageMaterial } from '../overlay/image-material';
import { effectDurationFor } from '../overlay/effect-timings';

class FakeImage {
  static instances: FakeImage[] = [];
  naturalWidth = 96;
  naturalHeight = 48;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  srcChanges: string[] = [];
  private value = '';

  constructor() {
    FakeImage.instances.push(this);
  }

  get src(): string {
    return this.value;
  }

  set src(value: string) {
    this.value = value;
    this.srcChanges.push(value);
  }

  finish(): void {
    this.onload?.();
  }
}

function internals(material: ImageMaterial) {
  return material as unknown as {
    img: FakeImage;
    pendingImage: FakeImage | null;
  };
}

function downpourContext(): CanvasRenderingContext2D {
  return {
    canvas: { clientWidth: 1440, clientHeight: 900 },
    globalAlpha: 1, strokeStyle: '', fillStyle: '', lineWidth: 1, lineCap: 'butt',
    save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, ellipse() {}, fill() {},
  } as unknown as CanvasRenderingContext2D;
}

describe('ImageMaterial image lifecycle', () => {
  beforeEach(() => {
    FakeImage.instances.length = 0;
    vi.stubGlobal('Image', FakeImage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('cancels superseded decoding without clearing the active image', () => {
    const material = new ImageMaterial();
    material.load('first.png', 'rocket');
    const first = FakeImage.instances[1];
    first.finish();
    expect(material.isReady).toBe(true);
    expect(internals(material).img).toBe(first);

    material.load('second.png', 'rocket');
    const second = FakeImage.instances[2];
    const lateLoad = second.onload;
    material.load('third.png', 'rocket');
    const third = FakeImage.instances[3];

    expect(second.onload).toBeNull();
    expect(second.onerror).toBeNull();
    expect(second.src).toBe('');
    expect(first.src).toBe('first.png');
    lateLoad?.();
    expect(internals(material).pendingImage).toBe(third);
    expect(internals(material).img).toBe(first);

    third.finish();
    expect(internals(material).img).toBe(third);
    expect(internals(material).pendingImage).toBeNull();
    expect(first.src).toBe('');
    expect(third.src).toBe('third.png');

    material.load('fourth.png', 'rocket');
    material.load('fifth.png', 'rocket');
    expect(third.src).toBe('third.png');
  });

  it('releases active and pending images exactly once on dispose', () => {
    const material = new ImageMaterial();
    material.load('active.png', 'rocket');
    const active = FakeImage.instances[1];
    active.finish();
    material.load('pending.png', 'rocket');
    const pending = FakeImage.instances[2];

    material.startCrack(10, 20);
    material.dispose();
    material.dispose();

    expect(material.isReady).toBe(false);
    expect(material.crackAlive).toBe(false);
    expect(active.onload).toBeNull();
    expect(active.onerror).toBeNull();
    expect(active.srcChanges.filter((src) => src === '')).toHaveLength(1);
    expect(pending.onload).toBeNull();
    expect(pending.onerror).toBeNull();
    expect(pending.srcChanges.filter((src) => src === '')).toHaveLength(1);
    expect(internals(material).pendingImage).toBeNull();
  });

  it('uses the matching WebGL timeline duration for a v3 fallback pack', () => {
    const material = new ImageMaterial();
    material.loadPack('storm.svg', 'downpour', {}, 204);
    expect((material as unknown as { crackDurationMs: number }).crackDurationMs)
      .toBe(effectDurationFor('downpour'));
  });

  it('keeps Canvas rain alive through 1,899 ms and stops at its 1,900 ms timeline end', () => {
    vi.spyOn(performance, 'now').mockReturnValue(100);
    const material = new ImageMaterial();
    material.loadPack('storm.svg', 'downpour', {}, 204);
    material.startCrack(720, 450);

    material.updateAndDrawCrack(downpourContext(), 1999);
    expect(material.crackAlive).toBe(true);
    material.updateAndDrawCrack(downpourContext(), 2000);
    expect(material.crackAlive).toBe(false);
  });
});
