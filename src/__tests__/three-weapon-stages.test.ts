import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { profileFor } from '../overlay/three-effect-profiles';
import { CrystalShatterWeaponStage, IceBloomWeaponStage } from '../overlay/three-family-weapon-crystal';
import { RevolverWeaponStage } from '../overlay/three-family-weapon-firearm';
import { GlassFractureWeaponStage } from '../overlay/three-family-weapon-fracture';
import { BullwhipWeaponStage } from '../overlay/three-family-weapon-whip';
import { MeleeWeaponStage } from '../overlay/three-family-weapon-melee';
import type { FamilyContext } from '../overlay/three-family-shared';
import type { EffectPresetId } from '../shared/material-packs';

function context(preset: EffectPresetId, params: Record<string, number>): FamilyContext {
  return {
    root: new THREE.Group(), origin: new THREE.Vector3(120, -64, 0), color: new THREE.Color('#71d7ff'),
    energy: 1.5, profile: profileFor(preset), direction: new THREE.Vector2(1, 0), width: 1280, height: 800, params,
  };
}

function named<T extends THREE.Object3D>(root: THREE.Object3D, name: string): T {
  const object = root.getObjectByName(name);
  if (!object) throw new Error(`missing ${name}`);
  return object as T;
}

function world(root: THREE.Object3D, name: string): THREE.Vector3 {
  root.updateMatrixWorld(true);
  return named<THREE.Object3D>(root, name).getWorldPosition(new THREE.Vector3());
}

