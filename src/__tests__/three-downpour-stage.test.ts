import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { profileFor } from '../overlay/three-effect-profiles';
import { DownpourNaturalStage } from '../overlay/three-family-natural-rainstorm';
import type { FamilyContext } from '../overlay/three-family-shared';
import { downpourDropAt, resolveDownpourField } from '../overlay/downpour-field';

const params = { dropDensity: 2.8, fallSpeed: 2.15, windSkew: 0.72, splashEnergy: 1.55, curtainWidth: 2.4, sheetDepth: 0.9 };

function context(direction: THREE.Vector2): FamilyContext {
  return {
    root: new THREE.Group(), origin: new THREE.Vector3(170, -80, 0), color: new THREE.Color('#42b8e6'),
    energy: 1.3, profile: profileFor('downpour'), direction, width: 1440, height: 900, params,
  };
}

function matrices(mesh: THREE.InstancedMesh): number[][] {
  const matrix = new THREE.Matrix4(); const result: number[][] = [];
  for (let i = 0; i < mesh.count; i++) { mesh.getMatrixAt(i, matrix); result.push(matrix.elements.slice()); }
  return result;
}

function named<T extends THREE.Object3D>(root: THREE.Object3D, name: string): T {
  const object = root.getObjectByName(name);
  if (!object) throw new Error(`missing ${name}`);
  return object as T;
}

describe('Three full-screen downpour stage', () => {
  it('has depth sheets, viewport-wide splashes and ground mist', () => {
    const ctx = context(new THREE.Vector2(1, 0)); const stage = new DownpourNaturalStage(ctx);
    stage.update(0.42, 640);
    for (const layer of ['background', 'middle', 'foreground']) {
      expect(named<THREE.InstancedMesh>(ctx.root, `downpour-rain-${layer}`).count).toBeGreaterThan(18);
    }
    const splash = named<THREE.InstancedMesh>(ctx.root, 'downpour-splash-field');
    const xs = matrices(splash).map((elements) => elements[12]);
    expect(Math.min(...xs)).toBeLessThan(-620);
    expect(Math.max(...xs)).toBeGreaterThan(620);
    expect(named<THREE.InstancedMesh>(ctx.root, 'downpour-ground-mist').count).toBeGreaterThan(10);
    expect(named<THREE.Mesh>(ctx.root, 'downpour-ground-haze').geometry).toBeInstanceOf(THREE.PlaneGeometry);
  });

  it('produces identical rain matrices for opposite whip directions', () => {
    const left = context(new THREE.Vector2(-1, 0)); const right = context(new THREE.Vector2(1, 0));
    new DownpourNaturalStage(left).update(0.53, 820);
    new DownpourNaturalStage(right).update(0.53, 820);
    for (const layer of ['background', 'middle', 'foreground']) {
      expect(matrices(named<THREE.InstancedMesh>(left.root, `downpour-rain-${layer}`)))
        .toEqual(matrices(named<THREE.InstancedMesh>(right.root, `downpour-rain-${layer}`)));
    }
  });

  it('covers most of the viewport width in every depth sheet', () => {
    const ctx = context(new THREE.Vector2(0, -1)); const stage = new DownpourNaturalStage(ctx);
    stage.update(0.36, 540);
    for (const layer of ['background', 'middle', 'foreground']) {
      const xs = matrices(named<THREE.InstancedMesh>(ctx.root, `downpour-rain-${layer}`)).map((elements) => elements[12]);
      expect(Math.min(...xs)).toBeLessThan(-600);
      expect(Math.max(...xs)).toBeGreaterThan(600);
    }
  });

  it('uses the same screen-space wind slope as the Canvas rain field', () => {
    for (const windSkew of [-0.72, 0.72]) {
      const ctx = { ...context(new THREE.Vector2(1, 0)), params: { ...params, windSkew } };
      new DownpourNaturalStage(ctx).update(0.42, 640);
      const mesh = named<THREE.InstancedMesh>(ctx.root, 'downpour-rain-foreground');
      const matrix = new THREE.Matrix4();
      mesh.getMatrixAt(0, matrix);
      const drop = downpourDropAt(
        0, mesh.count, ctx.width, ctx.height,
        resolveDownpourField(ctx.params), 'foreground', 0,
      );

      // Matrix column 2 is the local vertical rain axis. Convert its Y
      // component into screen space, then compare it with Canvas's vx/vy.
      expect(Math.sign(matrix.elements[4] * -matrix.elements[5]))
        .toBe(Math.sign(drop.vx * drop.vy));
    }
  });
});
