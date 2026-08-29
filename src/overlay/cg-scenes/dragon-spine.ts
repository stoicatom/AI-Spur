/**
 * 场景 04 dragon 的骨骼链（独立签名机制）。
 *
 * 抽成纯函数而不是写在编排里：「12~16 节按正弦波相位差蜿蜒、后节挂在前节上」
 * 是本场景全库唯一的机制，做成无副作用的坐标函数才能被直接断言
 * （链形可重现、节间距恒定、摆幅单调），不必先建 mesh 再反推。
 *
 * 链的建法是前向运动学：头节定位后，每节沿「主轴 + 本节偏转角」
 * 前进一个固定段长。段长恒定因此是构造保证的性质，不是调参调出来的——
 * 任何一帧都不可能出现节与节脱开或叠死。
 */

/** 骨节数（规格 §4.2 场景 04 要求 12~16 节）。 */
export const SPINE_JOINT_COUNT = 14;

/** 链弧长占屏对角线的比例：龙身要蜿蜒横穿全屏对角线。 */
const ARC_SPAN = 0.92;

/** 单节最大偏转角（弧度）。再大就会折出锐角，看着像铁链不像龙。 */
const BEND_AMPLITUDE = 0.62;

/**
 * 相邻节的正弦相位差——蜿蜒的唯一来源。
 *
 * 取 0.86 使全链跨过约 1.8 个波周期：不足一个周期只会弯成弓，
 * 太多则波长短于节长，链身看起来在抖而不是在游。
 */
const WAVE_STEP = 0.86;

export type SpineJoint = {
  x: number;
  y: number;
  /** 本节朝向（弧度），供节段 mesh 对齐链的走向。 */
  angle: number;
};

export type SpineInput = {
  width: number;
  height: number;
  /** 头节沿主轴推进的归一化位置（0 在屏外起手，1 在屏外收尾）。 */
  advance: number;
  /** 波相位，随时间推进让链身游动。 */
  phase: number;
  /** 摆幅（0~1），同时驱动链形与珠轨（互动③）。 */
  sway: number;
};

/** 单节长度：由链弧长与节数反推，保证不同分辨率下链都横穿对角线。 */
export function segmentLength(width: number, height: number): number {
  return (Math.hypot(width, height) * ARC_SPAN) / (SPINE_JOINT_COUNT - 1);
}

/** 屏对角线方向（弧度）：龙身的主轴。 */
export function spineAxis(width: number, height: number): number {
  return Math.atan2(height, width);
}

/**
 * 摆幅曲线：第二幕最大，云破幕与余晖幕更小但不为零。
 *
 * 单峰而非分段常量，是因为摆幅同时喂给链形与珠轨（互动③），
 * 分段会让珠轨在幕界跳一下。
 *
 * @param t 归一化总进度
 */
export function spineSway(t: number): number {
  const k = Math.min(1, Math.max(0, t));
  return 0.22 + 0.78 * Math.pow(Math.sin(Math.PI * k), 1.1);
}

/**
 * 互动③ 珠轨半径倍率：摆幅越大，双环张得越开。
 *
 * 与链形共用同一个 sway，所以「珠轨随龙身摆幅摆动」是同一个量的两个出口，
 * 而不是两条各自调好的曲线。
 */
export function orbitScaleFor(sway: number): number {
  return 0.62 + Math.min(1, Math.max(0, sway)) * 0.7;
}

/**
 * 求当前帧的骨骼链坐标。
 *
 * @returns 自头到尾的骨节，相邻节间距恒等于 `segmentLength`
 */
export function dragonSpine(input: SpineInput): SpineJoint[] {
  const { width, height, advance, phase, sway } = input;
  const seg = segmentLength(width, height);
  const axis = spineAxis(width, height);
  const arc = seg * (SPINE_JOINT_COUNT - 1);

  // 头节位置：advance = 0.5 时整条链正好压在屏对角线上居中。
  const headDistance = arc * (0.46 + (advance - 0.5) * 0.85);
  let x = Math.cos(axis) * headDistance;
  let y = Math.sin(axis) * headDistance;

  const joints: SpineJoint[] = [{
    x,
    y,
    angle: axis + sway * BEND_AMPLITUDE * Math.sin(phase),
  }];

  for (let i = 1; i < SPINE_JOINT_COUNT; i += 1) {
    // 本节偏转只看自己的相位：链身因此是一条行进波，
    // 而位置靠累加得到——这就是「后节挂在前节上」。
    const bend = sway * BEND_AMPLITUDE * Math.sin(phase + i * WAVE_STEP);
    const heading = axis + Math.PI + bend;
    x += Math.cos(heading) * seg;
    y += Math.sin(heading) * seg;
    joints.push({ x, y, angle: heading + Math.PI });
  }

  return joints;
}

/** 缠珠窗口：龙身中段这几节围出珠位（"缠绕"的落点）。 */
export const COIL_RANGE = { from: 5, to: 9 } as const;

/** 缠珠中心：中段骨节的质心，珠被真的圈在链身里而非贴在旁边。 */
export function coilCenter(joints: SpineJoint[]): { x: number; y: number } {
  let x = 0;
  let y = 0;
  let n = 0;
  for (let i = COIL_RANGE.from; i <= COIL_RANGE.to && i < joints.length; i += 1) {
    x += joints[i].x;
    y += joints[i].y;
    n += 1;
  }
  return n > 0 ? { x: x / n, y: y / n } : { x: 0, y: 0 };
}
