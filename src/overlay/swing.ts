/**
 * 甩动检测器（swing detector）—— 纯函数式，无 DOM / IPC 副作用，便于单测。
 *
 * 产品核心玩法是「快速甩动鼠标 → 触发 crack」。真实鞭子的 crack 发生在鞭梢
 * 回抽的瞬间，而非匀速滑动时，所以这里不是「速度超阈值就触发」那么粗糙，而是
 * 检测一个 snap 手势：**先高速运动，随后方向骤变或急减速**。这一条几乎消灭了
 * 「随手横穿屏幕」的误触。
 *
 * 用法：每收到一帧光标位置就 `push({x,y,t})`，返回是否在这一帧判定为 crack。
 * 判定后进入冷却窗口，避免一次甩动连触两次。
 */

export interface SwingSample {
  x: number;
  y: number;
  /** 时间戳（ms），来自 performance.now()。 */
  t: number;
}

export interface SwingParams {
  /** 触发所需的基准峰值速度（px/ms）。实际阈值再除以灵敏度。 */
  baseSpeed: number;
  /** 灵敏度 0.5–2.0（config.crackSensitivity）；越大越易触发。 */
  sensitivity: number;
  /** 一次甩动内的最小总位移（px），过滤微抖动。 */
  minTravel: number;
  /** crack 后的冷却窗口（ms）。 */
  cooldownMs: number;
  /** 覆盖层出现后的宽限期（ms），避免刚出现就误触。 */
  graceMs: number;
}

export interface SwingResult {
  cracked: boolean;
  vx: number;
  vy: number; // snap 瞬间速度向量（px/ms）
  peakSpeed: number; // 本次甩动累计峰值速度
}

export const DEFAULT_SWING: SwingParams = {
  // 60fps 下 px/ms：~1.4 相当于约 84px/帧的快速甩动，是明显的「甩」而非滑动。
  baseSpeed: 1.4,
  sensitivity: 1.0,
  minTravel: 90,
  cooldownMs: 260,
  graceMs: 280,
};

/** 保留最近若干帧用于速度/方向分析。3–5 帧足够捕捉 snap。 */
const HISTORY = 5;

export class SwingDetector {
  private samples: SwingSample[] = [];
  private lastCrackT = -Infinity;
  private spawnT: number;
  private peakSpeed = 0;

  constructor(spawnT: number) {
    this.spawnT = spawnT;
  }

  /** 复位（覆盖层重新出现时调用），沿用新的出生时间。 */
  reset(spawnT: number): void {
    this.samples = [];
    this.peakSpeed = 0;
    // 复位后允许立刻触发（不被上一次 crack 的冷却影响）；宽限期单独把关。
    this.lastCrackT = -Infinity;
    this.spawnT = spawnT;
  }

  /**
   * 送入一帧光标位置，返回本帧的甩动检测结果。
   * @param s   当前光标采样
   * @param p   参数（含实时灵敏度）
   */
  push(s: SwingSample, p: SwingParams): SwingResult {
    this.samples.push(s);
    if (this.samples.length > HISTORY) this.samples.shift();

    // 需要至少 3 帧才能判断「加速后 snap」。
    if (this.samples.length < 3) return { cracked: false, vx: 0, vy: 0, peakSpeed: this.peakSpeed };

    // 宽限期与冷却窗口。
    if (s.t - this.spawnT < p.graceMs) return { cracked: false, vx: 0, vy: 0, peakSpeed: this.peakSpeed };
    if (s.t - this.lastCrackT < p.cooldownMs) return { cracked: false, vx: 0, vy: 0, peakSpeed: this.peakSpeed };

    const n = this.samples.length;
    const prev = this.samples[n - 2];
    const cur = this.samples[n - 1];
    const before = this.samples[n - 3];

    const vCur = velocity(prev, cur);
    const vPrev = velocity(before, prev);
    const speedCur = mag(vCur);
    const speedPrev = mag(vPrev);
    this.peakSpeed = Math.max(this.peakSpeed, speedPrev, speedCur);

    // 阈值随灵敏度缩放：灵敏度越大，所需峰值速度越低。
    const threshold = p.baseSpeed / clamp(p.sensitivity, 0.5, 2.0);

    // 总位移门槛，过滤原地微抖。
    if (this.travel() < p.minTravel) return { cracked: false, vx: vCur.x, vy: vCur.y, peakSpeed: this.peakSpeed };

    // snap 判定：前一段达到过高速（peak 超阈值），且当前发生
    //   (a) 急减速：速度掉到峰值的一半以下，或
    //   (b) 方向反转：前后速度向量夹角 > 120°。
    const hadPeak = this.peakSpeed >= threshold;
    if (!hadPeak) return { cracked: false, vx: vCur.x, vy: vCur.y, peakSpeed: this.peakSpeed };

    const decel = speedCur < this.peakSpeed * 0.5;
    const reversed = speedPrev > 0.2 && speedCur > 0.2 && angleBetween(vPrev, vCur) > (2 * Math.PI) / 3;

    if (decel || reversed) {
      this.lastCrackT = s.t;
      const out = { cracked: true, vx: vCur.x, vy: vCur.y, peakSpeed: this.peakSpeed };
      this.peakSpeed = 0; // 触发后重置峰值，为下一次甩动重新蓄力
      return out;
    }
    return { cracked: false, vx: vCur.x, vy: vCur.y, peakSpeed: this.peakSpeed };
  }

  /** 当前历史窗口内的累计位移（px）。 */
  private travel(): number {
    let d = 0;
    for (let i = 1; i < this.samples.length; i++) {
      d += dist(this.samples[i - 1], this.samples[i]);
    }
    return d;
  }
}

// ── helpers ─────────────────────────────────────────────────────────────────

function velocity(a: SwingSample, b: SwingSample): { x: number; y: number } {
  const dt = Math.max(1, b.t - a.t); // 防除零；下限 1ms
  return { x: (b.x - a.x) / dt, y: (b.y - a.y) / dt };
}
function mag(v: { x: number; y: number }): number {
  return Math.hypot(v.x, v.y);
}
function dist(a: SwingSample, b: SwingSample): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}
function angleBetween(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dot = a.x * b.x + a.y * b.y;
  const m = mag(a) * mag(b);
  if (m === 0) return 0;
  return Math.acos(clamp(dot / m, -1, 1));
}
function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
