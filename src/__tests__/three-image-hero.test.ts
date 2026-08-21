import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { drawCanvasMaterialHero } from '../overlay/canvas-material-hero';
import type { SpriteFrame } from '../overlay/effects';
import { createImageHeroLayers, updateImageHeroLayers } from '../overlay/three-image-hero';
import { profileFor } from '../overlay/three-effect-profiles';
import { resolveMaterialPhysics } from '../overlay/three-effect-physics';

const frame: SpriteFrame = { dx: 42, dy: -18, scale: 1.4, rot: 0.22, alpha: 0.82 };

describe('image-derived Three hero layer', () => {
  it('creates a shader energy layer, two depth echoes, and a pulse ring', () => {
    const texture = new THREE.Texture();
    const layers = createImageHeroLayers(texture, 72, new THREE.Color('#2dd4bf'), 1.6);

    expect(layers.objects).toHaveLength(4);
    expect(layers.energy.material).toBeInstanceOf(THREE.ShaderMaterial);
    expect(layers.echoNear.material).toBeInstanceOf(THREE.MeshBasicMaterial);
    expect(layers.echoFar.material).toBeInstanceOf(THREE.MeshBasicMaterial);
    expect(layers.pulse.material).toBeInstanceOf(THREE.MeshBasicMaterial);
    expect(layers.energy.material.uniforms.map.value).toBe(texture);
    texture.dispose();
    layers.objects.forEach((object) => {
      object.geometry.dispose();
      (object.material as THREE.Material).dispose();
    });
  });

  it('updates all hero layers from the scaled frame and material physics', () => {
    const layers = createImageHeroLayers(new THREE.Texture(), 72, new THREE.Color('#2dd4bf'), 1.6);
    const profile = profileFor('bolt');
    const physics = resolveMaterialPhysics(profile, { branches: 4, flicker: 1.2 }, 5);
    const origin = new THREE.Vector3(100, 80, 0);
    const direction = new THREE.Vector2(0.8, 0.6).normalize();

    updateImageHeroLayers(layers, frame, 0.42, 640, physics, origin, direction);

    expect(layers.energy.position.x).toBeCloseTo(origin.x + frame.dx, 8);
    expect(layers.energy.position.y).toBeCloseTo(origin.y - frame.dy, 8);
    expect(layers.energy.scale.x).toBeGreaterThan(frame.scale);
    expect(layers.echoFar.position.distanceTo(layers.energy.position)).toBeGreaterThan(
      layers.echoNear.position.distanceTo(layers.energy.position),
    );
    expect(layers.pulse.scale.x).toBeGreaterThan(1);
    expect(layers.energy.material.uniforms.uProgress.value).toBeCloseTo(0.42, 8);
    expect(layers.energy.material.uniforms.uEnergy.value).toBeCloseTo(physics.energy, 8);
    layers.objects.forEach((object) => {
      object.geometry.dispose();
      (object.material as THREE.Material).dispose();
    });
  });
});

describe('Canvas image hero fallback', () => {
  it('draws the core image plus two directional depth echoes', () => {
    const ctx = {
      save: vi.fn(), restore: vi.fn(), translate: vi.fn(), rotate: vi.fn(), drawImage: vi.fn(),
      globalAlpha: 1, globalCompositeOperation: 'source-over', shadowColor: '#000', shadowBlur: 2,
    } as unknown as CanvasRenderingContext2D;

    drawCanvasMaterialHero(
      ctx, {} as HTMLImageElement, frame, 100, 80, 96, 48, 184, 1.5, 640,
    );

    expect(ctx.drawImage).toHaveBeenCalledTimes(3);
    expect(ctx.translate).toHaveBeenCalledTimes(3);
    expect(ctx.save).toHaveBeenCalledTimes(3);
    expect(ctx.restore).toHaveBeenCalledTimes(3);
    expect(ctx.globalCompositeOperation).toBe('source-over');
    expect(ctx.shadowColor).toBe('#000');
    expect(ctx.shadowBlur).toBe(2);
  });
});
