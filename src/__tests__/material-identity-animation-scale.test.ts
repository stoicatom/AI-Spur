import { describe, expect, it, vi } from 'vitest';
import { EFFECT_PRESET_IDS } from '../shared/material-packs';
import { drawCanvasMaterialSprite } from '../overlay/canvas-material-sprite';
import type { SpriteFrame } from '../overlay/effects';
import { effectDurationFor } from '../overlay/effect-timings';
import {
  MATERIAL_ANIMATION_AREA_SCALE,
  MATERIAL_ANIMATION_DURATION_SCALE,
  MATERIAL_SOURCE_SPRITE_LINEAR_SCALE,
  scaleMaterialSpriteFrame,
} from '../overlay/material-animation-constants';
import { renderContractFor } from '../overlay/three-effect-contract';

describe('material identity animation scale', () => {
  it('uses a three-times animation area and a matching linear sprite scale', () => {
    expect(MATERIAL_ANIMATION_AREA_SCALE).toBe(3);
    expect(MATERIAL_SOURCE_SPRITE_LINEAR_SCALE ** 2).toBeCloseTo(3, 8);
  });

  it('extends the shared material timeline by 1.5 times', () => {
    expect(MATERIAL_ANIMATION_DURATION_SCALE).toBe(1.5);
    expect(effectDurationFor('jet')).toBe(1800);
    expect(effectDurationFor('downpour')).toBe(2850);
  });

  it('keeps the material identity sprite visible for every preset', () => {
    for (const id of EFFECT_PRESET_IDS) {
      expect(renderContractFor(id).sourceSprite, id).toBe(true);
    }
  });

  it('scales a preset SpriteFrame exactly while preserving rotation and alpha', () => {
    const source: SpriteFrame = { dx: 7, dy: -11, scale: 1.25, rot: 0.42, alpha: 0.68 };

    expect(scaleMaterialSpriteFrame(source)).toEqual({
      dx: 21,
      dy: -33,
      scale: 1.25 * Math.sqrt(3),
      rot: 0.42,
      alpha: 0.68,
    });
    expect(source).toEqual({ dx: 7, dy: -11, scale: 1.25, rot: 0.42, alpha: 0.68 });
  });

  it('draws the scaled frame in the Canvas coordinate system', () => {
    const ctx = {
      save: vi.fn(),
      restore: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      drawImage: vi.fn(),
      globalAlpha: 1,
    } as unknown as CanvasRenderingContext2D;
    const image = {} as HTMLImageElement;

    drawCanvasMaterialSprite(
      ctx, image,
      { dx: 7, dy: -11, scale: 1.25, rot: 0.42, alpha: 0.68 },
      100, 80, 96, 48,
    );

    expect(ctx.translate).toHaveBeenCalledWith(121, 47);
    expect(ctx.rotate).toHaveBeenCalledWith(0.42);
    expect(ctx.drawImage).toHaveBeenCalledWith(
      image,
      -60 * Math.sqrt(3),
      -30 * Math.sqrt(3),
      120 * Math.sqrt(3),
      60 * Math.sqrt(3),
    );
    expect(ctx.globalAlpha).toBe(0.68);
  });
});
