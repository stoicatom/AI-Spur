import { describe, expect, it } from 'vitest';
import { EFFECT_PRESET_IDS } from '../shared/material-packs';
import { pixelRatioFor, resolveMaterialPhysics } from '../overlay/three-effect-physics';
import { profileFor } from '../overlay/three-effect-profiles';

describe('3D material physics', () => {
  it('assigns every effect preset an explicit physical motion', () => {
    const profiles = EFFECT_PRESET_IDS.map(profileFor);
    expect(profiles).toHaveLength(42);
    expect(profiles.every((profile) => profile.motion.length > 0)).toBe(true);
    expect(new Set(profiles.map((profile) => profile.motion)).size).toBeGreaterThanOrEqual(12);
  });

  it('maps semantic pack parameters and whip speed into bounded solver values', () => {
    const profile = profileFor('explode');
    const low = resolveMaterialPhysics(profile, { blast: 0.8, debris: 0.8 }, 1);
    const high = resolveMaterialPhysics(profile, { blast: 2.6, debris: 2 }, 8);

    expect(high.energy).toBeGreaterThan(low.energy);
    expect(high.spread).toBeGreaterThan(low.spread);
    expect(high.count).toBeGreaterThan(low.count);
    expect(high.energy).toBeLessThanOrEqual(2.35);
    expect(high.count).toBeLessThanOrEqual(160);
  });

  it('keeps the WebGL backing store inside its pixel budget', () => {
    const width = 7680;
    const height = 4320;
    const ratio = pixelRatioFor(width, height, 2);
    expect(width * height * ratio * ratio).toBeLessThanOrEqual(2_400_001);
    expect(pixelRatioFor(1200, 800, 2)).toBeLessThanOrEqual(1.75);
  });
});
