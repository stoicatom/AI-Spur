import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ImageMaterial } from '../overlay/image-material';
import { effectDurationFor } from '../overlay/effect-timings';
import { resolveEffect } from '../overlay/effects';
import { MATERIAL_ANIMATION_DURATION_SCALE } from '../overlay/material-animation-constants';
import type { Particle } from '../overlay/particles';

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
    particles: Particle[];
  };
}

function downpourContext(): CanvasRenderingContext2D {
  return {
    canvas: { clientWidth: 1440, clientHeight: 900 },
    globalAlpha: 1, strokeStyle: '', fillStyle: '', lineWidth: 1, lineCap: 'butt',
    save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, ellipse() {}, fill() {},
  } as unknown as CanvasRenderingContext2D;
}

function electricContext() {
  const moveXs: number[] = [];
  const gradient = { addColorStop() {} } as CanvasGradient;
  const ctx = {
    canvas: { clientWidth: 1440, clientHeight: 900 },
    globalAlpha: 1, strokeStyle: '', fillStyle: '', lineWidth: 1, lineCap: 'butt', lineJoin: 'miter',
    save() {}, restore() {}, beginPath() {}, moveTo(x: number) { moveXs.push(x); }, lineTo() {}, stroke() {},
    ellipse() {}, fill() {}, fillRect() {}, createRadialGradient() { return gradient; },
  } as unknown as CanvasRenderingContext2D;
  return { ctx, moveXs };
}

describe('ImageMaterial image lifecycle', () => {
  beforeEach(() => {
    FakeImage.instances.length = 0;
    vi.stubGlobal('Image', FakeImage);
  });

  afterEach(() => {
    vi.restoreAllMocks();
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

  it('extends emitted Canvas particle decay and fracture delay with the material timeline', () => {
    vi.spyOn(performance, 'now').mockReturnValue(100);
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const params = { fractureDelay: 0.08 };
    const vel = { vx: 1, vy: 0, speed: 4, dir: 0 };
    const baseline = resolveEffect('glass-break').emit(100, 80, vel, params);
    const material = new ImageMaterial();
    material.loadPack('', 'glass-break', params, 204);
    material.startCrack(100, 80, vel);

    const actual = internals(material).particles;
    expect(actual).toHaveLength(baseline.length);
    for (let index = 0; index < actual.length; index++) {
      expect(actual[index].decay).toBeCloseTo(
        baseline[index].decay / MATERIAL_ANIMATION_DURATION_SCALE,
        8,
      );
      const baselineDelay = baseline[index].delay;
      if (baselineDelay !== undefined) {
        expect(actual[index].delay).toBeCloseTo(
          baselineDelay * MATERIAL_ANIMATION_DURATION_SCALE,
          8,
        );
      }
    }
  });

  it('keeps Canvas rain alive through 2,849 ms and stops at its 2,850 ms timeline end', () => {
    vi.spyOn(performance, 'now').mockReturnValue(100);
    const material = new ImageMaterial();
    material.loadPack('storm.svg', 'downpour', {}, 204);
    material.startCrack(720, 450);

    material.updateAndDrawCrack(downpourContext(), 2949);
    expect(material.crackAlive).toBe(true);
    material.updateAndDrawCrack(downpourContext(), 2950);
    expect(material.crackAlive).toBe(false);
  });

  it('renders a bolt fallback as a directional cross-screen glide', () => {
    vi.spyOn(performance, 'now').mockReturnValue(100);
    const material = new ImageMaterial();
    material.loadPack('bolt.svg', 'bolt', { branches: 4, jaggedness: 1.3, flicker: 1.1 }, 204);
    material.startCrack(720, 450, { vx: 1, vy: 0, speed: 6, dir: 0 });

    const first = electricContext();
    material.updateAndDrawCrack(first.ctx, 100 + effectDurationFor('bolt') * 0.22);
    const firstX = first.moveXs[0];
    const second = electricContext();
    material.updateAndDrawCrack(second.ctx, 100 + effectDurationFor('bolt') * 0.48);
    const secondX = second.moveXs[0];

    expect(first.moveXs.length).toBeGreaterThan(0);
    expect(second.moveXs.length).toBeGreaterThan(0);
    expect(secondX - firstX).toBeGreaterThan(180);
  });
});
