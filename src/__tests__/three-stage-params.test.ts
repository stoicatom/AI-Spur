import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { profileFor } from '../overlay/three-effect-profiles';
import type { FamilyContext } from '../overlay/three-family-shared';
import { SplashNaturalStage } from '../overlay/three-family-natural-elements';
import { ExtremeNaturalStage } from '../overlay/three-family-natural-extreme';
import { DrumRhythmStage, GrooveRhythmStage } from '../overlay/three-family-rhythm-percussion';

const makeContext = (
  preset: 'tornado' | 'wildfire' | 'water-splash' | 'groove' | 'drum-beat',
  params: Record<string, number>,
): FamilyContext => ({
  root: new THREE.Group(),
  origin: new THREE.Vector3(20, -10, 0),
  color: new THREE.Color('#55bbff'),
  energy: 1.35,
  profile: profileFor(preset),
  direction: new THREE.Vector2(0.8, -0.6),
  width: 1280,
  height: 720,
  params,
});

const named = <T extends THREE.Object3D>(root: THREE.Object3D, name: string): T => {
  const object = root.getObjectByName(name);
  expect(object, name).toBeDefined();
  return object as T;
};

const instanceMatrix = (mesh: THREE.InstancedMesh, index: number): number[] => {
  const matrix = new THREE.Matrix4();
  mesh.getMatrixAt(index, matrix);
  return matrix.elements.slice();
};

describe('素材专属 Three.js 参数', () => {
  it('debrisOrbit 改变龙卷风碎屑轨道且固定输入无累计漂移', () => {
    const low = makeContext('tornado', { funnelTurns: 5, funnelWidth: 1.15, debrisOrbit: 0.5, suction: 2.2, stormScale: 1.8 });
    const high = makeContext('tornado', { funnelTurns: 5, funnelWidth: 1.15, debrisOrbit: 2.6, suction: 2.2, stormScale: 1.8 });
    const lowStage = new ExtremeNaturalStage(low); const highStage = new ExtremeNaturalStage(high);
    lowStage.update(0.43, 640); highStage.update(0.43, 640);
    const lowDebris = named<THREE.InstancedMesh>(low.root, 'tornado-debris-field');
    const highDebris = named<THREE.InstancedMesh>(high.root, 'tornado-debris-field');
    const first = instanceMatrix(highDebris, 3);
    highStage.update(0.43, 640);
    expect(instanceMatrix(highDebris, 3)).toEqual(first);
    expect(instanceMatrix(lowDebris, 3)).not.toEqual(first);
  });

  it('smokeRise 改变野火烟羽高度并保留独立余烬场', () => {
    const params = { spread: 1.65, emberLift: 1.8, flameHeight: 2.05, heatWarp: 1.42, gustResponse: 1.25 };
    const low = makeContext('wildfire', { ...params, smokeRise: 0.4 });
    const high = makeContext('wildfire', { ...params, smokeRise: 2.5 });
    const lowStage = new ExtremeNaturalStage(low); const highStage = new ExtremeNaturalStage(high);
    lowStage.update(0.5, 720); highStage.update(0.5, 720);
    const lowSmoke = named<THREE.InstancedMesh>(low.root, 'wildfire-smoke-field');
    const highSmoke = named<THREE.InstancedMesh>(high.root, 'wildfire-smoke-field');
    const lowPosition = new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().fromArray(instanceMatrix(lowSmoke, 2)));
    const highPosition = new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().fromArray(instanceMatrix(highSmoke, 2)));
    expect(highPosition.y).toBeLessThan(lowPosition.y);
    expect(named<THREE.InstancedMesh>(high.root, 'wildfire-ember-field').count).toBeGreaterThan(12);
  });

  it('groovePulse 与 dustFlicker 分别驱动黑胶沟槽行波和尘埃闪烁', () => {
    const base = { discSpin: 1.85, needleBounce: 0.55, waveOrbit: 1.75, wowFlutter: 0.42 };
    const muted = makeContext('groove', { ...base, groovePulse: 0.4, dustFlicker: 0.3 });
    const vivid = makeContext('groove', { ...base, groovePulse: 2.7, dustFlicker: 2.8 });
    const mutedStage = new GrooveRhythmStage(muted); const vividStage = new GrooveRhythmStage(vivid);
    mutedStage.update(0.47, 637); vividStage.update(0.47, 637);
    const mutedGroove = named<THREE.Mesh>(muted.root, 'vinyl-groove-2');
    const vividGroove = named<THREE.Mesh>(vivid.root, 'vinyl-groove-2');
    const mutedDust = named<THREE.Mesh>(muted.root, 'vinyl-dust-3');
    const vividDust = named<THREE.Mesh>(vivid.root, 'vinyl-dust-3');
    expect(vividGroove.scale.toArray()).not.toEqual(mutedGroove.scale.toArray());
    expect(vividDust.scale.x).not.toBeCloseTo(mutedDust.scale.x, 5);
    expect(vividDust.position.z).not.toBeCloseTo(mutedDust.position.z, 5);
  });

  it('水花 ripple 与战鼓 intensity 都作用于专属几何时间线', () => {
    const lowWater = makeContext('water-splash', { ripple: 0.45 });
    const highWater = makeContext('water-splash', { ripple: 2.6 });
    const lowSplash = new SplashNaturalStage(lowWater); const highSplash = new SplashNaturalStage(highWater);
    lowSplash.update(0.34, 420); highSplash.update(0.34, 420);
    expect(named<THREE.Mesh>(highWater.root, 'water-ripple-1').scale.x)
      .toBeGreaterThan(named<THREE.Mesh>(lowWater.root, 'water-ripple-1').scale.x);

    const lowDrum = makeContext('drum-beat', { rings: 5, bass: 1.2, intensity: 0.55 });
    const highDrum = makeContext('drum-beat', { rings: 5, bass: 1.2, intensity: 2.7 });
    const lowStage = new DrumRhythmStage(lowDrum); const highStage = new DrumRhythmStage(highDrum);
    lowStage.update(0.31, 510); highStage.update(0.31, 510);
    expect(named<THREE.Mesh>(highDrum.root, 'drum-mode-2').scale.x)
      .not.toBeCloseTo(named<THREE.Mesh>(lowDrum.root, 'drum-mode-2').scale.x, 5);
  });
});
