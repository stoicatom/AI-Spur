import { describe, it, expect } from 'vitest';
import {
  createWhipState,
  physicsStep,
  DEFAULT_PHYSICS,
  type PhysicsInput,
} from '../overlay/physics';

describe('Physics engine', () => {
  const createTestInput = (overrides?: Partial<PhysicsInput>): PhysicsInput => ({
    mouseX: 500,
    mouseY: 300,
    prevMouseX: 500,
    prevMouseY: 300,
    dt: 1 / 60,
    now: Date.now(),
    screenWidth: 1920,
    screenHeight: 1080,
    ...overrides,
  });

  describe('createWhipState', () => {
    it('should generate correct number of points', () => {
      const state = createWhipState(500, 300, DEFAULT_PHYSICS);
      expect(state.pts.length).toBe(DEFAULT_PHYSICS.segments);
    });

    it('should initialize with non-dropping state', () => {
      const state = createWhipState(500, 300, DEFAULT_PHYSICS);
      expect(state.dropping).toBe(false);
    });

    it('should initialize with correct handle angle', () => {
      const state = createWhipState(500, 300, DEFAULT_PHYSICS);
      expect(state.handleAngle).toBe(DEFAULT_PHYSICS.baseTargetAngle);
    });

    it('should place first point at mouse position', () => {
      const mouseX = 123;
      const mouseY = 456;
      const state = createWhipState(mouseX, mouseY, DEFAULT_PHYSICS);
      expect(state.pts[0].x).toBe(mouseX);
      expect(state.pts[0].y).toBe(mouseY);
    });

    it('should initialize with zero angular velocity', () => {
      const state = createWhipState(500, 300, DEFAULT_PHYSICS);
      expect(state.handleAngVel).toBe(0);
    });
  });

  describe('physicsStep', () => {
    it('should not trigger crack with zero velocity', () => {
      const state = createWhipState(500, 300, DEFAULT_PHYSICS);
      const input = createTestInput();
      const result = physicsStep(state, input, DEFAULT_PHYSICS);
      expect(result.crackTriggered).toBe(false);
    });

    it('should return new state without mutating original', () => {
      const state = createWhipState(500, 300, DEFAULT_PHYSICS);
      const originalPts = state.pts.map((p) => ({ ...p }));
      const input = createTestInput({ mouseX: 510, mouseY: 310 });
      physicsStep(state, input, DEFAULT_PHYSICS);
      // 验证原状态未被修改（除了手柄点，因为它会被固定）
      for (let i = 1; i < state.pts.length; i++) {
        expect(state.pts[i].x).toBe(originalPts[i].x);
        expect(state.pts[i].y).toBe(originalPts[i].y);
      }
    });

    it('should trigger crack when tip velocity exceeds threshold after grace period', () => {
      const state = createWhipState(500, 300, DEFAULT_PHYSICS);
      state.spawnTime = Date.now() - 1000; // 1 秒前生成，超过 grace period
      const tip = state.pts[state.pts.length - 1];
      tip.px = tip.x - 350; // 给 tip 足够速度（> crackSpeed 340）
      const input = createTestInput();
      const result = physicsStep(state, input, DEFAULT_PHYSICS);
      expect(result.crackTriggered).toBe(true);
    });

    it('should not trigger crack within grace period', () => {
      const state = createWhipState(500, 300, DEFAULT_PHYSICS);
      state.spawnTime = Date.now() - 100; // 100ms 前生成，在 grace period 内
      const tip = state.pts[state.pts.length - 1];
      tip.px = tip.x - 350;
      const input = createTestInput();
      const result = physicsStep(state, input, DEFAULT_PHYSICS);
      expect(result.crackTriggered).toBe(false);
    });

    it('should respect crack cooldown', () => {
      const state = createWhipState(500, 300, DEFAULT_PHYSICS);
      state.spawnTime = Date.now() - 1000;
      state.lastCrackTime = Date.now() - 100; // 100ms 前刚 crack，cooldown 200ms
      const tip = state.pts[state.pts.length - 1];
      tip.px = tip.x - 350;
      const input = createTestInput();
      const result = physicsStep(state, input, DEFAULT_PHYSICS);
      expect(result.crackTriggered).toBe(false);
    });

    it('should allow crack after cooldown expires', () => {
      const state = createWhipState(500, 300, DEFAULT_PHYSICS);
      state.spawnTime = Date.now() - 1000;
      state.lastCrackTime = Date.now() - 250; // 250ms 前，超过 cooldown 200ms
      const tip = state.pts[state.pts.length - 1];
      tip.px = tip.x - 350;
      const input = createTestInput();
      const result = physicsStep(state, input, DEFAULT_PHYSICS);
      expect(result.crackTriggered).toBe(true);
    });

    it('should pin handle to mouse when not dropping', () => {
      const state = createWhipState(500, 300, DEFAULT_PHYSICS);
      const input = createTestInput({ mouseX: 600, mouseY: 400 });
      const result = physicsStep(state, input, DEFAULT_PHYSICS);
      expect(result.nextState.pts[0].x).toBe(600);
      expect(result.nextState.pts[0].y).toBe(400);
    });

    it('should not pin handle to mouse when dropping', () => {
      const state = createWhipState(500, 300, DEFAULT_PHYSICS);
      state.dropping = true;
      state.pts[0].x = 500;
      state.pts[0].y = 300;
      const input = createTestInput({ mouseX: 600, mouseY: 400 });
      const result = physicsStep(state, input, DEFAULT_PHYSICS);
      expect(result.nextState.pts[0].x).not.toBe(600);
      expect(result.nextState.pts[0].y).not.toBe(400);
    });

    it('should update lastCrackTime when crack is triggered', () => {
      const state = createWhipState(500, 300, DEFAULT_PHYSICS);
      state.spawnTime = Date.now() - 1000;
      const tip = state.pts[state.pts.length - 1];
      tip.px = tip.x - 350;
      const now = Date.now();
      const input = createTestInput({ now });
      const result = physicsStep(state, input, DEFAULT_PHYSICS);
      expect(result.crackTriggered).toBe(true);
      expect(result.nextState.lastCrackTime).toBe(now);
    });

    it('should apply gravity to points over multiple steps', () => {
      let state = createWhipState(500, 300, DEFAULT_PHYSICS);
      const input = createTestInput();
      // 运行多步以累积重力效果
      for (let step = 0; step < 5; step++) {
        const result = physicsStep(state, input, DEFAULT_PHYSICS);
        state = result.nextState;
      }
      // 尾部点应该明显下降（不受手柄固定影响）
      const tipIndex = state.pts.length - 1;
      const initialState = createWhipState(500, 300, DEFAULT_PHYSICS);
      expect(state.pts[tipIndex].y).toBeGreaterThan(initialState.pts[tipIndex].y);
    });

    it('should use different gravity when dropping', () => {
      const state1 = createWhipState(500, 300, DEFAULT_PHYSICS);
      const state2 = createWhipState(500, 300, DEFAULT_PHYSICS);
      state2.dropping = true;

      const input = createTestInput();

      // 运行多步累积效果
      let s1 = state1;
      let s2 = state2;
      for (let step = 0; step < 10; step++) {
        s1 = physicsStep(s1, input, DEFAULT_PHYSICS).nextState;
        s2 = physicsStep(s2, input, DEFAULT_PHYSICS).nextState;
      }

      // dropGravity 0.95 < gravity 1.2，所以下落模式下移动距离应该更小
      const dy1 = s1.pts[s1.pts.length - 1].y - state1.pts[state1.pts.length - 1].y;
      const dy2 = s2.pts[s2.pts.length - 1].y - state2.pts[state2.pts.length - 1].y;

      expect(dy2).toBeLessThan(dy1);
    });
  });
});

