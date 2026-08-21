import { describe, expect, it } from 'vitest';
import { profileFor } from '../overlay/three-effect-profiles';
import { resolveMoonPhaseParams } from '../overlay/three-family-cosmic-moon';
import { resolveSingularityParams } from '../overlay/three-family-cosmic-singularity';

describe('cosmic material stages', () => {
  it('routes the moon arc preset through the cosmic family', () => {
    expect(profileFor('arc')).toMatchObject({ family: 'cosmic', motion: 'arc' });
  });

  it('maps each moon control to a distinct bounded stage property', () => {
    const restrained = resolveMoonPhaseParams({ arcLength: 0.8, glowTrail: 0.5, elegance: 0.7 });
    const cinematic = resolveMoonPhaseParams({ arcLength: 2.2, glowTrail: 2.8, elegance: 2.1 });
    expect(cinematic.arcLength).toBeGreaterThan(restrained.arcLength);
    expect(cinematic.glowTrail).toBeGreaterThan(restrained.glowTrail);
    expect(cinematic.elegance).toBeGreaterThan(restrained.elegance);
    expect(cinematic.echoCount).toBeGreaterThan(restrained.echoCount);
    expect(resolveMoonPhaseParams({ arcLength: 99, glowTrail: 99, elegance: 99 }))
      .toMatchObject({ arcLength: 2.8, glowTrail: 3.5, elegance: 2.5 });
  });

  it('lets black-hole jet power independently drive the bipolar jets', () => {
    const quiet = resolveSingularityParams({ gravityPull: 2, jetPower: 0.5 });
    const active = resolveSingularityParams({ gravityPull: 2, jetPower: 2.7 });
    expect(active.pull).toBe(quiet.pull);
    expect(active.jetPower).toBeGreaterThan(quiet.jetPower);
    expect(resolveSingularityParams({ jetPower: 99 }).jetPower).toBe(3.2);
  });
});
