// OpenWhip v2 - 物理引擎纯函数模块
// 所有物理计算为纯函数，确定性可测

import {
  clamp,
  wrapPi,
  capSegmentStretch,
  applyWallCollisions,
  applyBasePose,
  satisfyDistanceConstraints,
  applyBendLimits,
} from './constraints';

export interface PhysicsParams {
  segments: number;
  segmentLength: number;
  taper: number;
  gravity: number;
  dropGravity: number;
  damping: number;
  constraintIters: number;
  maxStretchRatio: number;
  crackSpeed: number;
  crackCooldownMs: number;
  firstCrackGraceMs: number;
  baseTargetAngle: number;
  handleAimByMouseX: number;
  handleAimByMouseY: number;
  handleAimClamp: number;
  handleSpring: number;
  handleAngularDamping: number;
  basePoseSegments: number;
  basePoseStiffStart: number;
  basePoseStiffEnd: number;
  handleMaxBendDeg: number;
  tipMaxBendDeg: number;
  bendRigidityStart: number;
  bendRigidityEnd: number;
  wallBounce: number;
  wallFriction: number;
}

export const DEFAULT_PHYSICS: PhysicsParams = {
  segments: 28,
  segmentLength: 25,
  taper: 0.6,
  gravity: 1.2,
  dropGravity: 0.95,
  damping: 0.96,
  constraintIters: 20,
  maxStretchRatio: 1.2,
  crackSpeed: 340,
  crackCooldownMs: 200,
  firstCrackGraceMs: 350,
  baseTargetAngle: -1.12,
  handleAimByMouseX: 0.4,
  handleAimByMouseY: 0.2,
  handleAimClamp: 2.0,
  handleSpring: 0.7,
  handleAngularDamping: 0.078,
  basePoseSegments: 2,
  basePoseStiffStart: 0.9,
  basePoseStiffEnd: 0.8,
  handleMaxBendDeg: 16,
  tipMaxBendDeg: 130,
  bendRigidityStart: 0.8,
  bendRigidityEnd: 0.12,
  wallBounce: 0.42,
  wallFriction: 0.86,
};

export interface Point {
  x: number;
  y: number;
  px: number;
  py: number;
}

export interface WhipState {
  pts: Point[];
  dropping: boolean;
  lastCrackTime: number;
  spawnTime: number;
  handleAngle: number;
  handleAngVel: number;
}

export interface PhysicsInput {
  mouseX: number;
  mouseY: number;
  prevMouseX: number;
  prevMouseY: number;
  now: number;
  screenWidth: number;
  screenHeight: number;
}

// 初始化函数

/** Options that let callers size and time the initial whip. */
export interface WhipInitOptions {
  /** Horizontal arc extent; the default 260 matches the tuned baseline. */
  arcWidth?: number;
  /** Vertical arc rise; the default 185 matches the tuned baseline. */
  arcHeight?: number;
  /** Spawn clock; injected so the initial state is deterministic and tests can
   * control it. Defaults to Date.now() for the production caller. */
  now?: number;
}

export function createWhipState(
  mouseX: number,
  mouseY: number,
  params: PhysicsParams,
  init: WhipInitOptions = {}
): WhipState {
  const arcWidth = init.arcWidth ?? 260;
  const arcHeight = init.arcHeight ?? 185;
  const now = init.now ?? Date.now();

  const pts: Point[] = [];
  for (let i = 0; i < params.segments; i++) {
    const t = i / (params.segments - 1);
    const x = mouseX + t * arcWidth;
    const y = mouseY - Math.sin(t * Math.PI * 0.75) * arcHeight;
    pts.push({ x, y, px: x, py: y });
  }
  return {
    pts,
    dropping: false,
    lastCrackTime: 0,
    spawnTime: now,
    handleAngle: params.baseTargetAngle,
    handleAngVel: 0,
  };
}

// 主物理步进函数

export function physicsStep(
  state: WhipState,
  input: PhysicsInput,
  params: PhysicsParams
): { nextState: WhipState; crackTriggered: boolean } {
  // 深拷贝状态（纯函数要求）
  const newState: WhipState = {
    ...state,
    pts: state.pts.map((p) => ({ ...p })),
  };

  let crackTriggered = false;
  const g = newState.dropping ? params.dropGravity : params.gravity;

  // 更新手柄角度（鼠标控制）
  if (!newState.dropping) {
    const mvx = input.mouseX - input.prevMouseX;
    const mvy = input.mouseY - input.prevMouseY;
    const delta = clamp(
      mvx * params.handleAimByMouseX + mvy * params.handleAimByMouseY,
      -params.handleAimClamp,
      params.handleAimClamp
    );
    const target = params.baseTargetAngle + delta;
    const err = wrapPi(target - newState.handleAngle);
    newState.handleAngVel += err * params.handleSpring;
    newState.handleAngVel *= params.handleAngularDamping;
    newState.handleAngle = wrapPi(newState.handleAngle + newState.handleAngVel);
  }

  // 在 Verlet 积分前保存 tip 速度用于 crack 检测
  const tipBeforePhysics = newState.pts[newState.pts.length - 1];
  const tipVelBeforePhysics = Math.hypot(
    tipBeforePhysics.x - tipBeforePhysics.px,
    tipBeforePhysics.y - tipBeforePhysics.py
  );

  // Verlet 积分
  const start = newState.dropping ? 0 : 1;
  for (let i = start; i < newState.pts.length; i++) {
    const p = newState.pts[i];
    const vx = (p.x - p.px) * params.damping;
    const vy = (p.y - p.py) * params.damping;
    p.px = p.x;
    p.py = p.y;
    p.x += vx;
    p.y += vy + g;
  }

  // 固定手柄到鼠标位置
  if (!newState.dropping) {
    newState.pts[0].x = input.mouseX;
    newState.pts[0].y = input.mouseY;
    newState.pts[0].px = input.mouseX;
    newState.pts[0].py = input.mouseY;
  }

  // 限制过度拉伸
  capSegmentStretch(newState.pts, params);

  // 墙壁碰撞
  applyWallCollisions(newState.pts, input, params);

  // 应用基础姿态（手柄附近约束）
  if (!newState.dropping) {
    applyBasePose(newState.pts, newState.handleAngle, params);
  }

  // 约束迭代求解
  for (let iter = 0; iter < params.constraintIters; iter++) {
    satisfyDistanceConstraints(newState.pts, params);
    if (!newState.dropping) {
      newState.pts[0].x = input.mouseX;
      newState.pts[0].y = input.mouseY;
    }
  }

  // 应用弯曲限制
  applyBendLimits(newState.pts, params);

  // Crack 检测（使用物理计算前的速度）
  const tipVel = tipVelBeforePhysics;

  if (
    !newState.dropping &&
    tipVel > params.crackSpeed &&
    input.now - newState.spawnTime >= params.firstCrackGraceMs &&
    input.now - newState.lastCrackTime > params.crackCooldownMs
  ) {
    crackTriggered = true;
    newState.lastCrackTime = input.now;
  }

  return { nextState: newState, crackTriggered };
}

