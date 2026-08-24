import { describe, expect, it } from 'vitest';
import { EFFECT_PRESET_IDS } from '../shared/material-packs';
import { pixelRatioFor, resolveMaterialPhysics } from '../overlay/three-effect-physics';
import { profileFor } from '../overlay/three-effect-profiles';
import { materialIdentityFor } from '../overlay/material-identity';

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

  it('keeps materials distinct when they share one visual preset', () => {
    const profile = profileFor('wave');
    const dragon = resolveMaterialPhysics(
      profile, { flow: 1.4 }, 6, materialIdentityFor('dragon', 'wave').physical,
    );
    const aurora = resolveMaterialPhysics(
      profile, { flow: 1.4 }, 6, materialIdentityFor('aurora', 'wave').physical,
    );

    expect(dragon.mass).not.toBe(aurora.mass);
    expect(dragon.force).not.toBe(aurora.force);
    expect(dragon.drag).not.toBe(aurora.drag);
    expect(dragon.identityPhase).not.toBe(aurora.identityPhase);
  });

  it('turns whip speed into bounded mass-aware impulse', () => {
    const profile = profileFor('impact');
    const blueprint = materialIdentityFor('shield', 'impact').physical;
    const slow = resolveMaterialPhysics(profile, { block: 1.7 }, 1, blueprint);
    const fast = resolveMaterialPhysics(profile, { block: 1.7 }, 24, blueprint);

    expect(fast.impulse).toBeGreaterThan(slow.impulse);
    expect(fast.impulse).toBeLessThanOrEqual(4.8);
    expect(fast.energy).toBeLessThanOrEqual(2.35);
    expect(fast.count).toBeLessThanOrEqual(160);
  });

  it('keeps the WebGL backing store inside its pixel budget', () => {
    const width = 7680;
    const height = 4320;
    const ratio = pixelRatioFor(width, height, 2);
    expect(width * height * ratio * ratio).toBeLessThanOrEqual(2_400_001);
    expect(pixelRatioFor(1200, 800, 2)).toBeLessThanOrEqual(1.75);
  });
});
