import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { profileFor } from '../overlay/three-effect-profiles';
import { CinematicLayers } from '../overlay/three-effect-layers';
import { disposeSceneResources } from '../overlay/three-effect-resources';
import {
  farthestViewportCorner,
  FullFieldSpectacleLayer,
} from '../overlay/three-full-field-spectacle';
import type { FamilyContext } from '../overlay/three-family-shared';
import { EFFECT_PRESET_IDS, type EffectPresetId } from '../shared/material-packs';
import { materialIdentityFor } from '../overlay/material-identity';
import { resolveMaterialPhysics } from '../overlay/three-effect-physics';

const REPRESENTATIVES: EffectPresetId[] = ['bolt', 'dash', 'pulse', 'glow', 'impact'];

function context(
  preset: EffectPresetId, width = 1280, height = 720, packId = `fixture-${preset}`,
): FamilyContext {
  const profile = profileFor(preset);
  const identity = materialIdentityFor(packId, preset);
  return {
    root: new THREE.Group(), origin: new THREE.Vector3(510, -230, 0),
    color: new THREE.Color('#ffb52e'), energy: 1.6, profile,
    direction: new THREE.Vector2(0.8, -0.2).normalize(), width, height, params: {},
    packId, physics: resolveMaterialPhysics(profile, {}, 6, identity.physical),
  };
}

function named<T extends THREE.Object3D>(root: THREE.Object3D, name: string): T {
  const object = root.getObjectByName(name);
  if (!object) throw new Error(`missing ${name}`);
  return object as T;
}

describe('全屏电影化能量层', () => {
  it('从任意触发点计算到最远屏幕角的真实覆盖距离', () => {
    const origin = new THREE.Vector3(510, -230, 0);
    expect(farthestViewportCorner(origin, 1280, 720))
      .toBeCloseTo(Math.hypot(1150, 590), 6);
  });

  it.each(REPRESENTATIVES)('%s 家族拥有全视口平面、传播环和实例化能量场', (preset) => {
    const ctx = context(preset); const stage = new FullFieldSpectacleLayer(ctx);
    stage.update(0.58, 620);
    const field = named<THREE.Mesh>(ctx.root, 'full-field-atmosphere');
    const ring = named<THREE.Mesh>(ctx.root, 'full-field-shock-ring-0');
    const particles = named<THREE.InstancedMesh>(ctx.root, `full-field-${ctx.packId}-energy`);
    const material = field.material as THREE.ShaderMaterial;

    expect(field.scale.x).toBe(1280);
    expect(field.scale.y).toBe(720);
    expect(material.transparent).toBe(true);
    expect(material.depthWrite).toBe(false);
    expect(ring.scale.x).toBeGreaterThan(farthestViewportCorner(ctx.origin, 1280, 720) * 0.98);
    expect(particles.count).toBeGreaterThan(40);
    expect(particles.frustumCulled).toBe(false);
  });

  it.each(EFFECT_PRESET_IDS)('%s 预设实际接入公共全屏舞台', (preset) => {
    const ctx = context(preset, 960, 540);
    const layers = new CinematicLayers(
      ctx.root, ctx.origin, ctx.color, ctx.energy, ctx.profile,
      ctx.direction, ctx.width, ctx.height, ctx.params, ctx.packId, ctx.physics,
    );
    layers.update(0.42, 480);

    expect(ctx.root.getObjectByName('full-field-atmosphere')).toBeTruthy();
    expect(ctx.root.getObjectByName(`full-field-${ctx.packId}-energy`)).toBeTruthy();
    disposeSceneResources(ctx.root, null, new WeakSet());
    ctx.root.clear();
  });

  it('视口变化后同步扩展透明场与冲击半径', () => {
    const ctx = context('glow'); const stage = new FullFieldSpectacleLayer(ctx);
    stage.resize(390, 844); stage.update(0.62, 680);
    const field = named<THREE.Mesh>(ctx.root, 'full-field-atmosphere');
    const ring = named<THREE.Mesh>(ctx.root, 'full-field-shock-ring-0');

    expect(field.scale.x).toBe(390);
    expect(field.scale.y).toBe(844);
    expect(ring.scale.x).toBeGreaterThan(farthestViewportCorner(ctx.origin, 390, 844));
  });

  it('共享 wave 预设的神龙与极光仍产生独立且确定的物理场', () => {
    const dragon = context('wave', 1280, 720, 'dragon');
    const aurora = context('wave', 1280, 720, 'aurora');
    const dragonStage = new FullFieldSpectacleLayer(dragon);
    const auroraStage = new FullFieldSpectacleLayer(aurora);
    dragonStage.update(.46, 640); auroraStage.update(.46, 640);
    const dragonEnergy = named<THREE.InstancedMesh>(dragon.root, 'full-field-dragon-energy');
    const auroraEnergy = named<THREE.InstancedMesh>(aurora.root, 'full-field-aurora-energy');
    const first = new THREE.Matrix4(); const second = new THREE.Matrix4();
    dragonEnergy.getMatrixAt(4, first); auroraEnergy.getMatrixAt(4, second);
    expect(first.elements).not.toEqual(second.elements);

    const repeated = first.elements.slice();
    dragonStage.update(.46, 640); dragonEnergy.getMatrixAt(4, first);
    expect(first.elements).toEqual(repeated);
  });

  it('神龙和左轮的公共场保持局部，不再覆盖到视口边缘', () => {
    for (const preset of ['wave', 'gunshot'] as const) {
      const packId = preset === 'wave' ? 'dragon' : 'revolver';
      const ctx = context(preset, 1280, 720, packId);
      const stage = new FullFieldSpectacleLayer(ctx);
      stage.update(0.58, 620);
      const field = named<THREE.Mesh>(ctx.root, 'full-field-atmosphere');
      const ring = named<THREE.Mesh>(ctx.root, 'full-field-shock-ring-0');
      const material = field.material as THREE.ShaderMaterial;
      expect(material.uniforms.uReach.value).toBeLessThan(420);
      expect(ring.scale.x).toBeLessThan(420);
    }
  });
});
