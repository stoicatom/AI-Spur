import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ElectricNaturalStage } from '../overlay/three-family-natural-electric';
import { profileFor } from '../overlay/three-effect-profiles';
import type { FamilyContext } from '../overlay/three-family-shared';

const params = { branches: 4, jaggedness: 1.3, flicker: 1.1 };

function context(direction = new THREE.Vector2(1, 0)): FamilyContext {
  return {
    root: new THREE.Group(), origin: new THREE.Vector3(0, 0, 0), color: new THREE.Color('#7ddcff'),
    energy: 1.4, profile: profileFor('bolt'), direction, width: 1440, height: 900, params,
  };
}

function named<T extends THREE.Object3D>(root: THREE.Object3D, name: string): T {
  const object = root.getObjectByName(name);
  if (!object) throw new Error(`missing ${name}`);
  return object as T;
}

describe('Three electric glide stage', () => {
  it('moves the main bolt along its direction with measurable inertial travel', () => {
    const ctx = context(new THREE.Vector2(1, 0));
    const stage = new ElectricNaturalStage(ctx);
    stage.update(0.22, 420);
    const first = named<THREE.Mesh>(ctx.root, 'electric-main-bolt-0').position.clone();
    stage.update(0.42, 420);
    const second = named<THREE.Mesh>(ctx.root, 'electric-main-bolt-0').position.clone();
    expect(second.x - first.x).toBeGreaterThan(180);
    expect(Math.abs(second.y - first.y)).toBeLessThan(120);
  });

  it('makes the electro core and impact halo physically dominant', () => {
    const ctx = context();
    const stage = new ElectricNaturalStage(ctx);
    stage.update(0.34, 520);
    const core = named<THREE.Mesh>(ctx.root, 'electric-core-node-0');
    const halo = named<THREE.Mesh>(ctx.root, 'electric-impact-halo');
    const impact = named<THREE.Mesh>(ctx.root, 'electric-impact');
    expect(core.scale.x).toBeGreaterThan(1.35);
    expect(halo.scale.x).toBeGreaterThan(2.4);
    expect(impact.scale.x).toBeGreaterThan(0.9);
  });
});