describe('3D 武器专属舞台', () => {
  it('左轮枪将枪口能量、后坐、烟卷与弹壳自旋写入不同道具', () => {
    const low = context('gunshot', { muzzleEnergy: 0.6, recoilKick: 0.5, smokeCurl: 0.3, casingSpin: 0.4 });
    const high = context('gunshot', { muzzleEnergy: 2.6, recoilKick: 2.2, smokeCurl: 2.1, casingSpin: 2.8 });
    const lowStage = new RevolverWeaponStage(low);
    const highStage = new RevolverWeaponStage(high);
    lowStage.update(0.04, 40);
    highStage.update(0.04, 40);
    expect(named<THREE.Mesh>(high.root, 'revolver-muzzle').scale.x).toBeGreaterThan(named<THREE.Mesh>(low.root, 'revolver-muzzle').scale.x);
    expect(world(high.root, 'revolver-barrel').x).toBeLessThan(world(low.root, 'revolver-barrel').x);
    lowStage.update(0.3, 300);
    highStage.update(0.3, 300);
    expect(named<THREE.Mesh>(high.root, 'revolver-smoke-3').position.x).toBeGreaterThan(named<THREE.Mesh>(low.root, 'revolver-smoke-3').position.x);
    expect(named<THREE.Mesh>(high.root, 'revolver-casing-2').rotation.x).toBeGreaterThan(named<THREE.Mesh>(low.root, 'revolver-casing-2').rotation.x);
  });

  it('碎屏把半径、延迟、折射、碎片速度和自旋分配到裂纹与碎片时间线', () => {
    const low = context('glass-break', { impactRadius: 0.7, shardVelocity: 0.6, shardSpin: 0.5, refraction: 0.4, fractureDelay: 0.3 });
    const high = context('glass-break', { impactRadius: 2.1, shardVelocity: 2.5, shardSpin: 2.8, refraction: 2.2, fractureDelay: 0.02 });
    new GlassFractureWeaponStage(low).update(0.22, 220);
    new GlassFractureWeaponStage(high).update(0.22, 220);
    expect(named<THREE.Mesh>(high.root, 'glass-impact-lens').scale.x).toBeGreaterThan(named<THREE.Mesh>(low.root, 'glass-impact-lens').scale.x);
    expect(named<THREE.Mesh>(high.root, 'glass-refraction--1').position.x).not.toBe(named<THREE.Mesh>(low.root, 'glass-refraction--1').position.x);
    expect(world(high.root, 'glass-shard-3').distanceTo(new THREE.Vector3(120, -64, 0))).toBeGreaterThan(world(low.root, 'glass-shard-3').distanceTo(new THREE.Vector3(120, -64, 0)));
    expect(named<THREE.Mesh>(high.root, 'glass-shard-3').rotation.z).toBeGreaterThan(named<THREE.Mesh>(low.root, 'glass-shard-3').rotation.z);
    expect(named<THREE.LineSegments>(high.root, 'glass-crack-graph').scale.x).toBeGreaterThan(named<THREE.LineSegments>(low.root, 'glass-crack-graph').scale.x);
  });

  it('长鞭的扬尘弧与持鞭后坐是独立控制，而不是同一条通用路径', () => {
    const low = context('whip-crack', { lashLength: 1.4, snapVelocity: 1, waveTension: 1, tipCrack: 1, dustArc: 0.25, recoil: 0.4 });
    const high = context('whip-crack', { lashLength: 1.4, snapVelocity: 1, waveTension: 1, tipCrack: 1, dustArc: 2.2, recoil: 2.1 });
    const lowStage = new BullwhipWeaponStage(low);
    const highStage = new BullwhipWeaponStage(high);
    lowStage.update(0.2, 200);
    highStage.update(0.2, 200);
    expect(world(high.root, 'bullwhip-handle').x).toBeLessThan(world(low.root, 'bullwhip-handle').x);
    lowStage.update(0.48, 480);
    highStage.update(0.48, 480);
    expect(Math.abs(named<THREE.Mesh>(high.root, 'bullwhip-dust-5').position.y)).toBeGreaterThan(Math.abs(named<THREE.Mesh>(low.root, 'bullwhip-dust-5').position.y));
  });

  it('水晶与寒冰具有不同舞台，并分别消费碎片速度和寒气参数', () => {
    const crystalLow = context('shatter', { shards: 0.7, shardSpeed: 0.6, sparkle: 0.8 });
    const crystalHigh = context('shatter', { shards: 2.5, shardSpeed: 2.2, sparkle: 2 });
    const iceLow = context('shatter-ice', { shards: 1, shardSpeed: 1, chill: 0.5 });
    const iceHigh = context('shatter-ice', { shards: 2.4, shardSpeed: 2.2, chill: 2.5 });
    new CrystalShatterWeaponStage(crystalLow).update(0.52, 520);
    new CrystalShatterWeaponStage(crystalHigh).update(0.52, 520);
    new IceBloomWeaponStage(iceLow).update(0.52, 520);
    new IceBloomWeaponStage(iceHigh).update(0.52, 520);
    expect(crystalHigh.root.getObjectByName('crystal-prism-0')).toBeTruthy();
    expect(crystalHigh.root.getObjectByName('ice-arm-0')).toBeUndefined();
    expect(iceHigh.root.getObjectByName('ice-arm-0')).toBeTruthy();
    expect(iceHigh.root.getObjectByName('crystal-prism-0')).toBeUndefined();
    expect(world(crystalHigh.root, 'crystal-facet-3').distanceTo(new THREE.Vector3(120, -64, 0))).toBeGreaterThan(world(crystalLow.root, 'crystal-facet-3').distanceTo(new THREE.Vector3(120, -64, 0)));
    expect(named<THREE.Mesh>(iceHigh.root, 'ice-frost-2').scale.x).toBeGreaterThan(named<THREE.Mesh>(iceLow.root, 'ice-frost-2').scale.x);
  });

  it('相同时间点重复更新不会累积漂移', () => {
    const ctx = context('gunshot', { muzzleEnergy: 2.2, recoilKick: 1.4, smokeCurl: 1.3, casingSpin: 2 });
    const stage = new RevolverWeaponStage(ctx);
    stage.update(0.31, 310); const first = world(ctx.root, 'revolver-casing-1');
    stage.update(0.31, 310); const second = world(ctx.root, 'revolver-casing-1');
    expect(second.distanceTo(first)).toBeLessThan(0.00001);
  });

  it('冲刺长度与长矛速度分别控制武器行程和到达时刻', () => {
    const bowShort = context('dash', { twang: 1.9, release: 1.3, dashLength: .8 });
    const bowLong = context('dash', { twang: 1.9, release: 1.3, dashLength: 2 });
    new MeleeWeaponStage(bowShort).update(.35, 350);
    new MeleeWeaponStage(bowLong).update(.35, 350);
    expect(world(bowLong.root, 'melee-bow-arrow').x).toBeGreaterThan(world(bowShort.root, 'melee-bow-arrow').x);

    const bladeShort = context('dash', { afterimage: 2, shear: 1.4, dashLength: .8 });
    const bladeLong = context('dash', { afterimage: 2, shear: 1.4, dashLength: 2 });
    new MeleeWeaponStage(bladeShort).update(.35, 350);
    new MeleeWeaponStage(bladeLong).update(.35, 350);
    expect(world(bladeLong.root, 'melee-blade-0').x).toBeGreaterThan(world(bladeShort.root, 'melee-blade-0').x);

    const spearSlow = context('dash', { thrust: 1.6, pierce: 1.4, speed: .6 });
    const spearFast = context('dash', { thrust: 1.6, pierce: 1.4, speed: 2.4 });
    new MeleeWeaponStage(spearSlow).update(.12, 120);
    new MeleeWeaponStage(spearFast).update(.12, 120);
    expect(world(spearFast.root, 'melee-spear-head').x).toBeGreaterThan(world(spearSlow.root, 'melee-spear-head').x);
  });
});
