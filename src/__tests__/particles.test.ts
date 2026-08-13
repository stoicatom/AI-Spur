import { describe, it, expect, beforeEach } from 'vitest';
import { ParticleSystem } from '../overlay/particles';

describe('ParticleSystem', () => {
  let particles: ParticleSystem;

  beforeEach(() => {
    particles = new ParticleSystem();
  });

  it('初始状态无活跃粒子', () => {
    expect(particles.activeCount).toBe(0);
  });

  it('emit 后粒子变为活跃', () => {
    particles.emit(100, 100, 'sparks', 5, '#ff0000');
    expect(particles.activeCount).toBe(5);
  });

  it('emit 不超过对象池容量', () => {
    // Pool size is 200
    particles.emit(100, 100, 'sparks', 250, '#ff0000');
    expect(particles.activeCount).toBe(200);
  });

  it('update 衰减粒子寿命', () => {
    particles.emit(100, 100, 'sparks', 10, '#ff0000');
    const initialCount = particles.activeCount;

    // Simulate 50 frames (sparks live 15-30 frames)
    for (let i = 0; i < 50; i++) {
      particles.update(1 / 60);
    }

    // All sparks should be dead after 50 frames
    expect(particles.activeCount).toBe(0);
    expect(initialCount).toBe(10);
  });

  it('dead 粒子回收到对象池', () => {
    particles.emit(100, 100, 'sparks', 10, '#ff0000');
    expect(particles.activeCount).toBe(10);

    // Kill all particles
    for (let i = 0; i < 50; i++) {
      particles.update(1 / 60);
    }
    expect(particles.activeCount).toBe(0);

    // Should be able to emit again (reusing recycled particles)
    particles.emit(200, 200, 'stars', 10, '#00ff00');
    expect(particles.activeCount).toBe(10);
  });

  it('clear 立即回收所有粒子', () => {
    particles.emit(100, 100, 'sparks', 20, '#ff0000');
    expect(particles.activeCount).toBe(20);

    particles.clear();
    expect(particles.activeCount).toBe(0);
  });

  it('不同类型的粒子有不同寿命', () => {
    particles.emit(100, 100, 'sparks', 5, '#ff0000');
    particles.emit(200, 200, 'stars', 5, '#00ff00');
    particles.emit(300, 300, 'lightning', 5, '#ffffff');

    expect(particles.activeCount).toBe(15);

    // After 20 frames:
    // - sparks (15-30 frames) may still be alive
    // - stars (30-60 frames) should all be alive
    // - lightning (6-12 frames) should all be dead
    for (let i = 0; i < 20; i++) {
      particles.update(1 / 60);
    }

    expect(particles.activeCount).toBeGreaterThan(0); // stars + some sparks
    expect(particles.activeCount).toBeLessThan(15); // lightning died
  });

  // Canvas rendering is tested manually in the actual overlay window
  // (jsdom does not support canvas.getContext('2d'))
});
