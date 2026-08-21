import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { advanceCanvasParticles } from '../overlay/material-particle-canvas';
import { resolveMaterialPhysics } from '../overlay/three-effect-physics';
import { profileFor } from '../overlay/three-effect-profiles';
import { seedParticleStates, stepParticle, type ParticleState } from '../overlay/three-particle-motion';
import type { Particle } from '../overlay/particles';

const origin = new THREE.Vector3(40, -20, 0);
const direction = new THREE.Vector2(0.8, 0.6).normalize();

function simulate(state: ParticleState, hz: number): ParticleState {
  const profile = profileFor('gunshot');
  const physics = resolveMaterialPhysics(profile, { muzzleEnergy: 1.4 }, 4);
  for (let i = 0; i < hz; i++) stepParticle(state, 0, origin, direction, profile, physics, 1 / hz);
  return state;
}

describe('refresh-rate independent particle integration', () => {
  it('keeps equal-time Three trajectories consistent at 60 and 120 Hz', () => {
    const profile = profileFor('gunshot');
    const physics = resolveMaterialPhysics(profile, { muzzleEnergy: 1.4 }, 4);
    const initial = seedParticleStates(1, origin, direction, profile, physics, { vx: 0.8, vy: -0.6, speed: 4, dir: -0.64 }, 1280, 720)[0];
    const at60 = simulate({ ...initial }, 60); const at120 = simulate({ ...initial }, 120);
    expect(at120.x).toBeCloseTo(at60.x, 1);
    expect(at120.y).toBeCloseTo(at60.y, 1);
    expect(at120.vx).toBeCloseTo(at60.vx, 2);
    expect(at120.life).toBeCloseTo(at60.life, 5);
  });

  it('keeps downpour gravity downward and independent of whip direction', () => {
    const profile = profileFor('downpour');
    const physics = resolveMaterialPhysics(profile, { dropDensity: 2.8, fallSpeed: 2.15 }, 4);
    const velocity = { vx: 1, vy: 0, speed: 4, dir: 0 };
    const left = seedParticleStates(8, origin, new THREE.Vector2(-1, 0), profile, physics, velocity, 1280, 720);
    const right = seedParticleStates(8, origin, new THREE.Vector2(1, 0), profile, physics, velocity, 1280, 720);
    for (let frame = 0; frame < 20; frame++) {
      for (let i = 0; i < left.length; i++) {
        stepParticle(left[i], i, origin, new THREE.Vector2(-1, 0), profile, physics, 1 / 60);
        stepParticle(right[i], i, origin, new THREE.Vector2(1, 0), profile, physics, 1 / 60);
      }
    }
    expect(left).toEqual(right);
    expect(left.every((state) => state.vy < 0)).toBe(true);
    expect(left.every((state) => Math.abs(state.vx) < Math.abs(state.vy) * 0.2)).toBe(true);
  });

  it('keeps Canvas equal-time integration consistent at 60 and 120 Hz', () => {
    const initial: Particle = { x: 10, y: 20, vx: 2.4, vy: 3.2, life: 1, decay: 0.005, size: 4, hue: 204, gravity: 0.08, shape: 4, angle: 1 };
    const at60 = [{ ...initial }]; const at120 = [{ ...initial }];
    for (let i = 0; i < 60; i++) advanceCanvasParticles(at60, 1 / 60);
    for (let i = 0; i < 120; i++) advanceCanvasParticles(at120, 1 / 120);
    expect(at120[0].x).toBeCloseTo(at60[0].x, 1);
    expect(at120[0].y).toBeCloseTo(at60[0].y, 1);
    expect(at120[0].life).toBeCloseTo(at60[0].life, 5);
  });

  it('holds delayed Canvas shards still and alive until their fracture stage begins', () => {
    const delayed: Particle[] = [{
      x: 10, y: 20, vx: 2.4, vy: -3.2, life: 1, decay: 0.01,
      size: 4, hue: 204, gravity: 0.08, shape: 2, angle: 1, delay: 0.05,
    }];

    for (let frame = 0; frame < 3; frame++) advanceCanvasParticles(delayed, 1 / 60);
    expect(delayed[0]).toMatchObject({ x: 10, y: 20, vx: 2.4, vy: -3.2, life: 1, delay: 0 });

    advanceCanvasParticles(delayed, 1 / 60);
    expect(delayed[0].x).not.toBe(10);
    expect(delayed[0].y).not.toBe(20);
    expect(delayed[0].life).toBeLessThan(1);
  });
});
