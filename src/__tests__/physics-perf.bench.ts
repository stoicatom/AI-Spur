/**
 * Performance benchmarks for the physics engine.
 *
 * Design-spec budget (§1.2 NFR): physics loop < 2ms per frame.
 *
 * Vitest bench suites are separate from test suites — run with:
 *   npx vitest bench
 */
import { bench, describe, expect } from 'vitest';
import {
  physicsStep,
  createWhipState,
  DEFAULT_PHYSICS,
  type PhysicsInput,
} from '../overlay/physics';

const state = createWhipState(960, 540, DEFAULT_PHYSICS);
const input: PhysicsInput = {
  mouseX: 900,
  mouseY: 480,
  prevMouseX: 850,
  prevMouseY: 500,
  dt: 16.67,
  now: performance.now(),
  screenWidth: 1920,
  screenHeight: 1080,
};

describe('physicsStep performance', () => {
  bench(
    'single step must finish well under the 2ms budget',
    () => {
      physicsStep(state, input, DEFAULT_PHYSICS);
    },
    { time: 500 }
  );

  bench(
    '100 consecutive steps (simulating ~1.6s at 60fps)',
    () => {
      let s = createWhipState(960, 540, DEFAULT_PHYSICS);
      for (let i = 0; i < 100; i++) {
        const result = physicsStep(s, { ...input, now: input.now + i * 16.67 }, DEFAULT_PHYSICS);
        s = result.nextState;
      }
    },
    { time: 500 }
  );
});

/**
 * Correctness assertion that the bench setup can be run in test mode too.
 * Vitest strips the bench suites in plain `vitest run`, so we add a test
 * here that enforces the budget without needing the bench runner.
 */
describe('physicsStep timing assertion', () => {
  it('single step completes in under 2ms (§1.2 NFR)', () => {
    const BUDGET_MS = 2;
    const SAMPLES = 1000;
    const times: number[] = [];

    for (let i = 0; i < SAMPLES; i++) {
      const t0 = performance.now();
      physicsStep(state, input, DEFAULT_PHYSICS);
      times.push(performance.now() - t0);
    }

    // Use the 99th percentile so a single GC pause does not fail the test.
    times.sort((a, b) => a - b);
    const p99 = times[Math.floor(SAMPLES * 0.99)];
    expect(p99).toBeLessThan(BUDGET_MS);
  });
});
