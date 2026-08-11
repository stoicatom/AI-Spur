// 约束求解辅助函数
import type { Point, PhysicsParams, PhysicsInput } from './physics';

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function wrapPi(a: number): number {
  let angle = a;
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

export function segLen(i: number, params: PhysicsParams): number {
  const t = i / (params.segments - 1);
  return params.segmentLength * (1 - t * (1 - params.taper));
}

export function capSegmentStretch(pts: Point[], params: PhysicsParams): void {
  for (let i = 0; i < pts.length - 1; i++) {
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const dist = Math.hypot(dx, dy);
    const targetLen = segLen(i, params);
    const maxLen = targetLen * params.maxStretchRatio;
    if (dist > maxLen) {
      const ratio = maxLen / dist;
      const midX = (p1.x + p2.x) / 2;
      const midY = (p1.y + p2.y) / 2;
      p2.x = midX + dx * ratio / 2;
      p2.y = midY + dy * ratio / 2;
      p1.x = midX - dx * ratio / 2;
      p1.y = midY - dy * ratio / 2;
    }
  }
}

export function applyWallCollisions(
  pts: Point[],
  input: PhysicsInput,
  params: PhysicsParams
): void {
  for (const p of pts) {
    if (p.x < 0) {
      p.x = 0;
      p.px = p.x + (p.x - p.px) * params.wallBounce;
      p.py = p.py + (p.py - p.y) * params.wallFriction;
    } else if (p.x > input.screenWidth) {
      p.x = input.screenWidth;
      p.px = p.x + (p.x - p.px) * params.wallBounce;
      p.py = p.py + (p.py - p.y) * params.wallFriction;
    }
    if (p.y < 0) {
      p.y = 0;
      p.py = p.y + (p.y - p.py) * params.wallBounce;
      p.px = p.px + (p.px - p.x) * params.wallFriction;
    } else if (p.y > input.screenHeight) {
      p.y = input.screenHeight;
      p.py = p.y + (p.y - p.py) * params.wallBounce;
      p.px = p.px + (p.px - p.x) * params.wallFriction;
    }
  }
}

export function applyBasePose(
  pts: Point[],
  handleAngle: number,
  params: PhysicsParams
): void {
  const n = Math.min(params.basePoseSegments, pts.length - 1);
  for (let i = 0; i < n; i++) {
    const t = i / (params.segments - 1);
    const stiffness = lerp(params.basePoseStiffStart, params.basePoseStiffEnd, t);
    const targetLen = segLen(i, params);
    const targetX = pts[i].x + Math.cos(handleAngle) * targetLen;
    const targetY = pts[i].y + Math.sin(handleAngle) * targetLen;
    pts[i + 1].x = lerp(pts[i + 1].x, targetX, stiffness);
    pts[i + 1].y = lerp(pts[i + 1].y, targetY, stiffness);
  }
}

export function satisfyDistanceConstraints(pts: Point[], params: PhysicsParams): void {
  for (let i = 0; i < pts.length - 1; i++) {
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const dist = Math.hypot(dx, dy);
    const targetLen = segLen(i, params);
    if (dist === 0) continue;
    const diff = (dist - targetLen) / dist;
    const offsetX = dx * diff * 0.5;
    const offsetY = dy * diff * 0.5;
    p1.x += offsetX;
    p1.y += offsetY;
    p2.x -= offsetX;
    p2.y -= offsetY;
  }
}

export function applyBendLimits(pts: Point[], params: PhysicsParams): void {
  for (let i = 1; i < pts.length - 1; i++) {
    const p0 = pts[i - 1];
    const p1 = pts[i];
    const p2 = pts[i + 1];

    const dx1 = p1.x - p0.x;
    const dy1 = p1.y - p0.y;
    const dx2 = p2.x - p1.x;
    const dy2 = p2.y - p1.y;

    const angle1 = Math.atan2(dy1, dx1);
    const angle2 = Math.atan2(dy2, dx2);
    let angleDiff = wrapPi(angle2 - angle1);

    const t = i / (pts.length - 1);
    const maxBendRad = lerp(
      params.handleMaxBendDeg,
      params.tipMaxBendDeg,
      t
    ) * Math.PI / 180;

    if (Math.abs(angleDiff) > maxBendRad) {
      const correction = (Math.abs(angleDiff) - maxBendRad) * Math.sign(angleDiff);
      const rigidity = lerp(params.bendRigidityStart, params.bendRigidityEnd, t);
      const adjustAngle = correction * rigidity;

      const len2 = Math.hypot(dx2, dy2);
      const newAngle2 = angle2 - adjustAngle;
      p2.x = p1.x + Math.cos(newAngle2) * len2;
      p2.y = p1.y + Math.sin(newAngle2) * len2;
    }
  }
}

