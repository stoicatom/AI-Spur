import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { WaveNaturalStage } from '../overlay/three-family-natural-wave';
import { profileFor } from '../overlay/three-effect-profiles';
import type { FamilyContext } from '../overlay/three-family-shared';

function context(): FamilyContext {
  return {
    root: new THREE.Group(), origin: new THREE.Vector3(180, -90, 0), color: new THREE.Color('#ffc247'),
    energy: 1.6, profile: profileFor('wave'), direction: new THREE.Vector2(1, 0),
    width: 1280, height: 720, params: { amplitude: 1.6, wavelength: 0.7, undulation: 1.4 }, packId: 'dragon',
  };
}

describe('神龙身份舞台', () => {
  it('包含头部、鳞片、背脊、龙须、龙珠和龙息部件', () => {
    const ctx = context();
    new WaveNaturalStage(ctx);
    for (const name of ['dragon-head', 'dragon-scale-0', 'dragon-spine-0', 'dragon-whisker-0', 'dragon-orb', 'dragon-breath']) {
      expect(ctx.root.getObjectByName(name), name).toBeTruthy();
    }
  });

  it('龙头领先龙身，龙珠贴着龙头运动，龙息沿前进方向展开', () => {
    const ctx = context();
    new WaveNaturalStage(ctx).update(0.38, 380);
    ctx.root.updateMatrixWorld(true);
    const head = ctx.root.getObjectByName('dragon-head')!;
    const segment = ctx.root.getObjectByName('dragon-segment-0')!;
    const orb = ctx.root.getObjectByName('dragon-orb')!;
    const breath = ctx.root.getObjectByName('dragon-breath')!;
    const headPos = head.getWorldPosition(new THREE.Vector3());
    const segmentPos = segment.getWorldPosition(new THREE.Vector3());
    const orbPos = orb.getWorldPosition(new THREE.Vector3());
    expect(headPos.x).toBeGreaterThan(segmentPos.x);
    expect(orbPos.x).toBeGreaterThan(headPos.x);
    expect(breath.scale.y).toBeGreaterThan(0.1);
  });
});
