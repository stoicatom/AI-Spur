/**
 * 场景 36 元素⑦：汗滴飞溅（quarks 水珠）。
 *
 * 规格的互动条款是「汗滴被环波溅开」，所以发射率不是本层自己的曲线，
 * 而是**读压缩环的冲量**（`sweatBurst` 直接由 `gloveSpeed` 归一得出）。
 * 这样「环强则汗多」是同一个量的两次使用，改拳速两者一起变。
 *
 * 锚点代理模式：quarks 的 ParticleSystem 在根节点不是 THREE.Scene 时
 * 首帧自毁（内部向上走到根检查 `type === 'Scene'`），测试 harness 的
 * root 是 Group，所以粒子内部状态在测试里观测不到。本层把可观测量
 * 挂在具名锚点的 userData 上作为唯一出口——`emitterPosition` 则用于
 * 保真探针，确认锚点没有和真实 emitter 脱钩。
 */
import * as THREE from 'three';
import { ConstantValue, type ParticleSystem } from 'three.quarks';
import type { CgStageContext } from '../cg-scene';
import { createParticleHub, scaledCount, type ParticleHub } from '../cg-particle-kit';
import { PUNCH_DURATION_MS } from './punch-impact';
import { sweatBurst } from './punch-recoil';

/** 电影级下的汗滴数。 */
export const SWEAT_COUNT = 26;
/** 汗滴的基准发射率（每秒），乘 sweatBurst 得到实际值。 */
export const SWEAT_PEAK_RATE = 120;

export interface SweatLayer {
  /** 具名锚点：可观测出口，位置跟着拳面走。 */
  readonly anchor: THREE.Group;
  /** 当前发射率（每秒）。 */
  readonly emissionRate: number;
  /** 真实 emitter 的世界位置，用于保真探针；粒子系统缺席时为 null。 */
  readonly emitterPosition: THREE.Vector3 | null;
  /** 推进：t 为归一化进度，delta 为秒，tip 为拳面位置（局部坐标）。 */
  advance(t: number, delta: number, tip: THREE.Vector3): void;
  dispose(): void;
}

/**
 * 建汗滴层。
 *
 * @param parent 挂载父节点（震屏容器内，汗滴随画面一起抖）
 * @param ctx 场景上下文
 * @param short 屏幕短边（像素），用于换算速度尺度
 */
export function createSweatLayer(
  parent: THREE.Object3D,
  ctx: CgStageContext,
  short: number,
): SweatLayer {
  const anchor = new THREE.Group();
  anchor.name = 'sweat-anchor';
  parent.add(anchor);

  const hub: ParticleHub = createParticleHub(anchor, ctx.quality);
  // 水珠：偏冷白，锥形朝拳路反向散开（被环波推回来）。
  const system: ParticleSystem | null = hub.emit({
    count: SWEAT_COUNT,
    lifetime: [0.18, 0.46],
    speed: [short * 0.34, short * 0.92],
    size: [short * 0.006, short * 0.016],
    color: new THREE.Color('#DCEBFF'),
    shape: 'cone',
    spread: 1.06,
    looping: true,
    rate: 0,
  });

  let rate = 0;

  return {
    anchor,
    get emissionRate() { return rate; },
    get emitterPosition() { return system ? system.emitter.position : null; },

    advance(t: number, delta: number, tip: THREE.Vector3): void {
      // 锚点跟着拳面：汗是从拳套上被甩出来的，不是从命中面凭空生成。
      anchor.position.copy(tip);
      // 发射率读环冲量的同源量：环强则汗多。
      const burst = sweatBurst(t);
      rate = burst * SWEAT_PEAK_RATE * (scaledCount(SWEAT_COUNT, ctx.quality) / SWEAT_COUNT);
      if (system) {
        // quarks 的 emissionOverTime 必须整体替换，改字段不生效。
        system.emissionOverTime = new ConstantValue(rate);
      }
      // 测试出口：粒子内部时钟观测不到，把折算后的值挂在锚点上。
      anchor.userData.particleT = t * PUNCH_DURATION_MS / 1000;
      // 测试出口：发射率。注意这只能证明「率算对了」，不能证明「率真的
      // 生效了」——quarks 要求整体替换 emissionOverTime（见上），而改字段
      // 与整体替换在任何反读下都看不出差别（同一个实例）。真实差别只体现
      // 在粒子生成数量上，而 ParticleSystem 在 harness 的 Group 根下首帧
      // 自毁，粒子数不可观测。这条属于单测覆盖不到的边界，靠 §9 的
      // 浏览器端目视验收兜底。
      anchor.userData.sweatRate = rate;
      hub.update(delta);
    },

    dispose(): void {
      hub.dispose();
      anchor.removeFromParent();
    },
  };
}
